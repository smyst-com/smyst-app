from __future__ import annotations

import io
import json
from datetime import date

from app.integrations.candidate_store import CandidateStore
from app.workers.backfill_gender import run_backfill

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


def entity_snapshot(gender_qid: str | None) -> bytes:
    claims = {}
    if gender_qid:
        claims["P21"] = [
            {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": gender_qid}}}}
        ]
    payload = {
        "entities": {
            "Q7259": {
                "labels": {"de": {"value": "Ada Lovelace"}},
                "descriptions": {"de": {"value": "britische Mathematikerin"}},
                "claims": claims,
                "sitelinks": {},
            }
        }
    }
    return json.dumps(payload).encode("utf-8")


def prepared_store(*, gender_qid: str | None = "Q6581072") -> tuple[CandidateStore, FakeS3]:
    s3 = FakeS3()
    store = CandidateStore(s3, "smyst-memories")
    index = [
        {"wikidata_qid": "Q7259", "slug": "ada-lovelace", "name": "Ada Lovelace"},
        {"wikidata_qid": "Q1035", "slug": "charles-darwin", "name": "Charles Darwin",
         "gender": "male"},
    ]
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects["pipeline/published/Q7259/profile.json"] = json.dumps(
        {"wikidata_qid": "Q7259", "slug": "ada-lovelace"}
    ).encode("utf-8")
    if gender_qid is not None:
        s3.objects["pipeline/sources/Q7259/wikidata-entitydata.json"] = entity_snapshot(gender_qid)
    return store, s3


def test_backfill_sets_gender_from_snapshot_and_updates_index_and_profile() -> None:
    store, s3 = prepared_store()
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 23))

    assert report["updated"] == {"Q7259": {"gender": "female", "source": "snapshot"}}
    assert report["already_set"] == 1
    assert report["errors"] == {}
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert index[0]["gender"] == "female"
    profile = json.loads(s3.objects["pipeline/published/Q7259/profile.json"])
    assert profile["gender"] == "female"
    # Changelog-Bericht wurde als Audit-Trail geschrieben.
    assert any("backfill-gender" in key for key in s3.objects)


def test_backfill_dry_run_changes_nothing() -> None:
    store, s3 = prepared_store()
    before = dict(s3.objects)
    report = run_backfill(store=store, dry_run=True, run_date=date(2026, 7, 23))

    assert report["updated"] == {"Q7259": {"gender": "female", "source": "snapshot"}}
    assert s3.objects == before


def test_backfill_nonbinary_stays_unresolved_without_write() -> None:
    store, s3 = prepared_store(gender_qid="Q48270")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 23))

    assert report["updated"] == {}
    assert report["unresolved"] == ["Q7259"]
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert "gender" not in index[0]
