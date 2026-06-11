from fastapi import APIRouter

from app.ai.dataflow import AiDataflowProbe

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/dataflow")
async def ai_dataflow() -> dict[str, object]:
    return await AiDataflowProbe().run()

