"""Admin-Endpoint fuer die echte Nutzerliste.

GET /api/admin/users liefert E-Mail-Konten aus dem Object Brain
(auth/email-accounts/v1/) als Zusammenfassungen ohne Passwort-Hashes plus
Zaehler der Nutzer-MVP-Dokumente (user-mvp/, inkl. OAuth-Subs). Nur fuer
Sessions mit admin:read (Rollen admin/owner). Read-only.

Google-OAuth-Nutzer haben keinen Konto-Datensatz — sie tauchen nur in den
mvpDocs-Zaehler ein, sobald sie MVP-Daten angelegt haben. Ein/Login-Sessions
sind zustandslos, daher gibt es keine "zuletzt aktiv"-Spalte.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.integrations import user_store
from app.integrations.email_account_store import get_email_account_store

logger = logging.getLogger("smyst.integrations.admin_users")

router = APIRouter(prefix="/admin", tags=["admin"])

#: Mehr Zeilen braucht die Admin-Tabelle nicht; Rest bleibt im Object Brain.
USERS_LIMIT = 200


def _count_user_docs() -> int:
    return user_store.count_user_docs()


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
