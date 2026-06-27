from dataclasses import dataclass

from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.integrations.redis_client import redis_client
from app.integrations.storage import get_storage_config_status


@dataclass(frozen=True)
class ReadinessResult:
    ready: bool
    postgres: bool
    postgres_required: bool
    redis: bool
    redis_required: bool
    storage_configured: bool


async def check_postgres() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def check_redis() -> bool:
    try:
        return bool(await redis_client.ping())
    except Exception:
        return False


async def check_readiness() -> ReadinessResult:
    postgres_ok = await check_postgres() if settings.health_require_postgres else False
    redis_ok = await check_redis() if settings.health_require_redis else False
    storage_status = get_storage_config_status()
    return ReadinessResult(
        ready=(
            (postgres_ok or not settings.health_require_postgres)
            and (redis_ok or not settings.health_require_redis)
            and storage_status.configured
        ),
        postgres=postgres_ok,
        postgres_required=settings.health_require_postgres,
        redis=redis_ok,
        redis_required=settings.health_require_redis,
        storage_configured=storage_status.configured,
    )
