"""Tests fuer die Autopilot-Statistik (pipeline_stats) und die Tagesquoten.

Grundlage des 5.000-Profile-Tagesautopiloten (14.09.2026): HEUTE-Zahlen kommen
aus den LastModified-Zeitstempeln der Status-Marker (LIST) — kein Voll-Scan.
"""

from __future__ import annotations

import datetime as dt
import io
import json

from app.integrations.candidate_store import (
    PUBLISHED_SUMMARY_KEY,
    STATUS_PREFIX,
    CandidateStore,
)
from app.workers import pipeline_stats


class FakeS3:
    """S3-Fake mit LIST (inkl. LastModified), GET und PUT."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.mtimes: dict[str, dt.datetime] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body
        self.touch(Key)

    def get_object(self, *, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        store = self

        class P:
            def paginate(self, **kwargs):
                prefix = kwargs.get("Prefix", "")
                yield {
                    "Contents": [
                        {"Key": k, "LastModified": store.mtimes.get(k)}
                        for k in sorted(store.objects)
                        if k.startswith(prefix)
                    ]
                }

        return P()

    def touch(self, key, when=None):
        self.mtimes[key] = when or dt.datetime.now(dt.timezone.utc)


def _seed(store: CandidateStore) -> None:
    client = store._client  # noqa: SLF001
    heute = dt.datetime.now(dt.timezone.utc)
    gestern = heute - dt.timedelta(days=1)
    marker = {
        "published/Q1": heute,          # heute veroeffentlicht
        "published/Q2": gestern,        # yesterday
        "published/Q3": heute,
        "reviewed/Q4": heute,           # Heute-Freigabe wartet
        "generated/Q5": gestern,
        "candidate/Q6": heute,
        "rejected/Q7": gestern,
    }
    for key, when in marker.items():
        client.objects[f"{STATUS_PREFIX}{key}"] = b""
        client.touch(f"{STATUS_PREFIX}{key}", when)
    client.touch(
        "pipeline/ingest/cursor.json", heute
    )
    client.objects["pipeline/ingest/cursor.json"] = json.dumps(
        {"Kunst": 12, "Politik": 0}
    ).encode()


def test_report_counts_totals_and_today(monkeypatch) -> None:
    store = CandidateStore(FakeS3(), "smyst-memories")
    _seed(store)
    monkeypatch.setenv("AUTOPILOT_DAILY_TARGET", "5000")

    report = pipeline_stats.build_report(store)

    assert report["totals"]["published"] == 3
    assert report["totals"]["reviewed"] == 1
    assert report["totals"]["generated"] == 1
    assert report["totals"]["candidate"] == 1
    assert report["totals"]["rejected"] == 1
    assert report["today"]["published"] == 2  # Q3 (gestern) zaehlt nicht
    assert report["today"]["reviewed"] == 1
    assert report["quota"]["remaining"] == 4998
    assert report["quota"]["target_reached"] is False
    assert report["ingest_cursor"] == {"Kunst": 12, "Politik": 0}


def test_report_target_reached(monkeypatch) -> None:
    store = CandidateStore(FakeS3(), "smyst-memories")
    _seed(store)
    monkeypatch.setenv("AUTOPILOT_DAILY_TARGET", "2")

    report = pipeline_stats.build_report(store)
    assert report["quota"]["target_reached"] is True
    assert report["quota"]["remaining"] == 0


def test_save_report_writes_daily_doc() -> None:
    store = CandidateStore(FakeS3(), "smyst-memories")
    report = pipeline_stats.build_report(store)
    key = pipeline_stats.save_report(store, report)
    assert key.startswith("pipeline/changelogs/stats-")
    body = json.loads(store._client.objects[key])  # noqa: SLF001
    assert body["worker"] == "pipeline_stats"
    assert body["daily_target"] == 5000


def test_published_summary_roundtrip() -> None:
    store = CandidateStore(FakeS3(), "smyst-memories")
    assert store.load_published_summary() is None  # fehlt -> Fallback-Pfad
    store.save_published_summary([{"wikidata_qid": "Q1", "name": "Ada Lovelace"}])
    summary = store.load_published_summary()
    assert summary == [{"wikidata_qid": "Q1", "name": "Ada Lovelace"}]
    assert PUBLISHED_SUMMARY_KEY in store._client.objects  # noqa: SLF001


def test_save_report_tolerates_denied_prefix() -> None:
    """Live-Befund 14.09. (Lauf 34789969666): gesperrte Prefixe duerfen den
    Statistik-/Publish-Lauf NICHT roet enden lassen — Report faellt auf
    None + Fehlervermerk zurueck."""
    class DenyingS3(FakeS3):
        def put_object(self, *, Bucket, Key, Body, ContentType):
            if Key.startswith("pipeline/changelogs/"):
                raise PermissionError("AccessDenied")
            return super().put_object(Bucket=Bucket, Key=Key, Body=Body, ContentType=ContentType)

    store = CandidateStore(DenyingS3(), "smyst-memories")
    report = pipeline_stats.build_report(store)
    assert pipeline_stats.save_report(store, report) is None
    assert "save_report" in report.get("errors", {})


def test_refresh_published_summary_tolerates_denied_write() -> None:
    """Gleicher Fall im Publisher: Summary-Schreibfehler darfa den Publish-
    Lauf nicht abbrechen (die Publikationen sind dann schon durch)."""
    from app.workers.publish_profiles import refresh_published_summary

    class DenyingS3(FakeS3):
        def put_object(self, *, Bucket, Key, Body, ContentType):
            if Key.endswith("summary.json"):
                raise PermissionError("AccessDenied")
            return super().put_object(Bucket=Bucket, Key=Key, Body=Body, ContentType=ContentType)

    store = CandidateStore(DenyingS3(), "smyst-memories")
    assert refresh_published_summary(store) is None  # wirft NICHT
