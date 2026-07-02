"""smyst.com Worker 3: Risiko-Check fuer Kandidaten mit Status 'researched'.

Stateless (Salad-Cronjob): laedt researched-Kandidaten und deren
ResearchDocument aus IDrivee2.com, holt Commons-Lizenzmetadaten (falls Bild
vorhanden), fuehrt assess_risk aus und schaltet per State Machine:
researched -> verified (mit risk_score/risk_flags/image_status) oder
researched -> rejected (publicity/ethics = block), immer mit AuditEvent.

Start:
    python -m app.workers.assess_risk --limit 10 --dry-run
    python -m app.workers.assess_risk --enabled --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from dataclasses import replace
from datetime import date, datetime, timezone

from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    PipelineConfig,
    PipelineStatus,
    transition,
)
from app.ai.risk_checks import assess_risk
from app.integrations.candidate_store import RESEARCH_PREFIX, CandidateStore, build_s3_client
from app.workers.research_candidates import _candidate_from_document

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "smyst.com-risk/1.0 (https://smyst.com; pipeline)"


def fetch_commons_license(image_file: str, *, timeout_seconds: float = 30.0) -> str | None:
    """LicenseShortName eines Commons-Bildes (None, wenn nicht ermittelbar)."""
    import httpx  # lazy: Domain-Tests brauchen keinen HTTP-Client

    params = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": f"File:{image_file}",
            "prop": "imageinfo",
            "iiprop": "extmetadata",
            "format": "json",
        }
    )
    response = httpx.get(
        f"{COMMONS_API}?{params}", headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds
    )
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    for page in pages.values():
        for info in page.get("imageinfo", []):
            value = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value")
            if value:
                return str(value)
    return None


def load_research_document(store: CandidateStore, qid: str) -> dict:
    response = store._client.get_object(  # noqa: SLF001 - bewusster interner Zugriff
        Bucket=store._bucket, Key=f"{RESEARCH_PREFIX}{qid}.json"
    )
    return json.loads(response["Body"].read().decode("utf-8"))


def assess_one(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    license_fetcher=fetch_commons_license,
) -> tuple[str, str]:
    candidate = _candidate_from_document(document)
    qid = candidate.wikidata_qid

    try:
        research = load_research_document(store, qid)
    except Exception:
        research = {}
    image_file = research.get("image_commons_file")
    license_name = None
    if image_file:
        try:
            license_name = license_fetcher(image_file)
        except Exception:
            license_name = None  # Metadaten nicht erreichbar -> manual_review via Bewertung

    assessment = assess_risk(
        candidate,
        config=config,
        image_commons_file=image_file,
        image_license_short_name=license_name,
    )

    enriched = replace(
        candidate,
        risk_score=assessment.score,
        risk_flags=assessment.flags,
        image_status=assessment.image_status,
    )
    if assessment.reject:
        updated, event = transition(
            enriched, PipelineStatus.REJECTED, reason=assessment.reject_reason, config=config
        )
        result = f"rejected: {assessment.reject_reason}"
    else:
        updated, event = transition(enriched, PipelineStatus.VERIFIED, config=config)
        result = f"verified (score {assessment.score}, image {assessment.image_status})"

    if not dry_run:
        new_document = {
            **document,
            "status": updated.status.value,
            "status_reason": updated.status_reason,
            "risk_score": assessment.score,
            "risk_flags": assessment.flags,
            "image_status": assessment.image_status,
            "risk_notes": list(assessment.notes),
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
    return qid, result


def run_assessment(
    *, store: CandidateStore, config: PipelineConfig, limit: int, dry_run: bool, run_date: date
) -> dict:
    documents = store.candidate_documents_by_status(PipelineStatus.RESEARCHED.value, limit=limit)
    report: dict = {
        "worker": "assess_risk",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "results": {},
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            qid, result = assess_one(document, store=store, config=config, dry_run=dry_run)
            report["results"][qid] = result
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report)
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com risk-Worker")
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
    report = run_assessment(
        store=store, config=config, limit=args.limit, dry_run=args.dry_run, run_date=date.today()
    )
    print(json.dumps({"results": len(report["results"]), "errors": len(report["errors"])}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
