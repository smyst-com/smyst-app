from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import threading
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

logger = logging.getLogger("smyst.api.tts")

router = APIRouter(prefix="/tts", tags=["tts"])

# Kuratierte, rein synthetische Piper-Stimmen (keine Klone realer Personen).
# Option A (Freigabe Adam King 14.07.2026): Die Stimmen liegen gebundelt im
# Voice-Worker; der Control Server bleibt schlank und reicht Anfragen durch.
VOICES_DIR = os.environ.get("PIPER_VOICES_DIR", "/voices")
PIPER_BIN = os.environ.get("PIPER_BIN", "/opt/piper/piper")

# Phase 2 (Klon-Stimme): Spezielle Voice-IDs, die die EIGENE, consent-
# gesicherte Nutzerstimme anfordern. Nur mit angemeldeter Session,
# vorhandener Stimmprobe und konfiguriertem GPU-Worker; sonst automatischer
# Fallback auf die kuratierten Piper-Stimmen.
OWN_VOICE_IDS = {"de-own", "en-own", "tr-own", "own"}

VOICE_FILES: dict[str, str] = {
    "de-male": "de_DE-thorsten-medium.onnx",
    "de-female": "de_DE-kerstin-low.onnx",
    "en-male": "en_US-ryan-medium.onnx",
    "en-female": "en_US-amy-medium.onnx",
    "de-thorsten": "de_DE-thorsten-medium.onnx",
    "de-karlsson": "de_DE-karlsson-low.onnx",
    "de-pavoque": "de_DE-pavoque-low.onnx",
    "de-kerstin": "de_DE-kerstin-low.onnx",
    "de-ramona": "de_DE-ramona-low.onnx",
    "de-eva": "de_DE-eva_k-x_low.onnx",
    "en-ryan": "en_US-ryan-medium.onnx",
    "en-joe": "en_US-joe-medium.onnx",
    "en-lessac": "en_US-lessac-medium.onnx",
    "en-hfc-male": "en_US-hfc_male-medium.onnx",
    "en-amy": "en_US-amy-medium.onnx",
    "en-hfc-female": "en_US-hfc_female-medium.onnx",
    # Tuerkisch: einzige verfuegbare tr-Piper-Stimme (rhasspy/piper-voices,
    # fahrettin/fettah wurden upstream entfernt). Aliase zeigen auf dfki.
    "tr-male": "tr_TR-dfki-medium.onnx",
    "tr-female": "tr_TR-dfki-medium.onnx",
    "tr-dfki": "tr_TR-dfki-medium.onnx",
}

# Wiederverwendeter HTTP-Client (Connection-Reuse spart pro Synthese
# TLS-/Verbindungsaufbau ueber die Cloudflare-Hops zum Worker).
_worker_http: httpx.Client | None = None
_worker_http_lock = threading.Lock()

# Kurzer Cache fuer die Worker-Stimmenliste (aendert sich nur per Deploy).
_worker_voices_cache: tuple[float, list[str]] = (0.0, [])
_WORKER_VOICES_TTL_SECONDS = 300.0


def _worker_client() -> httpx.Client:
    global _worker_http
    with _worker_http_lock:
        if _worker_http is None:
            _worker_http = httpx.Client(timeout=45.0)
        return _worker_http


