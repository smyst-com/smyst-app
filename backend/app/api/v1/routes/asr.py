from __future__ import annotations

import base64
import binascii
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

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
    return {
        "ready": bool(worker_url and (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()),
        "engine": "voice-worker",
        "languages": sorted(SUPPORTED_ASR_LANGS),
        "storage": "transient",
    }


@router.post("/transcribe")
def transcribe(body: AsrRequest) -> dict[str, Any]:
    worker_url = (os.environ.get("VOICE_WORKER_URL") or "").strip().rstrip("/")
    worker_token = (os.environ.get("VOICE_WORKER_TOKEN") or "").strip()
    if not worker_url or not worker_token:
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
