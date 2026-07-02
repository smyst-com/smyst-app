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


def fetch_bindings(query: str, *, timeout_seconds: float = 60.0) -> dict:
    """SPARQL-Anfrage gegen Wikidata (GET, JSON)."""
    url = f"{SPARQL_ENDPOINT}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()


def categories_for_today(run_date: date, *, all_categories: bool) -> list[str]:
    names = list(CATEGORY_OCCUPATIONS)
    if all_categories:
        return names
    # Tagesrotation: jeden Tag zwei Kategorien, deterministisch und replaybar.
    index = run_date.toordinal() % len(names)
    return [names[index], names[(index + len(names) // 2) % len(names)]]


def run_ingest(
    *,
    categories: list[str],
    config: PipelineConfig,
    store: CandidateStore,
    dry_run: bool,
    run_date: date,
) -> dict:
    existing = store.existing_qids()
    report: dict = {
        "worker": "ingest_candidates",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "categories": {},
        "totals": {"accepted": 0, "rejected": 0, "skipped_duplicates": 0},
    }
    per_category_limit = max(1, config.daily_candidate_limit // max(1, len(categories)))

    for category in categories:
        query = build_sparql_query(category=category, config=config, limit=per_category_limit)
        payload = fetch_bindings(query)
        parsed = parse_sparql_bindings(payload, category=category)
        result = screen_candidates(parsed, existing_qids=existing, config=config)

        if not dry_run:
            for candidate in result.accepted:
                store.save_candidate(candidate)
                existing.add(candidate.wikidata_qid)

        report["categories"][category] = {
            "fetched": len(parsed),
            "accepted": [c.wikidata_qid for c in result.accepted],
            "rejected": [
                {"qid": c.wikidata_qid, "name": c.name, "reason": reason}
                for c, reason in result.rejected
            ],
            "skipped_duplicates": list(result.skipped_duplicates),
        }
        report["totals"]["accepted"] += len(result.accepted)
        report["totals"]["rejected"] += len(result.rejected)
        report["totals"]["skipped_duplicates"] += len(result.skipped_duplicates)

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Wikidata-Kandidaten-Ingest")
    parser.add_argument("--category", choices=sorted(CATEGORY_OCCUPATIONS), action="append")
    parser.add_argument("--all-categories", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="nichts speichern, nur Bericht")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    run_date = date.today()
    categories = args.category or categories_for_today(run_date, all_categories=args.all_categories)
    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_ingest(
        categories=categories, config=config, store=store, dry_run=args.dry_run, run_date=run_date
    )
    print(json.dumps(report["totals"], ensure_ascii=False))
    return 0


def _pipeline_bucket() -> str:  # pragma: no cover
    from app.core.config import settings

    return settings.idrive_e2_bucket


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
