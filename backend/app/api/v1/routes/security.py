from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.security.audit import AuditEvent, audit_log_service
from app.security.consent import consent_service
from app.security.deletion import deletion_pipeline
from app.security.sanitization import normalize_text

router = APIRouter(prefix="/security", tags=["security"])

#: Obergrenze fuer CSP-Reports: Browser-Reports sind klein; alles Grossflaechige
#: hier ist Missbrauch (Audit-Poisoning / Storage-DoS).
CSP_REPORT_MAX_CHARS = 8_000


def _require_admin(request: Request) -> JSONResponse | None:
    """Session-Guard fuer Consent-/Loesch-/Audit-Verwaltung (admin/owner).

    Vorher standen diese Endpunkte komplett offen und nahmen beliebige
    user_id aus dem Request-Body an (Security-Fix 28.09.2026). Das Frontend
    nutzt sie nicht - sie sind Compliance-/Admin-Werkzeug.
    """
    from app.api.v1.routes.auth import _session_from_request

    session = _session_from_request(request)
    if not session:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "code": "auth_required", "message": "Bitte melde dich an."},
        )
    permissions = session.get("permissions") or []
    roles = {str(role).lower() for role in (session.get("roles") or [])}
    if "admin:read" not in permissions and not ({"admin", "owner"} & roles):
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "forbidden", "message": "Nur fuer Admins."},
        )
    return None


