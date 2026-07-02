from datetime import date
from uuid import uuid4

import pytest

from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    HistoricalCandidate,
    PipelineConfig,
    PipelineStatus,
    TransitionError,
    apply_auto_brake,
    is_publish_allowed_today,
    transition,
)


def make_candidate(**overrides) -> HistoricalCandidate:
    defaults = dict(
        wikidata_qid="Q762",
        name="Leonardo da Vinci",
        death_date=date(1519, 5, 2),
        category="Kunst",
        sitelink_count=200,
    )
    defaults.update(overrides)
    return HistoricalCandidate(**defaults)


def advance_to(candidate: HistoricalCandidate, target: PipelineStatus) -> HistoricalCandidate:
    """Happy path bis zum Zielstatus, mit jeweils erfuellten Guards."""
    from dataclasses import replace

    order = [
        PipelineStatus.RESEARCHED,
        PipelineStatus.VERIFIED,
        PipelineStatus.GENERATED,
        PipelineStatus.REVIEWED,
        PipelineStatus.PUBLISHED,
    ]
    for step in order:
        if step is PipelineStatus.RESEARCHED:
            candidate = replace(candidate, source_count=3)
        if step is PipelineStatus.VERIFIED:
            candidate = replace(candidate, risk_score=1.0, risk_flags={"works": "pass"})
        if step is PipelineStatus.GENERATED:
            candidate = replace(candidate, twin_id=uuid4())
        if step is PipelineStatus.REVIEWED:
            candidate = replace(candidate, qa_passed=True, image_status="commons_ok")
        actor = uuid4() if step is PipelineStatus.PUBLISHED else None
        candidate, _ = transition(candidate, step, actor=actor)
        if candidate.status is target:
            break
    return candidate


def test_happy_path_reaches_published_with_audit_trail() -> None:
    candidate = advance_to(make_candidate(), PipelineStatus.PUBLISHED)
    assert candidate.status is PipelineStatus.PUBLISHED
    assert candidate.published_at is not None
    assert candidate.reviewed_by is not None


def test_direct_candidate_to_published_is_blocked() -> None:
    with pytest.raises(TransitionError, match="nicht erlaubt"):
        transition(make_candidate(), PipelineStatus.PUBLISHED, actor=uuid4())


def test_rejected_requires_reason() -> None:
    with pytest.raises(TransitionError, match="Grund"):
        transition(make_candidate(), PipelineStatus.REJECTED)


def test_rejected_is_terminal() -> None:
    candidate, _ = transition(make_candidate(), PipelineStatus.REJECTED, reason="Duplikat")
    with pytest.raises(TransitionError, match="terminal"):
        transition(candidate, PipelineStatus.RESEARCHED)


def test_researched_requires_min_sources() -> None:
    with pytest.raises(TransitionError, match="Quellen"):
        transition(make_candidate(source_count=2), PipelineStatus.RESEARCHED)


def test_verified_blocked_by_estate_blacklist_flag() -> None:
    candidate = advance_to(make_candidate(), PipelineStatus.RESEARCHED)
    from dataclasses import replace

    candidate = replace(candidate, risk_score=9.0, risk_flags={"publicity": "block"})
    with pytest.raises(TransitionError, match="block"):
        transition(candidate, PipelineStatus.VERIFIED)


def test_death_year_after_cutoff_requires_restricted_works() -> None:
    late = make_candidate(wikidata_qid="Q47365", death_date=date(1965, 1, 24))
    late = advance_to(late, PipelineStatus.RESEARCHED)
    from dataclasses import replace

    blocked = replace(late, risk_score=2.0, risk_flags={"works": "pass"})
    with pytest.raises(TransitionError, match="Sterbejahr"):
        transition(blocked, PipelineStatus.VERIFIED)

    allowed = replace(late, risk_score=2.0, risk_flags={"works": "restricted"})
    updated, _ = transition(allowed, PipelineStatus.VERIFIED)
    assert updated.status is PipelineStatus.VERIFIED


def test_reviewed_requires_qa_passed() -> None:
    candidate = advance_to(make_candidate(), PipelineStatus.GENERATED)
    with pytest.raises(TransitionError, match="QA"):
        transition(candidate, PipelineStatus.REVIEWED)


def test_published_requires_human_actor() -> None:
    candidate = advance_to(make_candidate(), PipelineStatus.REVIEWED)
    with pytest.raises(TransitionError, match="Freigabe"):
        transition(candidate, PipelineStatus.PUBLISHED)


def test_unpublish_requires_reason_and_allows_republish() -> None:
    candidate = advance_to(make_candidate(), PipelineStatus.PUBLISHED)
    with pytest.raises(TransitionError, match="Grund"):
        transition(candidate, PipelineStatus.UNPUBLISHED)
    candidate, event = transition(
        candidate, PipelineStatus.UNPUBLISHED, reason="Meldung eingegangen", actor=uuid4()
    )
    assert candidate.status is PipelineStatus.UNPUBLISHED
    assert event.reason == "Meldung eingegangen"
    candidate, _ = transition(candidate, PipelineStatus.REVIEWED)
    assert candidate.status is PipelineStatus.REVIEWED


def test_audit_event_records_transition() -> None:
    candidate = make_candidate(source_count=3)
    updated, event = transition(candidate, PipelineStatus.RESEARCHED)
    assert event.from_status is PipelineStatus.CANDIDATE
    assert event.to_status is PipelineStatus.RESEARCHED
    assert event.wikidata_qid == candidate.wikidata_qid
    assert updated.candidate_id == event.candidate_id


def test_auto_brake_halves_candidate_limit() -> None:
    braked = apply_auto_brake(DEFAULT_CONFIG, review_backlog_days=4, qa_failure_rate=0.0)
    assert braked.daily_candidate_limit == DEFAULT_CONFIG.daily_candidate_limit // 2
    calm = apply_auto_brake(DEFAULT_CONFIG, review_backlog_days=1, qa_failure_rate=0.05)
    assert calm.daily_candidate_limit == DEFAULT_CONFIG.daily_candidate_limit


def test_publish_limit_and_feature_flag() -> None:
    enabled = PipelineConfig(enabled=True, daily_publish_limit=5)
    assert is_publish_allowed_today(4, enabled)
    assert not is_publish_allowed_today(5, enabled)
    assert not is_publish_allowed_today(0, DEFAULT_CONFIG)  # Flag ist standardmaessig aus
