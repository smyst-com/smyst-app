"""State Machine der smyst.com Autopilot-Pipeline fuer historische Profile.

Reine Domain-Logik ohne Datenbank- oder Framework-Abhaengigkeiten,
konsistent zu app/ai/models.py (frozen dataclasses, str-Enums).
Persistenz-Schema: database/migrations/0007_historical_pipeline.sql
Spezifikation: Autopilot_Profile_Pipeline_Spec.md

Grundregeln:
- Kein Statussprung ausserhalb ALLOWED_TRANSITIONS (kein candidate -> published).
- rejected und unpublished niemals ohne Grund.
- published nur mit menschlicher Freigabe (reviewed_by) und bestandener QA.
- Jeder Uebergang erzeugt ein AuditEvent (Anbindung an audit_logs).
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class PipelineStatus(str, Enum):
    CANDIDATE = "candidate"
    RESEARCHED = "researched"
    VERIFIED = "verified"
    GENERATED = "generated"
    REVIEWED = "reviewed"
    PUBLISHED = "published"
    REJECTED = "rejected"
    UNPUBLISHED = "unpublished"


class RiskResult(str, Enum):
    PASS = "pass"
    RESTRICTED = "restricted"
    MANUAL_REVIEW = "manual_review"
    BLOCK = "block"


#: Erlaubte Statusuebergaenge. rejected ist terminal (Wiederaufnahme nur als
#: neuer Kandidat mit gleicher QID nach manueller Blacklist-/Grund-Pruefung).
ALLOWED_TRANSITIONS: dict[PipelineStatus, frozenset[PipelineStatus]] = {
    PipelineStatus.CANDIDATE: frozenset({PipelineStatus.RESEARCHED, PipelineStatus.REJECTED}),
    PipelineStatus.RESEARCHED: frozenset({PipelineStatus.VERIFIED, PipelineStatus.REJECTED}),
    PipelineStatus.VERIFIED: frozenset({PipelineStatus.GENERATED, PipelineStatus.REJECTED}),
    PipelineStatus.GENERATED: frozenset({PipelineStatus.REVIEWED, PipelineStatus.REJECTED}),
    PipelineStatus.REVIEWED: frozenset({PipelineStatus.PUBLISHED, PipelineStatus.REJECTED}),
    PipelineStatus.PUBLISHED: frozenset({PipelineStatus.UNPUBLISHED}),
    PipelineStatus.UNPUBLISHED: frozenset({PipelineStatus.REVIEWED}),
    PipelineStatus.REJECTED: frozenset(),
}

#: Status, die einen Grund erzwingen.
REASON_REQUIRED: frozenset[PipelineStatus] = frozenset(
    {PipelineStatus.REJECTED, PipelineStatus.UNPUBLISHED}
)


class TransitionError(ValueError):
    """Ungueltiger oder unvollstaendiger Statusuebergang."""


@dataclass(frozen=True)
class PipelineConfig:
    """Spiegel der pipeline_config-Tabelle; Werte ohne Deployment aenderbar."""

    enabled: bool = False
    daily_publish_limit: int = 5
    daily_candidate_limit: int = 50
    min_sources: int = 3
    max_death_year: int = 1955
    min_sitelinks: int = 15
    qa_failure_rate_brake: float = 0.10
    review_backlog_days_brake: int = 3


DEFAULT_CONFIG = PipelineConfig()


@dataclass(frozen=True)
class HistoricalCandidate:
    wikidata_qid: str
    name: str
    death_date: date
    category: str
    birth_date: date | None = None
    birth_label: str | None = None
    death_label: str | None = None
    country: str | None = None
    language: str | None = None
    sitelink_count: int = 0
    status: PipelineStatus = PipelineStatus.CANDIDATE
    status_reason: str | None = None
    risk_score: float | None = None
    risk_flags: dict[str, str] = field(default_factory=dict)
    source_count: int = 0
    image_status: str | None = None
    qa_passed: bool = False
    qa_report: dict[str, Any] | None = None
    twin_id: UUID | None = None
    reviewed_by: UUID | None = None
    published_at: datetime | None = None
    candidate_id: UUID = field(default_factory=uuid4)

    def has_risk(self, result: RiskResult) -> bool:
        return result.value in self.risk_flags.values()


@dataclass(frozen=True)
class AuditEvent:
    """Nachvollziehbarkeit: wird 1:1 in audit_logs geschrieben."""

    candidate_id: UUID
    wikidata_qid: str
    from_status: PipelineStatus
    to_status: PipelineStatus
    reason: str | None
    actor: UUID | None
    occurred_at: datetime


def _guard(condition: bool, message: str) -> None:
    if not condition:
        raise TransitionError(message)


def _check_target_guards(
    candidate: HistoricalCandidate,
    to_status: PipelineStatus,
    *,
    reason: str | None,
    actor: UUID | None,
    config: PipelineConfig,
) -> None:
    if to_status in REASON_REQUIRED:
        _guard(bool(reason and reason.strip()), f"{to_status.value} erfordert einen Grund")

    if to_status is PipelineStatus.RESEARCHED:
        _guard(
            candidate.source_count >= config.min_sources,
            f"mindestens {config.min_sources} Quellen erforderlich "
            f"(vorhanden: {candidate.source_count})",
        )

    if to_status is PipelineStatus.VERIFIED:
        _guard(candidate.risk_score is not None, "verified erfordert einen Risiko-Score")
        _guard(bool(candidate.risk_flags), "verified erfordert ein Risiko-Check-Ergebnis")
        _guard(
            not candidate.has_risk(RiskResult.BLOCK),
            "Risiko-Check enthaelt 'block'; Kandidat muss rejected werden",
        )
        _guard(
            candidate.death_date.year <= config.max_death_year
            or candidate.risk_flags.get("works") == RiskResult.RESTRICTED.value,
            f"Sterbejahr > {config.max_death_year} nur mit works=restricted "
            "(keine Originalzitate/Werkauszuege) zulaessig",
        )

    if to_status is PipelineStatus.GENERATED:
        _guard(candidate.twin_id is not None, "generated erfordert eine gebaute Twin Capsule")

    if to_status is PipelineStatus.REVIEWED and candidate.status is PipelineStatus.GENERATED:
        _guard(candidate.qa_passed, "reviewed erfordert bestandene automatische QA")

    if to_status is PipelineStatus.PUBLISHED:
        _guard(actor is not None, "published erfordert eine menschliche Freigabe (actor)")
        _guard(candidate.qa_passed, "published erfordert bestandene QA")
        _guard(
            not candidate.has_risk(RiskResult.BLOCK),
            "published mit 'block'-Risiko ist nicht zulaessig",
        )
        _guard(candidate.image_status is not None, "published erfordert geklaerten Bildstatus")


def transition(
    candidate: HistoricalCandidate,
    to_status: PipelineStatus,
    *,
    reason: str | None = None,
    actor: UUID | None = None,
    config: PipelineConfig = DEFAULT_CONFIG,
    now: datetime | None = None,
) -> tuple[HistoricalCandidate, AuditEvent]:
    """Fuehrt einen Statusuebergang aus oder wirft TransitionError.

    Gibt den neuen (unveraenderlichen) Kandidaten und das AuditEvent zurueck.
    Der Aufrufer persistiert beides transaktional (historical_candidates + audit_logs).
    """
    allowed = ALLOWED_TRANSITIONS[candidate.status]
    if to_status not in allowed:
        raise TransitionError(
            f"Uebergang {candidate.status.value} -> {to_status.value} ist nicht erlaubt; "
            f"erlaubt: {sorted(status.value for status in allowed) or 'keine (terminal)'}"
        )

    _check_target_guards(candidate, to_status, reason=reason, actor=actor, config=config)

    timestamp = now or datetime.now(timezone.utc)
    updated = replace(
        candidate,
        status=to_status,
        status_reason=reason if to_status in REASON_REQUIRED else candidate.status_reason,
        reviewed_by=actor if to_status is PipelineStatus.PUBLISHED else candidate.reviewed_by,
        published_at=timestamp if to_status is PipelineStatus.PUBLISHED else candidate.published_at,
    )
    event = AuditEvent(
        candidate_id=candidate.candidate_id,
        wikidata_qid=candidate.wikidata_qid,
        from_status=candidate.status,
        to_status=to_status,
        reason=reason,
        actor=actor,
        occurred_at=timestamp,
    )
    return updated, event


def apply_auto_brake(
    config: PipelineConfig,
    *,
    review_backlog_days: int,
    qa_failure_rate: float,
) -> PipelineConfig:
    """Automatische Bremse: Qualitaet vor Masse.

    Halbiert daily_candidate_limit, wenn die Review-Queue oder die
    QA-Fehlerquote die konfigurierten Schwellen ueberschreitet.
    """
    if (
        review_backlog_days > config.review_backlog_days_brake
        or qa_failure_rate > config.qa_failure_rate_brake
    ):
        return replace(config, daily_candidate_limit=max(1, config.daily_candidate_limit // 2))
    return config


def is_publish_allowed_today(published_today: int, config: PipelineConfig) -> bool:
    """Tageslimit-Pruefung vor jedem Livegang."""
    return config.enabled and published_today < config.daily_publish_limit