class ConsentGrantRequest(BaseModel):
    user_id: UUID
    twin_id: UUID | None = None
    consent_type: str = Field(min_length=2, max_length=80)
    purpose: str = Field(min_length=2, max_length=120)
    version: str = Field(min_length=1, max_length=40)
    source: str = Field(min_length=2, max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConsentRevokeRequest(BaseModel):
    user_id: UUID


class DeletionRequestBody(BaseModel):
    user_id: UUID
    target_id: UUID | None = None
    scope: str = Field(pattern="^(user|twin|upload|chat|memory)$")
    reason: str = Field(min_length=4, max_length=500)


@router.post("/consent")
async def grant_consent(body: ConsentGrantRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    consent_type = normalize_text(body.consent_type, max_length=80).value
    purpose = normalize_text(body.purpose, max_length=120).value
    record = consent_service.grant(
        user_id=body.user_id,
        twin_id=body.twin_id,
        consent_type=consent_type,
        purpose=purpose,
        version=body.version,
        source=body.source,
        metadata=body.metadata,
    )
    return {
        "id": str(record.consent_id),
        "status": record.status,
        "consent_type": record.consent_type,
        "purpose": record.purpose,
        "created_at": record.created_at.isoformat(),
    }


@router.post("/consent/{consent_id}/revoke")
async def revoke_consent(
    consent_id: UUID, body: ConsentRevokeRequest, request: Request
) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    try:
        record = consent_service.revoke(consent_id=consent_id, user_id=body.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Consent record not found") from exc
    return {
        "id": str(record.consent_id),
        "status": record.status,
        "revoked_at": record.revoked_at.isoformat() if record.revoked_at else None,
    }


@router.post("/deletion-requests")
async def request_deletion(body: DeletionRequestBody, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    reason = normalize_text(body.reason, max_length=500)
    deletion_request = deletion_pipeline.request(
        user_id=body.user_id,
        target_id=body.target_id,
        scope=body.scope,
        reason=reason.value,
    )
    return {
        "id": str(deletion_request.request_id),
        "status": deletion_request.status.value,
        "scope": deletion_request.scope,
        "steps": [{"key": step.key, "status": step.status.value} for step in deletion_request.steps],
        "warnings": reason.warnings,
    }


@router.post("/deletion-requests/{request_id}/dry-run-complete")
async def complete_deletion_dry_run(request_id: UUID, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    try:
        deletion_request = deletion_pipeline.complete_dry_run(request_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Deletion request not found") from exc
    return {
        "id": str(deletion_request.request_id),
        "status": deletion_request.status.value,
        "completed_at": deletion_request.completed_at.isoformat() if deletion_request.completed_at else None,
        "steps": [{"key": step.key, "status": step.status.value} for step in deletion_request.steps],
    }


@router.get("/audit/recent")
async def recent_audit_events(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    events = audit_log_service.recent()
    return {
        "events": [
            {
                "id": str(event.event_id),
                "action": event.action,
                "resource_type": event.resource_type,
                "resource_id": str(event.resource_id) if event.resource_id else None,
                "actor_user_id": str(event.actor_user_id) if event.actor_user_id else None,
                "metadata": event.metadata,
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ]
    }


@router.post("/csp-report")
async def csp_report(report: dict[str, Any]) -> dict[str, bool]:
    # Oeffentlich (Browser melden CSP-Verstoesse ohne Credentials), aber
    # begrenzt: Groesse deckeln, unserialisierbare Teile verwerfen.
    try:
        rendered = json.dumps(report, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        rendered = "{}"
    audit_log_service.record(
        event=AuditEvent(
            action="security.csp_report",
            resource_type="csp",
            metadata={"report": rendered[:CSP_REPORT_MAX_CHARS], "truncated": len(rendered) > CSP_REPORT_MAX_CHARS},
        )
    )
    return {"ok": True}


# ------------------------------------------------------------- Canary (Radar 26)
#: Honeypot: Niemand legitimer ruft /security/canary/* auf - jeder Treffer
#: ist ein Scanner/Angreifer und wird als Security-Event archiviert
#: (e2-Objekt, vom Autopilot per /canary/status gezaehlt). Antwort ist
#: bewusst ein 404, damit der Angreifer nichts ueber den Tripwire lernt.
CANARY_PREFIX = "security-events/canary/"

#: RAM-Cache des Zaehlers (LIST ist teuer; 60s Frische reichen).
_CANARY_COUNT: dict[str, object] = {"count": None, "loaded_at": 0.0}


def _canary_client():
    import boto3
    from botocore.config import Config

    from app.core.config import settings

    if not (settings.idrive_e2_access_key and settings.idrive_e2_secret_key):
        return None
    return boto3.client(
        "s3",
        endpoint_url=settings.idrive_e2_endpoint,
        region_name=settings.idrive_e2_region,
        aws_access_key_id=settings.idrive_e2_access_key,
        aws_secret_access_key=settings.idrive_e2_secret_key,
        config=Config(connect_timeout=3, read_timeout=4, retries={"max_attempts": 1}),
    )


def _canary_count() -> int:
    import time as _time

    from app.core.config import settings

    now = _time.time()
    if _CANARY_COUNT["count"] is not None and now - float(_CANARY_COUNT["loaded_at"]) < 60:
        return int(_CANARY_COUNT["count"])
    client = _canary_client()
    count = 0
    if client is not None:
        try:
            paginator = client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=CANARY_PREFIX):
                count += len(page.get("Contents", []) or [])
        except Exception:
            pass
    _CANARY_COUNT.update(count=count, loaded_at=now)
    return count


def _record_canary_hit(path: str, request: Request) -> None:
    import json as _json
    import time as _time
    import uuid as _uuid

    from app.core.config import settings

    audit_log_service.record(
        event=AuditEvent(
            action="security.canary_hit",
            resource_type="honeypot",
            metadata={"path": path[:120], "method": request.method},
        )
    )
    client = _canary_client()
    if client is not None:
        try:
            stamp = _time.time()
            key = f"{CANARY_PREFIX}{int(stamp * 1000)}-{_uuid.uuid4().hex[:8]}.json"
            payload = _json.dumps(
                {"at": stamp, "path": path[:200], "method": request.method, "ua": (request.headers.get("user-agent") or "")[:200]}
            ).encode("utf-8")
            client.put_object(Bucket=settings.idrive_e2_bucket, Key=key, Body=payload, ContentType="application/json")
            _CANARY_COUNT.update(count=_canary_count() + 1)
        except Exception:
            pass


@router.get("/canary/status")
async def canary_status() -> dict[str, object]:
    """Zaehler fuer den Security-Autopilot (0 = unberuehrt).

    Muss VOR dem Catch-all registriert sein, sonst schluckt der Tripwire
    die Statusroute selbst.
    """
    return {"count": _canary_count(), "prefix": CANARY_PREFIX}


@router.api_route("/canary/{probe_path:path}", methods=["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH"])
async def canary_tripwire(probe_path: str, request: Request) -> JSONResponse:
    if probe_path == "status":
        return await canary_status()
    _record_canary_hit(f"/security/canary/{probe_path}", request)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
