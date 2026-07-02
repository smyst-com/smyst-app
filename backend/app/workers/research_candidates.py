"""smyst.com Worker 2: Recherche fuer Kandidaten mit Status 'candidate'.

Stateless (Salad-Cronjob): laedt candidate-Dokumente aus IDrivee2.com, holt
Wikidata-EntityData und Wikipedia-Summaries, speichert Quellen-Snapshots und
ResearchDocument nach IDrivee2.com und fuehrt die Transition
candidate -> researched (oder -> rejected bei Datenwiderspruch) ueber die
State Machine aus — inklusive AuditEvent im Kandidaten-Dokument.

Start:
    python -m app.workers.research_candidates --limit 10
    python -m app.workers.research_candidates --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import date, datetime, timezone

from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    HistoricalCandidate,
    PipelineConfig,
    PipelineStatus,
    transition,
)
from app.ai.research_profiles import (
    ResearchOutcome,
    SourceRef,
    evaluate_research,
    parse_entity,
    with_sources,
)
from app.integrations.candidate_store import CandidateStore, build_s3_client

ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
SUMMARY_URL = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
USER_AGENT = "smyst.com-research/1.0 (https://smyst.com; pipeline)"


def _get_json(url: str, *, timeout_seconds: float = 30.0) -> dict:
    import httpx  # lazy: Domain-Tests brauchen keinen HTTP-Client

    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds,
                         follow_redirects=True)
    response.raise_for_status()
    return response.json()


def _candidate_from_document(document: dict) -> HistoricalCandidate:
    return HistoricalCandidate(
        wikidata_qid=document["wikidata_qid"],
        name=document["name"],
        death_date=date.fromisoformat(document["death_date"]),
        category=document["category"],
        country=document.get("country"),
        sitelink_count=document.get("sitelink_count", 0),
        status=PipelineStatus(document["status"]),
        risk_flags=document.get("risk_flags") or {},
        source_count=document.get("source_count", 0),
    )


def research_one(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
) -> tuple[str, str]:
    """Recherchiert einen Kandidaten. Rueckgabe: (qid, Ergebnis-Text)."""
    from dataclasses import replace

    candidate = _candidate_from_document(document)
    qid = candidate.wikidata_qid

    entity_payload = _get_json(ENTITY_URL.format(qid=qid))
    research = parse_entity(entity_payload, qid)

    sources: list[SourceRef] = []
    extracts: dict[str, str] = {}
    if not dry_run:
        key = store.save_source_snapshot(
            qid, "wikidata-entitydata.json", json.dumps(entity_payload).encode("utf-8")
        )
        sources.append(SourceRef("Wikidata EntityData", "wikidata.org", ENTITY_URL.format(qid=qid), key))

    for wiki, title in research.wikipedia_titles.items():
        lang = wiki.removesuffix("wiki")
        url = SUMMARY_URL.format(lang=lang, title=title.replace(" ", "_"))
        try:
            summary = _get_json(url)
        except Exception:  # einzelne Wiki-Ausfaelle brechen die Recherche nicht ab
            continue
        extracts[wiki] = summary.get("extract", "")
        if not dry_run:
            key = store.save_source_snapshot(
                qid, f"wikipedia-{lang}.json", json.dumps(summary).encode("utf-8")
            )
            sources.append(SourceRef(title, f"{lang}.wikipedia.org", url, key))

    research = with_sources(research, sources if not dry_run else
                            [SourceRef("dry-run", "-", "-", "-")] * (1 + len(extracts)))
    outcome: ResearchOutcome = evaluate_research(
        research,
        candidate_death_date=candidate.death_date,
        min_sources=config.min_sources,
        wikipedia_extracts=extracts,
    )

    if outcome.ready:
        updated_candidate = replace(candidate, source_count=outcome.document.source_count)
        updated_candidate, event = transition(
            updated_candidate, PipelineStatus.RESEARCHED, config=config
        )
        result = "researched"
    else:
        updated_candidate, event = transition(
            candidate, PipelineStatus.REJECTED, reason=outcome.reject_reason, config=config
        )
        result = f"rejected: {outcome.reject_reason}"

    if not dry_run:
        store.save_research_document(qid, {**asdict(outcome.document), "notes": list(outcome.notes)})
        new_document = {
            **document,
            "status": updated_candidate.status.value,
            "status_reason": updated_candidate.status_reason,
            "source_count": updated_candidate.source_count,
            "audit_trail": document.get("audit_trail", [])
            + [{**asdict(event), "from_status": event.from_status.value,
                "to_status": event.to_status.value}],
        }
        store.save_candidate_document(qid, new_document)
    return qid, result


def run_research(
    *, store: CandidateStore, config: PipelineConfig, limit: int, dry_run: bool, run_date: date
) -> dict:
    documents = store.candidate_documents_by_status(PipelineStatus.CANDIDATE.value, limit=limit)
    report: dict = {
        "worker": "research_candidates",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "results": {},
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            qid, result = research_one(document, store=store, config=config, dry_run=dry_run)
            report["results"][qid] = result
        except Exception as error:  # Fehler dokumentieren, Lauf fortsetzen
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com research-Worker")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_research(
        store=store, config=config, limit=args.limit, dry_run=args.dry_run, run_date=date.today()
    )
    print(json.dumps({"results": len(report["results"]), "errors": len(report["errors"])}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
