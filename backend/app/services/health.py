from dataclasses import dataclass

from sqlalchemy import text

from app.db.session import engine
from app.integrations.redis_client import redis_client
from app.integrations.storage import get_storage_config_status


@dataclass(frozen=True)
class ReadinessResult:
    ready: bool
    postgres: bool
    redis: bool
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
    postgres_ok = await check_postgres()
    redis_ok = await check_redis()
    storage_status = get_storage_config_status()
    return ReadinessResult(
        ready=postgres_ok and redis_ok,
        postgres=postgres_ok,
        redis=redis_ok,
        storage_configured=storage_status.configured,
    )

