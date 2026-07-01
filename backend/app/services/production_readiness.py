from __future__ import annotations

from typing import Any

from app.ai.llm_router import provider_statuses
from app.core.config import Settings, get_settings
from app.integrations.storage import get_storage_config_status
from app.services.health import check_readiness


SCALE_TARGETS = {
    "chat_start_p95_ms": 300,
    "time_to_first_token_p95_ms": 700,
    "retrieval_p95_ms": 150,
    "api_availability_target": "99.99%+",
}


def _configured_provider_names(statuses: list[dict[str, object]]) -> list[str]:
    return [str(status["provider"]) for status in statuses if status.get("configured")]


def _missing_provider_key_names(statuses: list[dict[str, object]]) -> list[str]:
    return [str(status["key_name"]) for status in statuses if not status.get("configured")]


async def production_readiness(settings: Settings | None = None) -> dict[str, Any]:
    active_settings = settings or get_settings()
    readiness = await check_readiness()
    storage = get_storage_config_status()
    providers = provider_statuses(active_settings)
    configured_providers = _configured_provider_names(providers)
    public_storage_ready = bool(
        storage.configured and active_settings.idrive_e2_public_access_enabled
    )
    api_ready = bool(readiness.ready)
    ai_ready = bool(configured_providers)

    blockers: list[str] = []
    if not ai_ready:
        blockers.append("No external AI provider key is configured.")
    if not storage.configured:
        blockers.append("IDrive e2 private storage credentials are missing.")
    if not active_settings.idrive_e2_public_access_enabled:
        blockers.append("IDrive e2 public bucket/CDN access is not enabled.")
    if readiness.postgres_required and not readiness.postgres:
        blockers.append("Required Postgres health check is failing.")
    if readiness.redis_required and not readiness.redis:
        blockers.append("Required Redis health check is failing.")

    return {
        "status": "ready" if api_ready and ai_ready and public_storage_ready else "blocked",
        "runtime": {
            "api": "salad",
            "storage": "idrive_e2",
            "dns": "spaceship",
            "code": "github",
            "cloudflare_active": False,
            "salad_public_base_url": active_settings.salad_public_base_url,
        },
        "gates": {
            "api_ready": api_ready,
            "ai_provider_ready": ai_ready,
            "idrive_private_storage_ready": storage.configured,
            "idrive_public_cdn_ready": public_storage_ready,
            "postgres_ready": readiness.postgres,
            "postgres_required": readiness.postgres_required,
            "redis_ready": readiness.redis,
            "redis_required": readiness.redis_required,
        },
        "ai": {
            "configured_count": len(configured_providers),
            "configured_providers": configured_providers,
            "missing_key_names": _missing_provider_key_names(providers),
            "provider_order": [status["provider"] for status in providers],
        },
        "storage": {
            "private_bucket": storage.bucket,
            "static_buckets": {
                "site": active_settings.idrive_e2_site_bucket,
                "app": active_settings.idrive_e2_app_bucket,
                "cdn": active_settings.idrive_e2_cdn_bucket,
            },
            "endpoint": storage.endpoint,
            "region": storage.region,
            "public_access_enabled": active_settings.idrive_e2_public_access_enabled,
        },
        "scale_targets": SCALE_TARGETS,
        "blockers": blockers,
        "next_actions": [
            "Enable IDrive e2 public bucket/CDN access before moving public static traffic there.",
            "Add missing provider keys as GitHub/Salad secrets; never expose them in the browser.",
            "Point api.smyst.com to the Salad public endpoint and verify live/ready health.",
            "Turn on required Redis/Postgres gates before broad traffic.",
            "Add alerting for provider errors, rate limits, latency and spend before scaling.",
        ],
    }
