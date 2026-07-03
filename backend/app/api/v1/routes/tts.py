from __future__ import annotations

import io
import os
import threading
import wave
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

router = APIRouter(prefix="/tts", tags=["tts"])

# Kuratierte, rein synthetische Piper-Stimmen (keine Klone realer Personen).
# Modelle werden beim Docker-Build nach /voices gelegt; Worker bleibt stateless.
VOICES_DIR = os.environ.get("PIPER_VOICES_DIR", "/voices")

VOICE_FILES: dict[str, str] = {
    "de-male": "de_DE-thorsten-medium.onnx",
    "de-female": "de_DE-kerstin-low.onnx",
    "en-male": "en_US-ryan-medium.onnx",
    "en-female": "en_US-amy-medium.onnx",
}

_voice_cache: dict[str, Any] = {}
_voice_lock = threading.Lock()


def _resolve_voice_id(voice_id: str | None, lang: str | None, gender: str | None) -> str:
    if voice_id and voice_id in VOICE_FILES:
        return voice_id
    base = "de" if (lang or "de").lower().startswith("de") else "en"
    suffix = "female" if (gender or "").lower() == "female" else "male"
    return f"{base}-{suffix}"


def _load_voice(voice_id: str) -> Any:
    with _voice_lock:
        cached = _voice_cache.get(voice_id)
        if cached is not None:
            return cached
        model_path = os.path.join(VOICES_DIR, VOICE_FILES[voice_id])
        if not os.path.exists(model_path):
            raise HTTPException(status_code=503, detail="Voice model not available")
        from piper.voice import PiperVoice

        voice = PiperVoice.load(model_path)
        _voice_cache[voice_id] = voice
        return voice


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
    return {"voices": available, "engine": "piper"}


@router.post("")
def synthesize(body: TtsRequest) -> Response:
    text = normalize_text(body.text, max_length=800).value.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Empty text")

    voice_id = _resolve_voice_id(body.voiceId, body.lang, body.gender)
    voice = _load_voice(voice_id)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        voice.synthesize(text, wav_file)

    return Response(
        content=buffer.getvalue(),
        media_type="audio/wav",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Voice-Id": voice_id,
        },
    )
