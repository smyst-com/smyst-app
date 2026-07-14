"""smyst.com Voice-Worker (Phase 2): Piper-Standard-TTS + Chatterbox-Klon-TTS.

Stateless Worker auf SaladCloud mit zwei Pfaden (Option A, Freigabe Adam King
14.07.2026):
- Standard-/Sprachwellen-TTS (/synthesize) laeuft ueber Piper (CPU,
  echtzeitfaehig, ins Image gebundelte rein synthetische Stimmen).
- Klon-TTS (/clone-tts) laeuft weiter ueber Chatterbox (GPU): Der Worker
  erhaelt vom API-Backend eine zeitlich begrenzte, signierte Sample-URL
  (der Worker besitzt KEINE Speicher-Schluessel) und synthetisiert den Text
  in der Stimme des Samples.

Sicherheit & Datenschutz:
- Jeder Aufruf braucht den geteilten X-Worker-Token (nur Backend kennt ihn).
- Samples kommen ausschliesslich ueber https-URLs, werden nur temporaer
  verarbeitet und nie gespeichert.
- Chatterbox bettet ein PerTh-Watermark in jede Ausgabe ein
  (Missbrauchsschutz laut Modellanbieter).
"""

from __future__ import annotations

import base64
import binascii
import io
import logging
import os
import subprocess
import tempfile
import threading
import time

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smyst.voice_worker")

MAX_TEXT = 800
MAX_SAMPLE_BYTES = 12 * 1024 * 1024
SUPPORTED_LANGS = {"de", "en", "tr", "fr", "es", "it", "pt", "nl", "pl", "ru", "ar", "zh", "ja", "ko", "hi", "id", "bn"}
PRELOAD_ASR = os.environ.get("VOICE_WORKER_PRELOAD_ASR", "false").strip().lower() in {"1", "true", "yes", "on"}

_model = None
_model_kind = ""
_model_error = ""
_loading = False
_asr_model = None
_asr_error = ""
_asr_loading = False
_lock = threading.Lock()

ESPEAK_FALLBACK_VOICES = {
    "bn": os.environ.get("ESPEAK_BENGALI_VOICE", "bn"),
    "id": os.environ.get("ESPEAK_INDONESIAN_VOICE", "id"),
}

CHATTERBOX_LANGUAGE_ALIASES = {
    "id": "ms",
}

# ---- Piper-Standard-TTS (Option A, Freigabe Adam King 14.07.2026) ----
# Kuratierte, rein synthetische Piper-Stimmen (keine Klone realer Personen).
# Binary und Modelle werden beim Docker-Build ins Image gebundelt.
PIPER_BIN = os.environ.get("PIPER_BIN", "/opt/piper/piper")
PIPER_VOICES_DIR = os.environ.get("PIPER_VOICES_DIR", "/voices")

