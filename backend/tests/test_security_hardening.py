"""Security-Regressionstests der Haertungs-Runde 28.09.2026.

Jeder Test hier sichert einen konkreten Fix gegen stillstehende Rueckfaelle:
- P0: /security/* (Consent/Loeschung/Audit) war komplett ohne Auth
- P0: /ads/impression nahm beliebige Slugs an (Payout-Inflation)
- P1: zentraler Cookie-CSRF-Schutz (SameSite=None-Session)
- P1: Provider-/Health-/Storage-/WebResearch-Endpunkte redigiert bzw. geschlossen
- P1: Twin-Bild-URLs ohne Schema-Filter (Stored-XSS-Vektor)
- P2: SSRF-Redirect-Validierung, Billing-Origin-Allowlist, OpenAPI in Prod zu
"""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import SESSION_COOKIE, _make_token
from app.main import app
from app.security.middleware import _path_rate_limit, normalize_request_path

client = TestClient(app, base_url="https://testserver")


def _session_cookie(roles: list[str], sub: str = "hardening-sub") -> dict[str, str]:
    now_ms = int(time.time() * 1000)
    return {
        SESSION_COOKIE: _make_token(
            {
                "sub": sub,
                "email": "hardening@example.com",
                "roles": roles,
                "permissions": ["admin:read"] if {"admin", "owner"} & set(roles) else [],
                "expiresAt": now_ms + 3_600_000,
            }
        )
    }


CSRF = {"X-Smyst-CSRF": "1"}


# ---------------------------------------------------------------- P0: security.py
def test_security_consent_requires_auth() -> None:
    response = client.post(
        "/api/security/consent",
        json={
            "user_id": "00000000-0000-0000-0000-000000000001",
            "consent_type": "memory_upload",
            "purpose": "Test",
            "version": "1.0",
            "source": "test",
        },
    )
    assert response.status_code == 401


def test_security_consent_rejects_member() -> None:
    response = client.post(
        "/api/security/consent",
        cookies=_session_cookie(["member"]),
        headers=CSRF,
        json={
            "user_id": "00000000-0000-0000-0000-000000000001",
            "consent_type": "memory_upload",
            "purpose": "Test",
            "version": "1.0",
            "source": "test",
        },
    )
    assert response.status_code == 403


def test_security_deletion_requests_require_admin() -> None:
    response = client.post(
        "/api/security/deletion-requests",
        json={"user_id": "00000000-0000-0000-0000-000000000002", "scope": "user", "reason": "DSGVO"},
    )
    assert response.status_code == 401


def test_security_audit_recent_requires_admin() -> None:
    response = client.get("/api/security/audit/recent")
    assert response.status_code == 401
    response = client.get("/api/security/audit/recent", cookies=_session_cookie(["member"]))
    assert response.status_code == 403


