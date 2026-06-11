from __future__ import annotations

from hashlib import blake2b
from math import sqrt

from app.ai.models import EmbeddingRecord, MemoryChunk


class DeterministicEmbeddingProvider:
    """Local deterministic embedding provider for data-flow tests.

    It is not a semantic production model. It guarantees stable vectors without
    external network calls and keeps the architecture testable before provider
    credentials exist.
    """

    model_name = "smyst-local-hash-embedding-v1"

    def __init__(self, dimensions: int = 1536) -> None:
        self.dimensions = dimensions

    def embed_text(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        tokens = [token.lower() for token in text.split() if token.strip()]
        if not tokens:
            return vector

        for token in tokens:
            digest = blake2b(token.encode("utf-8"), digest_size=16).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign

        norm = sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class EmbeddingPipeline:
    def __init__(self, provider: DeterministicEmbeddingProvider | None = None) -> None:
        self.provider = provider or DeterministicEmbeddingProvider()

    def embed_chunks(self, chunks: list[MemoryChunk]) -> list[EmbeddingRecord]:
        return [
            EmbeddingRecord(
                twin_id=chunk.twin_id,
                chunk_id=chunk.chunk_id,
                vector=self.provider.embed_text(chunk.content),
                embedding_model=self.provider.model_name,
                sensitivity=chunk.sensitivity,
                metadata={"source_upload_id": str(chunk.source_upload_id)},
            )
            for chunk in chunks
        ]

