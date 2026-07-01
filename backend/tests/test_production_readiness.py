from dataclasses import dataclass

import pytest

from app.core.config import Settings
from app.integrations.storage import StorageConfigStatus
from app.services import production_readiness as pr


@dataclass(frozen=True)
class FakeReadiness:
    ready: bool = True
    postgres: bool = False
    postgres_required: bool = False
    redis: bool = False
    redis_required: bool = False
    storage_configured: bool = True


@pytest.mark.asyncio
async def test_production_readiness_reports_real_blockers_without_secret_leak(monkeypatch) -> None:
    async def fake_check_readiness() -> FakeReadiness:
        return FakeReadiness()

    monkeypatch.setattr(pr, "check_readiness", fake_check_readiness)
    monkeypatch.setattr(
        pr,
        "get_storage_config_status",
        lambda: StorageConfigStatus(
            configured=True,
            endpoint="https://s3.us-west-2.idrivee2.com",
            bucket="smyst-memories",
            region="us-west-2",
        ),
    )

    result = await pr.production_readiness(
        Settings(
            OPENROUTER_API_KEY="secret-openrouter",
            GEMINI_API_KEY="secret-gemini",
            IDRIVE_E2_PUBLIC_ACCESS_ENABLED=False,
            LLM_PROVIDER_ORDER="openrouter,gemini,anthropic",
        )
    )

    assert result["status"] == "blocked"
    assert result["gates"]["api_ready"] is True
    assert result["gates"]["ai_provider_ready"] is True
    assert result["gates"]["idrive_private_storage_ready"] is True
    assert result["gates"]["idrive_public_cdn_ready"] is False
    assert result["ai"]["configured_count"] == 2
    assert result["ai"]["configured_providers"] == ["openrouter", "gemini"]
    assert "IDrive e2 public bucket/CDN access is not enabled." in result["blockers"]
    assert "secret-openrouter" not in str(result)
    assert "secret-gemini" not in str(result)


@pytest.mark.asyncio
async def test_production_readiness_can_be_ready_when_all_gates_pass(monkeypatch) -> None:
    async def fake_check_readiness() -> FakeReadiness:
        return FakeReadiness(postgres=True, postgres_required=True, redis=True, redis_required=True)

    monkeypatch.setattr(pr, "check_readiness", fake_check_readiness)
    monkeypatch.setattr(
        pr,
        "get_storage_config_status",
        lambda: StorageConfigStatus(
            configured=True,
            endpoint="https://s3.us-west-2.idrivee2.com",
            bucket="smyst-memories",
            region="us-west-2",
        ),
    )

    result = await pr.production_readiness(
        Settings(
            OPENROUTER_API_KEY="secret-openrouter",
            IDRIVE_E2_PUBLIC_ACCESS_ENABLED=True,
            HEALTH_REQUIRE_POSTGRES=True,
            HEALTH_REQUIRE_REDIS=True,
        )
    )

    assert result["status"] == "ready"
    assert result["blockers"] == []
    assert result["gates"]["postgres_ready"] is True
    assert result["gates"]["redis_ready"] is True
    assert result["gates"]["idrive_public_cdn_ready"] is True
