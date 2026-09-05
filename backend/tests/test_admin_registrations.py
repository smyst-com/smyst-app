"""Tests fuer die Registrierungs-Kennzahlen (echte Konten, Tages-Buckets)."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_registrations as admin_registrations_route
from app.api.v1.routes.auth import _make_token
from app.integrations.email_account_store import set_email_account_store
from app.main import app

NOW = datetime.now(UTC)


def _ms_days_ago(days: float) -> int:
    return int((NOW - timedelta(days=days)).timestamp() * 1000)


class FakeAccountStore:
    def list_account_summaries(self, limit: int = 2000) -> list[dict[str, Any]]:
        return [
            # exakt JETZT statt 0.1 Tage: 0.1 Tage rutscht bei Laeufen kurz
            # nach Mitternacht UTC auf "gestern" (CI 00:09: newToday 0 statt 1)
            # und machte den Test uhrzeit-abhaengig — Pipeline blockierend.
            {"email": "a@example.com", "status": "active", "emailVerified": True, "createdAt": _ms_days_ago(0)},
            {"email": "b@example.com", "status": "active", "emailVerified": False, "createdAt": _ms_days_ago(3)},
            {"email": "c@example.com", "status": "active", "emailVerified": True, "createdAt": _ms_days_ago(20)},
            {"email": "d@example.com", "status": "deleted", "emailVerified": False, "createdAt": _ms_days_ago(30)},
        ]


def _session_cookie(roles: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "admin-sub",
            "email": "admin@example.com",
            "roles": roles,
            "permissions": [],
            "expiresAt": int(time.time() * 1000) + 3_600_000,
        }
    )
    return {"smyst_session": token}


def setup_function() -> None:
    set_email_account_store(FakeAccountStore())  # type: ignore[arg-type]


def teardown_function() -> None:
    set_email_account_store(None)


def test_admin_registrations_requires_session() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/registrations")
    assert response.status_code == 401


def test_admin_registrations_counts_and_buckets(monkeypatch) -> None:
    monkeypatch.setattr(
        admin_registrations_route.user_store,
        "list_user_doc_dates",
        lambda limit=10000: [_ms_days_ago(0.2), _ms_days_ago(6), _ms_days_ago(40)],
    )
    client = TestClient(app, base_url="https://testserver")
    response = client.get(
        "/api/admin/registrations", cookies=_session_cookie(["owner"])
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    counts = payload["counts"]
    assert counts["total"] == 4
    assert counts["active"] == 3
    assert counts["verified"] == 2
    assert counts["unverified"] == 1
    assert counts["deleted"] == 1
    assert counts["newToday"] == 1
    assert counts["new7d"] == 2
    assert counts["mvpTotal"] == 3
    assert counts["mvpToday"] == 1
    assert counts["mvp7d"] == 2
    days = payload["days"]
    assert len(days) == 14
    # Reihenfolge: aeltester Tag zuerst, heute zuletzt; im 14-Tage-Fenster
    # liegen nur die Konten von vor 0.1 und 3 Tagen (20/30 Tage sind aelter).
    assert days[-1]["date"] == NOW.strftime("%Y-%m-%d")
    assert sum(day["newAccounts"] for day in days) == 2
    # Keine einzelnen Adressen in der Antwort
    assert "users" not in payload


def test_admin_registrations_degrades_when_store_fails(monkeypatch) -> None:
    class _Boom:
        def list_account_summaries(self, limit: int = 2000) -> list[dict[str, Any]]:
            raise RuntimeError("e2 down")

    set_email_account_store(_Boom())  # type: ignore[arg-type]
    monkeypatch.setattr(
        admin_registrations_route.user_store, "list_user_doc_dates", lambda limit=10000: []
    )
    client = TestClient(app, base_url="https://testserver")
    response = client.get(
        "/api/admin/registrations", cookies=_session_cookie(["admin"])
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "unavailable"
    assert payload["counts"]["total"] == 0
    assert sum(day["newAccounts"] for day in payload["days"]) == 0
