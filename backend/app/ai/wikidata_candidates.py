"""Wikidata-Kandidatensuche fuer die smyst.com Autopilot-Pipeline (Worker 1).

Reine Domain-Logik: SPARQL-Query bauen, Antwort parsen, filtern, Blacklist
anwenden, deduplizieren. Kein Netzwerk, kein Speicher — beides injiziert der
Runner (app/workers/ingest_candidates.py). Dadurch stateless und ohne
Seiteneffekte testbar.

Warum Wikidata: strukturierte Sterbedaten, eindeutige QIDs (Dedup-Anker),
Sitelink-Anzahl als Bekanntheits-Proxy, nachvollziehbare Quelle.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from app.ai.estate_blacklist import find_estate_entry, publicity_risk
from app.ai.historical_pipeline import (
    HistoricalCandidate,
    PipelineConfig,
    RiskResult,
)

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "smyst.com-candidate-ingest/1.0 (https://smyst.com; pipeline)"

#: Zielkategorien -> Wikidata-Occupation-QIDs (P106, inkl. Unterklassen via P279*).
CATEGORY_OCCUPATIONS: dict[str, str] = {
    "Kunst": "Q1028181",          # painter
    "Literatur": "Q36180",        # writer
    "Musik": "Q36834",            # composer
    "Wissenschaft": "Q901",       # scientist
    "Philosophie": "Q4964182",    # philosopher
    "Politik": "Q82955",          # politician
    "Mathematik": "Q170790",      # mathematician
    "Medizin": "Q39631",          # physician
    "Architektur": "Q42973",      # architect
    "Erfinder": "Q205375",        # inventor
    "Entdecker": "Q11900058",     # explorer
    "Technik": "Q81096",          # engineer
}


def build_sparql_query(
    *,
    category: str,
    config: PipelineConfig,
    death_year_from: int = 1400,
    limit: int | None = None,
    offset: int = 0,
) -> str:
    """SPARQL fuer Menschen der Kategorie, gestorben bis max_death_year.

    Sortierung nach Sitelinks absteigend -> bekannteste zuerst, reproduzierbar.
    """
    occupation = CATEGORY_OCCUPATIONS[category]
    limit_value = limit if limit is not None else config.daily_candidate_limit
    return f"""
SELECT ?person ?personLabel ?birth ?death ?sitelinks ?countryLabel WHERE {{
  ?person wdt:P31 wd:Q5 ;
          wdt:P106/wdt:P279* wd:{occupation} ;
          wdt:P570 ?death ;
          wikibase:sitelinks ?sitelinks .
  OPTIONAL {{ ?person wdt:P569 ?birth . }}
  OPTIONAL {{ ?person wdt:P27 ?country . }}
  FILTER(YEAR(?death) >= {death_year_from} && YEAR(?death) <= {config.max_death_year})
  FILTER(?sitelinks >= {config.min_sitelinks})
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
}}
ORDER BY DESC(?sitelinks) ?person
LIMIT {limit_value}
OFFSET {offset}
""".strip()


@dataclass(frozen=True)
class IngestResult:
    accepted: tuple[HistoricalCandidate, ...]
    rejected: tuple[tuple[HistoricalCandidate, str], ...]  # (Kandidat, Grund)
    skipped_duplicates: tuple[str, ...]                    # QIDs


def _qid_from_uri(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def _parse_wikidata_date(raw: str) -> date | None:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_sparql_bindings(payload: dict, *, category: str) -> list[HistoricalCandidate]:
    """Wandelt eine SPARQL-JSON-Antwort in HistoricalCandidate-Objekte um.

    Zeilen ohne parsebares Sterbedatum werden verworfen (Pflichtfeld).
    """
    candidates: list[HistoricalCandidate] = []
    for row in payload.get("results", {}).get("bindings", []):
        death = _parse_wikidata_date(row["death"]["value"]) if "death" in row else None
        if death is None:
            continue
        birth = _parse_wikidata_date(row["birth"]["value"]) if "birth" in row else None
        candidates.append(
            HistoricalCandidate(
                wikidata_qid=_qid_from_uri(row["person"]["value"]),
                name=row.get("personLabel", {}).get("value", ""),
                death_date=death,
                birth_date=birth,
                category=category,
                country=row.get("countryLabel", {}).get("value"),
                sitelink_count=int(row.get("sitelinks", {}).get("value", 0)),
            )
        )
    return candidates


def screen_candidates(
    candidates: list[HistoricalCandidate],
    *,
    existing_qids: set[str],
    config: PipelineConfig,
) -> IngestResult:
    """Dedup + Eingangs-Screening. Ergebnis ist vollstaendig nachvollziehbar.

    - Duplikate (QID bereits im Store) werden uebersprungen.
    - Blacklist 'block' -> als abzulehnen markiert (Grund dokumentiert).
    - Blacklist 'manual_review' -> aufgenommen, aber risk_flag gesetzt,
      damit der risk-Worker und die menschliche Freigabe es sehen.
    - Sitelink-/Sterbejahr-Grenzen werden serverseitig gefiltert, hier aber
      erneut geprueft (Verteidigung in der Tiefe, Query kann sich aendern).
    """
    from dataclasses import replace

    accepted: list[HistoricalCandidate] = []
    rejected: list[tuple[HistoricalCandidate, str]] = []
    skipped: list[str] = []
    seen_this_run: set[str] = set()

    for candidate in candidates:
        qid = candidate.wikidata_qid
        if qid in existing_qids or qid in seen_this_run:
            skipped.append(qid)
            continue
        seen_this_run.add(qid)

        if not candidate.name or candidate.name == qid:
            rejected.append((candidate, "kein aufloesbarer Name (nur QID-Label)"))
            continue
        if candidate.death_date.year > config.max_death_year:
            rejected.append((candidate, f"Sterbejahr {candidate.death_date.year} > {config.max_death_year}"))
            continue
        if candidate.sitelink_count < config.min_sitelinks:
            rejected.append((candidate, f"Sitelinks {candidate.sitelink_count} < {config.min_sitelinks}"))
            continue

        risk = publicity_risk(qid, candidate.name)
        if risk is RiskResult.BLOCK:
            entry = find_estate_entry(qid, candidate.name)
            rejected.append((candidate, f"estate_blacklist block: {entry.manager if entry else 'Eintrag'}"))
            continue
        if risk is RiskResult.MANUAL_REVIEW:
            candidate = replace(candidate, risk_flags={"publicity": RiskResult.MANUAL_REVIEW.value})

        accepted.append(candidate)
        if len(accepted) >= config.daily_candidate_limit:
            break

    return IngestResult(tuple(accepted), tuple(rejected), tuple(skipped))
