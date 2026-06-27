from app.main import app
from app.integrations.storage import StorageConfigStatus
from app.services import health


def test_app_title() -> None:
    assert app.title == "Smyst API"


async def test_readiness_does_not_require_optional_postgres_or_redis(monkeypatch) -> None:
    async def fail_postgres() -> bool:
        raise AssertionError("postgres should not be checked when optional")

    async def fail_redis() -> bool:
        raise AssertionError("redis should not be checked when optional")

    monkeypatch.setattr(health.settings, "health_require_postgres", False)
    monkeypatch.setattr(health.settings, "health_require_redis", False)
    monkeypatch.setattr(health, "check_postgres", fail_postgres)
    monkeypatch.setattr(health, "check_redis", fail_redis)
    monkeypatch.setattr(
        health,
        "get_storage_config_status",
        lambda: StorageConfigStatus(
            configured=True,
            endpoint="https://s3.us-west-2.idrivee2.com",
            bucket="smyst-memories",
            region="us-west-2",
        ),
    )

    result = await health.check_readiness()

    assert result.ready is True
    assert result.postgres is False
    assert result.postgres_required is False
    assert result.redis is False
    assert result.redis_required is False
    assert result.storage_configured is True


async def test_readiness_checks_required_postgres_and_redis(monkeypatch) -> None:
    async def ok_postgres() -> bool:
        return True

    async def ok_redis() -> bool:
        return True

    monkeypatch.setattr(health.settings, "health_require_postgres", True)
    monkeypatch.setattr(health.settings, "health_require_redis", True)
    monkeypatch.setattr(health, "check_postgres", ok_postgres)
    monkeypatch.setattr(health, "check_redis", ok_redis)
    monkeypatch.setattr(
        health,
        "get_storage_config_status",
        lambda: StorageConfigStatus(
            configured=True,
            endpoint="https://s3.us-west-2.idrivee2.com",
            bucket="smyst-memories",
            region="us-west-2",
        ),
    )

    result = await health.check_readiness()

    assert result.ready is True
    assert result.postgres is True
    assert result.postgres_required is True
    assert result.redis is True
    assert result.redis_required is True
