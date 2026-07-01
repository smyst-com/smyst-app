from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.integrations.storage import get_storage_config_status
from app.services.health import check_readiness
from app.services.production_readiness import production_readiness

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {
        "status": "live",
        "service": settings.app_name,
        "environment": settings.app_env,
    }


@router.get("/health/ready")
async def ready() -> JSONResponse:
    result = await check_readiness()
    payload = {
        "status": "ready" if result.ready else "not_ready",
        "postgres": result.postgres,
        "postgres_required": result.postgres_required,
        "redis": result.redis,
        "redis_required": result.redis_required,
        "storage_configured": result.storage_configured,
    }
    return JSONResponse(
        payload,
        status_code=status.HTTP_200_OK if result.ready else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@router.get("/health/deep")
async def deep() -> dict[str, object]:
    result = await check_readiness()
    storage = get_storage_config_status()
    return {
        "status": "ready" if result.ready else "not_ready",
        "checks": {
            "postgres": {
                "ok": result.postgres,
                "required": result.postgres_required,
            },
            "redis": {
                "ok": result.redis,
                "required": result.redis_required,
            },
            "storage": {
                "configured": storage.configured,
                "endpoint": storage.endpoint,
                "bucket": storage.bucket,
                "region": storage.region,
            },
        },
        "targets": {
            "chat_stream_accepted_p95_ms": 300,
            "time_to_first_token_p95_ms": 700,
            "retrieval_p95_ms": 150,
        },
    }


@router.get("/health/production")
async def production() -> dict[str, object]:
    return await production_readiness()
