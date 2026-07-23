from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.v1.routes import tts as tts_route
from app.main import app

client = TestClient(app)


class _FakeWorkerResponse:
    status_code = 200
    content = b"RIFF" + b"0" * 2000

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Voice-Id": "de-thorsten", "X-Voice-Engine": "piper"}


class _FakeWorkerClient:
    def __init__(self) -> None:
        self.last_json: dict | None = None

    def post(self, url: str, json: dict, headers: dict, timeout: float) -> _FakeWorkerResponse:
        self.last_json = json
        return _FakeWorkerResponse()


def _fake_worker(monkeypatch) -> _FakeWorkerClient:
    fake = _FakeWorkerClient()
    monkeypatch.setenv("VOICE_WORKER_URL", "https://voice.example")
    monkeypatch.setenv("VOICE_WORKER_TOKEN", "x" * 32)
    # Lokalen Piper-Fallback deaktivieren, damit deterministisch der Worker-Pfad laeuft.
    monkeypatch.setattr(tts_route, "PIPER_BIN", "/nonexistent/piper")
    monkeypatch.setattr(tts_route, "_worker_client", lambda: fake)
    return fake


def test_tts_rate_out_of_bounds_is_rejected() -> None:
    for bad_rate in (0.1, 3.0):
        response = client.post("/tts", json={"text": "Hallo Welt", "lang": "de", "rate": bad_rate})
        assert response.status_code == 422


def test_tts_forwards_rate_to_worker(monkeypatch) -> None:
    fake = _fake_worker(monkeypatch)

    response = client.post(
        "/tts",
        json={"text": "Hallo Welt", "lang": "de", "gender": "male", "voiceId": "de-thorsten", "rate": 0.9},
    )

    assert response.status_code == 200
    assert response.headers["X-Voice-Id"] == "de-thorsten"
    assert fake.last_json is not None
    assert fake.last_json["rate"] == 0.9


def test_tts_without_rate_stays_backward_compatible(monkeypatch) -> None:
    fake = _fake_worker(monkeypatch)

    response = client.post(
        "/tts",
        json={"text": "Hallo Welt", "lang": "de", "gender": "male", "voiceId": "de-thorsten"},
    )

    assert response.status_code == 200
    assert fake.last_json is not None
    assert fake.last_json["rate"] is None
