from fastapi import APIRouter

from app.ai.dataflow import AiDataflowProbe
from app.ai.llm_router import provider_statuses

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/dataflow")
async def ai_dataflow() -> dict[str, object]:
    return await AiDataflowProbe().run()


@router.get("/providers")
async def ai_providers() -> dict[str, object]:
    statuses = provider_statuses()
    return {
        "cloudflare": False,
        "runtime": "salad",
        "configured_count": sum(1 for status in statuses if status["configured"]),
        "providers": statuses,
    }
