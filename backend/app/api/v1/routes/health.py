from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.integrations.storage import get_storage_config_status
from app.services.health import check_readiness
from app.services.production_readiness import production_readiness


def _require_admin(request: Request) -> JSONResponse | None:
    """Deep-/Production-Checks exponieren Infrastruktur-Details (Storage-
    Endpoint, Bucket, Provider-Fehlkonfigurationen) - nur Admins (28.09.2026)."""
    from app.api.v1.routes.auth import _session_from_request

    session = _session_from_request(request)
    if not session:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "code": "auth_required", "message": "Bitte melde dich an."},
        )
    permissions = session.get("permissions") or []
    roles = {str(role).lower() for role in (session.get("roles") or [])}
    if "admin:read" not in permissions and not ({"admin", "owner"} & roles):
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "forbidden", "message": "Nur fuer Admins."},
        )
    return None

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
async def deep(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
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
async def production(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    return await production_readiness()
