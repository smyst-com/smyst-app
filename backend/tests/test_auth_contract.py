import time

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import SESSION_COOKIE, _make_token
from app.main import app


client = TestClient(app)


def test_me_is_anonymous_without_session() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


def test_google_start_requires_runtime_config() -> None:
    response = client.get("/auth/google/start", follow_redirects=False)

    assert response.status_code == 503
    assert "Google OAuth is not configured" in response.text


def test_me_reads_signed_http_only_session_cookie() -> None:
    now_ms = int(time.time() * 1000)
    session = {
        "sub": "google:123",
        "email": "smyst247@gmail.com",
        "name": "Smyst",
        "picture": None,
        "locale": "de",
        "roles": ["owner"],
        "permissions": ["auth:read"],
        "createdAt": now_ms,
        "expiresAt": now_ms + 60_000,
    }
    token = _make_token(session)

    response = client.get("/auth/me", cookies={SESSION_COOKIE: token})

    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["user"]["sub"] == "google:123"
    assert body["user"]["email"] == "smyst247@gmail.com"
    assert body["session"]["tokenType"] == "signed-httpOnly-cookie"