PIPER_VOICE_FILES: dict[str, str] = {
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

# Eine Piper-Standardstimme je weiterer Sprache; ja/ko/bn (und fehlende
# Modelle) laufen ueber den espeak-ng-Fallback.
PIPER_LANG_VOICES: dict[str, str] = {
    "de": "de_DE-thorsten-medium.onnx",
    "en": "en_US-amy-medium.onnx",
    "tr": "tr_TR-dfki-medium.onnx",
    "fr": "fr_FR-siwis-medium.onnx",
    "es": "es_ES-sharvard-medium.onnx",
    "it": "it_IT-paola-medium.onnx",
    "pt": "pt_BR-faber-medium.onnx",
    "ru": "ru_RU-irina-medium.onnx",
    "ar": "ar_JO-kareem-medium.onnx",
    "zh": "zh_CN-huayan-medium.onnx",
    "hi": "hi_IN-pratham-medium.onnx",
    "id": "id_ID-news_tts-medium.onnx",
}


def _load_model() -> None:
    global _model, _model_kind, _model_error, _loading
    with _lock:
        if _model is not None or _loading:
            return
        _loading = True
    try:
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("loading chatterbox on %s ...", device)
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            kind = "multilingual"
        except Exception as multi_exc:  # noqa: BLE001 - Fallback auf EN-Modell
            logger.warning("multilingual load failed (%s), trying english", type(multi_exc).__name__)
            from chatterbox.tts import ChatterboxTTS

            model = ChatterboxTTS.from_pretrained(device=device)
            kind = "english"
        with _lock:
            _model = model
            globals()["_model_kind"] = kind
        logger.info("chatterbox ready (%s)", kind)
    except Exception as exc:  # noqa: BLE001
        globals()["_model_error"] = f"{type(exc).__name__}: {exc}"
        logger.error("model load failed: %s", _model_error)
    finally:
        globals()["_loading"] = False


def _load_asr_model() -> None:
    global _asr_model, _asr_error, _asr_loading
    with _lock:
        if _asr_model is not None or _asr_loading:
            return
        _asr_loading = True
    try:
        import torch
        from faster_whisper import WhisperModel

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model_size = os.environ.get("WHISPER_MODEL_SIZE", "small")
        logger.info("loading faster-whisper %s on %s ...", model_size, device)
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        with _lock:
            _asr_model = model
        logger.info("faster-whisper ready")
    except Exception as exc:  # noqa: BLE001
        globals()["_asr_error"] = f"{type(exc).__name__}: {exc}"
        logger.error("asr model load failed: %s", _asr_error)
    finally:
        globals()["_asr_loading"] = False


def _available_piper_voice_ids() -> list[str]:
    return sorted(
        voice_id
        for voice_id, file_name in PIPER_VOICE_FILES.items()
        if os.path.exists(os.path.join(PIPER_VOICES_DIR, file_name))
    )


def _resolve_piper_voice(voice_id: str | None, lang: str, gender: str | None) -> tuple[str | None, str | None]:
    """Loest voiceId/lang/gender auf (verwendete Voice-ID, Modell-Datei)."""
    if voice_id and voice_id in PIPER_VOICE_FILES:
        return voice_id, PIPER_VOICE_FILES[voice_id]
    if lang in {"de", "en", "tr"}:
        suffix = "female" if (gender or "").lower() == "female" else "male"
        alias = f"{lang}-{suffix}"
        return alias, PIPER_VOICE_FILES[alias]
    file_name = PIPER_LANG_VOICES.get(lang)
    if file_name:
        return f"worker-{lang}", file_name
    return None, None


def _piper_tts(text: str, voice_id: str | None, lang: str, gender: str | None) -> Response | None:
    """Standard-TTS ueber Piper (CPU). Jeder Fehler fuehrt zum espeak-Fallback."""
    used_id, file_name = _resolve_piper_voice(voice_id, lang, gender)
    if not used_id or not file_name:
        return None
    model_path = os.path.join(PIPER_VOICES_DIR, file_name)
    if not os.path.exists(PIPER_BIN) or not os.path.exists(model_path):
        return None
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = os.path.join(tmp_dir, "out.wav")
            completed = subprocess.run(
                [PIPER_BIN, "--model", model_path, "--output_file", output_path],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=40,
                check=False,
            )
            if completed.returncode != 0 or not os.path.exists(output_path):
                logger.error(
                    "piper tts failed (%s): %s",
                    completed.returncode,
                    completed.stderr.decode("utf-8", errors="ignore")[:300],
                )
                return None
            with open(output_path, "rb") as wav_file:
                audio = wav_file.read()
    except Exception as exc:  # noqa: BLE001
        logger.error("piper tts crashed: %s", exc)
        return None
    if len(audio) <= 1000:
        return None
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Voice-Engine": "piper", "X-Voice-Id": used_id, "X-Voice-Lang": lang},
    )


def _fallback_tts(text: str, lang: str) -> Response | None:
    voice = ESPEAK_FALLBACK_VOICES.get(lang, lang)
    if not voice:
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            completed = subprocess.run(
                ["espeak-ng", "-v", voice, "-s", "145", "-w", handle.name, text],
                capture_output=True,
                timeout=40,
                check=False,
            )
            if completed.returncode != 0:
                logger.error(
                    "fallback tts failed (%s): %s",
                    completed.returncode,
                    completed.stderr.decode("utf-8", errors="ignore")[:300],
                )
                return None
            handle.seek(0)
            audio = handle.read()
        if len(audio) <= 1000:
            return None
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={"X-Voice-Engine": f"espeak-ng-{voice}", "X-Voice-Lang": lang},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("fallback tts crashed: %s", exc)
        return None


class CloneRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    sampleUrl: str = Field(min_length=12, max_length=4000)
    lang: str | None = Field(default="de", max_length=16)


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    lang: str | None = Field(default="de", max_length=16)
    voiceId: str | None = Field(default=None, max_length=32)
    gender: str | None = Field(default=None, max_length=8)


class TranscribeRequest(BaseModel):
    audioBase64: str = Field(min_length=16, max_length=18_000_000)
    contentType: str = Field(default="audio/webm", max_length=80)
    lang: str | None = Field(default=None, max_length=16)


app = FastAPI(title="smyst-voice-worker", docs_url=None, redoc_url=None)


@app.on_event("startup")
def warmup() -> None:
    threading.Thread(target=_load_model, daemon=True).start()
    if PRELOAD_ASR:
        threading.Thread(target=_load_asr_model, daemon=True).start()


@app.get("/health/live")
def live() -> dict[str, object]:
    return {"status": "live", "service": "smyst-voice-worker"}


@app.get("/health/ready")
def ready() -> dict[str, object]:
    piper_voices = _available_piper_voice_ids()
    return {
        "ready": _model is not None,
        "loading": _loading,
        "kind": _model_kind,
        "error": _model_error[:200],
        "asrReady": _asr_model is not None,
        "asrLoading": _asr_loading,
        "asrError": _asr_error[:200],
        "asrPreload": PRELOAD_ASR,
        "piperReady": os.path.exists(PIPER_BIN) and len(piper_voices) > 0,
        "piperVoices": len(piper_voices),
    }


@app.get("/voices")
def voices(x_worker_token: str | None = Header(default=None)) -> dict[str, object]:
    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected or x_worker_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    available = _available_piper_voice_ids()
    return {
        "voices": available,
        "engine": "piper",
        "ready": os.path.exists(PIPER_BIN) and len(available) > 0,
    }


@app.get("/asr/languages")
def asr_languages() -> dict[str, object]:
    return {
        "languages": sorted(SUPPORTED_LANGS),
        "engine": "faster-whisper",
        "ready": _asr_model is not None,
        "loading": _asr_loading,
    }


@app.post("/clone-tts")
def clone_tts(body: CloneRequest, x_worker_token: str | None = Header(default=None)) -> Response:
    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected or x_worker_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    if _model is None:
        if not _loading and _model_error:
            raise HTTPException(status_code=503, detail="model_failed")
        threading.Thread(target=_load_model, daemon=True).start()
        raise HTTPException(status_code=503, detail="model_loading")
    if not body.sampleUrl.startswith("https://"):
        raise HTTPException(status_code=400, detail="sample_url_must_be_https")

    try:
        with httpx.Client(timeout=25, follow_redirects=False) as client:
            sample = client.get(body.sampleUrl)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=409, detail="sample_fetch_failed") from exc
    if sample.status_code != 200 or not (1000 <= len(sample.content) <= MAX_SAMPLE_BYTES):
        raise HTTPException(status_code=409, detail="sample_unavailable")

    lang = (body.lang or "de").lower()[:2]
    if lang not in SUPPORTED_LANGS:
        lang = "de"
    text = body.text.strip()[:MAX_TEXT]
    if not text:
        raise HTTPException(status_code=422, detail="empty_text")

    suffix = ".webm" if b"webm" in sample.content[:64] or body.sampleUrl.split("?")[0].endswith(".webm") else ".wav"
    try:
        import torchaudio

        with tempfile.NamedTemporaryFile(suffix=suffix) as handle:
            handle.write(sample.content)
            handle.flush()
            if _model_kind == "multilingual":
                wav = _model.generate(
                    text,
                    language_id=CHATTERBOX_LANGUAGE_ALIASES.get(lang, lang),
                    audio_prompt_path=handle.name,
                )
            else:
                wav = _model.generate(text, audio_prompt_path=handle.name)
        buffer = io.BytesIO()
        torchaudio.save(buffer, wav.cpu(), _model.sr, format="wav")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("synthesis failed: %s", exc)
        raise HTTPException(status_code=500, detail="synthesis_failed") from exc

    return Response(
        content=buffer.getvalue(),
        media_type="audio/wav",
        headers={"X-Voice-Engine": f"chatterbox-{_model_kind}"},
    )


