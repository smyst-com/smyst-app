"""Tests fuer die Moderations-Sicht (gemeldete Nachrichten, echte Zaehler)."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_moderation as admin_moderation_route
from app.api.v1.routes.auth import _make_token
from app.integrations.email_account_store import set_email_account_store
from app.main import app

WEEK_MS = 7 * 24 * 60 * 60 * 1000
NOW_MS = int(time.time() * 1000)


def _feedback() -> list[dict[str, Any]]:
    return [
        {"rating": "up", "twinId": "t1", "createdAt": NOW_MS - 1000},
        {"rating": "down", "twinId": "t1", "createdAt": NOW_MS - 2000},
        {"rating": "down", "twinId": "t2", "createdAt": NOW_MS - WEEK_MS - 5000},
        {"rating": "report", "twinId": "t2", "comment": "Beleidigung", "question": "Was hältst du von X?", "createdAt": NOW_MS - 3000},
        {"rating": "report", "twinId": "t3", "createdAt": NOW_MS - WEEK_MS - 6000},
    ]


class FakeAccountStore:
    def list_account_summaries(self, limit: int = 2000) -> list[dict[str, Any]]:
        return [
            {"email": "a@example.com", "status": "active", "createdAt": 1},
            {"email": "b@example.com", "status": "deleted", "createdAt": 2},
            {"email": "c@example.com", "status": "deleted", "createdAt": 3},
        ]


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
    set_email_account_store(FakeAccountStore())  # type: ignore[arg-type]
    admin_moderation_route.feedback_store.list_feedback = lambda twin_id=None, limit=50: _feedback()[:limit]  # type: ignore[assignment]


def teardown_function() -> None:
    set_email_account_store(None)


def test_admin_moderation_requires_session() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/moderation")
    assert response.status_code == 401


def test_admin_moderation_counts_and_reports(monkeypatch) -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/moderation", cookies=_session_cookie(["admin"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    counts = payload["counts"]
    assert counts["feedbackTotal"] == 5
    assert counts["up"] == 1
    assert counts["down"] == 2
    assert counts["down7d"] == 1
    assert counts["report"] == 2
    assert counts["report7d"] == 1
    assert counts["deletedAccounts"] == 2
    reports = payload["reports"]
    assert len(reports) == 2
    # Neueste Meldung zuerst, mit Kommentar und Frage-Schnipsel
    assert reports[0]["twinId"] == "t2"
    assert reports[0]["comment"] == "Beleidigung"


def test_admin_moderation_degrades_when_feedback_unavailable(monkeypatch) -> None:
    def _boom(twin_id=None, limit=50):
        raise RuntimeError("e2 down")

    monkeypatch.setattr(admin_moderation_route.feedback_store, "list_feedback", _boom)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/moderation", cookies=_session_cookie(["owner"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "unavailable"
    assert payload["counts"]["feedbackTotal"] == 0
    assert payload["reports"] == []
