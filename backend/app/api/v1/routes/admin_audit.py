"""Admin-Endpoint fuer das revisionssichere Audit-Log.

GET /api/admin/audit liefert die neuesten Admin-Aktionen (Sperren,
Freigaben, Verwerfen, Einnahmen-Erfassung) aus audit/admin-actions/ im
Object Brain. Nur fuer Sessions mit admin:read (Rollen admin/owner).
Read-only — Audit-Records werden ausschliesslich angehaengt, nie geloescht.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.integrations import audit_store

router = APIRouter(prefix="/admin", tags=["admin"])

#: Mehr Eintraege braucht die Admin-Sicht nicht.
AUDIT_LIMIT = 50


@router.get("/audit")
async def admin_audit(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    try:
        records = await asyncio.to_thread(audit_store.list_recent, AUDIT_LIMIT)
        source = "idrive-e2" if audit_store.storage_configured() else "ram-fallback"
    except Exception:  # noqa: BLE001 — Audit-Ansicht darf nie 500en
        records = []
        source = "unavailable"

    return {
        "ok": True,
        "source": source,
        "records": records,
        "generatedAt": int(time.time() * 1000),
    }
