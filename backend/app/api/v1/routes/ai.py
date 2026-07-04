from fastapi import APIRouter

from app.ai.dataflow import AiDataflowProbe
from app.ai.llm_router import ping_providers, provider_statuses

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/dataflow")
async def ai_dataflow() -> dict[str, object]:
    return await AiDataflowProbe().run()


@router.get("/providers")
async def ai_providers(ping: bool = False) -> dict[str, object]:
    statuses = provider_statuses()
    if ping:
        ping_results = await ping_providers()
        for status in statuses:
            result = ping_results.get(str(status["provider"]))
            if result is not None:
                status["ping"] = result
    return {
        "cloudflare": False,
        "runtime": "salad",
        "configured_count": sum(1 for status in statuses if status["configured"]),
        "ping_executed": ping,
        "providers": statuses,
    }
