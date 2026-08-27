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
import collections
import json
import sys
import time
from collections.abc import Callable
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
from app.workers.parallel_map import map_candidates, resolve_concurrency

#: Niedriger als die anderen Stufen: die Recherche ruft Wikimedia auf, nicht
#: unser eigenes Gateway. Mit 4 lag die Fehlerquote bei 23-48 % (siehe
#: _RETRY_STATUS). Notbremse ohne Code-Aenderung: RESEARCH_WORKER_CONCURRENCY.
RESEARCH_CONCURRENCY = 2
ENV_RESEARCH_CONCURRENCY = "RESEARCH_WORKER_CONCURRENCY"


def error_kinds(errors: dict[str, str]) -> dict[str, int]:
    """Fehlerarten zaehlen (z. B. HTTPStatusError: 12).

    Der Worker druckte bisher nur die ANZAHL der Fehler; die Details landeten
    ausschliesslich im Changelog in e2 und waren im Actions-Log unsichtbar.
    Genau deshalb liess sich die 48-%-Fehlerquote am 13.08. nicht direkt
    diagnostizieren.
    """
    return dict(
        collections.Counter(
            str(message).split(":", 1)[0].strip() for message in errors.values()
        ).most_common()
    )

ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
SUMMARY_URL = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
USER_AGENT = "smyst.com-research/1.0 (https://smyst.com; pipeline)"


#: Wikimedia drosselt gleichzeitige Abrufe pro IP, und GitHub-Runner teilen
#: sich IPs. Seit die Stufen parallel laufen (13.08.2026) stieg die
#: Fehlerquote der Recherche von ~0 auf 23 % (Lauf 31694475034: 29 von 125)
#: und dann 48 % (Lauf 31738692617: 61 von 127). Deshalb: wiederholen statt
#: sofort aufgeben, mit wachsender Wartezeit.
_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3


def _get_json(
    url: str,
    *,
    timeout_seconds: float = 30.0,
    attempts: int = _MAX_ATTEMPTS,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    import httpx  # lazy: Domain-Tests brauchen keinen HTTP-Client

    for attempt in range(1, attempts + 1):
        try:
            response = httpx.get(
                url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds,
                follow_redirects=True,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as error:
            # 404 & Co. sind echte Absagen — die zu wiederholen kostet nur Zeit.
            if error.response.status_code not in _RETRY_STATUS or attempt == attempts:
                raise
        except httpx.TransportError:  # Verbindungsabbruch, Timeout
            if attempt == attempts:
                raise
        sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError("unerreichbar")  # pragma: no cover - Schleife kehrt vorher zurueck


def _safe_date(value: str) -> date:
    """date.fromisoformat mit Fallback auf letzten Tag des Vormonats.
    Wikidata liefert gelegentlich ungueltige Daten wie '1800-02-30'."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        # Letzter Tag des Vormonats als sichere Fallback-Schätzung.
        parts = value.split("-")
        y, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 1
        if m == 1:
            y, m = y - 1, 12
        else:
            m -= 1
        import calendar
        return date(y, m, calendar.monthrange(y, m)[1])


def _candidate_from_document(document: dict) -> HistoricalCandidate:
    return HistoricalCandidate(
        wikidata_qid=document["wikidata_qid"],
        name=document["name"],
        death_date=_safe_date(document["death_date"]),
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
        store.save_candidate_document(
            qid, new_document, previous_status=document.get("status")
        )
    return qid, result


def run_research(
    *, store: CandidateStore, config: PipelineConfig, limit: int, dry_run: bool, run_date: date,
    concurrency: int | None = None,
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
    results, errors = map_candidates(
        documents,
        lambda document: research_one(document, store=store, config=config, dry_run=dry_run),
        concurrency=resolve_concurrency(
            concurrency, default=RESEARCH_CONCURRENCY, env_var=ENV_RESEARCH_CONCURRENCY
        ),
    )
    report["results"].update(results)
    report["errors"].update(errors)
    report["error_kinds"] = error_kinds(errors)
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com research-Worker")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--concurrency", type=int, default=None,
        help="parallele Kandidaten (Default 4; siehe workers/parallel_map)",
    )
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_research(
        store=store, config=config, limit=args.limit, dry_run=args.dry_run, run_date=date.today(), concurrency=args.concurrency
    )
    print(json.dumps({
        "results": len(report["results"]),
        "errors": len(report["errors"]),
        "error_kinds": report.get("error_kinds") or {},
    }))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
