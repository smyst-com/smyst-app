"""Tests fuer echte Object-Brain-Groessen (Praefix-Statistik)."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_storage as admin_storage_route
from app.api.v1.routes.auth import _make_token
from app.main import app

NOW_MS = int(time.time() * 1000)


class FakeClient:
    def __init__(self) -> None:
        self.get_paginator = lambda name: self

    def paginate(self, Bucket: str, Prefix: str = "", Delimiter: str | None = None):
        if Delimiter == "/":
            yield {"CommonPrefixes": [{"Prefix": "chat-feedback/"}, {"Prefix": "user-mvp/"}]}
        else:
            objects = {
                "chat-feedback/": [("a.json", 10), ("b.json", 20)],
                "user-mvp/": [("u1.json", 5)],
            }[Prefix]
            yield {"Contents": [{"Key": k, "Size": s} for k, s in objects]}


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
    admin_storage_route.storage_configured = lambda: True  # type: ignore[assignment]
    admin_storage_route._client = lambda: FakeClient()  # type: ignore[assignment]


def teardown_function() -> None:
    import importlib

    importlib.reload(admin_storage_route)


def test_storage_stats_requires_session() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/storage-stats")
    assert response.status_code == 401


def test_storage_stats_counts_objects_and_bytes_sorted() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/storage-stats", cookies=_session_cookie(["admin"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source"] == "idrive-e2"
    rows = payload["rows"]
    # Nach Bytes absteigend: chat-feedback (2 Objekte, 30 B) vor user-mvp (1, 5 B)
    assert rows[0]["prefix"] == "chat-feedback"
    assert rows[0]["objects"] == 2
    assert rows[0]["bytes"] == 30
    assert rows[0]["capped"] is False
    assert rows[1]["prefix"] == "user-mvp"
    assert rows[1]["bytes"] == 5


def test_storage_stats_degrades_without_config(monkeypatch) -> None:
    monkeypatch.setattr(admin_storage_route, "storage_configured", lambda: False)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/storage-stats", cookies=_session_cookie(["owner"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "unavailable"
    assert payload["rows"] == []
