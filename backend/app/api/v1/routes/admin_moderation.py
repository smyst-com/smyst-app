"""Admin-Endpoints fuer Moderation: gemeldete Chat-Nachrichten (echt).

GET  /api/admin/moderation      – Abuse-Queue + Fallstatus (read-only)
POST /api/admin/moderation/case – Fall eskalieren/erledigen (CSRF-pflichtig,
                                  schreibt Audit-Record)

Fallstatus liegt als kleine JSON-Objekte unter moderation/cases/v1/ im
Object Brain: <safe(twinId)>__<safe(messageId)>.json. Feedback-Records
selbst bleiben unveraenderbar (append-only-Regel); der Status ist ein
separater Vermerk darueber.

Nur fuer Sessions mit admin:read (Rollen admin/owner).
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.core.config import settings
from app.integrations import audit_store, feedback_store
from app.integrations.email_account_store import get_email_account_store
from app.integrations.feedback_store import _client, _safe, storage_configured

router = APIRouter(prefix="/admin", tags=["admin"])

#: 500 Feedback-Records reichen fuer Zaehler + Queue der Admin-Sicht.
FEEDBACK_SCAN_LIMIT = 500
#: Mehr gemeldete Faelle zeigt die Queue-Tabelle nicht.
REPORTS_TABLE_LIMIT = 30
#: Zeitfenster fuer "letzte 7 Tage" (ms).
WEEK_MS = 7 * 24 * 60 * 60 * 1000

CASE_PREFIX = "moderation/cases/v1/"


def _snippet(value: Any, limit: int = 140) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()[:limit]


def _case_key(twin_id: str | None, message_id: str) -> str:
    return f"{CASE_PREFIX}{_safe(twin_id or '')}__{_safe(message_id)}.json"


def list_case_statuses() -> dict[str, dict[str, Any]]:
    """Alle Fall-Vermerke als Map '<twin>__<message>' -> Record."""
    if not storage_configured():
        return {}
    try:
        client = _client()
        paginator = client.get_paginator("list_objects_v2")
        out: dict[str, dict[str, Any]] = {}
        for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=CASE_PREFIX):
            for entry in page.get("Contents", []) or []:
                key = str(entry.get("Key", ""))
                stem = key[len(CASE_PREFIX) : -len(".json")] if key.endswith(".json") else ""
                if not stem:
                    continue
                try:
                    response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=key)
                    data = json.loads(response["Body"].read().decode("utf-8"))
                    if isinstance(data, dict):
                        out[stem] = data
                except Exception:  # noqa: BLE001, S112
                    continue
        return out
    except Exception:  # noqa: BLE001
        return {}


def save_case_status(record: dict[str, Any]) -> dict[str, Any]:
    client = _client()
    client.put_object(
        Bucket=settings.idrive_e2_bucket,
        Key=_case_key(record.get("twinId"), record.get("messageId") or ""),
        Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    return record


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


class CaseActionRequest(BaseModel):
    twinId: str | None = Field(default=None, max_length=120)
    messageId: str = Field(min_length=1, max_length=120)
    action: str = Field(pattern="^(resolve|escalate)$")
    note: str | None = Field(default=None, max_length=240)


@router.get("/moderation")
async def admin_moderation(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    try:
        records = await asyncio.to_thread(feedback_store.list_feedback, None, FEEDBACK_SCAN_LIMIT)
        source = "idrive-e2"
    except Exception:  # noqa: BLE001
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

    cases = await asyncio.to_thread(list_case_statuses)
    for row in reports:
        stem = f"{_safe(row.get('twinId') or '')}__{_safe(row.get('messageId') or '')}"
        case = cases.get(stem)
        if case:
            row["caseStatus"] = case.get("status")
            row["caseNote"] = case.get("note")
    open_cases = sum(1 for row in reports if row.get("caseStatus") in (None, "open"))
    resolved_cases = sum(1 for row in reports if row.get("caseStatus") == "resolved")
    escalated_cases = sum(1 for row in reports if row.get("caseStatus") == "escalated")

    deleted_accounts = 0
    try:
        summaries = await asyncio.to_thread(get_email_account_store().list_account_summaries, 2000)
        deleted_accounts = sum(1 for row in summaries if row.get("status") == "deleted")
    except Exception:  # noqa: BLE001
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
            "openCases": open_cases,
            "resolvedCases": resolved_cases,
            "escalatedCases": escalated_cases,
        },
        "reports": reports,
        "generatedAt": now_ms,
    }


@router.post("/moderation/case")
async def admin_moderation_case(body: CaseActionRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    if not storage_configured():
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )

    session = _session_from_request(request) or {}
    status = "resolved" if body.action == "resolve" else "escalated"
    record = {
        "twinId": body.twinId,
        "messageId": body.messageId,
        "status": status,
        "note": (body.note or "").strip()[:240] or None,
        "handledBy": session.get("email"),
        "handledAt": int(time.time() * 1000),
    }
    try:
        await asyncio.to_thread(save_case_status, record)
    except Exception:  # noqa: BLE001
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )
    await asyncio.to_thread(
        audit_store.record_action,
        actor_sub=session.get("sub"),
        actor_email=session.get("email"),
        action=f"moderation.{body.action}",
        target_type="chat_report",
        target_id=f"{body.twinId}/{body.messageId}",
        detail=record["note"],
    )
    return {"ok": True, "case": record}
