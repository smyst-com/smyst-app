from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from app.security.audit import AuditEvent, audit_log_service


@dataclass(frozen=True)
class ConsentRecord:
    user_id: UUID
    consent_type: str
    purpose: str
    version: str
    status: str
    source: str
    twin_id: UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    consent_id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: datetime | None = None


class ConsentService:
    def __init__(self) -> None:
        self._records: dict[UUID, ConsentRecord] = {}

    def grant(
        self,
        *,
        user_id: UUID,
        consent_type: str,
        purpose: str,
        version: str,
        source: str,
        twin_id: UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ConsentRecord:
        record = ConsentRecord(
            user_id=user_id,
            twin_id=twin_id,
            consent_type=consent_type,
            purpose=purpose,
            version=version,
            status="granted",
            source=source,
            metadata=metadata or {},
        )
        self._records[record.consent_id] = record
        audit_log_service.record(
            AuditEvent(
                actor_user_id=user_id,
                action="consent.grant",
                resource_type="consent",
                resource_id=record.consent_id,
                metadata={"type": consent_type, "purpose": purpose, "version": version},
            )
        )
        return record

    def revoke(self, *, consent_id: UUID, user_id: UUID) -> ConsentRecord:
        existing = self._records.get(consent_id)
        if existing is None or existing.user_id != user_id:
            raise KeyError("Consent record not found")
        revoked = ConsentRecord(
            user_id=existing.user_id,
            twin_id=existing.twin_id,
            consent_type=existing.consent_type,
            purpose=existing.purpose,
            version=existing.version,
            status="revoked",
            source=existing.source,
            metadata=existing.metadata,
            consent_id=existing.consent_id,
            created_at=existing.created_at,
            revoked_at=datetime.now(timezone.utc),
        )
        self._records[consent_id] = revoked
        audit_log_service.record(
            AuditEvent(
                actor_user_id=user_id,
                action="consent.revoke",
                resource_type="consent",
                resource_id=consent_id,
            )
        )
        return revoked

    def active_for(self, *, user_id: UUID, consent_type: str, purpose: str) -> bool:
        return any(
            record.user_id == user_id
            and record.consent_type == consent_type
            and record.purpose == purpose
            and record.status == "granted"
            and record.revoked_at is None
            for record in self._records.values()
        )


consent_service = ConsentService()

