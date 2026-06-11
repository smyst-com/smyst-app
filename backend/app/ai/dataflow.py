from __future__ import annotations

from uuid import uuid4

from app.ai.models import Sensitivity, UploadedAsset
from app.ai.llm_router import LLMRouter
from app.ai.rag import RagEngine
from app.ai.upload_pipeline import UploadPipeline


class AiDataflowProbe:
    """End-to-end AI data-flow check without external providers."""

    async def run(self) -> dict[str, object]:
        user_id = uuid4()
        twin_id = uuid4()
        pipeline = UploadPipeline()
        upload = UploadedAsset(
            user_id=user_id,
            twin_id=twin_id,
            filename="memory.txt",
            mime_type="text/plain",
            content=(
                "Max prefers careful decisions and values privacy. "
                "He decided to build Smyst as a secure AI twin platform. "
                "Family memories and trust are important to him."
            ).encode("utf-8"),
        )
        result = pipeline.process(upload)
        rag = RagEngine(vector_search=pipeline.vector_search)
        answer = await rag.answer(
            twin_id=twin_id,
            question="What values are important to Max?",
            allowed_sensitivities={Sensitivity.PRIVATE},
        )
        return {
            "upload_status": result.upload.status.value,
            "checksum_present": bool(result.upload.checksum_sha256),
            "parsed_chars": len(result.parsed.text),
            "chunks": len(result.chunks),
            "embeddings": len(result.embeddings),
            "facts": len(result.facts),
            "persona_confidence": result.persona.confidence_score,
            "twin_version": result.twin_version.version_number,
            "rag_provider": answer.provider,
            "rag_model": answer.model,
            "rag_citations": len(answer.citations),
            "rag_degraded": answer.degraded,
            "moderation": answer.moderation.decision.value,
            "provider_targets": LLMRouter.supported_provider_targets(),
        }
