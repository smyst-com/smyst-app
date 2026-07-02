"""smyst.com Worker 5: automatische QA fuer Kandidaten mit Status 'generated'.

Stateless (Salad-Cronjob): laedt generated-Kandidaten + Capsule aus
IDrivee2.com, fuehrt run_qa aus (Vollstaendigkeit, Konsistenz, Duplikate,
Chat-Smoke-Test) und schaltet per State Machine:
- QA bestanden:  generated -> reviewed (qa_passed=true, Report gespeichert)
- Duplikat:      generated -> rejected (mit Grund)
- sonst:         Status bleibt 'generated'; Report + Issues werden gespeichert,
                 damit build/research nachbessern koennen (kein stilles Verwerfen).

Chat-Provider: wird ueber generate_twin_answer (app/ai/llm_router) angebunden,
sofern Provider-Keys konfiguriert sind; sonst wird der Chat-Test als 'skipped'
markiert und QA besteht NICHT (keine Freigabe ohne Chat-Pruefung).

Start:
    python -m app.workers.qa_candidates --limit 10 --dry-run
    python -m app.workers.qa_candidates --enabled --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from datetime import date, datetime, timezone
from typing import Callable

from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    PipelineConfig,
    PipelineStatus,
    transition,
)
from app.ai.qa_checks import run_qa
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.build_capsules import CAPSULE_PREFIX
from app.workers.research_candidates import _candidate_from_document


def load_capsule_document(store: CandidateStore, qid: str) -> dict:
    response = store._client.get_object(  # noqa: SLF001 - bewusster interner Zugriff
        Bucket=store._bucket, Key=f"{CAPSULE_PREFIX}{qid}/capsule.json"
    )
    return json.loads(response["Body"].read().decode("utf-8"))


def build_chat_fn(capsule_doc: dict) -> Callable[[str], str] | None:
    """Bindet den Chat-Smoke-Test an den konfigurierten LLM-Router an.

    Nutzt build_default_router (Provider-Kette aus Settings; enthaelt am Ende
    einen deterministischen Fallback). Sind KEINE externen Provider-Keys
    gesetzt, liefern wir None zurueck — der Fallback wuerde die QA-Regeln
    ohnehin nicht bestehen, und 'skipped' ist ehrlicher als 'fail'.
    """
    try:  # pragma: no cover - reine Verdrahtung, im Test injiziert
        import asyncio

        from app.ai.llm_router import LocalDeterministicProvider, build_default_router
        from app.ai.models import LLMRequest

        router = build_default_router()
        external = [
            provider for provider in router.providers
            if not isinstance(provider, LocalDeterministicProvider)
        ]
        if not external:
            return None

        def chat(question: str) -> str:
            response = asyncio.run(
                router.complete(
                    LLMRequest(
                        prompt=question,
                        system_prompt=capsule_doc.get("persona_prompt", ""),
                        max_tokens=400,
                    )
                )
            )
            return response.text

        return chat
    except Exception:
        return None


def qa_one(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
) -> tuple[str, str]:
    candidate = _candidate_from_document(document)
    candidate = replace(
        candidate,
        risk_score=document.get("risk_score"),
        risk_flags=document.get("risk_flags") or {},
        image_status=document.get("image_status"),
        qa_passed=False,
    )
    qid = candidate.wikidata_qid
    capsule_doc = load_capsule_document(store, qid)
    published = store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)

    report = run_qa(
        document,
        capsule_doc,
        published,
        chat_fn=chat_fn_factory(capsule_doc),
    )

    audit_entry = None
    if report.duplicate:
        rejected, event = transition(
            candidate, PipelineStatus.REJECTED,
            reason="; ".join(i for i in report.issues if "Duplikat" in i) or "Duplikat",
            config=config,
        )
        new_status, result = rejected.status, "rejected: Duplikat"
        status_reason = rejected.status_reason
        audit_entry = event
        qa_passed = False
    elif report.passed:
        passed_candidate = replace(candidate, qa_passed=True)
        reviewed, event = transition(passed_candidate, PipelineStatus.REVIEWED, config=config)
        new_status, result = reviewed.status, "reviewed (QA bestanden, wartet auf menschliche Freigabe)"
        status_reason = reviewed.status_reason
        audit_entry = event
        qa_passed = True
    else:
        new_status, result = candidate.status, f"generated (QA nicht bestanden: {len(report.issues)} Issues)"
        status_reason = document.get("status_reason")
        qa_passed = False

    if not dry_run:
        new_document = {
            **document,
            "status": new_status.value,
            "status_reason": status_reason,
            "qa_passed": qa_passed,
            "qa_report": report.as_document(),
        }
        if audit_entry is not None:
            new_document["audit_trail"] = document.get("audit_trail", []) + [
                {
                    "candidate_id": str(audit_entry.candidate_id),
                    "wikidata_qid": audit_entry.wikidata_qid,
                    "from_status": audit_entry.from_status.value,
                    "to_status": audit_entry.to_status.value,
                    "reason": audit_entry.reason,
                    "actor": None,
                    "occurred_at": audit_entry.occurred_at.isoformat(),
                }
            ]
        store.save_candidate_document(qid, new_document)
    return qid, result


def run_qa_batch(
    *, store: CandidateStore, config: PipelineConfig, limit: int, dry_run: bool, run_date: date,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
) -> dict:
    documents = store.candidate_documents_by_status(PipelineStatus.GENERATED.value, limit=limit)
    report: dict = {
        "worker": "qa_candidates",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "results": {},
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            qid, result = qa_one(
                document, store=store, config=config, dry_run=dry_run,
                chat_fn_factory=chat_fn_factory,
            )
            report["results"][qid] = result
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com qa-Worker")
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
    report = run_qa_batch(
        store=store, config=config, limit=args.limit, dry_run=args.dry_run, run_date=date.today()
    )
    print(json.dumps({"results": len(report["results"]), "errors": len(report["errors"])}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
