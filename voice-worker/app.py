"""smyst.com Voice-Worker (Phase 2): Klon-TTS mit Chatterbox (MIT-Lizenz).

Stateless GPU-Worker auf SaladCloud. Er erhaelt vom API-Backend eine
zeitlich begrenzte, signierte Sample-URL (der Worker besitzt KEINE
Speicher-Schluessel) und synthetisiert den Text in der Stimme des Samples.

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


def _fallback_tts(text: str, lang: str) -> Response | None:
    voice = ESPEAK_FALLBACK_VOICES.get(lang)
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
    return {
        "ready": _model is not None,
        "loading": _loading,
        "kind": _model_kind,
        "error": _model_error[:200],
        "asrReady": _asr_model is not None,
        "asrLoading": _asr_loading,
        "asrError": _asr_error[:200],
        "asrPreload": PRELOAD_ASR,
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
    if _model is None:
        fallback = _fallback_tts(text, lang)
        if fallback is not None:
            return fallback
        if not _loading and _model_error:
            raise HTTPException(status_code=503, detail="model_failed")
        threading.Thread(target=_load_model, daemon=True).start()
        raise HTTPException(status_code=503, detail="model_loading")
    try:
        import torchaudio

        if _model_kind == "multilingual":
            wav = _model.generate(text, language_id=CHATTERBOX_LANGUAGE_ALIASES.get(lang, lang))
        else:
            wav = _model.generate(text)
        buffer = io.BytesIO()
        torchaudio.save(buffer, wav.cpu(), _model.sr, format="wav")
    except Exception as exc:  # noqa: BLE001
        logger.error("worker synthesis failed: %s", exc)
        fallback = _fallback_tts(text, lang)
        if fallback is not None:
            return fallback
        raise HTTPException(status_code=500, detail="synthesis_failed") from exc

    return Response(
        content=buffer.getvalue(),
        media_type="audio/wav",
        headers={"X-Voice-Engine": f"chatterbox-{_model_kind}", "X-Voice-Lang": lang},
    )


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
    language = lang if lang in SUPPORTED_LANGS else None
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
            segments, info = _asr_model.transcribe(
                handle.name,
                language=language,
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
        "language": getattr(info, "language", None) or language or "unknown",
        "durationMs": round((time.monotonic() - started) * 1000),
        "engine": "faster-whisper",
    }
