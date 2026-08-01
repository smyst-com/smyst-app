"""Tests fuer den Orts-Backfill (app.workers.backfill_places)."""

from __future__ import annotations

import io
import json
from datetime import date

from app.ai.wikidata_places import PlaceResolver, format_place
from app.integrations.candidate_store import CandidateStore
from app.workers.backfill_places import run_backfill

PUBLISH_INDEX_KEY = "pipeline/published/index.json"


class FakePaginator:
    def __init__(self, keys):
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in self._keys if k.startswith(prefix)]}


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def item_claim(prop: str, *qids: str) -> dict:
    return {prop: [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": q}}}}
        for q in qids
    ]}


def entity_payload(qid: str, *, label: str = "", claims: dict | None = None) -> bytes:
    payload = {"entities": {qid: {
        "labels": {"de": {"value": label}} if label else {},
        "claims": claims or {},
        "sitelinks": {},
    }}}
    return json.dumps(payload).encode("utf-8")


def snapshot_key(qid: str) -> str:
    return f"pipeline/sources/{qid}/wikidata-entitydata.json"


def prepared_store() -> tuple[CandidateStore, FakeS3]:
    s3 = FakeS3()
    store = CandidateStore(s3, "smyst-memories")
    index = [
        # Ohne Orte -> soll befuellt werden.
        {"wikidata_qid": "Q9312", "slug": "lew-tolstoi", "name": "Lew Tolstoi"},
        # Bereits vollstaendig -> bleibt unberuehrt.
        {"wikidata_qid": "Q1035", "slug": "charles-darwin", "name": "Charles Darwin",
         "birth_place": "Shrewsbury, Vereinigtes Königreich",
         "death_place": "Down House, Vereinigtes Königreich"},
    ]
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects["pipeline/published/Q9312/profile.json"] = json.dumps(
        {"wikidata_qid": "Q9312", "slug": "lew-tolstoi"}
    ).encode("utf-8")
    # Personen-Snapshot: P19 Jasnaja Poljana, P20 Astapowo.
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi",
        claims={**item_claim("P19", "Q4515044"), **item_claim("P20", "Q2857656")},
    )
    # Orts-Snapshots samt Land (P17 Russland) und Land-Snapshot.
    s3.objects[snapshot_key("Q4515044")] = entity_payload(
        "Q4515044", label="Jasnaja Poljana", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q2857656")] = entity_payload(
        "Q2857656", label="Astapowo", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q159")] = entity_payload("Q159", label="Russland")
    return store, s3


def test_backfill_sets_places_from_snapshots_and_updates_index_and_profile() -> None:
    store, s3 = prepared_store()
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {"Q9312": {
        "birth_place": "Jasnaja Poljana, Russland",
        "death_place": "Astapowo, Russland",
    }}
    assert report["already_set"] == 1
    assert report["errors"] == {}
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert index[0]["birth_place"] == "Jasnaja Poljana, Russland"
    assert index[1]["birth_place"] == "Shrewsbury, Vereinigtes Königreich"
    profile = json.loads(s3.objects["pipeline/published/Q9312/profile.json"])
    assert profile["death_place"] == "Astapowo, Russland"
    # Changelog-Bericht wurde als Audit-Trail geschrieben.
    assert any("backfill-places" in key for key in s3.objects)


def test_backfill_dry_run_changes_nothing() -> None:
    store, s3 = prepared_store()
    before = dict(s3.objects)
    report = run_backfill(store=store, dry_run=True, run_date=date(2026, 7, 31))

    assert "Q9312" in report["updated"]
    assert s3.objects == before


def test_backfill_without_place_claims_stays_unresolved_without_write() -> None:
    store, s3 = prepared_store()
    s3.objects[snapshot_key("Q9312")] = entity_payload("Q9312", label="Lew Tolstoi")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {}
    assert report["unresolved"] == ["Q9312"]
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert "birth_place" not in index[0]


def test_backfill_fills_only_missing_field() -> None:
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Kuratierter Ort"  # vorhandene Werte nie ueberschreiben
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {"Q9312": {"death_place": "Astapowo, Russland"}}
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert index[0]["birth_place"] == "Kuratierter Ort"


# --- Ein-Land-Regel (identisch zu wikidata_candidates._place) ---

def test_format_place_appends_country_only_when_unambiguous() -> None:
    assert format_place("Ulm", {"Deutschland"}) == "Ulm, Deutschland"
    assert format_place("Thagaste", {"Numidien", "Algerien", "Frankreich"}) == "Thagaste"
    assert format_place("Monaco", {"Monaco"}) == "Monaco"
    assert format_place(None, {"Deutschland"}) is None


def test_place_resolver_caches_and_swallows_fetch_errors() -> None:
    calls: list[str] = []

    def fetch(qid: str) -> dict | None:
        calls.append(qid)
        if qid == "Q404":
            raise RuntimeError("kaputt")
        return {"labels": {"de": {"value": "Ulm"}}, "claims": {}}

    resolver = PlaceResolver(fetch)
    assert resolver.resolve("Q3012") == "Ulm"
    assert resolver.resolve("Q3012") == "Ulm"
    assert resolver.resolve("Q404") is None
    assert calls == ["Q3012", "Q404"]
