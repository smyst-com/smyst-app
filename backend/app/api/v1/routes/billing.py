"""Stripe-Billing fuer smyst Premium (Phase 2 Master-Plan, Web-Abo 4,99 EUR/Monat).

Ablauf:
1. POST /billing/checkout-session  (Login) -> Stripe-Checkout-URL (Abo)
2. Stripe ruft POST /billing/webhook (checkout.session.completed /
   customer.subscription.deleted) -> setzt premiumActive im Nutzer-Dokument
3. GET /billing/status (Login) -> Premium-Status fuer die UI

Ohne konfigurierten Stripe-Key antwortet checkout mit 503 (feature_flag_off) –
Free-only-Betrieb bleibt unberuehrt. Stripe-SDK wird lazy importiert, damit
Tests ohne Install lauffaehg bleiben.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes.user_mvp import _require_sub
from app.core.config import get_settings
from app.integrations.user_store import load_user_doc, save_user_doc

router = APIRouter(prefix="/billing", tags=["billing"])


def _now_ms() -> int:
    return int(time.time() * 1000)


def _stripe_configured() -> bool:
    settings = get_settings()
    return bool(settings.stripe_secret_key and settings.stripe_premium_price_id)


def _create_checkout_session(*, price_id: str, secret_key: str, sub: str, origin: str) -> Any:
    """Stripe-SDK-Aufruf, in Tests monkeypatchbar."""
    import stripe

    stripe.api_key = secret_key
    return stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        client_reference_id=sub,
        metadata={"user_sub": sub},
        success_url=f"{origin}/?premium=success",
        cancel_url=f"{origin}/?premium=cancelled",
    )


def _verify_webhook_event(*, payload: bytes, signature: str, secret: str) -> Any:
    """Signatur-pruefung; wirft bei ungueltiger Signatur (Tests monkeypatchbar)."""
    import stripe

    return stripe.Webhook.construct_event(payload, signature, secret)


@router.post("/checkout-session")
async def create_checkout_session(request: Request) -> Any:
    sub, error = _require_sub(request)
    if error is not None:
        return error
    if not _stripe_configured():
        return JSONResponse(
            status_code=503,
            content={"error": "billing_not_configured", "message": "Premium ist gerade nicht verfügbar."},
        )
    origin = str(request.headers.get("origin") or request.base_url).rstrip("/")
    settings = get_settings()
    session = _create_checkout_session(
        price_id=settings.stripe_premium_price_id,
        secret_key=settings.stripe_secret_key,
        sub=sub,
        origin=origin,
    )
    return {"checkoutUrl": session.url, "sessionId": session.id}


@router.get("/status")
async def billing_status(request: Request) -> Any:
    sub, error = _require_sub(request)
    if error is not None:
        return error
    doc = load_user_doc(sub) or {}
    return {
        "premiumActive": bool(doc.get("premiumActive")),
        "premiumSince": doc.get("premiumSince"),
        "stripeCustomerId": doc.get("stripeCustomerId"),
    }


@router.post("/webhook")
async def stripe_webhook(request: Request) -> Any:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        return JSONResponse(status_code=503, content={"error": "billing_not_configured"})
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = _verify_webhook_event(
            payload=payload, signature=signature, secret=settings.stripe_webhook_secret
        )
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid_signature"})

    event_type = event.get("type", "") if isinstance(event, dict) else event.type
    data_object = (
        event.get("data", {}).get("object", {})
        if isinstance(event, dict)
        else event.data.object
    )

    if event_type == "checkout.session.completed":
        sub = str(data_object.get("client_reference_id") or data_object.get("metadata", {}).get("user_sub") or "")
        if sub:
            doc = load_user_doc(sub) or {"sub": sub}
            doc["premiumActive"] = True
            doc["premiumSince"] = _now_ms()
            if data_object.get("customer"):
                doc["stripeCustomerId"] = data_object.get("customer")
            save_user_doc(sub, doc)
    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = str(data_object.get("metadata", {}).get("user_sub") or "")
        if sub:
            doc = load_user_doc(sub) or {"sub": sub}
            doc["premiumActive"] = False
            doc["premiumCancelledAt"] = _now_ms()
            save_user_doc(sub, doc)

    return {"received": True}
