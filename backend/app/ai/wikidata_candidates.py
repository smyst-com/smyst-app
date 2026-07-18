"""Wikidata-Kandidatensuche fuer die smyst.com Autopilot-Pipeline (Worker 1).

Reine Domain-Logik: SPARQL-Query bauen, Antwort parsen, filtern, Blacklist
anwenden, deduplizieren. Kein Netzwerk, kein Speicher — beides injiziert der
Runner (app/workers/ingest_candidates.py). Dadurch stateless und ohne
Seiteneffekte testbar.

Warum Wikidata: strukturierte Sterbedaten, eindeutige QIDs (Dedup-Anker),
Sitelink-Anzahl als Bekanntheits-Proxy, nachvollziehbare Quelle.
"""

from __future__ import annotations

import re as _re
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

#: Zielkategorien -> konkrete Wikidata-Occupation-QIDs (direkter P106-Match).
#: BEWUSST ohne P279*-Subklassen-Pfad: der traversierte Pfad ueber alle
#: Menschen laeuft in das 60s-Timeout des Wikidata-Endpoints (Befund
#: Pipeline-Run #3). Direkte VALUES-Listen sind um Groessenordnungen schneller.
CATEGORY_OCCUPATIONS: dict[str, tuple[str, ...]] = {
    "Kunst": ("Q1028181", "Q1281618"),                # painter, sculptor
    "Literatur": ("Q36180", "Q49757", "Q6625963"),    # writer, poet, novelist
    "Musik": ("Q36834", "Q639669"),                   # composer, musician
    "Wissenschaft": ("Q169470", "Q593644", "Q864503", "Q11063"),  # physicist, chemist, biologist, astronomer
    "Philosophie": ("Q4964182",),                     # philosopher
    "Politik": ("Q82955",),                           # politician
    "Mathematik": ("Q170790",),                       # mathematician
    "Medizin": ("Q39631",),                           # physician
    "Architektur": ("Q42973",),                       # architect
    "Erfinder": ("Q205375",),                         # inventor
    "Entdecker": ("Q11900058",),                      # explorer
    "Technik": ("Q81096",),                           # engineer
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
    occupations = CATEGORY_OCCUPATIONS[category]
    values = " ".join(f"wd:{qid}" for qid in occupations)
    limit_value = limit if limit is not None else config.daily_candidate_limit
    return f"""
SELECT DISTINCT ?person ?personLabel ?birth ?death ?sitelinks ?countryLabel
       ?birthPlaceLabel ?birthPlaceCountryLabel
       ?deathPlaceLabel ?deathPlaceCountryLabel WHERE {{
  VALUES ?occupation {{ {values} }}
  ?person wdt:P106 ?occupation ;
          wdt:P31 wd:Q5 ;
          wdt:P570 ?death ;
          wikibase:sitelinks ?sitelinks .
  OPTIONAL {{ ?person wdt:P569 ?birth . }}
  OPTIONAL {{ ?person wdt:P27 ?country . }}
  # Geburts-/Sterbeort (P19/P20) samt Staat des Ortes (P17) fuer die Zeilen 2
  # und 3 des 4-Zeilen-Profilformats. Orte mit mehreren P17-Werten (historische
  # Gebietswechsel) erzeugen Mehrfachzeilen; die QID-Dedup in screen_candidates
  # faengt das ab.
  OPTIONAL {{ ?person wdt:P19 ?birthPlace .
              OPTIONAL {{ ?birthPlace wdt:P17 ?birthPlaceCountry . }} }}
  OPTIONAL {{ ?person wdt:P20 ?deathPlace .
              OPTIONAL {{ ?deathPlace wdt:P17 ?deathPlaceCountry . }} }}
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


_QID_ONLY = _re.compile(r"^Q\d+$")


def _label(row: dict, key: str) -> str | None:
    """Label aus einer SPARQL-Zeile; roh gebliebene QIDs gelten als fehlend.

    Der Wikidata-Label-Service liefert die QID zurueck, wenn weder de- noch
    en-Label existiert. Solche Werte sind fuer die Anzeige unbrauchbar.
    """
    value = (row.get(key, {}).get("value") or "").strip()
    if not value or _QID_ONLY.match(value):
        return None
    return value


def _place(place: str | None, countries: set[str]) -> str | None:
    """Ort als "Stadt, Land".

    Das Land wird NUR angehaengt, wenn Wikidata genau einen Staat (P17) zum Ort
    fuehrt. Historische Orte tragen oft mehrere P17-Werte — Thagaste liefert
    Numidien, Algerien UND Frankreich. Ein beliebiger Treffer daraus waere
    schlicht falsch, deshalb bleibt der Ort in dem Fall ohne Land stehen.
    """
    if not place:
        return None
    real = {c for c in countries if c and c != place}
    if len(real) != 1:
        return place
    return f"{place}, {real.pop()}"


def parse_sparql_bindings(payload: dict, *, category: str) -> list[HistoricalCandidate]:
    """Wandelt eine SPARQL-JSON-Antwort in HistoricalCandidate-Objekte um.

    Zeilen ohne parsebares Sterbedatum werden verworfen (Pflichtfeld).
    """
    # Mehrere P17-Werte je Ort vervielfachen die Zeilen (Francis Bacon kam im
    # Livetest in vier Varianten). Darum je QID zusammenfassen: erste Zeile
    # gewinnt fuer die Stammdaten, die Laender werden ueber alle Zeilen gesammelt
    # und erst danach bewertet.
    first_row: dict[str, dict] = {}
    order: list[str] = []
    birth_countries: dict[str, set[str]] = {}
    death_countries: dict[str, set[str]] = {}
    for row in payload.get("results", {}).get("bindings", []):
        if "death" not in row or _parse_wikidata_date(row["death"]["value"]) is None:
            continue
        qid = _qid_from_uri(row["person"]["value"])
        if qid not in first_row:
            first_row[qid] = row
            order.append(qid)
            birth_countries[qid] = set()
            death_countries[qid] = set()
        for key, target in (("birthPlaceCountryLabel", birth_countries),
                            ("deathPlaceCountryLabel", death_countries)):
            country = _label(row, key)
            if country:
                target[qid].add(country)

    candidates: list[HistoricalCandidate] = []
    for qid in order:
        row = first_row[qid]
        candidates.append(
            HistoricalCandidate(
                wikidata_qid=qid,
                name=row.get("personLabel", {}).get("value", ""),
                death_date=_parse_wikidata_date(row["death"]["value"]),
                birth_date=_parse_wikidata_date(row["birth"]["value"]) if "birth" in row else None,
                category=category,
                country=row.get("countryLabel", {}).get("value"),
                birth_place=_place(_label(row, "birthPlaceLabel"), birth_countries[qid]),
                death_place=_place(_label(row, "deathPlaceLabel"), death_countries[qid]),
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
