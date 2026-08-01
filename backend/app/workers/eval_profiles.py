"""smyst.com Eval-Worker: wiederkehrende Qualitaets-Evals fuer published-Profile.

Baustein 1 der Qualitaetsschleife (Ergaenzung zu Worker 5/qa_candidates, der
nur das einmalige Vorab-Gate ist): prueft bereits veroeffentlichte Profile
regelmaessig mit dem Fragenset aus app/ai/profile_evals — Standardfragen,
profil-spezifische Fragen und per Daumen-runter gemeldete Nutzerfragen.

Ergebnis je Profil: eval_report (inkl. Score + Regressions-Flag gegen den
Vorlauf) im Kandidaten-Dokument, eval_history (letzte 10 Laeufe) und ein
Changelog-Eintrag. Der Status des Profils wird NIE veraendert — Regressionen
sind ein Befund fuer das Admin-Review, kein automatisches Unpublish.

Queue-Fairness wie bei Worker 5: nie evaluierte Profile zuerst, danach die
mit dem aeltesten Eval (Regressions-Abdeckung rotiert durch den Bestand).

Start:
    python -m app.workers.eval_profiles --limit 10 --dry-run
    python -m app.workers.eval_profiles --enabled --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from typing import Callable

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig, PipelineStatus
from app.ai.profile_evals import run_profile_eval
from app.ai.qa_checks import ChatProviderDegradedError
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.qa_candidates import build_chat_fn, load_capsule_document

#: Mehr als 10 History-Eintraege blaehen das Dokument ohne Erkenntnisgewinn auf.
EVAL_HISTORY_LIMIT = 10


def _default_feedback_loader(twin_slug: str) -> list[dict]:  # pragma: no cover - Verdrahtung
    from app.integrations import feedback_store

    return feedback_store.list_feedback(twin_slug)


def eval_one(
    document: dict,
    *,
    store: CandidateStore,
    dry_run: bool,
    now: datetime,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
    feedback_loader: Callable[[str], list[dict]] = _default_feedback_loader,
) -> tuple[str, str]:
    qid = document.get("wikidata_qid", "?")
    capsule_doc = load_capsule_document(store, qid)
    chat_fn = chat_fn_factory(capsule_doc)
    if chat_fn is None:
        return qid, "skipped (kein Chat-Provider konfiguriert) — Profil unbewertet"

    slug = str(capsule_doc.get("slug") or "")
    feedback_records = feedback_loader(slug) if slug else []
    previous = document.get("eval_report") or {}
    previous_score = previous.get("score") if isinstance(previous, dict) else None

    try:
        report = run_profile_eval(
            document,
            feedback_records,
            chat_fn=chat_fn,
            previous_score=previous_score if isinstance(previous_score, (int, float)) else None,
        )
    except ChatProviderDegradedError as error:
        # Provider-Ausfall: Profil NICHT anfassen — naechster Lauf prueft erneut.
        print(f"eval_profiles: {qid} uebersprungen — Chat-Provider degradiert ({error})")
        return qid, f"skipped (Chat-Provider degradiert: {error}) — Profil unbewertet"

    finished_at = now.isoformat()
    result = (
        f"score {report.score:.2f}"
        + (f" (Regression, vorher {report.previous_score:.2f})" if report.regression else "")
        + f", {len(report.issues)} Issues"
    )
    if not dry_run:
        history = [
            entry
            for entry in (document.get("eval_history") or [])
            if isinstance(entry, dict)
        ]
        history.append(
            {"finished_at": finished_at, "score": report.score, "regression": report.regression}
        )
        new_document = {
            **document,
            "eval_report": {**report.as_document(), "finished_at": finished_at},
            "eval_history": history[-EVAL_HISTORY_LIMIT:],
        }
        store.save_candidate_document(qid, new_document)
    return qid, result


def _eval_sort_key(document: dict) -> tuple[bool, str]:
    report = document.get("eval_report")
    if not isinstance(report, dict) or not report.get("finished_at"):
        return (False, "")  # nie evaluiert -> nach vorn
    return (True, str(report["finished_at"]))


def run_eval_batch(
    *,
    store: CandidateStore,
    limit: int,
    dry_run: bool,
    run_date: date,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
    feedback_loader: Callable[[str], list[dict]] = _default_feedback_loader,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    documents = store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)
    documents.sort(key=_eval_sort_key)
    if limit is not None:
        documents = documents[: max(limit, 0)]
    report: dict = {
        "worker": "eval_profiles",
        "run_date": run_date.isoformat(),
        "started_at": now.isoformat(),
        "dry_run": dry_run,
        "results": {},
        "regressions": [],
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            qid, result = eval_one(
                document,
                store=store,
                dry_run=dry_run,
                now=now,
                chat_fn_factory=chat_fn_factory,
                feedback_loader=feedback_loader,
            )
            report["results"][qid] = result
            if "Regression" in result:
                report["regressions"].append(qid)
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-evals")
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Eval-Worker (published-Profile)")
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
    report = run_eval_batch(
        store=store, limit=args.limit, dry_run=args.dry_run, run_date=date.today()
    )
    print(
        json.dumps(
            {
                "results": len(report["results"]),
                "regressions": len(report["regressions"]),
                "errors": len(report["errors"]),
            }
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
