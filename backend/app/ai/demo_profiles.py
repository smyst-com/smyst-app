from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.ai.models import UploadedAsset


@dataclass(frozen=True)
class PublicSource:
    title: str
    publisher: str
    url: str
    accessed_at: str

    def as_text(self) -> str:
        return f"{self.publisher}: {self.title}. URL: {self.url}. Accessed: {self.accessed_at}."


@dataclass(frozen=True)
class PublicDemoProfile:
    profile_id: str
    name: str
    filename: str
    facts: tuple[str, ...]
    guardrail: str
    sources: tuple[PublicSource, ...]

    def source_text(self) -> str:
        facts = " ".join(self.facts)
        sources = " ".join(source.as_text() for source in self.sources)
        return f"{facts} Guardrail: {self.guardrail} Sources: {sources}"

    def to_upload(self, *, user_id: UUID, twin_id: UUID) -> UploadedAsset:
        return UploadedAsset(
            user_id=user_id,
            twin_id=twin_id,
            filename=self.filename,
            mime_type="text/plain",
            content=self.source_text().encode("utf-8"),
        )


LEONARDO_DA_VINCI_PROFILE = PublicDemoProfile(
    profile_id="leonardo-da-vinci",
    name="Leonardo da Vinci Demo Twin",
    filename="leonardo-da-vinci-public-facts.txt",
    facts=(
        "Leonardo da Vinci was born on April 15, 1452, near Vinci and died on May 2, "
        "1519, in France.",
        "Public museum and encyclopedia sources describe him as an Italian Renaissance "
        "artist, draftsman, engineer, and scientist.",
        "His best known works include the Mona Lisa, The Last Supper, and the "
        "Vitruvian Man.",
        "His notebooks record observations, experiments, inventions, anatomy studies, "
        "water movement, flying machines, and mechanical designs.",
    ),
    guardrail=(
        "This profile must answer as a historical demo profile based on public sources "
        "and must not claim to be the real Leonardo da Vinci."
    ),
    sources=(
        PublicSource(
            title="Leonardo da Vinci",
            publisher="Encyclopaedia Britannica",
            url="https://www.britannica.com/biography/Leonardo-da-Vinci",
            accessed_at="2026-06-09",
        ),
        PublicSource(
            title="Leonardo da Vinci (1452-1519)",
            publisher="The Metropolitan Museum of Art",
            url="https://www.metmuseum.org/essays/leonardo-da-vinci-1452-1519",
            accessed_at="2026-06-09",
        ),
    ),
)

