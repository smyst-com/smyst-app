"""smyst.com Worker: Orts-Backfill fuer bereits publizierte Pipeline-Profile.

Seed-ingestierte Profile (179er- und 500er-Liste) wurden ohne Geburts-/
Sterbeort publiziert: der Seed-Resolver loeste nur QID und Lebensdaten auf,
waehrend der SPARQL-Ingest die Orte (P19/P20) direkt mitliefert. Dieser
Worker ergaenzt birth_place/death_place nachtraeglich — nach demselben Muster
wie backfill_gender:

1. Publish-Index laden (pipeline/published/index.json auf IDrivee2.com).
2. Fuer jeden Eintrag ohne birth_place/death_place: Snapshot
   pipeline/sources/{qid}/wikidata-entitydata.json lesen (fehlt er, wird er
   einmalig von Wikidata geladen und gesichert) und P19/P20 extrahieren.
3. Orts-QIDs zu "Stadt, Land" aufloesen (Labels + P17 des Ortes; Orts-
   Entities werden ebenfalls als Snapshots gesichert und wiederverwendet).
4. pipeline/published/{qid}/profile.json und den Index aktualisieren.
5. Changelog-Bericht nach IDrivee2.com schreiben (Audit-Trail).

Der Worker ist idempotent und ergaenzt nur fehlende Ortsfelder; vorhandene
Werte werden nie ueberschrieben, sichtbare Profile bleiben sichtbar.

Start:
    python -m app.workers.backfill_places --dry-run
    python -m app.workers.backfill_places
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone

from app.ai.publisher import PUBLISH_INDEX_KEY
from app.ai.wikidata_places import P_BIRTH_PLACE, P_DEATH_PLACE, PlaceResolver, claim_item_ids
from app.integrations.candidate_store import SOURCE_PREFIX, CandidateStore, build_s3_client

ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
USER_AGENT = "smyst.com-backfill-places/1.0 (https://smyst.com; pipeline)"
SNAPSHOT_FILENAME = "wikidata-entitydata.json"


def _get_json_object(store: CandidateStore, key: str) -> dict | list | None:
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


def _load_entity(store: CandidateStore, qid: str, *, dry_run: bool) -> dict | None:
    """Entity-Dict aus Snapshot, sonst live von Wikidata (Snapshot wird gesichert)."""
    snapshot_key = f"{SOURCE_PREFIX}{qid}/{SNAPSHOT_FILENAME}"
    payload = _get_json_object(store, snapshot_key)
    if payload is None:
        payload = _fetch_entity_payload(qid)
        if not dry_run:
            store.save_source_snapshot(qid, SNAPSHOT_FILENAME, json.dumps(payload).encode("utf-8"))
    if not isinstance(payload, dict):
        return None
    return payload.get("entities", {}).get(qid)


def run_backfill(*, store: CandidateStore, dry_run: bool, run_date: date) -> dict:
    index = _get_json_object(store, PUBLISH_INDEX_KEY)
    report: dict = {
        "worker": "backfill_places",
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

    resolver = PlaceResolver(lambda qid: _load_entity(store, qid, dry_run=dry_run))
    report["total"] = len(index)
    changed = False
    for record in index:
        qid = record.get("wikidata_qid")
        if not qid:
            continue
        if record.get("birth_place") and record.get("death_place"):
            report["already_set"] += 1
            continue
        try:
            entity = _load_entity(store, qid, dry_run=dry_run)
        except Exception as error:  # noqa: BLE001 - einzelne QIDs brechen den Lauf nicht ab
            report["errors"][qid] = f"{type(error).__name__}: {error}"
            continue
        if entity is None:
            report["errors"][qid] = "EntityData ohne Entity-Eintrag"
            continue

        updates: dict[str, str] = {}
        for field, prop in (("birth_place", P_BIRTH_PLACE), ("death_place", P_DEATH_PLACE)):
            if record.get(field):
                continue  # vorhandene Werte nie ueberschreiben
            place_qids = claim_item_ids(entity, prop)
            resolved = resolver.resolve(place_qids[0]) if place_qids else None
            if resolved:
                updates[field] = resolved
        if not updates:
            # Wikidata kennt fuer dieses Profil keinen (aufloesbaren) Ort.
            report["unresolved"].append(qid)
            continue

        record.update(updates)
        report["updated"][qid] = updates
        changed = True
        if not dry_run:
            profile_key = f"pipeline/published/{qid}/profile.json"
            profile = _get_json_object(store, profile_key)
            if isinstance(profile, dict):
                profile.update(updates)
                _put_json_object(store, profile_key, profile)

    if changed and not dry_run:
        _put_json_object(store, PUBLISH_INDEX_KEY, index)
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-backfill-places")
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
