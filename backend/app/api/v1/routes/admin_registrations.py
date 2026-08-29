"""Admin-Endpoint fuer Registrierungs-Kennzahlen (echte Daten, read-only).

GET /api/admin/registrations aggregiert:
- E-Mail-Konten aus dem Object Brain (createdAt → Tages-Buckets, 14 Tage)
- Verifiziert-/Unbestätigt-/DSGVO-Zaehler
- Aktivitaet der Nutzer-MVP-Dokumente (LastModified → heute/7 Tage)

Nur fuer Sessions mit admin:read (Rollen admin/owner). Es werden keine
einzelnen Adressen zurueckgegeben, nur Zaehler und Tages-Buckets — diese
Sicht ist rein statistisch.

Bewusst KEIN Fake-Funnel: Landing-/Signup-Impressions existieren nicht als
Datensatz, daher liefert der Endpoint nur, was wirklich gemessen wurde.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.integrations import user_store
from app.integrations.email_account_store import get_email_account_store

router = APIRouter(prefix="/admin", tags=["admin"])

#: Genug fuer kleine Nutzerzahlen; die Tabelle zeigt die neuesten Konten eh.
ACCOUNT_SCAN_LIMIT = 2000
DAY_BUCKETS = 14


def _day_key(ms: int | None) -> str | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=UTC).strftime("%Y-%m-%d")


@router.get("/registrations")
async def admin_registrations(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    store = get_email_account_store()
    try:
        users = await asyncio.to_thread(store.list_account_summaries, ACCOUNT_SCAN_LIMIT)
        source = "idrive-e2"
    except Exception:
        users = []
        source = "unavailable"

    try:
        mvp_dates = await asyncio.to_thread(user_store.list_user_doc_dates, ACCOUNT_SCAN_LIMIT)
    except Exception:
        mvp_dates = []

    now = datetime.now(UTC)
    today_key = now.strftime("%Y-%m-%d")
    week_ago_ms = int((now - timedelta(days=7)).timestamp() * 1000)

    daily: dict[str, int] = defaultdict(int)
    total = active = unverified = deleted = 0
    new_today = new_7d = 0
    for row in users:
        total += 1
        status = row.get("status")
        if status == "active":
            active += 1
            if not row.get("emailVerified"):
                unverified += 1
        elif status == "deleted":
            deleted += 1
        created = row.get("created_at") if "created_at" in row else row.get("createdAt")
        day = _day_key(created)
        if day:
            daily[day] += 1
            if day == today_key:
                new_today += 1
            if created and created >= week_ago_ms:
                new_7d += 1

    mvp_total = len(mvp_dates)
    mvp_today = sum(1 for ms in mvp_dates if ms and _day_key(ms) == today_key)
    mvp_7d = sum(1 for ms in mvp_dates if ms and ms >= week_ago_ms)

    days = []
    for offset in range(DAY_BUCKETS - 1, -1, -1):
        day = (now - timedelta(days=offset)).strftime("%Y-%m-%d")
        days.append({"date": day, "newAccounts": daily.get(day, 0)})

    return {
        "ok": True,
        "source": source,
        "counts": {
            "total": total,
            "active": active,
            "unverified": unverified,
            "deleted": deleted,
            "newToday": new_today,
            "new7d": new_7d,
            "verified": active - unverified,
            "mvpTotal": mvp_total,
            "mvpToday": mvp_today,
            "mvp7d": mvp_7d,
        },
        "days": days,
        "generatedAt": int(time.time() * 1000),
    }
