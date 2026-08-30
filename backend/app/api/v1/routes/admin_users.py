"""Admin-Endpoint fuer die echte Nutzerliste.

GET  /api/admin/users            – Konten-Zusammenfassungen (read-only)
POST /api/admin/users/status     – Konto sperren/entsperren (CSRF-pflichtig,
                                   schreibt einen Audit-Record)

Nur fuer Sessions mit admin:read (Rollen admin/owner). Sperren setzt den
Kontostatus auf "disabled": der Login akzeptiert nur status=="active", ein
neuer Login ist damit sofort blockiert. Bestehende zustandslose Session-
Tokens laufen natuerlich weiter ab (kurze TTL), ein Entsperren stellt den
Login sofort wieder her. Rollen bleiben bewusst Env-gesteuert
(SMYST_OWNER_EMAILS/SMYST_ADMIN_EMAILS) — das ist Sicherheitsdesign des
Inhabers, kein Backend-Zufgriff.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.integrations import audit_store, user_store
from app.integrations.email_account_store import get_email_account_store

logger = logging.getLogger("smyst.integrations.admin_users")

router = APIRouter(prefix="/admin", tags=["admin"])

#: Mehr Zeilen braucht die Admin-Tabelle nicht; Rest bleibt im Object Brain.
USERS_LIMIT = 200


def _count_user_docs() -> int:
    return user_store.count_user_docs()


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


class UserStatusRequest(BaseModel):
    sub: str = Field(min_length=3, max_length=200)
    action: str = Field(pattern="^(block|unblock)$")


@router.get("/users")
async def admin_users(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    store = get_email_account_store()
    try:
        users = await asyncio.to_thread(store.list_account_summaries, USERS_LIMIT)
        source = "idrive-e2"
    except Exception as exc:  # noqa: BLE001 — Admin-Sicht darf bei e2-Ausfall nicht 500en
        logger.warning("admin users listing failed (%s)", type(exc).__name__)
        users = []
        source = "unavailable"

    try:
        mvp_docs = await asyncio.to_thread(_count_user_docs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin users doc count failed (%s)", type(exc).__name__)
        mvp_docs = 0

    active = sum(1 for row in users if row.get("status") == "active")
    unverified = sum(
        1 for row in users if row.get("status") == "active" and not row.get("emailVerified")
    )
    deleted = sum(1 for row in users if row.get("status") == "deleted")

    return {
        "ok": True,
        "source": source,
        "limit": USERS_LIMIT,
        "counts": {
            "total": len(users),
            "active": active,
            "unverified": unverified,
            "deleted": deleted,
            "mvpDocs": mvp_docs,
        },
        "users": users,
    }


def _set_account_status(store: Any, sub: str, new_status: str) -> dict[str, Any] | None:
    """Sucht das Konto per sub in den Summaries und setzt den Status.

    Rueckgabe: aktualisierter Record-Auszug oder None (nicht gefunden).
    Wirft bei Store-Fehlern (Aufrufer wandelt in 503 um).
    """
    summaries = store.list_account_summaries(2000)
    match = next((row for row in summaries if row.get("sub") == sub), None)
    if match is None or not match.get("email"):
        return None
    account = store.get_account(match["email"])
    if account is None or account.get("status") == "deleted":
        return None
    account["status"] = new_status
    store.update_account(account)
    return {
        "sub": account.get("sub"),
        "email": account.get("email"),
        "status": account.get("status"),
    }


@router.post("/users/status")
async def admin_user_status(body: UserStatusRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf

    new_status = "disabled" if body.action == "block" else "active"
    store = get_email_account_store()
    try:
        updated = await asyncio.to_thread(_set_account_status, store, body.sub, new_status)
    except Exception as exc:  # noqa: BLE001 — e2-Fehler werden zu 503, nicht zu 500
        logger.warning("admin user status change failed (%s)", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )
    if updated is None:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "code": "not_found", "message": "Konto nicht gefunden oder DSGVO-gelöscht."},
        )

    session = _session_from_request(request) or {}
    await asyncio.to_thread(
        audit_store.record_action,
        actor_sub=session.get("sub"),
        actor_email=session.get("email"),
        action=f"user.{body.action}",
        target_type="user",
        target_id=body.sub,
        detail=f"Status -> {new_status} ({updated.get('email')})",
    )
    return {"ok": True, "user": updated}
