"""Tests fuer Baustein 2: Freshness-Worker (periodische Re-Recherche)."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

from app.integrations.candidate_store import CANDIDATE_PREFIX, CandidateStore
from app.workers.refresh_profiles import run_refresh_batch

NOW = datetime(2026, 8, 1, 6, 0, tzinfo=timezone.utc)
RUN_DATE = date(2026, 8, 1)


class FakePaginator:
    def __init__(self, keys):
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in sorted(self._keys) if k.startswith(prefix)]}


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


def entity_payload(qid: str, lastrevid: int) -> dict:
    return {
        "entities": {
            qid: {
                "lastrevid": lastrevid,
                "labels": {"de": {"value": "Charles Darwin"}},
                "descriptions": {"de": {"value": "britischer Naturforscher"}},
                "claims": {},
                "sitelinks": {"dewiki": {"title": "Charles Darwin"}},
            }
        }
    }


def fetcher(lastrevid: int, extract: str = "Naturforscher."):
    def fetch_json(url: str) -> dict:
        if "EntityData" in url:
            return entity_payload("Q1035", lastrevid)
        return {"extract": extract}

    return fetch_json


def _store_with_published(docs: list[dict]) -> tuple[CandidateStore, FakeS3]:
    client = FakeS3()
    store = CandidateStore(client, "test-bucket")
    for doc in docs:
        client.objects[f"{CANDIDATE_PREFIX}{doc['wikidata_qid']}.json"] = json.dumps(doc).encode(
            "utf-8"
        )
    return store, client


def test_first_run_creates_baseline_without_review_flag() -> None:
    store, client = _store_with_published(
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin", "status": "published"}]
    )
    report = run_refresh_batch(
        store=store, limit=10, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetcher(100), now=NOW,
    )
    assert report["results"]["Q1035"] == "baseline angelegt"
    assert report["changed"] == []
    saved = store.load_candidate_document("Q1035")
    assert saved["refresh"]["needs_review"] is False
    assert saved["refresh"]["lastrevid"] == 100
    assert saved["status"] == "published"  # Status bleibt unangetastet
    assert any(key.endswith("2026-08-01-refresh.json") for key in client.objects)


def test_unchanged_sources_do_not_flag_review() -> None:
    store, _ = _store_with_published(
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin", "status": "published"}]
    )
    run_refresh_batch(store=store, limit=10, dry_run=False, run_date=RUN_DATE,
                      fetch_json=fetcher(100), now=NOW)
    # zweiter Lauf, gleiche Quellenlage, Intervall abgelaufen
    later = datetime(2026, 9, 15, 6, 0, tzinfo=timezone.utc)
    report = run_refresh_batch(store=store, limit=10, dry_run=False, run_date=date(2026, 9, 15),
                               fetch_json=fetcher(100), now=later)
    assert report["results"]["Q1035"] == "unveraendert"
    assert store.load_candidate_document("Q1035")["refresh"]["needs_review"] is False


def test_changed_sources_flag_review_and_stay_flagged() -> None:
    store, _ = _store_with_published(
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin", "status": "published"}]
    )
    run_refresh_batch(store=store, limit=10, dry_run=False, run_date=RUN_DATE,
                      fetch_json=fetcher(100), now=NOW)
    later = datetime(2026, 9, 15, 6, 0, tzinfo=timezone.utc)
    report = run_refresh_batch(store=store, limit=10, dry_run=False, run_date=date(2026, 9, 15),
                               fetch_json=fetcher(101), now=later)
    assert report["changed"] == ["Q1035"]
    saved = store.load_candidate_document("Q1035")
    assert saved["refresh"]["changed"] is True
    assert saved["refresh"]["needs_review"] is True

    # dritter Lauf ohne weitere Aenderung: needs_review bleibt offen
    latest = datetime(2026, 10, 20, 6, 0, tzinfo=timezone.utc)
    report = run_refresh_batch(store=store, limit=10, dry_run=False, run_date=date(2026, 10, 20),
                               fetch_json=fetcher(101), now=latest)
    assert report["results"]["Q1035"] == "unveraendert (needs_review noch offen)"
    assert store.load_candidate_document("Q1035")["refresh"]["needs_review"] is True


def test_recently_checked_profiles_are_not_due() -> None:
    store, _ = _store_with_published(
        [
            {
                "wikidata_qid": "Q1035",
                "name": "Charles Darwin",
                "status": "published",
                "refresh": {"checked_at": NOW.isoformat(), "content_hash": "abc"},
            },
            {"wikidata_qid": "Q937", "name": "Albert Einstein", "status": "published"},
        ]
    )
    soon = datetime(2026, 8, 10, 6, 0, tzinfo=timezone.utc)
    report = run_refresh_batch(store=store, limit=10, dry_run=True, run_date=date(2026, 8, 10),
                               fetch_json=fetcher(100), now=soon)
    assert list(report["results"]) == ["Q937"]  # Q1035 erst nach 30 Tagen wieder


def test_dry_run_saves_nothing() -> None:
    store, client = _store_with_published(
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin", "status": "published"}]
    )
    before = dict(client.objects)
    report = run_refresh_batch(store=store, limit=10, dry_run=True, run_date=RUN_DATE,
                               fetch_json=fetcher(100), now=NOW)
    assert report["results"]["Q1035"] == "baseline angelegt"
    assert client.objects == before


def test_fetch_errors_are_reported_per_profile() -> None:
    store, _ = _store_with_published(
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin", "status": "published"}]
    )

    def broken(url: str) -> dict:
        raise RuntimeError("Wikidata nicht erreichbar")

    report = run_refresh_batch(store=store, limit=10, dry_run=False, run_date=RUN_DATE,
                               fetch_json=broken, now=NOW)
    assert "RuntimeError" in report["errors"]["Q1035"]
    assert "refresh" not in store.load_candidate_document("Q1035")
