"""Tests fuer die manuelle AdSense-Einnahmen-Erfassung + Payout-Berechnung."""

from __future__ import annotations

import io
import json
import time
from typing import Any

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_finance as admin_finance_route
from app.api.v1.routes.auth import _make_token
from app.main import app

NOW_MS = int(time.time() * 1000)
MONTH = time.strftime("%Y-%m")


class FakeClient:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.get_paginator = lambda name: self

    def paginate(self, Bucket: str, Prefix: str):
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        yield {"Contents": [{"Key": k} for k in keys]}

    def get_object(self, Bucket: str, Key: str):
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket: str, Key: str, Body: bytes, ContentType: str = "application/json"):
        self.objects[Key] = Body


def _impression_objects() -> dict[str, bytes]:
    compact = MONTH.replace("-", "")
    out: dict[str, bytes] = {}
    for i, slug in enumerate(["einstein", "einstein", "fitness-coach"]):
        key = f"pipeline/ads/impressions/{compact}/i{i}.json"
        out[key] = json.dumps({"slug": slug, "creatorSub": "c1"}).encode()
    return out


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
    admin_finance_route.storage_configured = lambda: True
    fake = FakeClient()
    fake.objects.update(_impression_objects())
    admin_finance_route._client = lambda: fake  # type: ignore[assignment]
    setup_function.fake = fake  # type: ignore[attr-defined]


def teardown_function() -> None:
    import importlib

    importlib.reload(admin_finance_route)


def test_revenue_entry_requires_session_csrf_and_valid_month() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/finance/revenue", json={"month": MONTH, "adsenseCents": 1000}
    )
    assert response.status_code == 401
    response = client.post(
        "/api/admin/finance/revenue",
        json={"month": MONTH, "adsenseCents": 1000},
        cookies=_session_cookie(["admin"]),
    )
    assert response.status_code == 403  # CSRF
    response = client.post(
        "/api/admin/finance/revenue",
        json={"month": "2026-13", "adsenseCents": 1000},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 422  # pydantic pattern


def test_revenue_entry_persists_and_audits(monkeypatch) -> None:
    recorded: list[dict[str, Any]] = []

    def fake_audit(**kwargs: Any) -> dict[str, Any]:
        recorded.append(kwargs)
        return {"id": "a1", **kwargs}

    monkeypatch.setattr(admin_finance_route.audit_store, "record_action", fake_audit)
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/finance/revenue",
        json={"month": MONTH, "adsenseCents": 100_000, "note": "AdSense final August"},
        cookies=_session_cookie(["owner"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["entry"]["adsenseCents"] == 100_000
    assert recorded[0]["action"] == "finance.revenue_entry"
    assert recorded[0]["target_id"] == MONTH


def test_finance_get_includes_payout_basis(monkeypatch) -> None:
    fake = setup_function.fake  # type: ignore[attr-defined]
    fake.objects[f"finance/adsense-revenue/v1/{MONTH}.json"] = json.dumps(
        {"month": MONTH, "adsenseCents": 100_000, "note": None}
    ).encode()
    client = TestClient(app, base_url="https://testserver")
    response = client.get("/api/admin/finance", cookies=_session_cookie(["admin"]))
    assert response.status_code == 200
    payload = response.json()
    assert payload["revenue"][0]["month"] == MONTH
    basis = payload["payoutBasis"]
    assert basis["adsenseCents"] == 100_000
    assert basis["poolCents"] == 25_000  # 25 % von 100_000
    assert basis["impressionsLoaded"] == 3
    assert basis["capped"] is False
    payouts = basis["payouts"]
    assert payouts[0]["slug"] == "einstein"
    assert payouts[0]["payoutCents"] == round(25_000 * 2 / 3)
    assert payouts[1]["slug"] == "fitness-coach"
    assert payouts[1]["payoutCents"] == round(25_000 * 1 / 3)
