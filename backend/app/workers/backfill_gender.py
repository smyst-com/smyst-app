"""smyst.com Worker: Gender-Backfill fuer bereits publizierte Pipeline-Profile.

Bestandsprofile wurden vor der Gender-Erweiterung publiziert und haben kein
Stimmen-Geschlecht. Dieser Worker ergaenzt es nachtraeglich aus den bereits
gespeicherten Wikidata-Quellen-Snapshots (reproduzierbar, keine neuen Quellen):

1. Publish-Index laden (pipeline/published/index.json auf IDrivee2.com).
2. Fuer jeden Eintrag ohne gender: Snapshot pipeline/sources/{qid}/
   wikidata-entitydata.json lesen und P21 via parse_entity extrahieren.
   Fehlt der Snapshot, wird EntityData einmalig von Wikidata geladen und
   als Snapshot gesichert (gleiche Quelle wie der Research-Worker).
3. pipeline/published/{qid}/profile.json und den Index aktualisieren.
4. Changelog-Bericht nach IDrivee2.com schreiben (Audit-Trail).

Der Worker ist idempotent und aendert nur das Feld gender; sichtbare
Profile bleiben sichtbar, nichts wird geloescht.

Start:
    python -m app.workers.backfill_gender --dry-run
    python -m app.workers.backfill_gender
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone

from app.ai.publisher import PUBLISH_INDEX_KEY
from app.ai.research_profiles import parse_entity
from app.integrations.candidate_store import SOURCE_PREFIX, CandidateStore, build_s3_client

ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
USER_AGENT = "smyst.com-backfill-gender/1.0 (https://smyst.com; pipeline)"
SNAPSHOT_FILENAME = "wikidata-entitydata.json"


def _get_json_object(store: CandidateStore, key: str) -> dict | None:
    try:
        response = store._client.get_object(Bucket=store._bucket, Key=key)  # noqa: SLF001
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception:  # noqa: BLE001 - fehlender Snapshot ist ein normaler Fall
        return None


def _put_json_object(store: CandidateStore, key: str, payload) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    store._client.put_object(  # noqa: SLF001
        Bucket=store._bucket, Key=key, Body=body, ContentType="application/json"
    )


def _fetch_entity_payload(qid: str) -> dict:
    import httpx  # lazy: Tests brauchen keinen HTTP-Client

    response = httpx.get(
        ENTITY_URL.format(qid=qid),
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.json()


def resolve_gender(store: CandidateStore, qid: str, *, dry_run: bool) -> tuple[str | None, str]:
    """Gender fuer eine QID bestimmen. Rueckgabe: (gender, quelle)."""
    snapshot_key = f"{SOURCE_PREFIX}{qid}/{SNAPSHOT_FILENAME}"
    payload = _get_json_object(store, snapshot_key)
    source = "snapshot"
    if payload is None:
        payload = _fetch_entity_payload(qid)
        source = "wikidata-live"
        if not dry_run:
            store.save_source_snapshot(qid, SNAPSHOT_FILENAME, json.dumps(payload).encode("utf-8"))
    return parse_entity(payload, qid).gender, source


def run_backfill(*, store: CandidateStore, dry_run: bool, run_date: date) -> dict:
    index = _get_json_object(store, PUBLISH_INDEX_KEY)
    report: dict = {
        "worker": "backfill_gender",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "total": 0,
        "already_set": 0,
        "updated": {},
        "unresolved": [],
        "errors": {},
    }
    if not isinstance(index, list) or not index:
        report["errors"]["index"] = "Publish-Index fehlt oder ist leer"
        return report

    report["total"] = len(index)
    changed = False
    for record in index:
        qid = record.get("wikidata_qid")
        if not qid:
            continue
        if record.get("gender") in ("female", "male"):
            report["already_set"] += 1
            continue
        try:
            gender, source = resolve_gender(store, qid, dry_run=dry_run)
        except Exception as error:  # noqa: BLE001 - einzelne QIDs brechen den Lauf nicht ab
            report["errors"][qid] = f"{type(error).__name__}: {error}"
            continue
        if gender is None:
            # Kein binaerer P21-Wert: bewusst None lassen (neutraler Fallback).
            report["unresolved"].append(qid)
            continue
        record["gender"] = gender
        report["updated"][qid] = {"gender": gender, "source": source}
        changed = True
        if not dry_run:
            profile_key = f"pipeline/published/{qid}/profile.json"
            profile = _get_json_object(store, profile_key)
            if isinstance(profile, dict):
                profile["gender"] = gender
                _put_json_object(store, profile_key, profile)

    if changed and not dry_run:
        _put_json_object(store, PUBLISH_INDEX_KEY, index)
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-backfill-gender")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_backfill(store=store, dry_run=args.dry_run, run_date=date.today())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    has_errors = bool(report["errors"])
    return 1 if has_errors else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
