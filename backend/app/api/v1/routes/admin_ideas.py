"""Ideen- & Modell-Loop (Admin-Stufe 3).

GET  /api/admin/ideas               - Freigabe-Karten aller Ideen des Ideen-Autopilots
                                      (Status proposed/approved/rejected) plus die
                                      neuesten smyst-1.0-Modell-Eval-Ergebnisse.
POST /api/admin/ideas/{id}/approve  - Idee fuer die Umsetzung durch den Agenten
                                      freigeben (nur Statuswechsel + Audit, kein
                                      Code, kein Deployment).
POST /api/admin/ideas/{id}/reject   - Idee ablehnen mit Pflicht-Begruendung.

Schutzregeln: nichts wird geloescht; Entscheidungen werden mit Zeit und
Account protokolliert. POST verlangt CSRF-Header und Admin-Session.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request

router = APIRouter(prefix="/admin/ideas", tags=["admin"])

IDEA_PREFIX = "pipeline/ideas/"
IDEAS_LIMIT = 50


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


def _store() -> Any:
    from app.core.config import settings
    from app.integrations.candidate_store import CandidateStore, build_s3_client

    return CandidateStore(build_s3_client(), settings.idrive_e2_bucket)


def _load_ideas(store: Any) -> list[dict[str, Any]]:
    from app.core.config import settings

    ideas: list[dict[str, Any]] = []
    paginator = store._client.get_paginator("list_objects_v2")  # noqa: SLF001
    pages = paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=IDEA_PREFIX)
    for page in pages:
        for obj in page.get("Contents", []):
            key = str(obj["Key"])
            if not key.endswith(".json"):
                continue
            try:
                body = store._client.get_object(Bucket=settings.idrive_e2_bucket, Key=key)["Body"].read()  # noqa: SLF001
                ideas.append(json.loads(body.decode("utf-8")))
            except Exception:
                continue
    ideas.sort(key=lambda doc: str(doc.get("created_at") or ""), reverse=True)
    return ideas[:IDEAS_LIMIT]


def _load_model_reports(store: Any, limit: int = 5) -> list[dict[str, Any]]:
    from app.workers.generate_ideas import load_model_eval_latest

    return load_model_eval_latest(store, limit=limit)


def _load_payload() -> dict[str, Any]:
    store = _store()
    ideas = _load_ideas(store)
    return {
        "ok": True,
        "ideas": ideas,
        "counts": {
            "proposed": sum(1 for i in ideas if i.get("status") == "proposed"),
            "approved": sum(1 for i in ideas if i.get("status") == "approved"),
            "rejected": sum(1 for i in ideas if i.get("status") == "rejected"),
        },
        "modelReports": _load_model_reports(store),
    }


def _decide(idea_id: str, action: str, reason: str | None, decided_by: str) -> str:
    from datetime import UTC, datetime

    from app.core.config import settings

    store = _store()
    key = f"{IDEA_PREFIX}{idea_id}.json"
    obj = store._client.get_object(Bucket=settings.idrive_e2_bucket, Key=key)  # noqa: SLF001
    doc = json.loads(obj["Body"].read().decode("utf-8"))
    if doc.get("status") != "proposed":
        return f"abgelehnt: Idee ist bereits '{doc.get('status')}'"
    doc["status"] = "approved" if action == "approve" else "rejected"
    doc["decided_at"] = datetime.now(UTC).isoformat()
    doc["decided_by"] = decided_by
    doc["decision_reason"] = reason
    store._client.put_object(  # noqa: SLF001
        Bucket=settings.idrive_e2_bucket,
        Key=key,
        Body=json.dumps(doc, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    verb = "freigegeben zur Umsetzung" if action == "approve" else f"abgelehnt ({reason})"
    return f"Idee '{doc.get('title')}': {verb} – Entscheidung von {decided_by}"


@router.get("")
async def list_ideas(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    try:
        return await asyncio.to_thread(_load_payload)
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "ideas_unavailable",
                "message": "Ideen-Daten (Object Brain) sind hier nicht erreichbar.",
            },
        )


@router.post("/{idea_id}/approve")
async def approve_idea(idea_id: str, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    decided_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(_decide, idea_id, "approve", None, decided_by)
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "idea_error", "message": "Freigabe lief auf einen Fehler."},
        )
    return {"ok": result.startswith("Idee"), "id": idea_id, "result": result}


@router.post("/{idea_id}/reject")
async def reject_idea(idea_id: str, body: RejectRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    decided_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(_decide, idea_id, "reject", body.reason, decided_by)
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "idea_error", "message": "Ablehnen lief auf einen Fehler."},
        )
    return {"ok": result.startswith("Idee"), "id": idea_id, "result": result}
