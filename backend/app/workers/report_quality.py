"""smyst.com Quality-Report-Worker: aggregiert die Qualitaetsschleife.

Scannt alle published-Profile und verdichtet Eval-Scores, Regressionen und
offene Freshness-Reviews zu EINER Zusammenfassung (quality_store.SUMMARY_KEY),
die der Admin-Endpoint /api/admin/quality ohne Live-Scan ausliefert.

Read-only gegenueber den Kandidaten-Dokumenten; schreibt nur die Summary.

Start:
    python -m app.workers.report_quality --dry-run
    python -m app.workers.report_quality
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from app.ai.historical_pipeline import PipelineStatus
from app.integrations.candidate_store import CandidateStore, build_s3_client

#: Mehr Listenzeilen machen die Admin-Sicht unuebersichtlich; Details stehen
#: im jeweiligen Kandidaten-Dokument.
LIST_LIMIT = 15


def build_quality_summary(documents: list[dict], *, now: datetime) -> dict:
    evaluated: list[dict] = []
    regressions: list[dict] = []
    needs_review: list[dict] = []
    refresh_checked = 0

    for document in documents:
        qid = document.get("wikidata_qid", "?")
        name = document.get("name")
        report = document.get("eval_report")
        if isinstance(report, dict) and isinstance(report.get("score"), (int, float)):
            entry = {
                "qid": qid,
                "name": name,
                "score": report["score"],
                "regression": bool(report.get("regression")),
                "finished_at": report.get("finished_at"),
                "issues": list(report.get("issues") or [])[:3],
            }
            evaluated.append(entry)
            if entry["regression"]:
                regressions.append(
                    {**entry, "previous_score": report.get("previous_score")}
                )
        refresh = document.get("refresh")
        if isinstance(refresh, dict) and refresh.get("checked_at"):
            refresh_checked += 1
            if refresh.get("needs_review"):
                needs_review.append(
                    {
                        "qid": qid,
                        "name": name,
                        "checked_at": refresh.get("checked_at"),
                        "changed": bool(refresh.get("changed")),
                        "lastrevid": refresh.get("lastrevid"),
                    }
                )

    evaluated.sort(key=lambda entry: entry["score"])
    regressions.sort(key=lambda entry: entry["score"])
    needs_review.sort(key=lambda entry: str(entry.get("checked_at") or ""))
    total = len(documents)
    average = (
        round(sum(entry["score"] for entry in evaluated) / len(evaluated), 4)
        if evaluated
        else None
    )
    return {
        "generated_at": now.isoformat(),
        "counts": {
            "published": total,
            "evaluated": len(evaluated),
            "regressions": len(regressions),
            "needs_review": len(needs_review),
            "refresh_checked": refresh_checked,
            "score_below_0_8": sum(1 for entry in evaluated if entry["score"] < 0.8),
        },
        "average_score": average,
        "worst_evals": evaluated[:LIST_LIMIT],
        "regressions": regressions[:LIST_LIMIT],
        "needs_review": needs_review[:LIST_LIMIT],
    }


def run_quality_report(*, store: CandidateStore, dry_run: bool, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    documents = store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)
    summary = build_quality_summary(documents, now=now)
    if not dry_run:
        from app.integrations import quality_store

        summary["saved"] = quality_store.save_summary(summary)
    return summary


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Quality-Report (Aggregation)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    summary = run_quality_report(store=store, dry_run=args.dry_run)
    print(json.dumps(summary["counts"], ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
