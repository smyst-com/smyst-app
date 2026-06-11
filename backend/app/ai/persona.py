from __future__ import annotations

from statistics import mean
from uuid import UUID

from app.ai.memory import MemoryLayer
from app.ai.models import MemoryFact, PersonaProfile


class PersonaEngine:
    def __init__(self, memory_layer: MemoryLayer | None = None) -> None:
        self.memory_layer = memory_layer or MemoryLayer()

    def build_profile(self, twin_id: UUID, facts: list[MemoryFact]) -> PersonaProfile:
        twin_facts = [fact for fact in facts if fact.twin_id == twin_id]
        summary = self.memory_layer.summarize_for_persona(twin_id, twin_facts)
        topics = self.memory_layer.topic_counts(twin_facts).most_common(8)
        confidence = mean([fact.confidence_score for fact in twin_facts]) if twin_facts else 0.0
        return PersonaProfile(
            twin_id=twin_id,
            persona_summary=summary,
            communication_style={
                "tone": "grounded",
                "detail_level": "contextual",
                "uses_citations": True,
            },
            values_profile={
                "inferred_topics": [{"topic": topic, "weight": count} for topic, count in topics],
                "source": "memory_facts",
            },
            safety_boundaries={
                "never_claim_to_be_the_real_person": True,
                "respect_private_memories": True,
                "block_highly_sensitive_public_disclosure": True,
            },
            confidence_score=round(confidence, 4),
            source_fact_ids=[fact.fact_id for fact in twin_facts],
        )

