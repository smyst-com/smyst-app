"""Tests fuer schreibende Admin-Aktionen: Nutzer sperren/entsperren + Audit."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_users as admin_users_route
from app.api.v1.routes.auth import _make_token
from app.integrations.email_account_store import set_email_account_store
from app.main import app

NOW_MS = int(time.time() * 1000)

_ACCOUNTS: dict[str, dict[str, Any]] = {
    "active@example.com": {
        "version": 1, "sub": "sub-active", "email": "active@example.com",
        "status": "active", "emailVerified": True,
        "createdAt": NOW_MS - 5000, "updatedAt": NOW_MS - 4000,
    },
}


class FakeAccountStore:
    def list_account_summaries(self, limit: int = 200) -> list[dict[str, Any]]:
        return [
            {
                "sub": record["sub"], "email": record["email"], "name": None,
                "status": record["status"], "emailVerified": record["emailVerified"],
                "createdAt": record["createdAt"], "updatedAt": record["updatedAt"],
            }
            for record in _ACCOUNTS.values()
        ][:limit]

    def get_account(self, email: str) -> dict[str, Any] | None:
        return _ACCOUNTS.get(email)

    def update_account(self, record: dict[str, Any]) -> dict[str, Any]:
        _ACCOUNTS[record["email"]] = dict(record)
        return record


def _session_cookie(roles: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "admin-sub",
            "email": "admin@example.com",
            "roles": roles,
            "permissions": [],
            "expiresAt": NOW_MS + 3_600_000,
        }
    )
    return {"smyst_session": token}


def setup_function() -> None:
    _ACCOUNTS["active@example.com"]["status"] = "active"
    set_email_account_store(FakeAccountStore())  # type: ignore[arg-type]


def teardown_function() -> None:
    set_email_account_store(None)


def test_block_requires_session_and_csrf() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post("/api/admin/users/status", json={"sub": "sub-active", "action": "block"})
    assert response.status_code == 401
    response = client.post(
        "/api/admin/users/status",
        json={"sub": "sub-active", "action": "block"},
        cookies=_session_cookie(["admin"]),
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_block_and_unblock_change_status_and_write_audit(monkeypatch) -> None:
    recorded: list[dict[str, Any]] = []

    def fake_record(**kwargs: Any) -> dict[str, Any]:
        recorded.append(kwargs)
        return {"id": "audit-1", **kwargs}

    monkeypatch.setattr(admin_users_route.audit_store, "record_action", fake_record)
    client = TestClient(app, base_url="https://testserver")

    response = client.post(
        "/api/admin/users/status",
        json={"sub": "sub-active", "action": "block"},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["status"] == "disabled"
    assert _ACCOUNTS["active@example.com"]["status"] == "disabled"
    assert recorded[0]["action"] == "user.block"
    assert recorded[0]["actor_email"] == "admin@example.com"

    response = client.post(
        "/api/admin/users/status",
        json={"sub": "sub-active", "action": "unblock"},
        cookies=_session_cookie(["owner"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["status"] == "active"
    assert recorded[1]["action"] == "user.unblock"


def test_block_unknown_sub_returns_404() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/users/status",
        json={"sub": "sub-gibts-nicht", "action": "block"},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 404


def test_audit_endpoint_lists_recent(monkeypatch) -> None:
    import app.api.v1.routes.admin_audit as admin_audit_route

    monkeypatch.setattr(
        admin_audit_route.audit_store,
        "list_recent",
        lambda limit=50: [{"id": "a1", "action": "user.block", "createdAt": "2026-08-30T10:00:00+00:00"}],
    )
    monkeypatch.setattr(admin_audit_route.audit_store, "storage_configured", lambda: True)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/audit", cookies=_session_cookie(["admin"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source"] == "idrive-e2"
    assert payload["records"][0]["action"] == "user.block"
