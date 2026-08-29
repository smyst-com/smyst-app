"""Admin-Endpoint fuer Moderation: gemeldete Chat-Nachrichten (echt).

GET /api/admin/moderation liefert aus dem Object Brain:
- gemeldete Nachrichten (rating='report') als Abuse-Queue
- Daumen-runter-Feedback (rating='down') als Qualitaetssignal
- DSGVO-geloeschte Konten (Tombstones im Account-Store)

Nur fuer Sessions mit admin:read (Rollen admin/owner). Read-only.

Bewusst ehrlich: Ein persistentes Audit-Log existiert noch nicht (der
In-Memory-AuditLogService ist nur lokale Referenz) — dieser Endpoint
erfindet keine Audit-Zahlen, sondern liefert nur gemessene Daten.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.integrations import feedback_store
from app.integrations.email_account_store import get_email_account_store

router = APIRouter(prefix="/admin", tags=["admin"])

#: 500 Feedback-Records reichen fuer Zaehler + Queue der Admin-Sicht.
FEEDBACK_SCAN_LIMIT = 500
#: Mehr gemeldete Faelle zeigt die Queue-Tabelle nicht.
REPORTS_TABLE_LIMIT = 30
#: Zeitfenster fuer "letzte 7 Tage" (ms).
WEEK_MS = 7 * 24 * 60 * 60 * 1000


def _snippet(value: Any, limit: int = 140) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()[:limit]


@router.get("/moderation")
async def admin_moderation(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    try:
        records = await asyncio.to_thread(feedback_store.list_feedback, None, FEEDBACK_SCAN_LIMIT)
        source = "idrive-e2"
    except Exception:
        records = []
        source = "unavailable"

    now_ms = int(time.time() * 1000)
    total = up = down = report = report_7d = down_7d = 0
    reports: list[dict[str, Any]] = []
    for record in records:
        total += 1
        rating = record.get("rating")
        created = record.get("createdAt")
        recent = isinstance(created, (int, float)) and created >= now_ms - WEEK_MS
        if rating == "up":
            up += 1
        elif rating == "down":
            down += 1
            if recent:
                down_7d += 1
        elif rating == "report":
            report += 1
            if recent:
                report_7d += 1
            if len(reports) < REPORTS_TABLE_LIMIT:
                reports.append(
                    {
                        "twinId": record.get("twinId"),
                        "messageId": record.get("messageId"),
                        "comment": _snippet(record.get("comment")),
                        "question": _snippet(record.get("question")),
                        "createdAt": created,
                    }
                )
    reports.sort(key=lambda row: row.get("createdAt") or 0, reverse=True)

    deleted_accounts = 0
    try:
        summaries = await asyncio.to_thread(get_email_account_store().list_account_summaries, 2000)
        deleted_accounts = sum(1 for row in summaries if row.get("status") == "deleted")
    except Exception:
        deleted_accounts = 0

    return {
        "ok": True,
        "source": source,
        "counts": {
            "feedbackTotal": total,
            "up": up,
            "down": down,
            "report": report,
            "report7d": report_7d,
            "down7d": down_7d,
            "deletedAccounts": deleted_accounts,
        },
        "reports": reports,
        "generatedAt": now_ms,
    }
