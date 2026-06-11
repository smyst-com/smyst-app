from __future__ import annotations

import re
from collections import Counter
from uuid import UUID

from app.ai.models import MemoryChunk, MemoryFact, ParsedDocument, Sensitivity


class Chunker:
    def __init__(self, max_words: int = 180, overlap_words: int = 30) -> None:
        self.max_words = max_words
        self.overlap_words = overlap_words

    def chunk(self, parsed: ParsedDocument) -> list[MemoryChunk]:
        words = parsed.text.split()
        if not words:
            return []

        chunks: list[MemoryChunk] = []
        start = 0
        index = 0
        while start < len(words):
            end = min(start + self.max_words, len(words))
            content = " ".join(words[start:end])
            chunks.append(
                MemoryChunk(
                    twin_id=parsed.twin_id,
                    source_upload_id=parsed.upload_id,
                    content=content,
                    chunk_index=index,
                    sensitivity=parsed.sensitivity,
                    metadata=parsed.metadata,
                ).normalized()
            )
            if end == len(words):
                break
            start = max(0, end - self.overlap_words)
            index += 1
        return chunks


class MemoryLayer:
    def extract_facts(self, chunks: list[MemoryChunk]) -> list[MemoryFact]:
        facts: list[MemoryFact] = []
        for chunk in chunks:
            sentences = re.split(r"(?<=[.!?])\s+", chunk.content)
            for sentence in sentences[:3]:
                normalized = sentence.strip()
                if len(normalized.split()) < 4:
                    continue
                facts.append(
                    MemoryFact(
                        twin_id=chunk.twin_id,
                        content=normalized,
                        fact_type=self._classify_fact(normalized),
                        confidence_score=self._confidence(normalized, chunk.sensitivity),
                        sensitivity=chunk.sensitivity,
                        source_chunk_ids=[chunk.chunk_id],
                    )
                )
        return facts

    def summarize_for_persona(self, twin_id: UUID, facts: list[MemoryFact]) -> str:
        relevant = [fact.content for fact in facts if fact.twin_id == twin_id]
        if not relevant:
            return "No stable memory facts are available yet."
        return " ".join(relevant[:5])

    def topic_counts(self, facts: list[MemoryFact]) -> Counter[str]:
        words: list[str] = []
        for fact in facts:
            words.extend(
                token.lower()
                for token in re.findall(r"[A-Za-zÀ-ÿ]{4,}", fact.content)
                if token.lower() not in {"this", "that", "with", "from", "about", "diese", "dass"}
            )
        return Counter(words)

    def _classify_fact(self, text: str) -> str:
        lower = text.lower()
        if any(word in lower for word in ("prefer", "likes", "vorliebe", "mag ")):
            return "preference"
        if any(word in lower for word in ("decided", "entscheidung", "choose", "wählte")):
            return "decision"
        if any(word in lower for word in ("family", "familie", "mother", "father", "kind")):
            return "episodic"
        return "semantic"

    def _confidence(self, text: str, sensitivity: Sensitivity) -> float:
        base = min(0.95, 0.45 + len(text.split()) / 80)
        if sensitivity in {Sensitivity.SENSITIVE, Sensitivity.HIGHLY_SENSITIVE}:
            return max(0.2, base - 0.1)
        return base

