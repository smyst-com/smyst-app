"""Phase 2: Stripe-Billing (Checkout, Webhook-Signatur, Premium-Status)."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routes.auth import SESSION_COOKIE, _make_token
from app.api.v1.routes import billing
from app.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _auth_cookie(sub: str = "user-123") -> dict[str, str]:
    now_ms = int(time.time() * 1000)
    token = _make_token({"sub": sub, "expiresAt": now_ms + 60_000})
    return {SESSION_COOKIE: token}


def test_status_requires_login(client: TestClient) -> None:
    assert client.get("/api/v1/billing/status").status_code == 401


def test_checkout_returns_503_without_stripe_config(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(billing, "_stripe_configured", lambda: False)
    response = client.post("/api/v1/billing/checkout-session", cookies=_auth_cookie())
    assert response.status_code == 503
    assert response.json()["error"] == "billing_not_configured"


def test_checkout_returns_url_when_configured(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(billing, "_stripe_configured", lambda: True)

    class FakeSession:
        id = "cs_test_1"
        url = "https://checkout.stripe.com/c/pay/cs_test_1"

    def fake_create(*, price_id, secret_key, sub, origin):
        assert sub == "user-123"
        assert price_id == "price_premium"
        return FakeSession()

    monkeypatch.setattr(billing, "_create_checkout_session", fake_create)
    monkeypatch.setattr(
        billing, "get_settings",
        lambda: type("S", (), {
            "stripe_secret_key": "sk_test", "stripe_premium_price_id": "price_premium",
            "stripe_webhook_secret": None,
        })(),
    )
    response = client.post(
        "/api/v1/billing/checkout-session",
        cookies=_auth_cookie(), headers={"origin": "https://smyst.com"},
    )
    assert response.status_code == 200
    assert response.json()["checkoutUrl"].startswith("https://checkout.stripe.com")


def test_webhook_rejects_invalid_signature(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        billing, "get_settings",
        lambda: type("S", (), {"stripe_webhook_secret": "whsec_x"})(),
    )

    def bad_verify(**kwargs):
        raise ValueError("bad signature")

    monkeypatch.setattr(billing, "_verify_webhook_event", bad_verify)
    response = client.post(
        "/api/v1/billing/webhook",
        content=b"{}",
        headers={"stripe-signature": "t=1,v1=bad"},
    )
    assert response.status_code == 400


def test_webhook_activates_and_cancels_premium(client: TestClient, monkeypatch) -> None:
    settings = type("S", (), {"stripe_webhook_secret": "whsec_x"})()
    monkeypatch.setattr(billing, "get_settings", lambda: settings)

    def verify(**kwargs):
        import json as _json

        return _json.loads(kwargs["payload"])

    monkeypatch.setattr(billing, "_verify_webhook_event", verify)

    events: list[dict] = []

    def fake_load(sub):
        events.append(("load", sub))
        return None

    saved: dict[str, dict] = {}

    def fake_save(sub, doc):
        saved[sub] = doc
        return True

    monkeypatch.setattr(billing, "load_user_doc", fake_load)
    monkeypatch.setattr(billing, "save_user_doc", fake_save)

    # Abo aktiviert
    response = client.post(
        "/api/v1/billing/webhook",
        content=(
            b'{"type": "checkout.session.completed", "data": {"object": '
            b'{"client_reference_id": "user-9", "customer": "cus_1"}}}'
        ),
        headers={"stripe-signature": "t=1,v1=ok"},
    )
    assert response.status_code == 200
    assert saved["user-9"]["premiumActive"] is True
    assert saved["user-9"]["stripeCustomerId"] == "cus_1"

    # Abo gekuendigt
    response = client.post(
        "/api/v1/billing/webhook",
        content=(
            b'{"type": "customer.subscription.deleted", "data": {"object": '
            b'{"metadata": {"user_sub": "user-9"}}}}'
        ),
        headers={"stripe-signature": "t=1,v1=ok"},
    )
    assert response.status_code == 200
    assert saved["user-9"]["premiumActive"] is False
