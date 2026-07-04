from __future__ import annotations

import os
import subprocess
import tempfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.security.sanitization import normalize_text

router = APIRouter(prefix="/tts", tags=["tts"])

# Kuratierte, rein synthetische Piper-Stimmen (keine Klone realer Personen).
# Binary und Modelle werden beim Docker-Build installiert; Worker bleibt stateless.
VOICES_DIR = os.environ.get("PIPER_VOICES_DIR", "/voices")
PIPER_BIN = os.environ.get("PIPER_BIN", "/opt/piper/piper")

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
                "ready": os.path.exists(PIPER_BIN) and len(available) > 0,
    }


@router.post("")
def synthesize(body: TtsRequest) -> Response:
        text = normalize_text(body.text, max_length=800).value.strip()
    if not text:
                raise HTTPException(status_code=422, detail="Empty text")

    voice_id = _resolve_voice_id(body.voiceId, body.lang, body.gender)
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
