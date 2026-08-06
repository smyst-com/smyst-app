"""Tests fuer Soft-Delete und Wiederherstellung einzelner Twins."""

import time

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import SESSION_COOKIE, _make_token
from app.integrations import user_store
from app.main import app

client = TestClient(app)


def _cookies(sub: str) -> dict[str, str]:
    now_ms = int(time.time() * 1000)
    session = {
        "sub": sub,
        "email": "smyst247@gmail.com",
        "name": "smyst.com Test",
        "picture": None,
        "locale": "de",
        "roles": ["owner"],
        "permissions": ["auth:read"],
        "createdAt": now_ms,
        "expiresAt": now_ms + 60_000,
    }
    return {SESSION_COOKIE: _make_token(session)}


def _create_twin(cookies: dict[str, str], name: str) -> dict:
    response = client.post(
        "/api/twins",
        json={"name": name, "description": "Testprofil fuer Soft-Delete"},
        cookies=cookies,
    )
    assert response.status_code == 200, response.text
    return response.json()["twin"]


def _twin_ids(cookies: dict[str, str]) -> list[str]:
    response = client.get("/api/twins", cookies=cookies)
    assert response.status_code == 200, response.text
    return [t["id"] for t in response.json()["twins"]]


def test_delete_requires_auth() -> None:
    response = client.delete("/api/twins/irgendwas")
    assert response.status_code == 401


def test_delete_unknown_twin_returns_404() -> None:
    response = client.delete("/api/twins/gibt-es-nicht", cookies=_cookies("google:sd-404"))
    assert response.status_code == 404


def test_soft_delete_moves_twin_to_trash_and_restore_brings_it_back() -> None:
    sub = "google:sd-roundtrip"
    cookies = _cookies(sub)
    twin = _create_twin(cookies, "Soft Delete Proband")
    assert twin["id"] in _twin_ids(cookies)

    response = client.delete(f"/api/twins/{twin['id']}", cookies=cookies)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert body["restorable"] is True

    # Aus der aktiven Liste verschwunden, aber NICHT geloescht:
    assert twin["id"] not in _twin_ids(cookies)
    doc = user_store.load_user_doc(sub)
    trash_ids = [t["id"] for t in doc.get("deletedTwins", [])]
    assert twin["id"] in trash_ids

    # Papierkorb-Endpunkt zeigt ihn:
    listing = client.get("/api/twins/deleted/list", cookies=cookies)
    assert listing.status_code == 200
    assert twin["id"] in [t["id"] for t in listing.json()["twins"]]

    # Wiederherstellen:
    restore = client.post(f"/api/twins/{twin['id']}/restore", cookies=cookies)
    assert restore.status_code == 200, restore.text
    assert twin["id"] in _twin_ids(cookies)
    doc = user_store.load_user_doc(sub)
    assert twin["id"] not in [t["id"] for t in doc.get("deletedTwins", [])]


def test_restore_unknown_twin_returns_404() -> None:
    response = client.post(
        "/api/twins/nie-geloescht/restore", cookies=_cookies("google:sd-restore-404")
    )
    assert response.status_code == 404
