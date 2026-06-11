from __future__ import annotations

from collections import defaultdict
from uuid import UUID, uuid4

from app.ai.models import MemoryFact, PersonaProfile, TwinVersion
from app.ai.persona import PersonaEngine


class TwinVersionStore:
    def __init__(self) -> None:
        self._versions: dict[UUID, list[TwinVersion]] = defaultdict(list)

    def create_version(
        self,
        *,
        twin_id: UUID,
        persona_profile: PersonaProfile,
        memory_facts: list[MemoryFact],
        metadata: dict[str, object] | None = None,
    ) -> TwinVersion:
        version_number = len(self._versions[twin_id]) + 1
        version = TwinVersion(
            twin_id=twin_id,
            version_id=uuid4(),
            version_number=version_number,
            persona_profile=persona_profile,
            memory_fact_ids=[fact.fact_id for fact in memory_facts],
            metadata=metadata or {},
        )
        self._versions[twin_id].append(version)
        return version

    def latest(self, twin_id: UUID) -> TwinVersion | None:
        versions = self._versions.get(twin_id, [])
        return versions[-1] if versions else None


class TwinBuilder:
    def __init__(
        self,
        persona_engine: PersonaEngine | None = None,
        version_store: TwinVersionStore | None = None,
    ) -> None:
        self.persona_engine = persona_engine or PersonaEngine()
        self.version_store = version_store or TwinVersionStore()

    def build(self, twin_id: UUID, facts: list[MemoryFact]) -> TwinVersion:
        persona = self.persona_engine.build_profile(twin_id, facts)
        return self.version_store.create_version(
            twin_id=twin_id,
            persona_profile=persona,
            memory_facts=facts,
            metadata={"builder": "smyst-twin-builder-v1"},
        )

