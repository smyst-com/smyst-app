"""smyst.com Worker: Orts-Backfill fuer bereits publizierte Pipeline-Profile.

Seed-ingestierte Profile (179er- und 500er-Liste) wurden ohne Geburts-/
Sterbeort publiziert: der Seed-Resolver loeste nur QID und Lebensdaten auf,
waehrend der SPARQL-Ingest die Orte (P19/P20) direkt mitliefert. Dieser
Worker ergaenzt birth_place/death_place nachtraeglich — nach demselben Muster
wie backfill_gender:

1. Publish-Index laden (pipeline/published/index.json auf IDrivee2.com).
2. Fuer jeden Eintrag ohne vollstaendigen birth_place/death_place: Snapshot
   pipeline/sources/{qid}/wikidata-entitydata.json lesen (fehlt er, wird er
   einmalig von Wikidata geladen und gesichert) und P19/P20 extrahieren.
3. Orts-QIDs zu "Stadt, Land" aufloesen (Labels + P17 des Ortes; Orts-
   Entities werden ebenfalls als Snapshots gesichert und wiederverwendet).
4. pipeline/published/{qid}/profile.json und den Index aktualisieren.
5. Changelog-Bericht nach IDrivee2.com schreiben (Audit-Trail).

Zwei Faelle werden behandelt:
  fehlt   — das Feld ist leer und wird gesetzt.
  ohne Land — das Feld enthaelt nur die Stadt ("Stockholm"). Solche Werte sind
            durch die alte Ein-Land-Regel entstanden, die bei jeder Stadt mit
            gepflegtem Gebietsverlauf das Land weggelassen hat (Livebefund
            03.08.2026: 522 Geburts- und 629 Sterbeorte). Sie werden neu
            aufgeloest und NUR dann ersetzt, wenn die neue Fassung mit exakt
            demselben Stadtnamen beginnt und lediglich ", Land" anhaengt.
            Weicht der Stadtname ab, bleibt der bestehende Wert stehen und der
            Fall wird als mismatch berichtet.

Der Worker ist idempotent. Vollstaendige Werte ("Stadt, Land") und kuratierte
Eintraege mit Komma werden nie angefasst, sichtbare Profile bleiben sichtbar.

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


PLACE_FIELDS = (("birth_place", P_BIRTH_PLACE), ("death_place", P_DEATH_PLACE))


def _needs_country(value) -> bool:
    """True, wenn nur die Stadt drinsteht ("Stockholm") und das Land fehlt."""
    return isinstance(value, str) and bool(value.strip()) and "," not in value


def _upgraded(current: str, resolved: str) -> str | None:
    """Neue Fassung, wenn sie den Stadtnamen unveraendert laesst — sonst None.

    Bewusst eng: akzeptiert wird ausschliesslich "<current>, <Land>". Damit
    kann der Backfill ein Land anhaengen, aber niemals einen Ort umschreiben.
    """
    prefix = f"{current.strip()}, "
    return resolved if resolved.startswith(prefix) and len(resolved) > len(prefix) else None


def _covers(container: str, place: str) -> bool:
    """True, wenn container denselben Ort meint wie place (ggf. mit Zusatz).

    Wikidata benennt Verwaltungseinheiten oft mit Zusatzwort ("Gemeinde
    Stockholm" fuer Stockholm). Verglichen wird deshalb auf Wortgrenzen, nicht
    auf Teilzeichenketten — "Halle" trifft damit nicht auf "Halland" zu.
    """
    a = container.casefold().split()
    b = place.casefold().split()
    if not b or len(b) > len(a):
        return False
    return any(a[i:i + len(b)] == b for i in range(len(a) - len(b) + 1))


def _country_for_known_place(
    resolver: PlaceResolver, place_qids: tuple[str, ...], current: str
) -> str | None:
    """Land fuer einen Bestandsort, ohne den Ortsnamen anzutasten.

    Personen tragen oft mehrere Ortsangaben. Alfred Nobel hat "Stockholm"
    (normal) und die Jakobs- und Johannesgemeinde (bevorzugt); der
    veroeffentlichte Wert ist Stockholm. Darum zuerst genau das Statement
    suchen, das denselben Ort nennt — dann wird nur dessen Land angehaengt.

    Findet sich keins, greift die Verwaltungskette (P131): liegt der
    Bestandsort in der Kette des Wikidata-Ortes, gilt dessen Land auch fuer
    ihn (Windlesham Manor liegt in Crowborough). Trifft beides nicht zu
    — Snamensk vs. Kaliningrad —, bleibt der Wert unveraendert.
    """
    for qid in place_qids:
        resolved = resolver.resolve(qid)
        if resolved and _upgraded(current, resolved):
            return resolved
    for qid in place_qids:
        country = resolver.country_of(qid)
        if country and any(_covers(c, current) for c in resolver.containing_labels(qid)):
            return f"{current}, {country}"
    return None


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
        "filled": 0,
        "upgraded": 0,
        "mismatch": {},
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
        if not any(
            not record.get(field) or _needs_country(record.get(field))
            for field, _ in PLACE_FIELDS
        ):
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
        for field, prop in PLACE_FIELDS:
            current = record.get(field)
            if current and not _needs_country(current):
                continue  # vollstaendige Werte nie anfassen
            place_qids = claim_item_ids(entity, prop)
            resolved = resolver.resolve(place_qids[0]) if place_qids else None
            if not resolved:
                continue
            if not current:
                updates[field] = resolved
                report["filled"] += 1
                continue
            upgrade = _upgraded(current, resolved) or _country_for_known_place(
                resolver, place_qids, current
            )
            if upgrade:
                updates[field] = upgrade
                report["upgraded"] += 1
            else:
                # Stadtname weicht ab: bestehender Wert bleibt, Fall wird
                # dokumentiert statt stillschweigend ueberschrieben.
                report["mismatch"].setdefault(qid, {})[field] = [current, resolved]
        if not updates:
            # Wikidata kennt fuer dieses Profil keinen (aufloesbaren) Ort;
            # abweichende Stadtnamen stehen bereits unter mismatch.
            if qid not in report["mismatch"]:
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
