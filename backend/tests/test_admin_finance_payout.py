"""Tests fuer Invalid-Traffic-Abzug und Auszahlungs-Vermerk (Finance Stufe 3)."""

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
    admin_finance_route.storage_configured = lambda: True  # type: ignore[assignment]
    fake = FakeClient()
    compact = MONTH.replace("-", "")
    for i, slug in enumerate(["a", "a", "b"]):
        key = f"pipeline/ads/impressions/{compact}/i{i}.json"
        fake.objects[key] = json.dumps({"slug": slug, "creatorSub": "c1"}).encode()
    admin_finance_route._client = lambda: fake  # type: ignore[assignment]
    setup_function.fake = fake  # type: ignore[attr-defined]


def teardown_function() -> None:
    import importlib

    importlib.reload(admin_finance_route)


def test_revenue_entry_with_invalid_traffic_deduction(monkeypatch) -> None:
    monkeypatch.setattr(admin_finance_route.audit_store, "record_action", lambda **kw: {"id": "a", **kw})
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/finance/revenue",
        json={"month": MONTH, "adsenseCents": 100_000, "invalidTrafficCents": 20_000, "note": None},
        cookies=_session_cookie(["admin"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["entry"]["invalidTrafficCents"] == 20_000

    payload = client.get("/api/admin/finance", cookies=_session_cookie(["admin"])).json()
    basis = payload["payoutBasis"]
    assert basis["adsenseCents"] == 100_000
    assert basis["invalidTrafficCents"] == 20_000
    assert basis["netCents"] == 80_000
    assert basis["poolCents"] == 20_000  # 25 % von 80_000
    # Anteile: a=2/3 -> 13333 Cents, b=1/3 -> 6667
    payouts = {row["slug"]: row for row in basis["payouts"]}
    assert payouts["a"]["payoutCents"] == round(20_000 * 2 / 3)
    assert payouts["b"]["payoutCents"] == round(20_000 * 1 / 3)


def test_payout_record_marks_month_paid(monkeypatch) -> None:
    monkeypatch.setattr(admin_finance_route.audit_store, "record_action", lambda **kw: {"id": "a", **kw})
    fake = setup_function.fake  # type: ignore[attr-defined]
    fake.objects[f"finance/adsense-revenue/v1/{MONTH}.json"] = json.dumps(
        {"month": MONTH, "adsenseCents": 100_000, "invalidTrafficCents": 0}
    ).encode()
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/finance/payout-record",
        json={"month": MONTH, "note": "Überweisung am 30."},
        cookies=_session_cookie(["owner"]),
        headers={"X-Smyst-CSRF": "1"},
    )
    assert response.status_code == 200
    assert response.json()["record"]["month"] == MONTH

    payload = client.get("/api/admin/finance", cookies=_session_cookie(["admin"])).json()
    assert payload["payoutBasis"]["paid"]["note"] == "Überweisung am 30."
    assert payload["payoutBasis"]["paid"]["paidBy"] == "admin@example.com"
    assert payload["payoutRecords"][0]["month"] == MONTH


def test_payout_record_requires_csrf() -> None:
    client = TestClient(app, base_url="https://testserver")
    response = client.post(
        "/api/admin/finance/payout-record",
        json={"month": MONTH},
        cookies=_session_cookie(["admin"]),
    )
    assert response.status_code == 403
