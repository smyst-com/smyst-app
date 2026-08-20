"""Tests fuer die Avatar-Anbindung im User-MVP (SSOT-Regel aus app.ai.avatar).

Aufloesung: Twin-Bild ?? Besitzer-Avatar ?? Platzhalter. Der Besitzer-Avatar
wird beim ersten Profil-Abruf einmalig aus dem Google-Session-Bild uebernommen
und ist danach per PATCH /api/profile aenderbar (leer = entfernen).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.ai.avatar import DEFAULT_AVATAR_PLACEHOLDER
from app.api.v1.routes import user_mvp
from app.integrations import user_store
from app.main import app

GOOGLE_PICTURE = "https://lh3.googleusercontent.com/test-avatar.jpg"


@pytest.fixture()
def client(monkeypatch) -> TestClient:
    user_store._MEMORY.clear()
    monkeypatch.setattr(
        user_mvp,
        "_session_from_request",
        lambda request: {"sub": "test-user", "email": "t@example.com", "picture": GOOGLE_PICTURE},
    )
    return TestClient(app, base_url="https://testserver")


@pytest.fixture()
def client_without_picture(monkeypatch) -> TestClient:
    user_store._MEMORY.clear()
    monkeypatch.setattr(
        user_mvp,
        "_session_from_request",
        lambda request: {"sub": "test-user", "email": "t@example.com"},
    )
    return TestClient(app, base_url="https://testserver")


def test_profile_seeds_avatar_from_google_session(client: TestClient) -> None:
    body = client.get("/api/profile").json()
    assert body["profile"]["avatarUrl"] == GOOGLE_PICTURE
    assert body["profile"]["resolvedAvatarUrl"].startswith(GOOGLE_PICTURE)
    assert "v=" in body["profile"]["resolvedAvatarUrl"]


def test_profile_without_session_picture_resolves_placeholder(client_without_picture: TestClient) -> None:
    body = client_without_picture.get("/api/profile").json()
    assert body["profile"]["avatarUrl"] == ""
    assert body["profile"]["resolvedAvatarUrl"] == DEFAULT_AVATAR_PLACEHOLDER


def test_patch_avatar_overrides_and_clears(client: TestClient) -> None:
    client.get("/api/profile")
    body = client.patch("/api/profile", json={"avatarUrl": "https://example.com/me.png"}).json()
    assert body["profile"]["avatarUrl"] == "https://example.com/me.png"
    # Leerer String entfernt den Avatar -> Platzhalter greift wieder.
    body = client.patch("/api/profile", json={"avatarUrl": ""}).json()
    assert body["profile"]["avatarUrl"] == ""
    assert body["profile"]["resolvedAvatarUrl"] == DEFAULT_AVATAR_PLACEHOLDER


def test_patch_avatar_rejects_unsafe_schemes(client: TestClient) -> None:
    body = client.patch("/api/profile", json={"avatarUrl": "javascript:alert(1)"}).json()
    assert body["profile"]["avatarUrl"] == ""
    body = client.patch("/api/profile", json={"avatarUrl": "http://insecure.example/x.png"}).json()
    assert body["profile"]["avatarUrl"] == ""


def test_twin_resolution_owner_avatar_then_override(client: TestClient) -> None:
    client.get("/api/profile")  # Seeding
    created = client.post("/api/twins", json={"name": "Test Twin"}).json()["twin"]
    # Ohne Twin-Bild greift der Besitzer-Avatar.
    assert created["resolvedAvatarUrl"].startswith(GOOGLE_PICTURE)
    # Twin-Bild gewinnt vor dem Besitzer-Avatar.
    patched = client.patch(
        f"/api/twins/{created['id']}", json={"imageUrl": "https://example.com/twin.png"}
    ).json()["twin"]
    assert patched["resolvedAvatarUrl"].startswith("https://example.com/twin.png")
    listed = client.get("/api/twins").json()["twins"][0]
    assert listed["resolvedAvatarUrl"].startswith("https://example.com/twin.png")
