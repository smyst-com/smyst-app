from uuid import uuid4

import pytest

from app.ai.dataflow import AiDataflowProbe
from app.ai.demo_profiles import (
    LEONARDO_DA_VINCI_PROFILE,
    LOW_RISK_HISTORICAL_STARTER_PROFILES,
)
from app.ai.models import Sensitivity, UploadedAsset
from app.ai.parsers import ParserRegistry
from app.ai.rag import RagEngine
from app.ai.upload_pipeline import UploadPipeline


def test_text_upload_pipeline_builds_twin_version() -> None:
    user_id = uuid4()
    twin_id = uuid4()
    pipeline = UploadPipeline()
    result = pipeline.process(
        UploadedAsset(
            user_id=user_id,
            twin_id=twin_id,
            filename="journal.txt",
            mime_type="text/plain",
            content=(
                "Max values privacy and careful decisions. "
                "He decided to build a secure AI twin platform. "
                "Trust and family are important recurring themes."
            ).encode("utf-8"),
        )
    )

    assert result.upload.checksum_sha256
    assert result.parsed.text.startswith("Max values privacy")
    assert len(result.chunks) >= 1
    assert len(result.embeddings) == len(result.chunks)
    assert len(result.facts) >= 1
    assert result.persona.confidence_score > 0
    assert result.twin_version.version_number == 1


def test_public_historical_profile_builds_safe_twin() -> None:
    user_id = uuid4()
    twin_id = uuid4()
    pipeline = UploadPipeline()
    result = pipeline.process(
        LEONARDO_DA_VINCI_PROFILE.to_upload(user_id=user_id, twin_id=twin_id)
    )

    assert result.parsed.text.startswith("Leonardo da Vinci was born")
    assert "Encyclopaedia Britannica" in result.parsed.text
    assert "The Metropolitan Museum of Art" in result.parsed.text
    assert any("Mona Lisa" in fact.content for fact in result.facts)
    assert result.persona.safety_boundaries["never_claim_to_be_the_real_person"] is True
    assert result.persona.confidence_score > 0
    assert result.twin_version.version_number == 1


def test_low_risk_historical_starter_profiles_share_guardrails() -> None:
    assert [profile.profile_id for profile in LOW_RISK_HISTORICAL_STARTER_PROFILES] == [
        "leonardo-da-vinci",
        "isaac-newton",
        "william-shakespeare",
        "aristotle",
        "sun-tzu",
    ]

    for profile in LOW_RISK_HISTORICAL_STARTER_PROFILES:
        result = UploadPipeline().process(
            profile.to_upload(user_id=uuid4(), twin_id=uuid4())
        )

        assert profile.launch_wave == "Low-risk historical starter"
        assert "real" in profile.guardrail
        assert result.persona.safety_boundaries["never_claim_to_be_the_real_person"] is True
        assert profile.sources


def test_pdf_parser_falls_back_without_external_dependency() -> None:
    parser = ParserRegistry(moderation=UploadPipeline().moderation).pdf
    upload = UploadedAsset(
        user_id=uuid4(),
        twin_id=uuid4(),
        filename="memory.pdf",
        mime_type="application/pdf",
        content=b"Plain fallback text inside fake pdf bytes",
    )

    parsed = parser.parse(upload.with_checksum())

    assert "fallback text" in parsed.text
    assert parsed.content_type.value == "pdf"


@pytest.mark.asyncio
async def test_rag_returns_answer_with_citations() -> None:
    twin_id = uuid4()
    pipeline = UploadPipeline()
    pipeline.process(
        UploadedAsset(
            user_id=uuid4(),
            twin_id=twin_id,
            filename="memory.txt",
            mime_type="text/plain",
            content=b"Max values privacy. Max decided to build Smyst carefully.",
        )
    )

    answer = await RagEngine(vector_search=pipeline.vector_search).answer(
        twin_id=twin_id,
        question="What does Max value?",
        allowed_sensitivities={Sensitivity.PRIVATE},
    )

    assert answer.provider == "local"
    assert answer.degraded is True
    assert len(answer.citations) >= 1
    assert "Smyst memory context" in answer.answer


@pytest.mark.asyncio
async def test_rag_answers_leonardo_from_public_profile_context() -> None:
    twin_id = uuid4()
    pipeline = UploadPipeline()
    pipeline.process(LEONARDO_DA_VINCI_PROFILE.to_upload(user_id=uuid4(), twin_id=twin_id))

    answer = await RagEngine(vector_search=pipeline.vector_search).answer(
        twin_id=twin_id,
        question="What is the Leonardo historical profile based on?",
        allowed_sensitivities={Sensitivity.PRIVATE},
    )

    assert answer.provider == "local"
    assert answer.degraded is True
    assert len(answer.citations) >= 1
    cited_context = " ".join(result.chunk.content for result in answer.citations)
    assert "Leonardo da Vinci" in cited_context
    assert "public sources" in cited_context


@pytest.mark.asyncio
async def test_ai_dataflow_probe_checks_complete_flow() -> None:
    result = await AiDataflowProbe().run()

    assert result["checksum_present"] is True
    assert result["chunks"] >= 1
    assert result["embeddings"] == result["chunks"]
    assert result["facts"] >= 1
    assert result["twin_version"] == 1
    assert result["rag_provider"] == "local"
