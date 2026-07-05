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

import io
import logging
import os
import tempfile
import threading

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smyst.voice_worker")

MAX_TEXT = 800
MAX_SAMPLE_BYTES = 12 * 1024 * 1024
SUPPORTED_LANGS = {"de", "en", "tr", "fr", "es", "it", "pt", "nl", "pl", "ru", "ar", "zh", "ja", "ko", "hi"}

_model = None
_model_kind = ""
_model_error = ""
_loading = False
_lock = threading.Lock()


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


class CloneRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    sampleUrl: str = Field(min_length=12, max_length=4000)
    lang: str | None = Field(default="de", max_length=16)


app = FastAPI(title="smyst-voice-worker", docs_url=None, redoc_url=None)


@app.on_event("startup")
def warmup() -> None:
    threading.Thread(target=_load_model, daemon=True).start()


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
                wav = _model.generate(text, language_id=lang, audio_prompt_path=handle.name)
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

