"""Tests fuer die private Upload-Mediathek."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.api.v1.routes import storage as storage_routes
from app.api.v1.routes.auth import _make_token
from app.integrations import user_store
from app.main import app

client = TestClient(app)


def _token(sub: str = "email:storage-test") -> str:
    now_ms = int(time.time() * 1000)
    return _make_token(
        {
            "sub": sub,
            "email": "storage-test@example.com",
            "name": "Storage Test",
            "roles": ["member"],
            "permissions": [],
            "createdAt": now_ms,
            "expiresAt": now_ms + 60_000,
        }
    )


class FakeS3Client:
    def generate_presigned_url(self, operation: str, Params: dict[str, str], ExpiresIn: int) -> str:  # noqa: N803
        assert operation == "get_object"
        assert ExpiresIn == storage_routes.DOWNLOAD_URL_TTL_SECONDS
        return f"https://signed.example/{Params['Key']}"


def setup_function() -> None:
    user_store.delete_user_doc_from_cache("email:storage-test")


def teardown_function() -> None:
    user_store.delete_user_doc_from_cache("email:storage-test")


def test_list_uploads_returns_only_owned_private_media(monkeypatch) -> None:
    sub = "email:storage-test"
    owned_key = "user-uploads/email__storage-test/video/abc123-mein-video.mp4"
    foreign_key = "user-uploads/email__other/video/zzz-fremd.mp4"
    user_store.save_user_doc(
        sub,
        {
            "profile": {"id": "default"},
            "twins": [],
            "memories": [],
            "chats": [],
            "uploads": [
                {
                    "uploadId": "abc123",
                    "key": owned_key,
                    "size": 12345,
                    "contentType": "video/mp4",
                    "category": "video",
                    "uploadedAt": 1_700_000_000_000,
                },
                {
                    "uploadId": "zzz",
                    "key": foreign_key,
                    "size": 999,
                    "contentType": "video/mp4",
                    "category": "video",
                    "uploadedAt": 1_700_000_000_001,
                },
            ],
        },
    )
    monkeypatch.setattr(storage_routes, "_storage_ready", lambda: True)
    monkeypatch.setattr(storage_routes, "_client", lambda: FakeS3Client())

    response = client.get("/storage/uploads", headers={"Authorization": f"Bearer {_token(sub)}"})

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["deleteLocked"] is True
    assert len(body["uploads"]) == 1
    upload = body["uploads"][0]
    assert upload["uploadId"] == "abc123"
    assert upload["name"] == "mein-video.mp4"
    assert upload["category"] == "video"
    assert upload["visibility"] == "private"
    assert upload["getUrl"] == f"https://signed.example/{owned_key}"
