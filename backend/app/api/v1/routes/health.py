from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.integrations.storage import get_storage_config_status
from app.services.health import check_readiness

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
        "redis": result.redis,
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
            "postgres": result.postgres,
            "redis": result.redis,
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

