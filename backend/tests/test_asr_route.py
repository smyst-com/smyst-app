from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from app.api.v1.routes import asr as asr_route
from app.api.v1.routes import tts as tts_route
from app.main import app

client = TestClient(app)


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


def test_asr_transcribe_requires_worker(monkeypatch) -> None:
    monkeypatch.delenv("VOICE_WORKER_URL", raising=False)
    monkeypatch.delenv("VOICE_WORKER_TOKEN", raising=False)
    audio = base64.b64encode(b"0" * 1000).decode()

    response = client.post("/asr/transcribe", json={"audioBase64": audio, "contentType": "audio/webm", "lang": "tr"})

    assert response.status_code == 503
    assert response.json()["detail"] == "asr_worker_not_configured"


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
