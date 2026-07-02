"""smyst.com Worker 4: Twin-Capsule-Bau fuer Kandidaten mit Status 'verified'.

Stateless (Salad-Cronjob): laedt verified-Kandidaten + ResearchDocument aus
IDrivee2.com, baut die Twin Capsule (Persona-Prompt, RAG, SEO, Bild-Anweisung)
und schaltet verified -> generated (twin_id gesetzt) via State Machine mit
AuditEvent. Artefakte nach IDrivee2.com:

  pipeline/capsules/{qid}/capsule.json   vollstaendige Capsule (versioniert)
  pipeline/capsules/{qid}/prompt.json    Persona-Prompt
  pipeline/capsules/{qid}/seo.json       SEO/AEO-Paket

Start:
    python -m app.workers.build_capsules --limit 10 --dry-run
    python -m app.workers.build_capsules --enabled --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from datetime import date, datetime, timezone

from app.ai.capsule_builder import build_capsule
from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    PipelineConfig,
    PipelineStatus,
    transition,
)
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.assess_risk import load_research_document
from app.workers.research_candidates import _candidate_from_document

CAPSULE_PREFIX = "pipeline/capsules/"


def _put_json(store: CandidateStore, key: str, payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    store._client.put_object(  # noqa: SLF001 - bewusster interner Zugriff
        Bucket=store._bucket, Key=key, Body=body, ContentType="application/json"
    )
    return key


def build_one(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
) -> tuple[str, str]:
    candidate = _candidate_from_document(document)
    candidate = replace(
        candidate,
        risk_score=document.get("risk_score"),
        risk_flags=document.get("risk_flags") or {},
        image_status=document.get("image_status"),
    )
    qid = candidate.wikidata_qid
    research = load_research_document(store, qid)

    capsule = build_capsule(candidate, research, config=config)
    enriched = replace(candidate, twin_id=capsule.twin_id)
    updated, event = transition(enriched, PipelineStatus.GENERATED, config=config)

    if not dry_run:
        capsule_doc = capsule.as_document()
        _put_json(store, f"{CAPSULE_PREFIX}{qid}/capsule.json", capsule_doc)
        prompt_key = _put_json(
            store, f"{CAPSULE_PREFIX}{qid}/prompt.json",
            {"wikidata_qid": qid, "persona_prompt": capsule.persona_prompt, "version": capsule.version},
        )
        seo_key = _put_json(store, f"{CAPSULE_PREFIX}{qid}/seo.json", capsule.seo)
        new_document = {
            **document,
            "status": updated.status.value,
            "twin_id": str(capsule.twin_id),
            "prompt_key": prompt_key,
            "seo_key": seo_key,
            "audit_trail": document.get("audit_trail", [])
            + [
                {
                    "candidate_id": str(event.candidate_id),
                    "wikidata_qid": event.wikidata_qid,
                    "from_status": event.from_status.value,
                    "to_status": event.to_status.value,
                    "reason": event.reason,
                    "actor": None,
                    "occurred_at": event.occurred_at.isoformat(),
                }
            ],
        }
        store.save_candidate_document(qid, new_document)
    return qid, f"generated (slug {capsule.slug}, twin {capsule.twin_id})"


def run_build(
    *, store: CandidateStore, config: PipelineConfig, limit: int, dry_run: bool, run_date: date
) -> dict:
    documents = store.candidate_documents_by_status(PipelineStatus.VERIFIED.value, limit=limit)
    report: dict = {
        "worker": "build_capsules",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "results": {},
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            qid, result = build_one(document, store=store, config=config, dry_run=dry_run)
            report["results"][qid] = result
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com build-Worker")
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
    report = run_build(
        store=store, config=config, limit=args.limit, dry_run=args.dry_run, run_date=date.today()
    )
    print(json.dumps({"results": len(report["results"]), "errors": len(report["errors"])}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
