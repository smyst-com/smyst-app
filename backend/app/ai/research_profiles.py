"""Recherche-Logik der smyst.com Autopilot-Pipeline (Worker 2, Domain-Schicht).

Verarbeitet Wikidata-EntityData (Special:EntityData/{qid}.json) und
Wikipedia-REST-Summaries zu einem pruefbaren ResearchDocument. Kein Netzwerk,
kein Speicher — der Runner (app/workers/research_candidates.py) injiziert
beides. Widersprueche werden markiert, niemals verschwiegen (Master Prompt:
widerspruechliche Quellen nie unmarkiert speichern).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# Wikidata-Properties
P_BIRTH = "P569"
P_DEATH = "P570"
P_IMAGE = "P18"
P_NOTABLE_WORKS = "P800"
P_OCCUPATION = "P106"
P_GENDER = "P21"

# Wikidata sex-or-gender (P21) -> Stimmen-Geschlecht fuer die Sprachwelle.
# Nur binaere Werte werden gemappt; alles andere bleibt None (neutraler
# Fallback, keine Vermutungen laut Master-Prompt).
GENDER_BY_QID = {
    "Q6581072": "female",
    "Q6581097": "male",
}

#: Bevorzugte Wikipedia-Sprachversionen fuer Quellen-Snapshots.
PREFERRED_WIKIS = ("dewiki", "enwiki", "frwiki", "eswiki", "itwiki")


@dataclass(frozen=True)
class SourceRef:
    """Eine gesammelte Quelle inkl. Snapshot-Ablage in IDrivee2.com."""

    title: str
    publisher: str
    url: str
    snapshot_key: str


@dataclass(frozen=True)
class ResearchDocument:
    wikidata_qid: str
    name: str
    description: str
    death_date_wikidata: date | None
    birth_date_wikidata: date | None
    image_commons_file: str | None
    notable_work_qids: tuple[str, ...]
    occupation_qids: tuple[str, ...]
    wikipedia_titles: dict[str, str]
    sources: tuple[SourceRef, ...] = ()
    conflicts: tuple[str, ...] = ()
    # Stimmen-Geschlecht aus Wikidata P21 ('female'/'male'); None = unbekannt
    # oder nicht-binaer -> neutraler Fallback in der Sprachwelle.
    gender: str | None = None

    @property
    def source_count(self) -> int:
        return len(self.sources)


def _parse_wikidata_time(value: dict) -> date | None:
    """Wikidata-Zeitwert (+1955-04-18T00:00:00Z) -> date; None bei Praezision < Tag/Jahr."""
    time_str = value.get("time", "")
    if not time_str.startswith("+"):
        return None  # negative Jahre (v. Chr.) hier nicht relevant
    parts = time_str[1:].split("T")[0].split("-")
    try:
        year, month, day = (int(p) for p in parts)
    except ValueError:
        return None
    # Wikidata nutzt 00 fuer unbekannten Monat/Tag.
    return date(year, max(month, 1), max(day, 1))


def _first_claim_value(entity: dict, prop: str) -> dict | None:
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            return snak.get("datavalue", {}).get("value")
    return None


def _claim_item_ids(entity: dict, prop: str) -> tuple[str, ...]:
    ids: list[str] = []
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            item = snak.get("datavalue", {}).get("value", {})
            if isinstance(item, dict) and "id" in item:
                ids.append(item["id"])
    return tuple(ids)


def parse_entity(payload: dict, qid: str) -> ResearchDocument:
    """Wikidata-EntityData-JSON -> ResearchDocument (ohne Quellen/Konflikte)."""
    entity = payload.get("entities", {}).get(qid, {})
    labels = entity.get("labels", {})
    descriptions = entity.get("descriptions", {})
    name = (labels.get("de") or labels.get("en") or {}).get("value", "")
    description = (descriptions.get("de") or descriptions.get("en") or {}).get("value", "")

    death_value = _first_claim_value(entity, P_DEATH)
    birth_value = _first_claim_value(entity, P_BIRTH)
    image_value = _first_claim_value(entity, P_IMAGE)
    gender_qids = _claim_item_ids(entity, P_GENDER)
    gender = GENDER_BY_QID.get(gender_qids[0]) if gender_qids else None

    wikipedia_titles = {
        wiki: link["title"]
        for wiki, link in entity.get("sitelinks", {}).items()
        if wiki in PREFERRED_WIKIS and "title" in link
    }

    return ResearchDocument(
        wikidata_qid=qid,
        name=name,
        description=description,
        death_date_wikidata=_parse_wikidata_time(death_value) if death_value else None,
        birth_date_wikidata=_parse_wikidata_time(birth_value) if birth_value else None,
        image_commons_file=image_value if isinstance(image_value, str) else None,
        notable_work_qids=_claim_item_ids(entity, P_NOTABLE_WORKS),
        occupation_qids=_claim_item_ids(entity, P_OCCUPATION),
        wikipedia_titles=wikipedia_titles,
        gender=gender,
    )


def check_consistency(
    document: ResearchDocument,
    *,
    candidate_death_date: date,
    wikipedia_extracts: dict[str, str] | None = None,
) -> tuple[str, ...]:
    """Konsistenzpruefungen; jede Abweichung wird als Konflikt-Text markiert.

    - Sterbedatum Kandidat (aus SPARQL-Ingest) vs. EntityData-Claim.
    - Sterbejahr muss in mindestens einem Wikipedia-Extract vorkommen.
    """
    conflicts: list[str] = []
    if document.death_date_wikidata is None:
        conflicts.append("Wikidata-EntityData enthaelt kein Sterbedatum (P570)")
    elif document.death_date_wikidata != candidate_death_date:
        conflicts.append(
            f"Sterbedatum widerspruechlich: Ingest {candidate_death_date.isoformat()} "
            f"vs. EntityData {document.death_date_wikidata.isoformat()}"
        )

    if wikipedia_extracts:
        year = str(candidate_death_date.year)
        if not any(year in extract for extract in wikipedia_extracts.values()):
            conflicts.append(
                f"Sterbejahr {year} in keinem Wikipedia-Extract gefunden"
            )
    return tuple(conflicts)


@dataclass(frozen=True)
class ResearchOutcome:
    """Entscheidung des research-Workers fuer einen Kandidaten."""

    document: ResearchDocument
    ready: bool
    reject_reason: str | None = None
    notes: tuple[str, ...] = field(default_factory=tuple)


def evaluate_research(
    document: ResearchDocument,
    *,
    candidate_death_date: date,
    min_sources: int,
    wikipedia_extracts: dict[str, str] | None = None,
) -> ResearchOutcome:
    """Regeln fuer candidate -> researched bzw. -> rejected.

    Harte Ablehnung nur bei Datenwiderspruch oder zu wenigen Quellen;
    fehlendes Bild ist KEIN Ablehnungsgrund (build-Worker generiert dann).
    """
    conflicts = check_consistency(
        document,
        candidate_death_date=candidate_death_date,
        wikipedia_extracts=wikipedia_extracts,
    )
    document = ResearchDocument(
        **{**document.__dict__, "conflicts": conflicts}  # frozen -> Neuaufbau
    )

    date_conflicts = tuple(c for c in conflicts if "widerspruechlich" in c or "kein Sterbedatum" in c)
    if date_conflicts:
        return ResearchOutcome(document, ready=False, reject_reason="; ".join(date_conflicts))
    if document.source_count < min_sources:
        return ResearchOutcome(
            document,
            ready=False,
            reject_reason=f"nur {document.source_count} Quellen (< {min_sources})",
        )
    notes = tuple(c for c in conflicts if c not in date_conflicts)
    return ResearchOutcome(document, ready=True, notes=notes)


def with_sources(document: ResearchDocument, sources: list[SourceRef]) -> ResearchDocument:
    return ResearchDocument(**{**document.__dict__, "sources": tuple(sources)})
