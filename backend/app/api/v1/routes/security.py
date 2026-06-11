from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.security.audit import AuditEvent, audit_log_service
from app.security.consent import consent_service
from app.security.deletion import deletion_pipeline
from app.security.sanitization import normalize_text

router = APIRouter(prefix="/security", tags=["security"])


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
async def grant_consent(body: ConsentGrantRequest) -> dict[str, object]:
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
async def revoke_consent(consent_id: UUID, body: ConsentRevokeRequest) -> dict[str, object]:
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
async def request_deletion(body: DeletionRequestBody) -> dict[str, object]:
    reason = normalize_text(body.reason, max_length=500)
    request = deletion_pipeline.request(
        user_id=body.user_id,
        target_id=body.target_id,
        scope=body.scope,
        reason=reason.value,
    )
    return {
        "id": str(request.request_id),
        "status": request.status.value,
        "scope": request.scope,
        "steps": [{"key": step.key, "status": step.status.value} for step in request.steps],
        "warnings": reason.warnings,
    }


@router.post("/deletion-requests/{request_id}/dry-run-complete")
async def complete_deletion_dry_run(request_id: UUID) -> dict[str, object]:
    try:
        request = deletion_pipeline.complete_dry_run(request_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Deletion request not found") from exc
    return {
        "id": str(request.request_id),
        "status": request.status.value,
        "completed_at": request.completed_at.isoformat() if request.completed_at else None,
        "steps": [{"key": step.key, "status": step.status.value} for step in request.steps],
    }


@router.get("/audit/recent")
async def recent_audit_events() -> dict[str, object]:
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
    audit_log_service.record(
        event=AuditEvent(
            action="security.csp_report",
            resource_type="csp",
            metadata={"report": report},
        )
    )
    return {"ok": True}
