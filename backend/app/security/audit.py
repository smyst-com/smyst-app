from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4


@dataclass(frozen=True)
class AuditEvent:
    action: str
    resource_type: str
    actor_user_id: UUID | None = None
    resource_id: UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    event_id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLogService:
    """Audit baseline.

    Legacy local-development reference only.

    Free-only production audit/status data must stay in Cloudflare Workers,
    Cloudflare KV and/or IDrive e2 according to the active data map. This
    in-memory sink keeps local data-flow tests deterministic.
    """

    def __init__(self) -> None:
        self._events: list[AuditEvent] = []

    def record(self, event: AuditEvent) -> AuditEvent:
        self._events.append(event)
        return event

    def recent(self, limit: int = 50) -> list[AuditEvent]:
        return list(reversed(self._events[-limit:]))


audit_log_service = AuditLogService()
