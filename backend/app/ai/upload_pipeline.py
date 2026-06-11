from __future__ import annotations

from app.ai.embeddings import EmbeddingPipeline
from app.ai.memory import Chunker, MemoryLayer
from app.ai.models import PipelineResult, UploadedAsset
from app.ai.moderation import ModerationLayer
from app.ai.parsers import ParserRegistry
from app.ai.twin_builder import TwinBuilder
from app.ai.vector_search import InMemoryVectorSearch


class UploadPipeline:
    def __init__(
        self,
        *,
        moderation: ModerationLayer | None = None,
        parser_registry: ParserRegistry | None = None,
        chunker: Chunker | None = None,
        embedding_pipeline: EmbeddingPipeline | None = None,
        memory_layer: MemoryLayer | None = None,
        twin_builder: TwinBuilder | None = None,
        vector_search: InMemoryVectorSearch | None = None,
    ) -> None:
        self.moderation = moderation or ModerationLayer()
        self.parser_registry = parser_registry or ParserRegistry(self.moderation)
        self.chunker = chunker or Chunker()
        self.embedding_pipeline = embedding_pipeline or EmbeddingPipeline()
        self.memory_layer = memory_layer or MemoryLayer()
        self.twin_builder = twin_builder or TwinBuilder()
        self.vector_search = vector_search or InMemoryVectorSearch(self.embedding_pipeline.provider)

    def process(self, upload: UploadedAsset) -> PipelineResult:
        upload_with_checksum = upload.with_checksum()
        parser = self.parser_registry.parser_for(upload_with_checksum)
        parsed = parser.parse(upload_with_checksum)

        moderation = self.moderation.moderate_text(parsed.text, context="uploaded_content")
        if not moderation.allowed:
            raise ValueError(f"Upload rejected by moderation: {moderation.reason}")

        chunks = self.chunker.chunk(parsed)
        embeddings = self.embedding_pipeline.embed_chunks(chunks)
        self.vector_search.upsert(chunks, embeddings)

        facts = self.memory_layer.extract_facts(chunks)
        twin_version = self.twin_builder.build(upload.twin_id, facts)

        return PipelineResult(
            upload=upload_with_checksum,
            parsed=parsed,
            chunks=chunks,
            embeddings=embeddings,
            facts=facts,
            persona=twin_version.persona_profile,
            twin_version=twin_version,
        )

