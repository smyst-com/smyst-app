"""smyst.com Worker 1: taeglicher Wikidata-Kandidaten-Ingest (Salad-Cronjob).

Stateless: liest Wikidata (SPARQL) und den IDrive-e2-Store, schreibt neue
Kandidaten + Tages-Changelog zurueck nach IDrivee2.com. Kein lokaler Zustand.

Start (Salad-Container, taeglich):
    python -m app.workers.ingest_candidates --category Wissenschaft
    python -m app.workers.ingest_candidates --all-categories --dry-run

Sicherheitsregeln:
- Laeuft nur, wenn pipeline.enabled true ist (oder --dry-run).
- Blacklist-Treffer 'block' werden nie gespeichert, nur im Changelog dokumentiert.
- Rotiert taeglich durch die Kategorien (Wochentag), damit die Auswahl breit bleibt.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from dataclasses import replace
from datetime import date, datetime, timezone

import httpx

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig
from app.ai.wikidata_candidates import (
    CATEGORY_OCCUPATIONS,
    SPARQL_ENDPOINT,
    USER_AGENT,
    build_sparql_query,
    parse_sparql_bindings,
    screen_candidates,
)
from app.integrations.candidate_store import CandidateStore, build_s3_client


RETRY_DELAYS_SECONDS = (10.0, 30.0)  # WDQS liefert unter Last transiente 5xx (Run #7: 502)

# Obergrenze der OFFSET-Seiten je Kategorie: schuetzt WDQS vor Dauerfeuer,
# wenn der Store irgendwann fast alle bekannten Namen einer Kategorie enthaelt.
MAX_PAGES_PER_CATEGORY = 40

# Feste Seitengroesse fuer LIMIT/OFFSET. Frueher war das die Tagesquote geteilt
# durch die Kategorienzahl — damit verschob jede Aenderung an Quote oder
# Kategorienzahl die Bedeutung der gespeicherten Cursor-Seitenzahlen. 125
# entspricht dem bisherigen Wert (250 Quote / 2 Kategorien), die vorhandenen
# Cursor bleiben also gueltig.
PAGE_SIZE = 125

# Kategorien je Lauf. Zwei reichten nicht: ist eine davon abgegrast, blieb ihr
# Anteil am Budget ungenutzt liegen (Messung 13.08.2026: accepted 20/125/125/0
# bei ~1000 Dubletten je Lauf, waehrend die QA 250 verarbeiten koennte).
CATEGORIES_PER_RUN = 4

# Mindest-Bekanntheit der besten Person einer Seite. Die SPARQL-Liste ist nach
# Sitelinks absteigend sortiert; sinkt schon der Spitzenwert einer Seite unter
# diese Schwelle, ist die Kategorie beim aktuellen Qualitaetsanspruch
# abgegrast — weiter unten fehlen Bilder und Quellen, und die QA laesst die
# Kandidaten durchfallen.
#
# WARUM ES DIESE BREMSE BRAUCHT (teuer gelernt 14./15.08.2026): Der Cursor ist
# PERSISTENTER Zustand. Er wanderte Lauf fuer Lauf tiefer, bis die Ausbeute von
# ~200 auf 1-4 publizierte Profile je Lauf fiel. Sichtbar war das an den
# Dubletten: frueher ~1000 pro Lauf (bekanntes Gebiet), zuletzt 177-461 (die
# Pipeline war im Niemandsland). Ein Zurueckdrehen der Stufen-Limits half
# NICHT — Konfiguration rollt keinen gespeicherten Cursor zurueck. Deshalb
# setzt die Bremse den Cursor selbst zurueck.
MIN_PAGE_SITELINKS = 5  # 29.08.2026: 12 -> 5, folgt min_sitelinks (Betreiber-Anweisung 28.08.)

# Harte Obergrenze der Cursor-Tiefe als Rueckfallebene, falls die Sitelink-
# Bremse einmal nicht greift (z.B. Kategorie mit vielen gut verlinkten, aber
# bildlosen Personen). 40 Seiten a 125 = 5000 Eintraege je Kategorie.
MAX_CURSOR_PAGE = 40


def fetch_bindings(
    query: str, *, timeout_seconds: float = 60.0, sleep=None
) -> dict:
    """SPARQL-Anfrage gegen Wikidata (GET, JSON) mit Retry bei 5xx/Timeout."""
    import time

    sleep = sleep or time.sleep
    url = f"{SPARQL_ENDPOINT}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
    last_error: Exception | None = None
    for attempt in range(1 + len(RETRY_DELAYS_SECONDS)):
        if attempt:
            sleep(RETRY_DELAYS_SECONDS[attempt - 1])
        try:
            response = httpx.get(
                url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds
            )
            if response.status_code >= 500:  # transient: retry lohnt
                last_error = httpx.HTTPStatusError(
                    f"Server error '{response.status_code}'",
                    request=response.request, response=response,
                )
                continue
            response.raise_for_status()  # 4xx: kein Retry (Query-Fehler)
            return response.json()
        except (httpx.TimeoutException, httpx.TransportError) as error:
            last_error = error
    raise last_error  # type: ignore[misc]


def categories_for_run(
    run_date: date,
    *,
    slot: int = 0,
    all_categories: bool = False,
    count: int = CATEGORIES_PER_RUN,
) -> list[str]:
    """Mehrere Kategorien je LAUF, deterministisch und replaybar.

    Bis 06.08.2026 rotierte die Auswahl nur pro Tag (run_date) — alle 8
    Tagesläufe scannten dieselben zwei Kategorien und dieselben OFFSET-
    Seiten; Lauf 1 erntete alles, die Läufe 2-8 publizierten 2-5 Profile
    (Befund 06.08.). Der 3h-Slot (UTC-Stunde // 3) schiebt die Rotation
    deshalb pro Lauf weiter.

    Seit 13.08.2026 sind es vier statt zwei: das Budget ist jetzt gemeinsam
    (siehe run_ingest), abgegraste Kategorien kosten also nichts mehr, und
    die zusaetzlichen dienen als Reserve, wenn die ersten nichts liefern.
    Die Auswahl bleibt ueber den Ring gleichmaessig verteilt.
    """
    names = list(CATEGORY_OCCUPATIONS)
    if all_categories:
        return names
    count = max(1, min(count, len(names)))
    index = (run_date.toordinal() * 8 + slot) % len(names)
    step = len(names) // count
    return [names[(index + offset * step) % len(names)] for offset in range(count)]


def categories_for_today(run_date: date, *, all_categories: bool) -> list[str]:
    """Rueckwaertskompatibler Alias (Slot 0) fuer bestehende Aufrufer/Tests."""
    return categories_for_run(run_date, slot=0, all_categories=all_categories)


def run_ingest(
    *,
    categories: list[str],
    config: PipelineConfig,
    store: CandidateStore,
    dry_run: bool,
    run_date: date,
) -> dict:
    # "known" = Store-Bestand + alle in diesem Lauf bereits gesehenen QIDs.
    # Damit deduplizieren die OFFSET-Seiten untereinander UND gegen den Store.
    known = store.existing_qids()
    report: dict = {
        "worker": "ingest_candidates",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "categories": {},
        "errors": {},
        "totals": {"accepted": 0, "rejected": 0, "skipped_duplicates": 0},
    }
    # GEMEINSAMES Budget statt fester Anteile je Kategorie: frueher bekam jede
    # Kategorie Quote/Anzahl zugeteilt, und was eine abgegraste Kategorie nicht
    # abrief, verfiel — der Lauf brachte 125 statt 250 Kandidaten, obwohl die
    # zweite Kategorie noch Material gehabt haette (Messung 13.08.2026).
    # Jetzt zieht jede Kategorie aus demselben Topf, bis er leer ist.
    remaining_total = max(1, config.daily_candidate_limit)
    # Persistenter Seiten-Cursor je Kategorie: ohne ihn scannte jeder Lauf
    # wieder die Seiten 0..MAX-1 und fand nur Bekanntes (Befund 06.08.:
    # Laeufe 2-8 des Tages publizierten 2-5 Profile). Der Cursor laesst
    # Folgelaeufe dort weiterblaettern, wo der letzte aufgehoert hat.
    cursor = store.load_ingest_cursor()

    for category in categories:
        if remaining_total <= 0:
            # Topf leer — die restlichen Kategorien sind nur Reserve und werden
            # gar nicht erst angefragt (schont WDQS).
            break
        # OFFSET-Pagination: die Sitelink-Sortierung liefert auf Seite 1 immer
        # dieselben Top-Namen — sobald die im Store sind, kaeme ohne Blaettern
        # nie wieder Nachschub (Befund 20.07.: 0 neue Kandidaten/Tag).
        start_page = max(0, int(cursor.get(category, 0)))
        next_start = start_page
        cat_report = {
            "fetched": 0,
            "pages": 0,
            "start_page": start_page,
            "accepted": [],
            "rejected": [],
            "skipped_duplicates": [],
        }
        for page in range(start_page, start_page + MAX_PAGES_PER_CATEGORY):
            if page >= MAX_CURSOR_PAGE:
                # Tiefendeckel: zurueck an den Anfang. Dort stehen inzwischen
                # neu erfasste Wikidata-Eintraege, und Bekanntes kostet dank
                # Dedup fast nichts.
                next_start = 0
                cat_report["stop_reason"] = f"Tiefendeckel (Seite {page} >= {MAX_CURSOR_PAGE})"
                break
            query = build_sparql_query(
                category=category,
                config=config,
                limit=PAGE_SIZE,
                offset=page * PAGE_SIZE,
            )
            try:
                payload = fetch_bindings(query)
            except Exception as error:
                # Eine klemmende Kategorie (z.B. WDQS-502 bei grossen Berufen
                # wie Maler) darf den Tageslauf nicht komplett stoppen —
                # dokumentieren und mit der naechsten Kategorie weitermachen
                # (Run #7-Befund).
                report["errors"][category] = f"{type(error).__name__}: {error}"
                break
            rows = payload.get("results", {}).get("bindings", [])
            parsed = parse_sparql_bindings(payload, category=category)

            # Bekanntheits-Bremse: die Liste ist nach Sitelinks absteigend
            # sortiert. Liegt schon die BESTE Person dieser Seite unter der
            # Schwelle, wird es weiter unten nur schlechter — Cursor zurueck
            # auf Anfang und naechste Kategorie. Die Kandidaten dieser Seite
            # werden bewusst NICHT aufgenommen: sie wuerden nur die QA-Queue
            # fuellen und dort durchfallen.
            best_sitelinks = max((c.sitelink_count for c in parsed), default=0)
            if parsed and best_sitelinks < MIN_PAGE_SITELINKS:
                next_start = 0
                cat_report["stop_reason"] = (
                    f"Bekanntheit erschoepft (beste Seite {best_sitelinks} "
                    f"< {MIN_PAGE_SITELINKS} Sitelinks)"
                )
                break

            result = screen_candidates(
                parsed,
                existing_qids=known,
                config=replace(config, daily_candidate_limit=remaining_total),
            )

            if not dry_run:
                for candidate in result.accepted:
                    store.save_candidate(candidate)
            for candidate in parsed:
                known.add(candidate.wikidata_qid)

            cat_report["fetched"] += len(parsed)
            cat_report["pages"] += 1
            cat_report["accepted"].extend(c.wikidata_qid for c in result.accepted)
            cat_report["rejected"].extend(
                {"qid": c.wikidata_qid, "name": c.name, "reason": reason}
                for c, reason in result.rejected
            )
            cat_report["skipped_duplicates"].extend(result.skipped_duplicates)
            report["totals"]["accepted"] += len(result.accepted)
            report["totals"]["rejected"] += len(result.rejected)
            report["totals"]["skipped_duplicates"] += len(result.skipped_duplicates)

            remaining_total -= len(result.accepted)
            if remaining_total <= 0:
                # Budget voll, Seite evtl. nicht ausgeschoepft: naechster Lauf
                # liest DIESE Seite erneut (Dedup macht das billig) statt
                # ungesehene Kandidaten zu ueberspringen.
                next_start = page
                break
            if len(rows) < PAGE_SIZE:
                # Seite kuerzer als angefragt: Kategorie ist ausgeschoepft —
                # Cursor zurueck auf 0, damit spaetere Laeufe neu erfasste
                # Wikidata-Eintraege am Kopf der Sortierung wieder einsammeln.
                next_start = 0
                break
            next_start = page + 1
        cursor[category] = next_start
        cat_report["next_page"] = next_start
        # Auch ohne gelesene Seite berichten, wenn eine Bremse gegriffen hat —
        # sonst bliebe genau der Fall unsichtbar, der die Ausbeute erklaert.
        if cat_report["pages"] or cat_report.get("stop_reason"):
            report["categories"][category] = cat_report

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_ingest_cursor(cursor)
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Wikidata-Kandidaten-Ingest")
    parser.add_argument("--category", choices=sorted(CATEGORY_OCCUPATIONS), action="append")
    parser.add_argument("--all-categories", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="nichts speichern, nur Bericht")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    parser.add_argument(
        "--limit", type=int, help="Override daily_candidate_limit (Tagesquote Kandidaten)"
    )
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if args.limit:
        config = replace(config, daily_candidate_limit=args.limit)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    run_date = date.today()
    # 3h-Slot des Laufs (0-7): rotiert die Kategorien pro Lauf statt pro Tag.
    slot = datetime.now(timezone.utc).hour // 3
    categories = args.category or categories_for_run(
        run_date, slot=slot, all_categories=args.all_categories
    )
    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_ingest(
        categories=categories, config=config, store=store, dry_run=args.dry_run, run_date=run_date
    )
    print(json.dumps({**report["totals"], "errors": report["errors"]}, ensure_ascii=False))
    if report["errors"] and not report["categories"]:
        # ALLE Kategorien fehlgeschlagen -> rot (GitHub mailt dem Owner).
        return 1
    return 0


def _pipeline_bucket() -> str:  # pragma: no cover
    from app.core.config import settings

    return settings.idrive_e2_bucket


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
