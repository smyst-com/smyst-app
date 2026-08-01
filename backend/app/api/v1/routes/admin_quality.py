"""Admin-Endpoint fuer die Qualitaetsschleife der Profile.

GET /api/admin/quality liefert die vom Quality-Report-Worker aggregierte
Zusammenfassung (Eval-Scores, Regressionen, offene Freshness-Reviews) plus
die neuesten Chat-Feedback-Records. Nur fuer Sessions mit admin:read
(Rollen admin/owner aus SMYST_ADMIN_EMAILS/SMYST_OWNER_EMAILS).

Read-only: dieser Endpoint schreibt und loescht nichts.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes.auth import _session_from_request
from app.integrations import feedback_store, quality_store

router = APIRouter(prefix="/admin", tags=["admin"])

#: Mehr Feedback-Zeilen braucht die Admin-Sicht nicht; Details im Object Brain.
FEEDBACK_LIMIT = 30


def _require_admin(request: Request) -> JSONResponse | None:
    session = _session_from_request(request)
    if not session:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "code": "auth_required", "message": "Bitte melde dich an."},
        )
    permissions = session.get("permissions") or []
    roles = [str(role).lower() for role in (session.get("roles") or [])]
    if "admin:read" not in permissions and not ({"admin", "owner"} & set(roles)):
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "forbidden", "message": "Nur fuer Admins."},
        )
    return None


def _feedback_row(record: dict[str, Any]) -> dict[str, Any]:
    def _trim(value: Any, limit: int = 240) -> str | None:
        if not isinstance(value, str) or not value.strip():
            return None
        return value.strip()[:limit]

    return {
        "twinId": record.get("twinId"),
        "rating": record.get("rating"),
        "question": _trim(record.get("question")),
        "answer": _trim(record.get("answer")),
        "comment": _trim(record.get("comment")),
        "createdAt": record.get("createdAt"),
    }


@router.get("/quality")
async def quality_overview(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied

    summary = await asyncio.to_thread(quality_store.load_summary)
    records = await asyncio.to_thread(feedback_store.list_feedback, None, limit=200)
    records.sort(key=lambda record: record.get("createdAt") or 0, reverse=True)
    feedback = [_feedback_row(record) for record in records[:FEEDBACK_LIMIT]]
    down_count = sum(1 for record in records if record.get("rating") in ("down", "report"))
    return {
        "ok": True,
        "summary": summary,
        "feedback": {
            "recent": feedback,
            "total_listed": len(records),
            "down_or_report": down_count,
        },
    }
