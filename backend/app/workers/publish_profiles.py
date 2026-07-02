"""smyst.com Schritt 7: Publish/Unpublish mit menschlicher Freigabe.

KEIN Cronjob — dieser Befehl wird bewusst von einem Menschen ausgefuehrt,
nachdem er die reviewed-Kandidaten (QA-Report!) geprueft hat. Die Freigabe
wird als actor im Audit-Trail dokumentiert (uuid5 aus der E-Mail).

    python -m app.workers.publish_profiles publish --qid Q1035 \
        --approved-by adam@smyst.com --enabled
    python -m app.workers.publish_profiles unpublish --qid Q1035 \
        --reason "Meldung eingegangen" --approved-by adam@smyst.com --enabled

Sicherungen:
- publish nur fuer Status 'reviewed' mit qa_passed=true (State Machine erzwingt Rest).
- Tageslimit daily_publish_limit + Feature-Flag pipeline.enabled.
- Index-Konflikte (Slug/Name) brechen ab, bevor irgendetwas geschrieben wird.
- Unpublish entzieht Sichtbarkeit; Daten bleiben erhalten (kein Loeschen).
Artefakte: pipeline/published/{qid}/profile.json, index.json, sitemap-fragment.json.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from dataclasses import replace
from datetime import date, datetime, timezone

from app.ai.historical_pipeline import (
    DEFAULT_CONFIG,
    PipelineConfig,
    PipelineStatus,
    is_publish_allowed_today,
    transition,
)
from app.ai.publisher import (
    PUBLISH_INDEX_KEY,
    SITEMAP_FRAGMENT_KEY,
    build_publish_record,
    build_sitemap_fragment,
    mark_unpublished,
    upsert_index,
    visible_count_today,
)
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.qa_candidates import load_capsule_document
from app.workers.research_candidates import _candidate_from_document

ACTOR_NAMESPACE = uuid.UUID("8b1c9a52-0000-4000-8000-736d79737400")  # smyst.com actors


def actor_uuid(email: str) -> uuid.UUID:
    return uuid.uuid5(ACTOR_NAMESPACE, email.strip().casefold())


def _load_index(store: CandidateStore) -> list[dict]:
    try:
        response = store._client.get_object(Bucket=store._bucket, Key=PUBLISH_INDEX_KEY)  # noqa: SLF001
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception:
        return []


def _put_json(store: CandidateStore, key: str, payload) -> str:
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    store._client.put_object(  # noqa: SLF001
        Bucket=store._bucket, Key=key, Body=body, ContentType="application/json"
    )
    return key


def _append_audit(document: dict, event) -> list[dict]:
    return document.get("audit_trail", []) + [
        {
            "candidate_id": str(event.candidate_id),
            "wikidata_qid": event.wikidata_qid,
            "from_status": event.from_status.value,
            "to_status": event.to_status.value,
            "reason": event.reason,
            "actor": str(event.actor) if event.actor else None,
            "occurred_at": event.occurred_at.isoformat(),
        }
    ]


def publish_one(
    qid: str, *, store: CandidateStore, config: PipelineConfig, approved_by: str, dry_run: bool
) -> str:
    document = store.load_candidate_document(qid)
    if document.get("status") != PipelineStatus.REVIEWED.value:
        return f"abgelehnt: Status ist '{document.get('status')}', nicht 'reviewed'"
    if not document.get("qa_passed"):
        return "abgelehnt: qa_passed ist nicht gesetzt"

    index = _load_index(store)
    today = datetime.now(timezone.utc).date().isoformat()
    if not is_publish_allowed_today(visible_count_today(index, today_iso=today), config):
        return "abgelehnt: Tageslimit erreicht oder pipeline.enabled=false"

    capsule_doc = load_capsule_document(store, qid)
    record = build_publish_record(document, capsule_doc, approved_by=approved_by)
    new_index = upsert_index(index, record)  # wirft bei Slug-/Namenskonflikt

    candidate = replace(
        _candidate_from_document(document),
        risk_score=document.get("risk_score"),
        risk_flags=document.get("risk_flags") or {},
        image_status=document.get("image_status"),
        qa_passed=True,
    )
    published, event = transition(
        candidate, PipelineStatus.PUBLISHED, actor=actor_uuid(approved_by), config=config
    )

    if not dry_run:
        _put_json(store, f"pipeline/published/{qid}/profile.json", record)
        _put_json(store, PUBLISH_INDEX_KEY, new_index)
        _put_json(store, SITEMAP_FRAGMENT_KEY, build_sitemap_fragment(new_index))
        store.save_candidate_document(
            qid,
            {
                **document,
                "status": published.status.value,
                "published_at": published.published_at.isoformat() if published.published_at else None,
                "reviewed_by": str(published.reviewed_by) if published.reviewed_by else None,
                "audit_trail": _append_audit(document, event),
            },
        )
    return f"published (slug {record['slug']}, freigegeben von {approved_by})"


def unpublish_one(
    qid: str, *, store: CandidateStore, config: PipelineConfig, approved_by: str,
    reason: str, dry_run: bool
) -> str:
    document = store.load_candidate_document(qid)
    candidate = replace(
        _candidate_from_document(document),
        qa_passed=bool(document.get("qa_passed")),
    )
    unpublished, event = transition(
        candidate, PipelineStatus.UNPUBLISHED, reason=reason,
        actor=actor_uuid(approved_by), config=config,
    )
    new_index = mark_unpublished(_load_index(store), qid, reason=reason)

    if not dry_run:
        _put_json(store, PUBLISH_INDEX_KEY, new_index)
        _put_json(store, SITEMAP_FRAGMENT_KEY, build_sitemap_fragment(new_index))
        store.save_candidate_document(
            qid,
            {
                **document,
                "status": unpublished.status.value,
                "status_reason": reason,
                "audit_trail": _append_audit(document, event),
            },
        )
    return f"unpublished ({reason})"


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com publish-Schritt (menschliche Freigabe)")
    parser.add_argument("command", choices=["publish", "unpublish"])
    parser.add_argument("--qid", action="append", required=True)
    parser.add_argument("--approved-by", required=True, help="E-Mail der freigebenden Person")
    parser.add_argument("--reason", default="", help="Pflicht bei unpublish")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if args.command == "unpublish" and not args.reason.strip():
        print("unpublish erfordert --reason.", file=sys.stderr)
        return 2

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    results = {}
    for qid in args.qid:
        try:
            if args.command == "publish":
                results[qid] = publish_one(
                    qid, store=store, config=config, approved_by=args.approved_by,
                    dry_run=args.dry_run,
                )
            else:
                results[qid] = unpublish_one(
                    qid, store=store, config=config, approved_by=args.approved_by,
                    reason=args.reason, dry_run=args.dry_run,
                )
        except Exception as error:
            results[qid] = f"FEHLER {type(error).__name__}: {error}"
    if not args.dry_run:
        store.save_changelog(date.today(), {"worker": "publish_profiles", "results": results})
    print(json.dumps(results, ensure_ascii=False))
    return 0


def _pipeline_bucket() -> str:  # pragma: no cover
    from app.core.config import settings

    return settings.idrive_e2_bucket


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