# ---------------------------------------------------------------- P0: ads.py
def test_ads_impression_rejects_invalid_slug() -> None:
    response = client.post(
        "/api/ads/impression",
        json={"slug": "../../secrets/payout", "placement": "profile-footer"},
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_slug"


def test_ads_impression_rejects_uppercase_slug() -> None:
    response = client.post(
        "/api/ads/impression",
        json={"slug": "Albert-Einstein"},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------- P1: CSRF-Middleware
def test_cookie_post_without_csrf_header_is_blocked() -> None:
    response = client.post(
        "/api/twins",
        cookies=_session_cookie(["member"]),
        json={"name": "Csrf Test", "description": "x"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_cookie_post_with_csrf_header_passes_middleware() -> None:
    # Middleware laesst durch; die Route selbst antwortet dann - entscheidend
    # ist hier nur: KEIN 403 csrf_required.
    response = client.post(
        "/api/twins",
        cookies=_session_cookie(["member"]),
        headers=CSRF,
        json={"name": "Csrf Ok", "description": "x"},
    )
    assert response.status_code != 403 or response.json().get("code") != "csrf_required"


def test_bearer_post_without_cookie_passes_middleware() -> None:
    response = client.post(
        "/api/twins",
        headers={"Authorization": "Bearer v1.anything.sig", **CSRF},
        json={"name": "Bearer", "description": "x"},
    )
    assert response.status_code != 403 or response.json().get("code") != "csrf_required"


def test_anonymous_post_without_cookie_passes_middleware() -> None:
    # Gast-Anfragen (z. B. Chat) haben kein Session-Cookie und laufen weiter.
    response = client.post("/api/chat/messages/stream", json={"chatId": "none", "message": "hi"})
    assert response.status_code != 403 or response.json().get("code") != "csrf_required"


def test_get_with_cookie_needs_no_csrf_header() -> None:
    response = client.get("/api/auth/me", cookies=_session_cookie(["member"]))
    assert response.status_code == 200


# ---------------------------------------------------------------- P1: ai.py
def test_ai_providers_anonymous_is_redacted() -> None:
    response = client.get("/api/ai/providers")
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert providers, "Provider-Liste darf nicht leer sein"
    for entry in providers:
        assert "key_name" not in entry
        assert "base_url" not in entry
        assert "model" not in entry


def test_ai_providers_ping_requires_privilege() -> None:
    response = client.get("/api/ai/providers?ping=true")
    assert response.status_code == 403


def test_ai_dataflow_requires_admin() -> None:
    response = client.get("/api/ai/dataflow")
    assert response.status_code == 401


# ---------------------------------------------------------------- P1: health/storage/web_research
def test_health_deep_and_production_require_admin() -> None:
    assert client.get("/api/health/deep").status_code == 401
    assert client.get("/api/health/production").status_code == 401


def test_health_live_and_ready_stay_public() -> None:
    assert client.get("/api/health/live").status_code == 200
    assert client.get("/api/health/ready").status_code in {200, 503}


def test_storage_capabilities_requires_session() -> None:
    assert client.get("/api/storage/capabilities").status_code == 401


def test_web_research_run_requires_session() -> None:
    response = client.post(
        "/api/web-research/run",
        json={"question": "irgendeine frage"},
    )
    assert response.status_code == 401


def test_web_research_public_suggestions_require_session() -> None:
    response = client.post(
        "/api/web-research/public-profile-suggestions",
        json={"question": "frage", "profile_id": "q42"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------- P1: Twin-Bild-URLs
def test_twin_image_url_rejects_javascript_scheme(monkeypatch) -> None:
    from app.api.v1.routes import user_mvp

    assert user_mvp._clean_image_url("javascript:alert(1)") == ""
    assert user_mvp._clean_image_url("data:text/html,<script>") == ""
    assert user_mvp._clean_image_url("https://cdn.example.com/a.jpg") == "https://cdn.example.com/a.jpg"
    assert user_mvp._clean_image_url("/local/path.png") == "/local/path.png"
    assert user_mvp._clean_image_key("uploads/2026/x.bin") == "uploads/2026/x.bin"
    assert user_mvp._clean_image_key("https://evil/") == ""
    assert user_mvp._clean_image_key("../../etc/passwd") == ""


def test_avatar_clean_rejects_non_https(monkeypatch) -> None:
    from app.ai.avatar import resolve_avatar_url

    assert resolve_avatar_url("javascript:alert(1)", None, "/placeholder.svg") == "/placeholder.svg"
    assert resolve_avatar_url("https://ok.example/a.png", None, "/placeholder.svg") == "https://ok.example/a.png"


# ---------------------------------------------------------------- P1: SSRF-Redirects
def test_social_links_redirect_targets_are_validated() -> None:
    from app.api.v1.routes.social_links import _redirect_target_allowed

    assert _redirect_target_allowed("https://example.com/page") is True
    assert _redirect_target_allowed("http://127.0.0.1:8080/admin") is False
    assert _redirect_target_allowed("http://169.254.169.254/latest/meta-data") is False
    assert _redirect_target_allowed("http://10.0.0.5/internal") is False
    assert _redirect_target_allowed("ftp://example.com/x") is False


# ---------------------------------------------------------------- P2: Billing-Origin
def test_billing_origin_allowlist() -> None:
    from fastapi import Request

    from app.api.v1.routes.billing import _safe_checkout_origin

    class FakeRequest:
        def __init__(self, origin: str | None, base: str = "https://testserver/") -> None:
            self.headers = {"origin": origin} if origin else {}
            self.base_url = base

    # Eigene Origin wird uebernommen
    allowed_origin = None
    from app.core.config import get_settings

    settings = get_settings()
    if settings.cors_origins:
        allowed_origin = settings.cors_origins[0]
        assert _safe_checkout_origin(FakeRequest(allowed_origin)) == allowed_origin.rstrip("/")
    # Fremde Origin faellt auf die Public-Basis-URL zurueck
    assert _safe_checkout_origin(FakeRequest("https://evil.example")) == settings.public_base_url.rstrip("/")
    # Ohne Origin-Header: Basis-URL der Anfrage (same-origin)
    assert _safe_checkout_origin(FakeRequest(None)) == "https://testserver"


# ---------------------------------------------------------------- P2: Rate-Limit-Pfade
def test_rate_limit_path_normalization() -> None:
    assert normalize_request_path("/api/v1/tts") == "/tts"
    assert normalize_request_path("/api/tts") == "/tts"
    assert normalize_request_path("/tts") == "/tts"
    assert normalize_request_path("/api/v1/auth/email/login") == "/auth/email/login"
    # Alle drei Mounts teilen sich EIN Budget: gleicher normalisierter Pfad
    assert normalize_request_path("/api/v1/chat/x") == normalize_request_path("/api/chat/x") == normalize_request_path("/chat/x")


def test_path_rate_limits_are_stricter_than_default() -> None:
    for path, expected in [
        ("/tts", 30),
        ("/asr/transcribe", 12),
        ("/auth/email/login", 10),
        ("/ads/impression", 60),
        ("/visits", 30),
    ]:
        assert _path_rate_limit(path) == expected, path
        assert _path_rate_limit(normalize_request_path("/api/v1" + path)) == expected, path


# ---------------------------------------------------------------- P2: OpenAPI in Produktion
def test_openapi_disabled_in_production(monkeypatch) -> None:
    from app.core.config import Settings
    from app.main import create_app

    prod_settings = Settings(app_env="production", auth_session_secret="x" * 48)
    monkeypatch.setattr("app.main.settings", prod_settings)
    prod_app = create_app()
    assert prod_app.openapi_url is None
    assert prod_app.docs_url is None


# ------------------------------------------------- Security-Runde 2: IP-Pinning
def test_resolve_public_ips_rejects_private_hosts() -> None:
    from app.api.v1.routes.social_links import _resolve_public_ips

    assert _resolve_public_ips("127.0.0.1") == []
    assert _resolve_public_ips("localhost") == []
    assert _resolve_public_ips("169.254.169.254") == []
    assert _resolve_public_ips("10.0.0.1") == []


def test_dechunk_decodes_chunked_body() -> None:
    from app.api.v1.routes.social_links import _dechunk

    chunked = b"4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n"
    assert _dechunk(chunked) == b"Wikipedia"
    # Ungueltige Eingabe bricht sauber ab (kein Crash)
    assert isinstance(_dechunk(b"m\u00fclk"), bytes)


# ------------------------------------------- Security-Runde 2: Upload-Presign
def test_upload_presign_signs_content_length() -> None:
    import json as _json
    from unittest.mock import patch

    from app.api.v1.routes import storage as storage_route

    captured: dict = {}

    class FakeClient:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            captured[operation] = Params
            return "https://signed.example/fake"

        def head_object(self, **kwargs):
            return {"ContentLength": 1}

    with patch.object(storage_route, "_storage_ready", lambda: True), \
         patch.object(storage_route, "_client", lambda: FakeClient()):
        response = client.post(
            "/api/storage/upload-url",
            cookies=_session_cookie(["member"]),
            headers={"X-Smyst-CSRF": "1"},
            json={
                "filename": "memo.png",
                "contentType": "image/png",
                "category": "image",
                "size": 1234,
            },
        )
    assert response.status_code == 200, response.text
    params = captured.get("put_object")
    assert params is not None
    assert params.get("ContentLength") == 1234


# ------------------------------------------------- Canary-Honeypot (Radar-26)
def test_canary_status_zero_and_tripwire_404(monkeypatch) -> None:
    from app.api.v1.routes import security as security_route

    monkeypatch.setattr(security_route, "_CANARY_COUNT", {"count": None, "loaded_at": 0.0})
    response = client.get("/api/security/canary/status")
    assert response.status_code == 200
    assert response.json()["count"] == 0

    # Ohne e2-Konfiguration landet der Treffer nur im Audit-Log (RAM).
    response = client.get("/api/security/canary/.env.bak")
    assert response.status_code == 404
    # Cache wurde durch den Hit NICHT veraendert (Zaehlung laeuft ueber e2-List)
    response = client.get("/api/security/canary/status")
    assert response.status_code == 200
