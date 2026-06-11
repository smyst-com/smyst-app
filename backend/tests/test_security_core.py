from uuid import uuid4

from app.security.consent import ConsentService
from app.security.deletion import DeletionPipeline, DeletionStatus
from app.security.rate_limit import InMemoryRateLimiter
from app.security.sanitization import escape_html, normalize_text


def test_consent_grant_and_revoke() -> None:
    service = ConsentService()
    user_id = uuid4()

    record = service.grant(
        user_id=user_id,
        consent_type="upload_processing",
        purpose="build_twin",
        version="v1",
        source="test",
    )

    assert service.active_for(user_id=user_id, consent_type="upload_processing", purpose="build_twin")

    revoked = service.revoke(consent_id=record.consent_id, user_id=user_id)
    assert revoked.status == "revoked"
    assert not service.active_for(user_id=user_id, consent_type="upload_processing", purpose="build_twin")


def test_deletion_pipeline_dry_run() -> None:
    pipeline = DeletionPipeline()
    request = pipeline.request(user_id=uuid4(), scope="user", reason="gdpr erasure request")
    completed = pipeline.complete_dry_run(request.request_id)

    assert completed.status == DeletionStatus.COMPLETED
    assert all(step.status == DeletionStatus.COMPLETED for step in completed.steps)


def test_rate_limiter_blocks_after_limit() -> None:
    limiter = InMemoryRateLimiter()

    assert limiter.check(key="client:/chat", limit=2, window_seconds=60).allowed
    assert limiter.check(key="client:/chat", limit=2, window_seconds=60).allowed
    assert not limiter.check(key="client:/chat", limit=2, window_seconds=60).allowed


def test_sanitization_detects_sql_meta_and_escapes_html() -> None:
    result = normalize_text("hello; DROP TABLE users", max_length=100)

    assert "sql_meta_pattern_detected" in result.warnings
    assert escape_html("<script>alert(1)</script>") == "&lt;script&gt;alert(1)&lt;/script&gt;"

