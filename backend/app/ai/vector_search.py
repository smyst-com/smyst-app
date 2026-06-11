from __future__ import annotations

from math import sqrt

from app.ai.embeddings import DeterministicEmbeddingProvider
from app.ai.models import EmbeddingRecord, MemoryChunk, SearchResult, Sensitivity


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = sqrt(sum(a * a for a in left)) or 1.0
    right_norm = sqrt(sum(b * b for b in right)) or 1.0
    return dot / (left_norm * right_norm)


class InMemoryVectorSearch:
    """In-memory vector search for deterministic pipeline validation.

    Legacy local-development reference only.

    pgvector is not part of the Free-only production architecture. Any future
    vector retrieval system needs a separate written architecture and cost
    approval before it can become a production dependency.
    """

    def __init__(self, embedding_provider: DeterministicEmbeddingProvider | None = None) -> None:
        self.embedding_provider = embedding_provider or DeterministicEmbeddingProvider()
        self._chunks: dict[str, MemoryChunk] = {}
        self._embeddings: dict[str, EmbeddingRecord] = {}

    def upsert(self, chunks: list[MemoryChunk], embeddings: list[EmbeddingRecord]) -> None:
        for chunk in chunks:
            self._chunks[str(chunk.chunk_id)] = chunk
        for embedding in embeddings:
            self._embeddings[str(embedding.chunk_id)] = embedding

    def search(
        self,
        *,
        twin_id: str,
        query: str,
        allowed_sensitivities: set[Sensitivity],
        limit: int = 5,
    ) -> list[SearchResult]:
        query_vector = self.embedding_provider.embed_text(query)
        results: list[SearchResult] = []
        for chunk_id, embedding in self._embeddings.items():
            chunk = self._chunks.get(chunk_id)
            if chunk is None:
                continue
            if str(chunk.twin_id) != twin_id:
                continue
            if chunk.sensitivity not in allowed_sensitivities:
                continue
            score = cosine_similarity(query_vector, embedding.vector)
            if score > 0:
                results.append(SearchResult(chunk=chunk, score=score))
        return sorted(results, key=lambda item: item.score, reverse=True)[:limit]