def _worker_voice_list() -> list[str]:
    """Holt die gebundelten Piper-Voice-IDs vom Voice-Worker (mit Cache)."""
    global _worker_voices_cache
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip().rstrip("/")
    worker_token = (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()
    if not worker_url or not worker_token:
        return []
    cached_at, cached = _worker_voices_cache
    if cached and time.monotonic() - cached_at < _WORKER_VOICES_TTL_SECONDS:
        return cached
    try:
        response = _worker_client().get(
            f"{worker_url}/voices",
            headers={"X-Worker-Token": worker_token},
            timeout=8.0,
        )
        if response.status_code == 200:
            voices = [str(voice) for voice in response.json().get("voices", [])]
            if voices:
                _worker_voices_cache = (time.monotonic(), voices)
                return voices
    except Exception as exc:  # noqa: BLE001 - Stimmenliste darf nie brechen
        logger.warning("worker voices failed (%s)", type(exc).__name__)
    return _worker_voices_cache[1]


def _resolve_voice_id(voice_id: str | None, lang: str | None, gender: str | None) -> str:
    if voice_id and voice_id in VOICE_FILES:
        return voice_id
    lang_base = (lang or "de").lower()
    if lang_base.startswith("de"):
        base = "de"
    elif lang_base.startswith("tr"):
        base = "tr"
    else:
        base = "en"
    suffix = "female" if (gender or "").lower() == "female" else "male"
    return f"{base}-{suffix}"


def _try_clone_tts(request: Request, text: str, lang: str | None) -> tuple[Response | None, str | None]:
    """Versucht die Klon-Synthese ueber den GPU-Worker.

    Rueckgabe: (Audio-Response oder None, Fallback-Piper-VoiceId oder None).
    Wirft nie — jeder Fehler fuehrt zum Piper-Fallback (Phase 1).
    """
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip().rstrip("/")
    worker_token = (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()
    fallback_voice: str | None = None
    try:
        from app.api.v1.routes.auth import _session_from_request
        from app.api.v1.routes.user_mvp import _load_doc
        from app.integrations import user_store

        session = _session_from_request(request)
        if not session:
            return None, None
        sub = str(session.get("sub", "")).strip()
        if not sub:
            return None, None
        doc = _load_doc(sub)
        voice = doc.get("voiceProfile")
        if not isinstance(voice, dict) or not voice.get("consent"):
            return None, None
        picked = str(voice.get("voiceId") or "")
        if picked in VOICE_FILES:
            fallback_voice = picked
        sample_key = str(voice.get("sampleKey") or "")
        if not sample_key or not worker_url or not worker_token:
            return None, fallback_voice
        sample_url = user_store.presign_voice_sample(sample_key)
        if not sample_url:
            return None, fallback_voice
        worker_response = _worker_client().post(
            f"{worker_url}/clone-tts",
            json={"text": text, "sampleUrl": sample_url, "lang": (lang or "de")},
            headers={"X-Worker-Token": worker_token},
            timeout=40.0,
        )
        if worker_response.status_code == 200 and len(worker_response.content) > 1000:
            return (
                Response(
                    content=worker_response.content,
                    media_type="audio/wav",
                    headers={
                        "Cache-Control": "no-store",
                        "X-Voice-Id": "de-own",
                        "X-Voice-Engine": worker_response.headers.get("X-Voice-Engine", "chatterbox"),
                    },
                ),
                fallback_voice,
            )
        logger.info("voice worker declined (%s), falling back", worker_response.status_code)
    except Exception as exc:  # noqa: BLE001 - Klonpfad darf TTS nie brechen
        logger.warning("clone tts failed (%s), falling back to piper", type(exc).__name__)
    return None, fallback_voice


def _try_worker_tts(
    text: str,
    lang: str | None,
    voice_id: str | None = None,
    gender: str | None = None,
    rate: float | None = None,
) -> Response | None:
    """Normale Standard-TTS ueber den stateless Voice-Worker (Piper, Option A).

    Der Control Server speichert keine Audio-Artefakte und besitzt keine Modelle.
    Jeder Fehler fuehrt zum Piper-/Browser-Fallback.
    """
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip().rstrip("/")
    worker_token = (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()
    if not worker_url or not worker_token:
        return None
    try:
        worker_response = _worker_client().post(
            f"{worker_url}/synthesize",
            json={"text": text, "lang": (lang or "de"), "voiceId": voice_id, "gender": gender, "rate": rate},
            headers={"X-Worker-Token": worker_token},
            timeout=45.0,
        )
        if worker_response.status_code == 200 and len(worker_response.content) > 1000:
            return Response(
                content=worker_response.content,
                media_type="audio/wav",
                headers={
                    "Cache-Control": "no-store",
                    "X-Voice-Id": worker_response.headers.get("X-Voice-Id")
                    or f"worker-{(lang or 'de').lower()[:2]}",
                    "X-Voice-Engine": worker_response.headers.get("X-Voice-Engine", "piper"),
                },
            )
        logger.info("worker tts declined (%s), falling back", worker_response.status_code)
    except Exception as exc:  # noqa: BLE001
        logger.warning("worker tts failed (%s), falling back", type(exc).__name__)
    return None


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    voiceId: str | None = Field(default=None, max_length=32)
    lang: str | None = Field(default=None, max_length=16)
    gender: str | None = Field(default=None, max_length=8)
    # Sprechtempo des Twins (1.0 = normal, >1 schneller). Optional und
    # abwaertskompatibel: alte Clients senden kein rate.
    rate: float | None = Field(default=None, ge=0.5, le=1.5)


@router.get("/voices")
def list_voices() -> dict[str, object]:
    local_available = sorted(
        voice_id
        for voice_id, file_name in VOICE_FILES.items()
        if os.path.exists(os.path.join(VOICES_DIR, file_name))
    )
    worker_configured = bool((os.environ.get("VOICE_WORKER_URL") or "").strip())
    piper_ready = os.path.exists(PIPER_BIN) and len(local_available) > 0
    available = local_available
    if not available and worker_configured:
        available = sorted(_worker_voice_list())
    return {
        "voices": available,
        "engine": "worker+piper" if worker_configured else "piper",
        "cloneConfigured": worker_configured,
        "workerConfigured": worker_configured,
        "ready": piper_ready or worker_configured,
    }


@router.post("")
def synthesize(request: Request, body: TtsRequest) -> Response:
    text = normalize_text(body.text, max_length=800).value.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Empty text")

    requested_voice = (body.voiceId or "").strip()
    effective_voice_id = body.voiceId
    if requested_voice in OWN_VOICE_IDS:
        clone_response, fallback_voice = _try_clone_tts(request, text, body.lang)
        if clone_response is not None:
            return clone_response
        effective_voice_id = fallback_voice

    voice_id = _resolve_voice_id(effective_voice_id, body.lang, body.gender)
    model_path = os.path.join(VOICES_DIR, VOICE_FILES[voice_id])
    piper_ready = os.path.exists(PIPER_BIN) and os.path.exists(model_path)
    lang_base = (body.lang or "").lower()[:2]
    if lang_base not in {"de", "en", "tr"} or not piper_ready:
        worker_response = _try_worker_tts(text, body.lang, effective_voice_id, body.gender, body.rate)
        if worker_response is not None:
            return worker_response
    if not piper_ready:
        raise HTTPException(status_code=503, detail="TTS engine not available")

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "out.wav")
        piper_cmd = [PIPER_BIN, "--model", model_path, "--output_file", output_path]
        if body.rate:
            # Piper: length_scale ist die inverse Sprechgeschwindigkeit.
            piper_cmd.extend(["--length_scale", f"{1.0 / body.rate:.3f}"])
        try:
            completed = subprocess.run(
                piper_cmd,
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="TTS timeout") from exc
        if completed.returncode != 0 or not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="TTS synthesis failed")
        with open(output_path, "rb") as wav_file:
            audio = wav_file.read()

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Voice-Id": voice_id,
        },
    )
