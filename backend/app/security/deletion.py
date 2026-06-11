from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from app.security.audit import AuditEvent, audit_log_service


class DeletionStatus(str, Enum):
    REQUESTED = "requested"
    VERIFYING = "verifying"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class DeletionStep:
    key: str
    description: str
    status: DeletionStatus = DeletionStatus.REQUESTED


@dataclass(frozen=True)
class DeletionRequest:
    user_id: UUID
    scope: str
    reason: str
    target_id: UUID | None = None
    request_id: UUID = field(default_factory=uuid4)
    status: DeletionStatus = DeletionStatus.REQUESTED
    steps: list[DeletionStep] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


class DeletionPipeline:
    """GDPR deletion orchestration baseline.

    Production implementation must execute these steps through repositories,
    storage clients, vector stores, and backup retention rules.
    """

    default_steps = [
        DeletionStep("verify_identity", "Verify requester identity and ownership."),
        DeletionStep("freeze_processing", "Stop new processing jobs for target scope."),
        DeletionStep("delete_uploads", "Delete raw uploads and derived storage assets."),
        DeletionStep("delete_vectors", "Delete chunks, embeddings, and retrieval indexes."),
        DeletionStep("delete_domain_data", "Delete profile, twin, chat, and memory records."),
        DeletionStep("write_audit", "Write non-sensitive deletion audit event."),
        DeletionStep("schedule_backup_expiry", "Mark backup copies for retention-window expiry."),
    ]

    def __init__(self) -> None:
        self._requests: dict[UUID, DeletionRequest] = {}

    def request(self, *, user_id: UUID, scope: str, reason: str, target_id: UUID | None = None) -> DeletionRequest:
        deletion_request = DeletionRequest(
            user_id=user_id,
            target_id=target_id,
            scope=scope,
            reason=reason,
            steps=self.default_steps,
            status=DeletionStatus.QUEUED,
        )
        self._requests[deletion_request.request_id] = deletion_request
        audit_log_service.record(
            AuditEvent(
                actor_user_id=user_id,
                action="deletion.request",
                resource_type=scope,
                resource_id=target_id,
                metadata={"deletion_request_id": str(deletion_request.request_id), "reason": reason},
            )
        )
        return deletion_request

    def complete_dry_run(self, request_id: UUID) -> DeletionRequest:
        existing = self._requests[request_id]
        completed = DeletionRequest(
            user_id=existing.user_id,
            target_id=existing.target_id,
            scope=existing.scope,
            reason=existing.reason,
            request_id=existing.request_id,
            status=DeletionStatus.COMPLETED,
            steps=[
                DeletionStep(step.key, step.description, DeletionStatus.COMPLETED)
                for step in existing.steps
            ],
            metadata={**existing.metadata, "mode": "dry_run"},
            created_at=existing.created_at,
            completed_at=datetime.now(timezone.utc),
        )
        self._requests[request_id] = completed
        audit_log_service.record(
            AuditEvent(
                actor_user_id=completed.user_id,
                action="deletion.complete_dry_run",
                resource_type=completed.scope,
                resource_id=completed.target_id,
                metadata={"deletion_request_id": str(request_id)},
            )
        )
        return completed


deletion_pipeline = DeletionPipeline()

