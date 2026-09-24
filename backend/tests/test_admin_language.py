"""Admin-API des Language-Autopiloten: Auth-Gate + Statusform + Toggle."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_status_ohne_session_401() -> None:
    response = client.get("/api/admin/language/autopilot")
    assert response.status_code == 401
    assert response.json()["ok"] is False


def test_toggle_ohne_session_401() -> None:
    response = client.post("/api/admin/language/autopilot/toggle", json={"enabled": True})
    assert response.status_code == 401


def test_run_ohne_session_401() -> None:
    response = client.post(
        "/api/admin/language/autopilot/run", json={"profile": "x", "language": "tr"}
    )
    assert response.status_code == 401


def _admin_session(monkeypatch, email: str = "smyst247@gmail.com") -> None:
    from app.api.v1.routes import admin_language as route

    monkeypatch.setattr(
        route,
        "_require_admin",
        lambda request: None,
    )
    # execute_run nicht wirklich laufen lassen (waere ein echter Live-Lauf)
    monkeypatch.setattr(
        route,
        "execute_run",
        lambda *args, **kwargs: {"skipped": "test"},
    )


def test_status_mit_admin_liefert_form(monkeypatch) -> None:
    _admin_session(monkeypatch)
    response = client.get("/api/admin/language/autopilot")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert "register" in payload
    assert payload["register"]["ethnologueLivingLanguages"] == 7170
    assert "coverage" in payload and "errors" in payload


def test_toggle_persistent(monkeypatch) -> None:
    _admin_session(monkeypatch)
    response = client.post("/api/admin/language/autopilot/toggle", json={"enabled": False})
    assert response.status_code == 200
    assert response.json()["enabled"] is False
    # Wieder aktivieren (kein Seiteneffekt auf den Betrieb bleiben lassen)
    response = client.post("/api/admin/language/autopilot/toggle", json={"enabled": True})
    assert response.json()["enabled"] is True


def test_run_startet_begrenzt(monkeypatch) -> None:
    _admin_session(monkeypatch)
    response = client.post(
        "/api/admin/language/autopilot/run",
        json={"profile": "sokrates", "language": "tr", "function": "text", "limit": 2},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True and payload["started"] is True
    assert payload["limit"] == 2
