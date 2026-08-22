"""Tests fuer den Ideen- & Modell-Loop (Admin-Stufe 3)."""

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


def test_ideas_require_admin() -> None:
    client = TestClient(app, base_url="https://testserver")
    assert client.get("/api/admin/ideas").status_code == 401
    assert client.get("/api/admin/ideas", cookies=OWNER).status_code in (200, 503)


def test_idea_approve_requires_csrf() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post("/api/admin/ideas/xyz/approve", cookies=OWNER)
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_idea_reject_validates_reason() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/ideas/xyz/reject",
        cookies=OWNER,
        headers={"X-Smyst-CSRF": "1", "Content-Type": "application/json"},
        json={"reason": "x"},
    )
    assert response.status_code == 422


def test_parse_ideas_extracts_json() -> None:
    from app.workers.generate_ideas import _parse_ideas

    raw = 'Vorspann {"ideas": [{"title": "T", "description": "D", "expected_benefit": "B"}]} Nachspann'
    ideas = _parse_ideas(raw)
    assert len(ideas) == 1
    assert ideas[0]["title"] == "T"

    assert _parse_ideas("kaputt") == []
