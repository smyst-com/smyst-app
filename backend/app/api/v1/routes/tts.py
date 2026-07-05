from __future__ import annotations

import logging
import os
import subprocess
import tempfile

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

logger = logging.getLogger("smyst.api.tts")

router = APIRouter(prefix="/tts", tags=["tts"])

# Kuratierte, rein synthetische Piper-Stimmen (keine Klone realer Personen).
# Binary und Modelle werden beim Docker-Build installiert; Worker bleibt stateless.
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
        worker_response = httpx.post(
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


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    voiceId: str | None = Field(default=None, max_length=32)
    lang: str | None = Field(default=None, max_length=16)
    gender: str | None = Field(default=None, max_length=8)


@router.get("/voices")
def list_voices() -> dict[str, object]:
    available = sorted(
        voice_id
        for voice_id, file_name in VOICE_FILES.items()
        if os.path.exists(os.path.join(VOICES_DIR, file_name))
    )
    return {
        "voices": available,
        "engine": "piper",
        "cloneConfigured": bool((os.environ.get("VOICE_WORKER_URL") or "").strip()),
        "ready": os.path.exists(PIPER_BIN) and len(available) > 0,
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
    if not os.path.exists(PIPER_BIN) or not os.path.exists(model_path):
        raise HTTPException(status_code=503, detail="TTS engine not available")

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "out.wav")
        try:
            completed = subprocess.run(
                [PIPER_BIN, "--model", model_path, "--output_file", output_path],
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
