"""Tests fuer sichere Social-Link-Aenderungen."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import _make_token
from app.integrations import user_store
from app.main import app

client = TestClient(app)


def _token(sub: str = "email:social-test") -> str:
    now_ms = int(time.time() * 1000)
    return _make_token(
        {
            "sub": sub,
            "email": "social-test@example.com",
            "name": "Social Test",
            "roles": ["member"],
            "permissions": [],
            "createdAt": now_ms,
            "expiresAt": now_ms + 60_000,
        }
    )


def setup_function() -> None:
    user_store.delete_user_doc_from_cache("email:social-test")


def teardown_function() -> None:
    user_store.delete_user_doc_from_cache("email:social-test")


def test_social_link_delete_requires_confirmation_header() -> None:
    sub = "email:social-test"
    user_store.save_user_doc(
        sub,
        {
            "profile": {"id": "default"},
            "twins": [],
            "memories": [],
            "chats": [],
            "socialLinks": [
                {
                    "id": "social-test-link",
                    "url": "https://example.com/profile",
                    "platform": "website",
                    "status": "ok",
                }
            ],
        },
    )
    headers = {"Authorization": f"Bearer {_token(sub)}"}

    blocked = client.delete("/api/social/links/social-test-link", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "delete_confirmation_required"

    still_there = client.get("/api/social/links", headers=headers)
    assert still_there.status_code == 200
    assert len(still_there.json()["links"]) == 1

    deleted = client.delete(
        "/api/social/links/social-test-link",
        headers={**headers, "X-Smyst-Delete-Confirm": "delete-social-link"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    empty = client.get("/api/social/links", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["links"] == []
