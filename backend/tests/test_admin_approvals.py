"""Tests fuer das Freigabe-Postfach (Admin-Stufe 2)."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import _make_token
from app.main import app


def _session_cookie(roles: list[str], permissions: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "user-1",
            "email": "owner@example.com",
            "roles": roles,
            "permissions": permissions,
            "expiresAt": int(time.time() * 1000) + 3_600_000,
        }
    )
    return {"smyst_session": token}


OWNER = _session_cookie(["owner"], ["admin:read"])


def test_approvals_require_admin() -> None:
    client = TestClient(app, base_url="https://testserver")
    assert client.get("/api/admin/approvals").status_code == 401
    assert client.get("/api/admin/approvals", cookies=OWNER).status_code in (200, 503)


def test_approve_requires_csrf(monkeypatch) -> None:
    import app.api.v1.routes.admin_approvals as route

    monkeypatch.setattr(route, "publish_one", lambda *a, **k: "published (slug x)")
    client = TestClient(app, base_url="https://testserver")
    response = client.post("/api/admin/approvals/Q1/approve", cookies=OWNER)
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_approve_publishes_via_pipeline_gate(monkeypatch) -> None:
    import app.api.v1.routes.admin_approvals as route

    calls: list[dict] = []

    def fake_publish(qid, *, store, config, approved_by, dry_run):
        calls.append({"qid": qid, "approved_by": approved_by})
        return f"published (slug {qid.lower()})"

    monkeypatch.setattr(route, "publish_one", fake_publish)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/approvals/Q1/approve",
        cookies=OWNER,
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert calls[0]["approved_by"] == "owner@example.com"


def test_reject_validates_reason() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/approvals/Q1/reject",
        cookies=OWNER,
        headers={"X-Smyst-CSRF": "1", "Content-Type": "application/json"},
        json={"reason": "x"},
    )
    assert response.status_code == 422
