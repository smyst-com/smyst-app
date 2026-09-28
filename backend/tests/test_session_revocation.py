"""Session-Revocation (Security-Runde 2, 29.09.2026): serverseitige Widerrufbarkeit.

Gesichert wird:
- Epoch-Semantik: Widerruf toetet nur Tokens VOR dem Widerruf-Zeitpunkt
- logout-all widerruft real (alter Bearer wird ungueltig)
- _session_from_request lehnt widerrufene Sessions ab (alle Guards erben)
"""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from app.security import session_revocation

client = TestClient(app, base_url="https://testserver")


def _token(sub: str, age_ms: int = 0) -> str:
    from app.api.v1.routes.auth import _make_token

    now_ms = int(time.time() * 1000) - age_ms
    return _make_token(
        {
            "sub": sub,
            "email": "revoke@example.com",
            "roles": ["member"],
            "permissions": [],
            "createdAt": now_ms,
            "expiresAt": now_ms + 3_600_000,
        }
    )


def setup_function() -> None:
    session_revocation.reset_cache_for_tests()


def teardown_function() -> None:
    session_revocation.reset_cache_for_tests()


def test_epoch_semantics_old_token_dies_new_token_lives() -> None:
    session_revocation.revoke_sub("google:epoch-user", reason="test")
    older = int(time.time() * 1000) - 60_000
    newer = int(time.time() * 1000) + 5
    assert session_revocation.is_revoked("google:epoch-user", older) is True
    assert session_revocation.is_revoked("google:epoch-user", newer) is False


def test_logout_all_revokes_bearer_server_side() -> None:
    sub = "google:logout-all-user"
    token = _token(sub)
    headers = {"Authorization": f"Bearer {token}", "X-Smyst-CSRF": "1"}
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["authenticated"] is True
    response = client.post("/api/auth/logout-all", headers=headers)
    assert response.status_code == 200
    assert response.json()["revoked"] is True
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["authenticated"] is False
    response = client.get("/api/security/audit/recent", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_revoked_member_token_rejected_everywhere() -> None:
    sub = "google:revoked-member"
    token = _token(sub)
    response = client.get("/api/twins", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    session_revocation.revoke_sub(sub, reason="test")
    response = client.get("/api/twins", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_revocation_key_parsing() -> None:
    """Index-Aufbau aus Keys der Form <subHash>-<ts>.json (ohne Netz/S3)."""
    from app.security.session_revocation import REVOCATION_PREFIX

    class FakePaginator:
        def paginate(self, Bucket: str, Prefix: str) -> list[dict[str, Any]]:
            return [
                {
                    "Contents": [
                        {"Key": f"{REVOCATION_PREFIX}aaaa-1000.json"},
                        {"Key": f"{REVOCATION_PREFIX}aaaa-2000.json"},
                        {"Key": f"{REVOCATION_PREFIX}bbbb-1500.json"},
                        {"Key": f"{REVOCATION_PREFIX}cccc-keinzahl.json"},
                    ]
                }
            ]

    session_revocation.reset_cache_for_tests()
    original_client = session_revocation._client
    original_configured = session_revocation.storage_configured
    try:
        session_revocation.storage_configured = lambda: True  # type: ignore[assignment]
        session_revocation._client = lambda: type(  # type: ignore[assignment]
            "C", (), {"get_paginator": lambda self, name: FakePaginator()}
        )()
        assert session_revocation.is_revoked("x", 1500) is False  # kein Treffer
        index = session_revocation._INDEX
        assert index.get("aaaa") == 2000
        assert index.get("bbbb") == 1500
        assert "cccc" not in index
    finally:
        session_revocation._client = original_client  # type: ignore[assignment]
        session_revocation.storage_configured = original_configured  # type: ignore[assignment]
        session_revocation.reset_cache_for_tests()
