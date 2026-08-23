"""Tests fuer den Versions-Autopilot: Staging + Freigabe schuetzen die Live-Capsule."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

from app.ai.historical_pipeline import PipelineConfig
from app.ai.qa_checks import QA_QUESTIONS
from app.integrations.candidate_store import CANDIDATE_PREFIX, CandidateStore
from app.workers import version_autopilot as va
from app.workers.build_capsules import CAPSULE_PREFIX
from app.workers.version_autopilot import PENDING_PREFIX, run_version_autopilot

CONFIG = PipelineConfig(enabled=True)
NOW = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
RUN_DATE = date(2026, 8, 2)

PUBLISHED_DOC = {
    "wikidata_qid": "Q1035",
    "name": "Charles Darwin",
    "death_date": "1882-04-19",
    "category": "Wissenschaft",
    "status": "published",
    "risk_score": 0.0,
    "risk_flags": {"works": "pass"},
    "image_status": "commons_ok",
    "twin_id": "11111111-1111-4111-8111-111111111111",
    "source_count": 3,
    "eval_report": {"finished_at": "2026-07-01T06:00:00+00:00", "score": 0.6},
    "refresh": {"checked_at": "2026-07-01T06:00:00+00:00", "needs_review": True, "content_hash": "alt"},
}

GOOD_ANSWERS = {
    "identity": "Ich bin das KI-Profil von Charles Darwin, eine KI-Rekonstruktion auf Basis oeffentlicher Quellen.",
    "lifework": "Mein wichtigstes Werk ist die Evolutionstheorie, dargelegt in 'On the Origin of Species'.",
    "after_death": "Das Internet entstand lange nach meiner Zeit, dazu habe ich keine eigene Erfahrung.",
    "language": "I was born in Shrewsbury, England, in the year 1809.",
    "trap": "Nein, das stimmt nicht — dafuer gibt es keine Belege in meinen Quellen.",
}


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


def entity_payload() -> dict:
    return {
        "entities": {
            "Q1035": {
                "lastrevid": 123,
                "labels": {"de": {"value": "Charles Darwin"}},
                "descriptions": {"de": {"value": "britischer Naturforscher"}},
                "claims": {
                    "P570": [
                        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"time": "+1882-04-19T00:00:00Z", "precision": 11}}}}
                    ]
                },
                "sitelinks": {"dewiki": {"title": "Charles Darwin"}, "enwiki": {"title": "Charles Darwin"}},
            }
        }
    }


def fetch_json(url: str) -> dict:
    if "EntityData" in url:
        return entity_payload()
    return {"extract": "Charles Darwin war ein britischer Naturforscher (1809-1882)."}


def good_chat_factory(capsule_doc):
    def chat(question: str) -> str:
        for q in QA_QUESTIONS:
            if q["frage"] == question:
                return GOOD_ANSWERS[q["id"]]
        return "Ausreichend lange Antwort fuer die Pruefung."

    return chat


def bad_chat_factory(capsule_doc):
    def chat(question: str) -> str:
        return "kurz"

    return chat


def _store() -> tuple[CandidateStore, FakeS3]:
    client = FakeS3()
    store = CandidateStore(client, "test-bucket")
    client.objects[f"{CANDIDATE_PREFIX}Q1035.json"] = json.dumps(PUBLISHED_DOC).encode("utf-8")
    client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"] = json.dumps(
        {"persona_prompt": "ALTE CAPSULE", "slug": "charles-darwin", "version": 1}
    ).encode("utf-8")
    client.objects[f"{CAPSULE_PREFIX}Q1035/prompt.json"] = b"{}"
    client.objects[f"{CAPSULE_PREFIX}Q1035/seo.json"] = b"{}"
    return store, client


def _patch_eval(monkeypatch, score: float) -> None:
    class FakeReport:
        def __init__(self, score: float) -> None:
            self.passed = True
            self.issues: list = []
            self.score = score

    monkeypatch.setattr(va, "run_profile_eval", lambda *a, **k: FakeReport(score))


def test_stage_qa_pass_and_eval_win_stages_new_version(monkeypatch) -> None:
    _patch_eval(monkeypatch, 0.9)
    store, client = _store()
    report = run_version_autopilot(
        store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=good_chat_factory, now=NOW,
    )
    assert report["results"]["Q1035"].startswith("gestaged")
    assert report["staged"] == ["Q1035"]
    record = json.loads(client.objects[f"{PENDING_PREFIX}Q1035.json"])
    assert record["old_version"] == 1
    assert record["new_version"] == 2
    assert record["twin_id"] == PUBLISHED_DOC["twin_id"]
    # Live-Capsule bleibt unangetastet: Staging liegt separat.
    capsule = json.loads(client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["persona_prompt"] == "ALTE CAPSULE"


def test_stage_eval_regression_discards_and_keeps_live(monkeypatch) -> None:
    _patch_eval(monkeypatch, 0.5)  # schlechter als 0.6
    store, client = _store()
    report = run_version_autopilot(
        store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=good_chat_factory, now=NOW,
    )
    assert "verworfen" in report["results"]["Q1035"]
    assert not any(k.startswith(PENDING_PREFIX) for k in client.objects)


def test_stage_failed_qa_keeps_everything(monkeypatch) -> None:
    _patch_eval(monkeypatch, 0.9)
    store, client = _store()
    report = run_version_autopilot(
        store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=bad_chat_factory, now=NOW,
    )
    assert "verworfen" in report["results"]["Q1035"]
    assert not any(k.startswith(PENDING_PREFIX) for k in client.objects)


def test_apply_pending_swaps_live_archives_old_and_writes_history(monkeypatch) -> None:
    from app.api.v1.routes import admin_versions as av

    _patch_eval(monkeypatch, 0.9)
    store, client = _store()
    run_version_autopilot(
        store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=good_chat_factory, now=NOW,
    )
    result = av._apply_pending(store, "Q1035", "owner@smyst.com")
    assert result.startswith("live: v1 -> v2")
    capsule = json.loads(client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["persona_prompt"] != "ALTE CAPSULE"
    assert capsule["version"] == 2
    # Alte Version vollstaendig archiviert (Rollback moeglich).
    assert "pipeline/backups/Q1035/v1/capsule.json" in client.objects
    # Freigabe-Datensatz wandert nach applied/, Historie ins Dokument.
    assert any(k.startswith("pipeline/autopilot/applied/") for k in client.objects)
    document = store.load_candidate_document("Q1035")
    assert document["twin_versions"][-1]["version"] == 2
    assert document["twin_versions"][-1]["approved_by"] == "owner@smyst.com"
    assert document["status"] == "published"  # kein Status-Wechsel


def test_reject_pending_keeps_live_and_archives_decision(monkeypatch) -> None:
    from app.api.v1.routes import admin_versions as av

    _patch_eval(monkeypatch, 0.9)
    store, client = _store()
    run_version_autopilot(
        store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=good_chat_factory, now=NOW,
    )
    result = av._reject_pending(store, "Q1035", "Testgrund", "owner@smyst.com")
    assert result.startswith("verworfen")
    capsule = json.loads(client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["persona_prompt"] == "ALTE CAPSULE"
    assert any(k.startswith("pipeline/autopilot/rejected/") for k in client.objects)
