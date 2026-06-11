from __future__ import annotations

from uuid import UUID

from app.ai.llm_router import LLMRouter
from app.ai.models import LLMRequest, RagAnswer, Sensitivity
from app.ai.moderation import ModerationLayer
from app.ai.vector_search import InMemoryVectorSearch


class RagEngine:
    def __init__(
        self,
        vector_search: InMemoryVectorSearch,
        llm_router: LLMRouter | None = None,
        moderation: ModerationLayer | None = None,
    ) -> None:
        self.vector_search = vector_search
        self.llm_router = llm_router or LLMRouter()
        self.moderation = moderation or ModerationLayer()

    async def answer(
        self,
        *,
        twin_id: UUID,
        question: str,
        allowed_sensitivities: set[Sensitivity] | None = None,
    ) -> RagAnswer:
        input_moderation = self.moderation.moderate_text(question, context="user_input")
        if not input_moderation.allowed:
            return RagAnswer(
                answer=input_moderation.reason,
                citations=[],
                moderation=input_moderation,
                provider="none",
                model="none",
                degraded=True,
            )

        allowed = allowed_sensitivities or {Sensitivity.PUBLIC, Sensitivity.PRIVATE}
        results = self.vector_search.search(
            twin_id=str(twin_id),
            query=question,
            allowed_sensitivities=allowed,
            limit=5,
        )
        context = "\n".join(f"- {result.chunk.content}" for result in results)
        retrieval_moderation = self.moderation.moderate_text(context, context="retrieval_context")
        if not retrieval_moderation.allowed:
            return RagAnswer(
                answer=retrieval_moderation.reason,
                citations=results,
                moderation=retrieval_moderation,
                provider="none",
                model="none",
                degraded=True,
            )

        request = LLMRequest(
            system_prompt=(
                "You are Smyst's safe twin answer engine. Answer only from allowed memory context. "
                "Never claim to be the real person. Respect privacy and uncertainty."
            ),
            prompt=f"Question: {question}\n\nContext:\n{context}",
        )
        response = await self.llm_router.complete(request)
        output_moderation = self.moderation.moderate_text(response.text, context="public_answer")
        answer = response.text if output_moderation.allowed else output_moderation.reason
        return RagAnswer(
            answer=answer,
            citations=results,
            moderation=output_moderation,
            provider=response.provider,
            model=response.model,
            degraded=response.degraded,
        )

