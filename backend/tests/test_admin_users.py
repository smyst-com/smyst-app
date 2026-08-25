"""Tests fuer die Admin-Nutzerliste (echte Konten aus dem Object Brain)."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_users as admin_users_route
from app.api.v1.routes.auth import _make_token
from app.integrations.email_account_store import set_email_account_store
from app.main import app


class FakeAccountStore:
    """Nur für Tests: liefert Zusammenfassungen ohne e2-Zugriff."""

    def list_account_summaries(self, limit: int = 200) -> list[dict[str, Any]]:
        return [
            {
                "sub": "email:2",
                "email": "zwei@example.com",
                "name": "Zwei",
                "status": "active",
                "emailVerified": True,
                "createdAt": 2_000,
                "updatedAt": 2_500,
            },
            {
                "sub": "email:1",
                "email": "eins@example.com",
                "name": None,
                "status": "active",
                "emailVerified": False,
                "createdAt": 1_000,
                "updatedAt": 1_500,
            },
            {
                "sub": "email:0",
                "email": None,
                "name": None,
                "status": "deleted",
                "emailVerified": False,
                "createdAt": 500,
                "updatedAt": 900,
            },
        ][:limit]


def _session_cookie(roles: list[str], permissions: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "admin-sub",
            "email": "admin@example.com",
            "roles": roles,
            "permissions": permissions,
            "expiresAt": int(time.time() * 1000) + 3_600_000,
        }
    )
    return {"smyst_session": token}


def setup_function() -> None:
    set_email_account_store(FakeAccountStore())  # type: ignore[arg-type]


def teardown_function() -> None:
    set_email_account_store(None)


def test_admin_users_requires_session() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/users")
    assert response.status_code == 401
    assert response.json()["ok"] is False


def test_admin_users_forbidden_for_plain_members() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/users", cookies=_session_cookie(["member"], []))
    assert response.status_code == 403


def test_admin_users_returns_counts_and_rows(monkeypatch) -> None:
    monkeypatch.setattr(admin_users_route.user_store, "count_user_docs", lambda: 7)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/users", cookies=_session_cookie(["admin"], ["admin:read"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source"] == "idrive-e2"
    assert payload["counts"] == {
        "total": 3,
        "active": 2,
        "unverified": 1,
        "deleted": 1,
        "mvpDocs": 7,
    }
    # Neueste zuerst, kein passwordHash in der Antwort
    assert payload["users"][0]["email"] == "zwei@example.com"
    for row in payload["users"]:
        assert "passwordHash" not in row
        assert "password" not in row


def test_admin_users_degrades_gracefully_when_store_fails(monkeypatch) -> None:
    def _boom(limit: int = 200) -> list[dict[str, Any]]:
        raise RuntimeError("e2 down")

    set_email_account_store(_BoomStore())  # type: ignore[arg-type]
    monkeypatch.setattr(admin_users_route.user_store, "count_user_docs", lambda: 0)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/users", cookies=_session_cookie(["owner"], []))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source"] == "unavailable"
    assert payload["users"] == []
    assert payload["counts"]["total"] == 0


class _BoomStore:
    def list_account_summaries(self, limit: int = 200) -> list[dict[str, Any]]:
        raise RuntimeError("e2 down")
