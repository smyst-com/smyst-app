from __future__ import annotations

import base64
import binascii
import logging
import os
import tempfile
import threading
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

logger = logging.getLogger("smyst.api.asr")

router = APIRouter(prefix="/asr", tags=["asr"])

MAX_AUDIO_BYTES = 12 * 1024 * 1024
MIN_AUDIO_BYTES = 600
SUPPORTED_ASR_LANGS = {
    "en",
    "zh",
    "es",
    "ar",
    "fr",
    "de",
    "pt",
    "ru",
    "tr",
    "ja",
    "ko",
    "it",
    "hi",
    "id",
    "bn",
}


class AsrRequest(BaseModel):
    audioBase64: str = Field(min_length=16, max_length=18_000_000)
    contentType: str = Field(default="audio/webm", max_length=80)
    lang: str | None = Field(default=None, max_length=16)


def _clean_language(value: str | None) -> str | None:
    lang = (value or "").lower().split("-")[0].split("_")[0]
    return lang if lang in SUPPORTED_ASR_LANGS else None


# Lokales Whisper (faster-whisper, CPU) als Fallback ohne Voice-Worker: seit der
# Salad-Trennung gibt es keinen Worker mehr, das Diktat lief nur noch ueber die
# Browser-Spracherkennung. faster-whisper ist eine optionale Dependency
# ([project.optional-dependencies] asr) — ohne Installation bleibt alles beim
# alten 503-Verhalten. Ein Modell, ein Lock: der Server hat 2 vCPU, parallele
# Transkriptionen wuerden sich nur gegenseitig verdraengen.
_LOCAL_MODEL_NAME = os.environ.get("ASR_LOCAL_MODEL", "small")
_LOCAL_MODEL_DIR = os.environ.get("ASR_MODEL_DIR") or None
_local_model: Any = None
_local_model_error = ""
_local_lock = threading.Lock()


def _local_asr_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
    except Exception:  # noqa: BLE001 - optionale Dependency
        return False
    return True


def _get_local_model() -> Any:
    global _local_model, _local_model_error
    if _local_model is not None:
        return _local_model
    if _local_model_error:
        raise HTTPException(status_code=503, detail="asr_local_model_failed")
    from faster_whisper import WhisperModel

    try:
        _local_model = WhisperModel(
            _LOCAL_MODEL_NAME,
            device="cpu",
            compute_type="int8",
            download_root=_LOCAL_MODEL_DIR,
        )
    except Exception as exc:  # noqa: BLE001
        _local_model_error = type(exc).__name__
        logger.warning("local asr model load failed (%s)", _local_model_error)
        raise HTTPException(status_code=503, detail="asr_local_model_failed") from exc
    return _local_model


def _local_transcribe(audio: bytes, lang: str | None) -> tuple[str, str | None]:
    with _local_lock:
        model = _get_local_model()
        with tempfile.NamedTemporaryFile(suffix=".audio") as tmp:
            tmp.write(audio)
            tmp.flush()
            segments, info = model.transcribe(
                tmp.name,
                language=lang,
                beam_size=1,
                vad_filter=True,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
    detected = getattr(info, "language", None)
    return text, detected if isinstance(detected, str) else None


def _clean_audio_base64(value: str) -> tuple[str, bytes]:
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    try:
        audio = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="invalid_audio_base64") from exc
    if len(audio) < MIN_AUDIO_BYTES:
        raise HTTPException(status_code=422, detail="audio_too_short")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio_too_large")
    return payload, audio


@router.get("/status")
def status() -> dict[str, object]:
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip()
    worker_ready = bool(worker_url and (os.environ.get("VOICE_WORKER_TOKEN") or "").strip())
    local_ready = _local_asr_available()
    return {
        "ready": worker_ready or local_ready,
        "engine": "voice-worker" if worker_ready else "local-whisper",
        "languages": sorted(SUPPORTED_ASR_LANGS),
        "storage": "transient",
    }


@router.post("/transcribe")
def transcribe(body: AsrRequest) -> dict[str, Any]:
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip().rstrip("/")
    worker_token = (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()
    if not worker_url or not worker_token:
        if _local_asr_available():
            return _transcribe_local(body)
        raise HTTPException(status_code=503, detail="asr_worker_not_configured")

    audio_base64, _audio = _clean_audio_base64(body.audioBase64)
    content_type = normalize_text(body.contentType, max_length=80).value.strip() or "audio/webm"
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="audio_content_type_required")

    started = time.monotonic()
    try:
        worker_response = httpx.post(
            f"{worker_url}/transcribe",
            json={
                "audioBase64": audio_base64,
                "contentType": content_type,
                "lang": _clean_language(body.lang),
            },
            headers={"X-Worker-Token": worker_token},
            timeout=55.0,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="asr_worker_unavailable") from exc
    if worker_response.status_code != 200:
        raise HTTPException(status_code=503, detail="asr_worker_failed")

    data = worker_response.json()
    text = normalize_text(str(data.get("text") or ""), max_length=4000).value.strip()
    if not text:
        raise HTTPException(status_code=422, detail="empty_transcript")
    detected_lang = _clean_language(str(data.get("language") or "")) or _clean_language(body.lang) or "de"
    return {
        "text": text,
        "language": detected_lang,
        "engine": str(data.get("engine") or "voice-worker"),
        "durationMs": round((time.monotonic() - started) * 1000),
        "workerDurationMs": data.get("durationMs"),
    }


def _transcribe_local(body: AsrRequest) -> dict[str, Any]:
    _audio_base64, audio = _clean_audio_base64(body.audioBase64)
    content_type = normalize_text(body.contentType, max_length=80).value.strip() or "audio/webm"
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="audio_content_type_required")

    started = time.monotonic()
    try:
        raw_text, detected = _local_transcribe(audio, _clean_language(body.lang))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("local asr failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="asr_local_failed") from exc

    text = normalize_text(raw_text, max_length=4000).value.strip()
    if not text:
        raise HTTPException(status_code=422, detail="empty_transcript")
    return {
        "text": text,
        "language": _clean_language(detected) or _clean_language(body.lang) or "de",
        "engine": "local-whisper",
        "durationMs": round((time.monotonic() - started) * 1000),
        "workerDurationMs": None,
    }