@app.post("/synthesize")
def synthesize(body: SynthesizeRequest, x_worker_token: str | None = Header(default=None)) -> Response:
    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected or x_worker_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    lang = (body.lang or "de").lower()[:2]
    if lang not in SUPPORTED_LANGS:
        lang = "de"
    text = body.text.strip()[:MAX_TEXT]
    if not text:
        raise HTTPException(status_code=422, detail="empty_text")

    # Option A (Freigabe Adam King, 14.07.2026): Standard-TTS laeuft ueber
    # Piper (CPU, echtzeitfaehig). Chatterbox bleibt NUR fuer /clone-tts —
    # die neuronale Synthese war fuer den Live-Loop strukturell zu langsam
    # (3-6 s Sampling + Overhead auf RTX 3060, QA-Schwelle 8 s).
    piper = _piper_tts(text, body.voiceId, lang, body.gender)
    if piper is not None:
        return piper
    fallback = _fallback_tts(text, lang)
    if fallback is not None:
        return fallback
    raise HTTPException(status_code=503, detail="tts_unavailable")


@app.post("/transcribe")
def transcribe(body: TranscribeRequest, x_worker_token: str | None = Header(default=None)) -> dict[str, object]:
    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected or x_worker_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    if _asr_model is None:
        if not _asr_loading and _asr_error:
            raise HTTPException(status_code=503, detail="asr_model_failed")
        threading.Thread(target=_load_asr_model, daemon=True).start()
        raise HTTPException(status_code=503, detail="asr_model_loading")
    if not (body.contentType or "").startswith("audio/"):
        raise HTTPException(status_code=422, detail="audio_content_type_required")
    try:
        audio = base64.b64decode(body.audioBase64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="invalid_audio_base64") from exc
    if not (600 <= len(audio) <= MAX_SAMPLE_BYTES):
        raise HTTPException(status_code=422, detail="invalid_audio_size")

    lang = (body.lang or "").lower().split("-")[0].split("_")[0]
    language_hint = lang if lang in SUPPORTED_LANGS else None
    suffix = ".webm"
    lowered_type = (body.contentType or "").lower()
    if "mp4" in lowered_type or "m4a" in lowered_type:
        suffix = ".m4a"
    elif "wav" in lowered_type:
        suffix = ".wav"

    started = time.monotonic()
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix) as handle:
            handle.write(audio)
            handle.flush()
            # Sprache IMMER automatisch erkennen - Sprachwechsel muss sofort greifen.
            # Erzwungener Sprach-Hint erzeugte Halluzinationen (z. B. tuerkisches Audio
            # mit de-Hint wurde als erfundener deutscher Satz transkribiert).
            segments, info = _asr_model.transcribe(
                handle.name,
                language=None,
                vad_filter=True,
                beam_size=5,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            detected_probability = float(getattr(info, "language_probability", 0.0) or 0.0)
            if (
                language_hint
                and getattr(info, "language", None) != language_hint
                and detected_probability < 0.5
            ):
                # Nur bei sehr unsicherer Auto-Erkennung auf den Client-Hint zurueckfallen
                segments, info = _asr_model.transcribe(
                    handle.name,
                    language=language_hint,
                    vad_filter=True,
                    beam_size=5,
                )
                text = " ".join(segment.text.strip() for segment in segments).strip()
    except Exception as exc:  # noqa: BLE001
        logger.error("transcription failed: %s", exc)
        raise HTTPException(status_code=500, detail="transcription_failed") from exc
    if not text:
        raise HTTPException(status_code=422, detail="empty_transcript")
    return {
        "text": text[:4000],
        "language": getattr(info, "language", None) or language_hint or "unknown",
        "durationMs": round((time.monotonic() - started) * 1000),
        "engine": "faster-whisper",
    }
