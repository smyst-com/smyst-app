"""Tests fuer den Reparatur-Worker (rebuild_profile): QA-Gate schuetzt die Live-Capsule."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

from app.ai.historical_pipeline import PipelineConfig
from app.ai.qa_checks import QA_QUESTIONS
from app.integrations.candidate_store import CANDIDATE_PREFIX, CandidateStore
from app.workers.build_capsules import CAPSULE_PREFIX
from app.workers.rebuild_profile import run_rebuild

CONFIG = PipelineConfig(enabled=True)
NOW = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
RUN_DATE = date(2026, 8, 1)

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
                        {
                            "mainsnak": {
                                "snaktype": "value",
                                "datavalue": {"value": {"time": "+1882-04-19T00:00:00Z", "precision": 11}},
                            }
                        }
                    ]
                },
                "sitelinks": {
                    "dewiki": {"title": "Charles Darwin"},
                    "enwiki": {"title": "Charles Darwin"},
                },
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
        {"persona_prompt": "ALTE CAPSULE", "slug": "charles-darwin"}
    ).encode("utf-8")
    return store, client


def test_rebuild_passes_qa_updates_capsule_and_resolves_review() -> None:
    store, client = _store()
    report = run_rebuild(
        ["Q1035"], store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=good_chat_factory, now=NOW,
    )
    assert "neu gebaut" in report["results"]["Q1035"]
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "published"  # kein Status-Wechsel, keine Downtime
    assert saved["twin_id"] == PUBLISHED_DOC["twin_id"]  # Identitaet bleibt stabil
    assert saved["refresh"]["needs_review"] is False
    assert saved["rebuild_report"]["qa_passed"] is True
    capsule = json.loads(client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["persona_prompt"] != "ALTE CAPSULE"
    assert capsule["slug"] == "charles-darwin"
    assert any(key.endswith("2026-08-01-rebuild.json") for key in client.objects)


def test_rebuild_failed_qa_keeps_live_capsule_and_review_flag() -> None:
    store, client = _store()
    report = run_rebuild(
        ["Q1035"], store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=fetch_json, chat_fn_factory=bad_chat_factory, now=NOW,
    )
    assert "QA nicht bestanden" in report["results"]["Q1035"]
    capsule = json.loads(client.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["persona_prompt"] == "ALTE CAPSULE"  # Live-Capsule unveraendert
    saved = store.load_candidate_document("Q1035")
    assert saved["refresh"]["needs_review"] is True  # Review bleibt offen
    assert saved["rebuild_report"]["qa_passed"] is False


def test_rebuild_aborts_on_broken_research_without_changes() -> None:
    store, client = _store()
    before = dict(client.objects)

    def broken(url: str) -> dict:
        raise RuntimeError("Wikidata down")

    report = run_rebuild(
        ["Q1035"], store=store, config=CONFIG, dry_run=False, run_date=RUN_DATE,
        fetch_json=broken, chat_fn_factory=good_chat_factory, now=NOW,
    )
    assert "RuntimeError" in report["errors"]["Q1035"]
    # ausser dem Changelog wurde nichts geschrieben
    changed = {k for k in client.objects if client.objects.get(k) != before.get(k)}
    assert all("changelogs" in key or "-rebuild" in key for key in changed)
