"""Tests fuer den Moderations-Fallworkflow (erledigen/eskalieren)."""

from __future__ import annotations

import io
import json
import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_moderation as admin_moderation_route
from app.api.v1.routes.auth import _make_token
from app.integrations.email_account_store import set_email_account_store
from app.main import app

NOW_MS = int(time.time() * 1000)


def _feedback() -> list[dict[str, Any]]:
    return [
        {"rating": "report", "twinId": "t1", "messageId": "m1", "comment": "Beleidigung", "createdAt": NOW_MS - 1000},
        {"rating": "report", "twinId": "t2", "messageId": "m2", "createdAt": NOW_MS - 2000},
    ]


class FakeClient:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.get_paginator = lambda name: self

    def paginate(self, Bucket: str, Prefix: str):
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        yield {"Contents": [{"Key": k} for k in keys]}

    def get_object(self, Bucket: str, Key: str):
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket: str, Key: str, Body: bytes, ContentType: str = "application/json"):
        self.objects[Key] = Body


class FakeAccountStore:
    def list_account_summaries(self, limit: int = 2000) -> list[dict[str, Any]]:
        return []


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
    admin_moderation_route.storage_configured = lambda: True  # type: ignore[assignment]
    fake = FakeClient()
    admin_moderation_route._client = lambda: fake  # type: ignore[assignment]
    setup_function.fake = fake  # type: ignore[attr-defined]


def teardown_function() -> None:
    set_email_account_store(None)
    import importlib

    importlib.reload(admin_moderation_route)


def test_case_action_requires_session_and_csrf() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/moderation/case",
        json={"twinId": "t1", "messageId": "m1", "action": "resolve"},
    )
    assert response.status_code == 401
    response = client.post(
        "/api/admin/moderation/case",
        json={"twinId": "t1", "messageId": "m1", "action": "resolve"},
        cookies=_session_cookie(["admin"]),
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_case_resolve_persists_audits_and_enriches_queue(monkeypatch) -> None:
    recorded: list[dict[str, Any]] = []

    def fake_audit(**kwargs: Any) -> dict[str, Any]:
        recorded.append(kwargs)
        return {"id": "a1", **kwargs}

    monkeypatch.setattr(admin_moderation_route.audit_store, "record_action", fake_audit)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/moderation/case",
        json={"twinId": "t1", "messageId": "m1", "action": "resolve", "note": "Geprüft, kein Verstoß"},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["case"]["status"] == "resolved"
    assert recorded[0]["action"] == "moderation.resolve"

    queue = client.get("/api/admin/moderation", cookies=_session_cookie(["admin"])).json()
    counts = queue["counts"]
    assert counts["openCases"] == 1
    assert counts["resolvedCases"] == 1
    row = next(r for r in queue["reports"] if r["messageId"] == "m1")
    assert row["caseStatus"] == "resolved"
    assert row["caseNote"] == "Geprüft, kein Verstoß"


def test_case_escalate_sets_status(monkeypatch) -> None:
    monkeypatch.setattr(admin_moderation_route.audit_store, "record_action", lambda **kw: {"id": "a", **kw})
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/moderation/case",
        json={"twinId": "t2", "messageId": "m2", "action": "escalate"},
        cookies=_session_cookie(["owner"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    queue = client.get("/api/admin/moderation", cookies=_session_cookie(["admin"])).json()
    assert queue["counts"]["escalatedCases"] == 1
