import time

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import SESSION_COOKIE, _make_token
from app.core.config import AUTH_SESSION_SECRET_PLACEHOLDER, settings
from app.main import app


client = TestClient(app, base_url="https://testserver")


def test_me_is_anonymous_without_session() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


def test_google_start_requires_runtime_config() -> None:
    response = client.get("/auth/google/start", follow_redirects=False)

    assert response.status_code == 503
    assert "Google OAuth is not configured" in response.text


def test_google_token_login_requires_runtime_config() -> None:
    response = client.post("/auth/google/token", json={})

    assert response.status_code == 503
    assert "Google OAuth is not configured" in response.text


def test_google_token_login_rejects_missing_token(monkeypatch) -> None:
    monkeypatch.setattr(settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(settings, "openrouter_api_key", "sk-or-test-master-key")

    response = client.post("/auth/google/token", json={})

    assert response.status_code == 400
    assert "Missing Google credential" in response.text


def test_effective_session_secret_derivation(monkeypatch) -> None:
    monkeypatch.setattr(settings, "auth_session_secret", AUTH_SESSION_SECRET_PLACEHOLDER)
    monkeypatch.setattr(settings, "openrouter_api_key", "sk-or-test-master-key")
    derived = settings.effective_auth_session_secret
    assert derived is not None
    assert len(derived) == 64
    assert derived != AUTH_SESSION_SECRET_PLACEHOLDER

    # Explizit gesetztes, ausreichend langes Secret hat Vorrang
    explicit = "x" * 48
    monkeypatch.setattr(settings, "auth_session_secret", explicit)
    assert settings.effective_auth_session_secret == explicit

    # Ohne Master-Key und ohne explizites Secret gibt es kein Signier-Secret
    monkeypatch.setattr(settings, "auth_session_secret", AUTH_SESSION_SECRET_PLACEHOLDER)
    monkeypatch.setattr(settings, "openrouter_api_key", None)
    assert settings.effective_auth_session_secret is None


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
