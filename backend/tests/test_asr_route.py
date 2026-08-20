from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from app.api.v1.routes import asr as asr_route
from app.api.v1.routes import tts as tts_route
from app.main import app

client = TestClient(app, base_url="https://testserver")


def test_asr_status_is_transient_and_lists_required_languages(monkeypatch) -> None:
    monkeypatch.setenv("VOICE_WORKER_URL", "https://voice.example")
    monkeypatch.setenv("VOICE_WORKER_TOKEN", "x" * 32)

    response = client.get("/asr/status")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["storage"] == "transient"
    for lang in ["de", "tr", "en", "ar", "zh", "hi", "bn"]:
        assert lang in body["languages"]


def test_asr_transcribe_requires_worker_or_local_engine(monkeypatch) -> None:
    monkeypatch.delenv("VOICE_WORKER_URL", raising=False)
    monkeypatch.delenv("VOICE_WORKER_TOKEN", raising=False)
    monkeypatch.setattr(asr_route, "_local_asr_available", lambda: False)
    audio = base64.b64encode(b"0" * 1000).decode()

    response = client.post("/asr/transcribe", json={"audioBase64": audio, "contentType": "audio/webm", "lang": "tr"})

    assert response.status_code == 503
    assert response.json()["detail"] == "asr_worker_not_configured"


def test_asr_status_ready_with_local_engine(monkeypatch) -> None:
    monkeypatch.delenv("VOICE_WORKER_URL", raising=False)
    monkeypatch.delenv("VOICE_WORKER_TOKEN", raising=False)
    monkeypatch.setattr(asr_route, "_local_asr_available", lambda: True)

    response = client.get("/asr/status")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["engine"] == "local-whisper"


def test_asr_transcribe_uses_local_engine_without_worker(monkeypatch) -> None:
    monkeypatch.delenv("VOICE_WORKER_URL", raising=False)
    monkeypatch.delenv("VOICE_WORKER_TOKEN", raising=False)
    monkeypatch.setattr(asr_route, "_local_asr_available", lambda: True)
    calls: list[dict] = []

    def fake_local_transcribe(audio: bytes, lang: str | None):
        calls.append({"audio_len": len(audio), "lang": lang})
        return "Hallo, wie geht es dir?", "de"

    monkeypatch.setattr(asr_route, "_local_transcribe", fake_local_transcribe)
    audio = base64.b64encode(b"3" * 1200).decode()

    response = client.post("/asr/transcribe", json={"audioBase64": audio, "contentType": "audio/webm", "lang": "de-DE"})

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Hallo, wie geht es dir?"
    assert body["language"] == "de"
    assert body["engine"] == "local-whisper"
    assert calls[0]["lang"] == "de"
    assert calls[0]["audio_len"] == 1200


def test_asr_local_engine_rejects_empty_transcript(monkeypatch) -> None:
    monkeypatch.delenv("VOICE_WORKER_URL", raising=False)
    monkeypatch.delenv("VOICE_WORKER_TOKEN", raising=False)
    monkeypatch.setattr(asr_route, "_local_asr_available", lambda: True)
    monkeypatch.setattr(asr_route, "_local_transcribe", lambda _audio, _lang: ("", None))
    audio = base64.b64encode(b"4" * 1200).decode()

    response = client.post("/asr/transcribe", json={"audioBase64": audio, "contentType": "audio/webm"})

    assert response.status_code == 422
    assert response.json()["detail"] == "empty_transcript"


def test_asr_transcribe_proxies_to_voice_worker(monkeypatch) -> None:
    monkeypatch.setenv("VOICE_WORKER_URL", "https://voice.example/")
    monkeypatch.setenv("VOICE_WORKER_TOKEN", "secret-token-voice-worker-123")
    audio = base64.b64encode(b"1" * 1200).decode()
    calls: list[dict] = []

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> dict[str, object]:
            return {"text": "Merhaba, nasilsin?", "language": "tr", "durationMs": 123, "engine": "faster-whisper"}

    def fake_post(url: str, **kwargs):
        calls.append({"url": url, **kwargs})
        return FakeResponse()

    monkeypatch.setattr(asr_route.httpx, "post", fake_post)

    response = client.post("/asr/transcribe", json={"audioBase64": audio, "contentType": "audio/webm", "lang": "tr-TR"})

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Merhaba, nasilsin?"
    assert body["language"] == "tr"
    assert body["engine"] == "faster-whisper"
    assert calls[0]["url"] == "https://voice.example/transcribe"
    assert calls[0]["headers"]["X-Worker-Token"] == "secret-token-voice-worker-123"
    assert calls[0]["json"]["lang"] == "tr"
    assert calls[0]["json"]["contentType"] == "audio/webm"


def test_tts_uses_worker_when_piper_is_not_available(monkeypatch) -> None:
    monkeypatch.setenv("VOICE_WORKER_URL", "https://voice.example")
    monkeypatch.setenv("VOICE_WORKER_TOKEN", "secret-token-voice-worker-123")
    monkeypatch.setattr(tts_route.os.path, "exists", lambda _path: False)
    calls: list[dict] = []

    class FakeResponse:
        status_code = 200
        content = b"RIFF" + (b"2" * 1600)
        headers = {"X-Voice-Engine": "chatterbox-multilingual"}

    class FakeClient:
        def post(self, url: str, **kwargs):
            calls.append({"url": url, **kwargs})
            return FakeResponse()

    monkeypatch.setattr(tts_route, "_worker_client", lambda: FakeClient())

    response = client.post("/tts", json={"text": "Bonjour, je parle francais.", "lang": "fr"})

    assert response.status_code == 200
    assert response.content.startswith(b"RIFF")
    assert response.headers["X-Voice-Id"] == "worker-fr"
    assert response.headers["X-Voice-Engine"] == "chatterbox-multilingual"
    assert calls[0]["url"] == "https://voice.example/synthesize"
    assert calls[0]["json"]["lang"] == "fr"
