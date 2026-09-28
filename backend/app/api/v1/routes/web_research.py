from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.ai.web_research import (
    ResearchContext,
    VerifiedWebResearchService,
    decide_search,
    rewrite_query,
)

router = APIRouter(prefix="/web-research", tags=["web-research"])


def _require_session(request: Request) -> JSONResponse | None:
    """/run und Suggestions verbrauchen Such-Provider-Quota bzw. schreiben
    Vorschlaege - beides nur fuer angemeldete Nutzer (Security-Fix 28.09.2026)."""
    from app.api.v1.routes.auth import _session_from_request

    if _session_from_request(request):
        return None
    return JSONResponse(
        status_code=401,
        content={"ok": False, "code": "auth_required", "message": "Bitte melde dich an."},
    )


class ResearchContextIn(BaseModel):
    user_id: str | None = None
    workspace_id: str | None = None
    profile_id: str | None = None
    context_type: str = "chat"
    contains_private_memory: bool = False
    contains_private_document: bool = False
    contains_twin_capsule: bool = False
    contains_sensitive_data: bool = False
    public_profile_mode: bool = False
    user_explicitly_requested_search: bool = False
    public_research_allowed: bool = False

    def to_domain(self) -> ResearchContext:
        return ResearchContext(**self.model_dump())


class ResearchPreviewRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    context: ResearchContextIn = Field(default_factory=ResearchContextIn)


class ResearchRunRequest(ResearchPreviewRequest):
    max_results: int = Field(default=3, ge=1, le=5)


class PublicProfileSuggestionRequest(ResearchRunRequest):
    profile_id: str = Field(min_length=1, max_length=120)


@router.post("/preview")
async def preview_research(request: ResearchPreviewRequest) -> dict[str, object]:
    context = request.context.to_domain()
    decision = decide_search(request.question, context)
    rewrite = rewrite_query(request.question, category=decision.category)
    return {
        "decision": decision.decision.value,
        "category": decision.category.value,
        "reasons": list(decision.reasons),
        "webResearchEnabled": decision.web_research_enabled,
        "provider": decision.provider,
        "canCallProvider": decision.can_call_provider,
        "rewrittenQuery": rewrite.query,
        "queryHash": rewrite.query_hash,
        "redacted": rewrite.redacted,
        "removedCategories": list(rewrite.removed_categories),
    }


@router.post("/run")
async def run_research(request: Request, body: ResearchRunRequest) -> Any:
    denied = _require_session(request)
    if denied is not None:
        return denied
    response = await VerifiedWebResearchService().research(
        body.question,
        context=body.context.to_domain(),
        max_results=body.max_results,
    )
    if response is None:
        return {"searched": False, "message": "Keine Internetrecherche ausgeführt."}
    return {
        "searched": True,
        "notice": "Ich habe im Internet gesucht.",
        "provider": response.provider,
        "fromCache": response.from_cache,
        "category": response.category.value,
        "summary": response.summary,
        "sources": [source.__dict__ for source in response.sources[:3]],
        "trustStatus": response.trust_status,
        "injectionWarnings": list(response.injection_warnings),
    }


@router.post("/public-profile-suggestions")
async def suggest_public_profile_update(
    request: Request, body: PublicProfileSuggestionRequest
) -> Any:
    denied = _require_session(request)
    if denied is not None:
        return denied
    suggestion = await VerifiedWebResearchService().suggest_public_profile_update(
        body.question,
        profile_id=body.profile_id,
        context=body.context.to_domain(),
    )
    if suggestion is None:
        return {"suggested": False, "message": "Keine Public-Knowledge-Aktualisierung vorgeschlagen."}
    return {
        "suggested": True,
        "status": suggestion.status.value,
        "reviewRequired": suggestion.review_required,
        "profileId": suggestion.profile_id,
        "fact": suggestion.fact,
        "retrievedAt": suggestion.retrieved_at,
        "trustScore": suggestion.trust_score,
        "sources": [source.__dict__ for source in suggestion.sources[:3]],
    }
