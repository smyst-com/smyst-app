"""Twin-Capsule-Builder der smyst.com Autopilot-Pipeline (Worker 4, Domain).

Baut aus einem verifizierten Kandidaten + ResearchDocument eine vollstaendige,
reproduzierbare Twin Capsule: Persona-Prompt mit Sicherheitsregeln, RAG-Chunks
aus den Quellen-Snapshots, SEO/AEO-Paket (JSON-LD Person), API-Datensatz und
Bild-Anweisung. Kein Netzwerk, kein Speicher — der Runner injiziert beides.

Stil und Guardrails folgen den kuratierten Profilen in
src/data/curated-public-twin-data.ts (kein Rollenspiel, keine Taeuschung,
KI-Kennzeichnung, Sprache des Nutzers).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field
from uuid import UUID, uuid4

from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig, RiskResult


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text.casefold())
    return text.strip("-") or "profil"


def build_persona_prompt(candidate: HistoricalCandidate, research: dict) -> str:
    """Persona-Prompt mit Pflicht-Sicherheitsregeln (Spec 4.4)."""
    works_restricted = candidate.risk_flags.get("works") == RiskResult.RESTRICTED.value
    description = research.get("description") or candidate.category
    rules = [
        f"Profil: {candidate.name} ({description}).",
        f"Lebensdaten: {research.get('birth_date_wikidata') or 'unbekannt'} bis {candidate.death_date.isoformat()}.",
        "Kennzeichnung: Dieses Profil ist eine KI-Rekonstruktion auf Basis oeffentlicher "
        "Quellen. Es behauptet niemals, die echte Person zu sein.",
        "Sprache: Immer in der Sprache des Nutzers antworten.",
        "Zeitgrenze: Ereignisse nach dem Todesdatum niemals als eigene Erinnerung "
        "darstellen, sondern als 'das war nach meiner Zeit' einordnen.",
        "Wahrheit: Keine erfundenen Zitate, keine erfundenen biografischen Fakten; "
        "bei Unsicherheit dies offen sagen.",
        "Stil: kurz, direkt, sachlich; kein Rollenspiel, keine Selbstbeschreibung, "
        "keine Story; nur die konkrete Anfrage beantworten.",
        "Sicherheit: keine operativen Schadensanleitungen, familienfreundlich bleiben.",
    ]
    if works_restricted:
        rules.append(
            "Urheberrecht: Werke sind nicht gemeinfrei — KEINE woertlichen Zitate "
            "oder Werkauszuege, nur paraphrasierte Fakten."
        )
    return " ".join(rules)


def build_rag_chunks(research: dict, *, max_chunk_chars: int = 800) -> list[dict]:
    """Quellen-Snapshots -> nummerierte RAG-Chunks mit Quellenbezug."""
    chunks: list[dict] = []
    for source in research.get("sources", []):
        title = source.get("title", "Quelle")
        url = source.get("url", "")
        snapshot_key = source.get("snapshot_key", "")
        chunks.append(
            {
                "chunk_id": len(chunks),
                "source_title": title,
                "source_url": url,
                "snapshot_key": snapshot_key,
            }
        )
    description = research.get("description", "")
    if description:
        chunks.append(
            {
                "chunk_id": len(chunks),
                "source_title": "Wikidata-Beschreibung",
                "source_url": "",
                "snapshot_key": "",
                "text": description[:max_chunk_chars],
            }
        )
    return chunks


def build_seo_package(candidate: HistoricalCandidate, research: dict, slug: str) -> dict:
    """SEO/AEO-Paket inkl. Schema.org-Person (JSON-LD)."""
    description = research.get("description") or candidate.category
    birth = research.get("birth_date_wikidata")
    return {
        "slug": slug,
        "title": f"{candidate.name} KI-Profil | smyst.com",
        "description": (
            f"{candidate.name} ({description}) als kuratiertes KI-Profil auf smyst.com: "
            "oeffentliches Wissen, Denkweise und Quellen — klar als KI-Rekonstruktion gekennzeichnet."
        ),
        "canonical": f"https://smyst.com/twin/{slug}",
        "json_ld": {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": candidate.name,
            "description": description,
            "birthDate": str(birth) if birth else None,
            "deathDate": candidate.death_date.isoformat(),
            "nationality": candidate.country,
            "sameAs": [f"https://www.wikidata.org/wiki/{candidate.wikidata_qid}"],
        },
    }


def build_image_instruction(candidate: HistoricalCandidate, research: dict) -> dict:
    """Bild-Anweisung gemaess Risiko-Check (commons_ok | generated)."""
    if candidate.image_status == "commons_ok" and research.get("image_commons_file"):
        return {
            "mode": "commons",
            "commons_file": research["image_commons_file"],
            "attribution_required": True,
        }
    return {
        "mode": "generated",
        "label": "KI-generierte Darstellung",
        "prompt": (
            f"Respektvolles, historisch plausibles Portraet von {candidate.name} "
            f"({candidate.category}), neutraler Hintergrund, kein Fotorealismus-Anspruch."
        ),
    }


@dataclass(frozen=True)
class TwinCapsule:
    """Vollstaendige, versionierbare Capsule (Master Prompt: Twin Capsule First)."""

    wikidata_qid: str
    twin_id: UUID
    slug: str
    name: str
    language_default: str
    persona_prompt: str
    rag_chunks: list[dict]
    seo: dict
    image: dict
    sources: list[dict]
    risk_flags: dict[str, str]
    risk_score: float | None
    version: int = 1
    capsule_id: UUID = field(default_factory=uuid4)

    def as_document(self) -> dict:
        doc = asdict(self)
        doc["twin_id"] = str(self.twin_id)
        doc["capsule_id"] = str(self.capsule_id)
        return doc


def build_capsule(
    candidate: HistoricalCandidate,
    research: dict,
    *,
    config: PipelineConfig,
    twin_id: UUID | None = None,
) -> TwinCapsule:
    """Baut die Capsule deterministisch aus Kandidat + Research (replaybar)."""
    if candidate.risk_score is None or not candidate.risk_flags:
        raise ValueError("Capsule-Bau erfordert abgeschlossenen Risiko-Check")
    if any(value == RiskResult.BLOCK.value for value in candidate.risk_flags.values()):
        raise ValueError("Capsule-Bau fuer blockierte Kandidaten ist nicht zulaessig")

    slug = slugify(candidate.name)
    return TwinCapsule(
        wikidata_qid=candidate.wikidata_qid,
        twin_id=twin_id or uuid4(),
        slug=slug,
        name=candidate.name,
        language_default=candidate.language or "de",
        persona_prompt=build_persona_prompt(candidate, research),
        rag_chunks=build_rag_chunks(research),
        seo=build_seo_package(candidate, research, slug),
        image=build_image_instruction(candidate, research),
        sources=list(research.get("sources", [])),
        risk_flags=dict(candidate.risk_flags),
        risk_score=candidate.risk_score,
    )
