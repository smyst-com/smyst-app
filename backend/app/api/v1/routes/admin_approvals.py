"""Freigabe-Postfach (Admin-Stufe 2): Pending-Kandidaten per Klick freigeben/ablehnen.

GET  /api/admin/approvals                - Karten aller Kandidaten im Status
                                           'reviewed' (getrennt nach QA bestanden /
                                           nicht bestanden).
POST /api/admin/approvals/{qid}/approve  - Publiziert via publish_one (derselbe
                                           QA-Gate-Code wie die Pipeline; Slug-
                                           Dubletten und Tageslimits gelten
                                           unveraendert).
POST /api/admin/approvals/{qid}/reject   - Terminal-Ablehnung mit Pflicht-Begruendung
                                           (Statuswechsel auf 'rejected', Dokument
                                           bleibt vollstaendig erhalten).

Schutzregeln: nichts wird geloescht; publish_one veraendert keine Live-Capsule
und keine kuratierten Profile. POST-Endpunkte verlangen CSRF-Header und
Admin-Session (Rollen admin/owner).
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineStatus, transition
from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.publish_profiles import (
    _append_audit,
    actor_uuid,
    publish_one,
)
from app.workers.research_candidates import _candidate_from_document

router = APIRouter(prefix="/admin/approvals", tags=["admin"])

#: Mehr Karten braucht die Freigabe-Sicht nicht; alles liegt im Object Brain.
APPROVALS_LIMIT = 100


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


def _store() -> CandidateStore:
    from app.core.config import settings

    return CandidateStore(build_s3_client(), settings.idrive_e2_bucket)


def _card(qid: str, document: dict[str, Any]) -> dict[str, Any]:
    return {
        "qid": qid,
        "name": document.get("name") or document.get("preferredName") or qid,
        "status": document.get("status"),
        "qa_passed": bool(document.get("qa_passed")),
        "risk_score": document.get("risk_score"),
        "image_status": document.get("image_status"),
        "status_reason": document.get("status_reason"),
        "reviewed_at": document.get("reviewed_at"),
    }


def _load_approvals() -> dict[str, Any]:
    store = _store()
    ready: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    for document in store.candidate_documents_by_status(
        PipelineStatus.REVIEWED.value, limit=APPROVALS_LIMIT
    ):
        qid = str(document.get("qid") or document.get("id") or "")
        if not qid:
            continue
        card = _card(qid, document)
        (ready if card["qa_passed"] else blocked).append(card)
    ready.sort(key=lambda card: card["name"].casefold())
    blocked.sort(key=lambda card: card["name"].casefold())
    return {
        "ok": True,
        "ready": ready,
        "blocked": blocked,
        "counts": {"ready": len(ready), "blocked": len(blocked)},
    }


def _reject(qid: str, reason: str, approved_by: str) -> str:
    store = _store()
    document = store.load_candidate_document(qid)
    if document.get("status") != PipelineStatus.REVIEWED.value:
        return f"abgelehnt: Status ist '{document.get('status')}', nicht 'reviewed'"
    candidate = replace(
        _candidate_from_document(document),
        qa_passed=bool(document.get("qa_passed")),
    )
    rejected, event = transition(
        candidate,
        PipelineStatus.REJECTED,
        reason=reason,
        actor=actor_uuid(approved_by),
        config=DEFAULT_CONFIG,
    )
    store.save_candidate_document(
        qid,
        {
            **document,
            "status": rejected.status.value,
            "status_reason": rejected.status_reason or reason,
            "audit_trail": _append_audit(document, event),
        },
    )
    return f"abgelehnt ({reason}; Entscheidung von {approved_by})"


@router.get("")
async def list_approvals(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    try:
        return await asyncio.to_thread(_load_approvals)
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "approvals_unavailable",
                "message": "Freigabe-Daten (Object Brain) sind hier nicht erreichbar.",
            },
        )


@router.post("/{qid}/approve")
async def approve_candidate(qid: str, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    approved_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(
            publish_one, qid, store=_store(), config=DEFAULT_CONFIG,
            approved_by=approved_by, dry_run=False,
        )
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "publish_error", "message": "Publish lief auf einen Fehler."},
        )
    ok = result.startswith("published")
    return {"ok": ok, "qid": qid, "result": result}


@router.post("/{qid}/reject")
async def reject_candidate(qid: str, body: RejectRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    approved_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(_reject, qid, body.reason, approved_by)
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "reject_error", "message": "Ablehnen lief auf einen Fehler."},
        )
    return {"ok": result.startswith("abgelehnt"), "qid": qid, "result": result}
