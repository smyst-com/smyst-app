"""Tests fuer den Autopilot-Re-Run (GitHub workflow dispatch)."""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi.testclient import TestClient

import app.api.v1.routes.admin_overview as admin_overview_route
from app.api.v1.routes.auth import _make_token
from app.main import app

NOW_MS = int(time.time() * 1000)


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


def test_rerun_requires_session_and_csrf() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post("/api/admin/autopilot/rerun", json={"file": "quality-loop.yml"})
    assert response.status_code == 401
    response = client.post(
        "/api/admin/autopilot/rerun",
        json={"file": "quality-loop.yml"},
        cookies=_session_cookie(["admin"]),
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_required"


def test_rerun_rejects_unknown_and_local_workflows() -> None:
    client = TestClient(app, base_url="https://testserver")
    for file in ["gibts-nicht.yml", "com.smyst.retrain-autopilot"]:
        response = client.post(
            "/api/admin/autopilot/rerun",
            json={"file": file},
            cookies=_session_cookie(["admin"]),
            headers={"X-Smyst-CSRF": "1"},
        )
        assert response.status_code == 404


def test_rerun_without_token_is_honest_503(monkeypatch) -> None:
    monkeypatch.delenv("SMYST_GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/autopilot/rerun",
        json={"file": "quality-loop.yml"},
        cookies=_session_cookie(["owner"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "token_missing"


def test_rerun_dispatches_and_audits(monkeypatch) -> None:
    monkeypatch.setenv("SMYST_GITHUB_TOKEN", "test-token")
    calls: list[tuple[str, dict[str, Any]]] = []

    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:  # noqa: ANN001
        calls.append((url, kwargs.get("json") or {}))  # type: ignore[arg-type]
        return httpx.Response(204)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    recorded: list[dict[str, Any]] = []

    def fake_audit(**kwargs: Any) -> dict[str, Any]:
        recorded.append(kwargs)
        return {"id": "a1", **kwargs}

    monkeypatch.setattr(admin_overview_route.audit_store, "record_action", fake_audit)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/autopilot/rerun",
        json={"file": "quality-loop.yml"},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert "workflows/quality-loop.yml/dispatches" in calls[0][0]
    assert calls[0][1] == {"ref": "main"}
    assert recorded[0]["action"] == "autopilot.rerun"


def test_rerun_reports_github_rejection(monkeypatch) -> None:
    monkeypatch.setenv("SMYST_GITHUB_TOKEN", "bad-token")

    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:  # noqa: ANN001
        return httpx.Response(422)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/autopilot/rerun",
        json={"file": "quality-loop.yml"},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 502
    assert response.json()["code"] == "dispatch_failed"
