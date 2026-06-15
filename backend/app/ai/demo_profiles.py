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
class PublicHistoricalProfile:
    profile_id: str
    name: str
    filename: str
    launch_wave: str
    rights_posture: str
    facts: tuple[str, ...]
    guardrail: str
    sources: tuple[PublicSource, ...]

    def source_text(self) -> str:
        facts = " ".join(self.facts)
        sources = " ".join(source.as_text() for source in self.sources)
        return (
            f"{facts} Launch wave: {self.launch_wave}. "
            f"Rights posture: {self.rights_posture} "
            f"Guardrail: {self.guardrail} Sources: {sources}"
        )

    def to_upload(self, *, user_id: UUID, twin_id: UUID) -> UploadedAsset:
        return UploadedAsset(
            user_id=user_id,
            twin_id=twin_id,
            filename=self.filename,
            mime_type="text/plain",
            content=self.source_text().encode("utf-8"),
        )


PublicDemoProfile = PublicHistoricalProfile


LEONARDO_DA_VINCI_PROFILE = PublicHistoricalProfile(
    profile_id="leonardo-da-vinci",
    name="Leonardo da Vinci",
    filename="leonardo-da-vinci-public-facts.txt",
    launch_wave="Low-risk historical starter",
    rights_posture=(
        "Long deceased; use original smyst copy and licensed or public-domain-safe imagery only."
    ),
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
        "This profile must answer as a historical profile based on public sources "
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

ISAAC_NEWTON_PROFILE = PublicHistoricalProfile(
    profile_id="isaac-newton",
    name="Isaac Newton",
    filename="isaac-newton-public-facts.txt",
    launch_wave="Low-risk historical starter",
    rights_posture=(
        "Long deceased; avoid modern book scans, portraits, and editions unless rights are verified."
    ),
    facts=(
        "Isaac Newton was born on December 25, 1642, Old Style, or January 4, 1643, "
        "New Style, and died on March 20, 1727, Old Style, or March 31, 1727, New Style.",
        "Public scientific and biographical sources describe him as a central figure "
        "in physics, mathematics, astronomy, and the Scientific Revolution.",
        "His work is associated with classical mechanics, universal gravitation, optics, "
        "calculus, and the Philosophiae Naturalis Principia Mathematica.",
        "This profile should treat historical debates and priority disputes carefully and "
        "avoid presenting disputed claims as settled personal testimony.",
    ),
    guardrail=(
        "This profile must answer as a historical profile based on public sources "
        "and must not claim to be the real Isaac Newton."
    ),
    sources=(
        PublicSource(
            title="Isaac Newton",
            publisher="Encyclopaedia Britannica",
            url="https://www.britannica.com/biography/Isaac-Newton",
            accessed_at="2026-06-12",
        ),
        PublicSource(
            title="Sir Isaac Newton",
            publisher="The Royal Society",
            url="https://royalsociety.org/people/isaac-newton-11991/",
            accessed_at="2026-06-12",
        ),
    ),
)

WILLIAM_SHAKESPEARE_PROFILE = PublicHistoricalProfile(
    profile_id="william-shakespeare",
    name="William Shakespeare",
    filename="william-shakespeare-public-facts.txt",
    launch_wave="Low-risk historical starter",
    rights_posture=(
        "Long deceased; public-domain works are usable, but modern annotations, "
        "introductions, performances, and editions need rights review."
    ),
    facts=(
        "William Shakespeare was born in Stratford-upon-Avon in 1564 and died there "
        "in 1616.",
        "Public literary sources describe him as an English playwright, poet, actor, "
        "and central figure in English literature.",
        "His works include tragedies, comedies, histories, sonnets, and long narrative poems.",
        "This profile should distinguish Shakespeare's documented biography from later "
        "traditions, authorship theories, adaptations, and modern interpretations.",
    ),
    guardrail=(
        "This profile must answer as a historical profile based on public sources "
        "and must not claim to be the real William Shakespeare."
    ),
    sources=(
        PublicSource(
            title="William Shakespeare",
            publisher="Encyclopaedia Britannica",
            url="https://www.britannica.com/biography/William-Shakespeare",
            accessed_at="2026-06-12",
        ),
        PublicSource(
            title="Shakespeare's life",
            publisher="Shakespeare Birthplace Trust",
            url=(
                "https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/"
                "william-shakespeare/shakespeares-life/"
            ),
            accessed_at="2026-06-12",
        ),
    ),
)

ARISTOTLE_PROFILE = PublicHistoricalProfile(
    profile_id="aristotle",
    name="Aristotle",
    filename="aristotle-public-facts.txt",
    launch_wave="Low-risk historical starter",
    rights_posture=(
        "Ancient figure; avoid copying modern translations, introductions, or commentary "
        "without rights clearance."
    ),
    facts=(
        "Aristotle was born in 384 BCE in Stagira and died in 322 BCE in Chalcis.",
        "Public philosophy sources describe him as a Greek philosopher and polymath "
        "whose work influenced logic, ethics, politics, rhetoric, biology, and metaphysics.",
        "He studied in Plato's Academy and later founded the Lyceum in Athens.",
        "This profile should clearly separate Aristotle's surviving texts, later school "
        "traditions, and modern scholarly interpretation.",
    ),
    guardrail=(
        "This profile must answer as a historical profile based on public sources "
        "and must not claim to be the real Aristotle."
    ),
    sources=(
        PublicSource(
            title="Aristotle",
            publisher="Encyclopaedia Britannica",
            url="https://www.britannica.com/biography/Aristotle",
            accessed_at="2026-06-12",
        ),
        PublicSource(
            title="Aristotle",
            publisher="Stanford Encyclopedia of Philosophy",
            url="https://plato.stanford.edu/entries/aristotle/",
            accessed_at="2026-06-12",
        ),
    ),
)

SUN_TZU_PROFILE = PublicHistoricalProfile(
    profile_id="sun-tzu",
    name="Sun Tzu",
    filename="sun-tzu-public-facts.txt",
    launch_wave="Low-risk historical starter",
    rights_posture=(
        "Ancient figure; avoid copying modern translations of The Art of War unless "
        "their rights status is verified."
    ),
    facts=(
        "Sun Tzu, also rendered Sunzi, is traditionally associated with ancient Chinese "
        "military thought and The Art of War.",
        "Public reference sources describe uncertainty around parts of his biography "
        "and dating.",
        "The Art of War became influential in military, political, and business strategy.",
        "This profile should distinguish historically attested information from later "
        "tradition, legend, and modern management interpretation.",
    ),
    guardrail=(
        "This profile must answer as a historical profile based on public sources, "
        "must distinguish known history from tradition, and must not claim to be the real Sun Tzu."
    ),
    sources=(
        PublicSource(
            title="Sunzi",
            publisher="Encyclopaedia Britannica",
            url="https://www.britannica.com/biography/Sunzi",
            accessed_at="2026-06-12",
        ),
        PublicSource(
            title="Sunzi",
            publisher="Internet Encyclopedia of Philosophy",
            url="https://iep.utm.edu/sunzi/",
            accessed_at="2026-06-12",
        ),
    ),
)

LOW_RISK_HISTORICAL_STARTER_PROFILES = (
    LEONARDO_DA_VINCI_PROFILE,
    ISAAC_NEWTON_PROFILE,
    WILLIAM_SHAKESPEARE_PROFILE,
    ARISTOTLE_PROFILE,
    SUN_TZU_PROFILE,
)
