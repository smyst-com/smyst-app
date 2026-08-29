"""Tests fuer die Finance-Sicht (Abrechnungsbasis aus dem Impression-Archiv)."""

from __future__ import annotations

import io
import json
import time
from datetime import UTC
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_finance as admin_finance_route
from app.api.v1.routes.auth import _make_token
from app.main import app


def _today_compact() -> str:
    from datetime import datetime

    return datetime.now(UTC).strftime("%Y%m%d")


def _yesterday_compact() -> str:
    from datetime import datetime, timedelta

    return (datetime.now(UTC) - timedelta(days=1)).strftime("%Y%m%d")


class FakeClient:
    """Minimaler S3-Fake: list_objects_v2 + get_object fuer bekannte Keys."""

    def __init__(self, objects: dict[str, dict[str, Any]]) -> None:
        self._objects = objects
        self.get_paginator = lambda name: self

    def paginate(self, Bucket: str, Prefix: str):
        keys = sorted(k for k in self._objects if k.startswith(Prefix))
        yield {"Contents": [{"Key": k} for k in keys]}

    def get_object(self, Bucket: str, Key: str):
        body = json.dumps(self._objects[Key]).encode("utf-8")
        return {"Body": io.BytesIO(body)}


def _archive() -> dict[str, dict[str, Any]]:
    today, yesterday = _today_compact(), _yesterday_compact()
    return {
        f"pipeline/ads/impressions/{today}/a1.json": {"slug": "einstein", "creatorSub": "creator-1"},
        f"pipeline/ads/impressions/{today}/a2.json": {"slug": "einstein", "creatorSub": "creator-1"},
        f"pipeline/ads/impressions/{today}/a3.json": {"slug": "fitness-coach", "creatorSub": "creator-2"},
        f"pipeline/ads/impressions/{yesterday}/b1.json": {"slug": "einstein", "creatorSub": "creator-1"},
        "pipeline/ads/impressions/20250101/old.json": {"slug": "alt", "creatorSub": "alt"},
    }


def _session_cookie(roles: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "admin-sub",
            "email": "admin@example.com",
            "roles": roles,
            "permissions": [],
            "expiresAt": int(time.time() * 1000) + 3_600_000,
        }
    )
    return {"smyst_session": token}


def setup_function() -> None:
    admin_finance_route.storage_configured = lambda: True
    admin_finance_route._client = lambda: FakeClient(_archive())  # type: ignore[assignment]


def teardown_function() -> None:
    # Originale Funktionen wiederherstellen (Modul neu laden reicht nicht)
    import importlib

    importlib.reload(admin_finance_route)


def test_admin_finance_requires_session() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/finance")
    assert response.status_code == 401


def test_admin_finance_counts_days_and_tops() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/finance", cookies=_session_cookie(["admin"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source"] == "idrive-e2"
    counts = payload["counts"]
    assert counts["totalImpressions"] == 5
    assert counts["today"] == 3
    assert counts["recent7d"] == 4  # heute 3 + gestern 1, alt excluded
    assert counts["userSharePercent"] == 25
    days = payload["days"]
    assert len(days) == 14
    assert sum(day["impressions"] for day in days) == 4  # nur die 14-Tage-Fenster
    top_profiles = payload["topProfiles"]
    assert top_profiles[0] == {"slug": "einstein", "impressions": 3}
    top_creators = payload["topCreators"]
    assert top_creators[0] == {"creatorSub": "creator-1", "impressions": 3}


def test_admin_finance_degrades_when_storage_down(monkeypatch) -> None:
    def _boom():
        raise RuntimeError("e2 down")

    monkeypatch.setattr(admin_finance_route, "_client", _boom)
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/finance", cookies=_session_cookie(["owner"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "unavailable"
    assert payload["counts"]["totalImpressions"] == 0
    assert payload["topProfiles"] == []
