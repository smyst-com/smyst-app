import json
from datetime import date, datetime, timezone

import pytest

from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig
from app.ai.publisher import (
    PUBLISH_INDEX_KEY,
    SITEMAP_FRAGMENT_KEY,
    build_publish_record,
    build_sitemap_fragment,
    mark_unpublished,
    upsert_index,
    visible_count_today,
)
from app.integrations.candidate_store import CandidateStore

CONFIG = PipelineConfig(enabled=True, daily_publish_limit=5)

CANDIDATE_DOC = {
    "wikidata_qid": "Q1035",
    "name": "Charles Darwin",
    "death_date": "1882-04-19",
    "category": "Wissenschaft",
    "risk_score": 0.0,
    "risk_flags": {"works": "pass", "image": "pass", "publicity": "pass", "ethics": "pass"},
    "image_status": "commons_ok",
    "twin_id": "11111111-1111-4111-8111-111111111111",
    "source_count": 3,
    "prompt_key": "pipeline/capsules/Q1035/prompt.json",
    "qa_passed": True,
}

CAPSULE_DOC = {
    "slug": "charles-darwin",
    "name": "Charles Darwin",
    "language_default": "de",
    "persona_prompt": "Profil: Charles Darwin. Kennzeichnung: KI-Rekonstruktion.",
    "rag_chunks": [{"chunk_id": 0}],
    "image": {"mode": "commons", "commons_file": "Charles Darwin.jpg"},
    "seo": {"json_ld": {"name": "Charles Darwin", "deathDate": "1882-04-19",
                        "birthDate": "1809-02-12", "description": "britischer Naturforscher"}},
    "sources": [{"title": "Wikidata"}, {"title": "Wikipedia de"}, {"title": "Wikipedia en"}],
    "gender": "male",
}


def record(**overrides):
    base = build_publish_record(
        CANDIDATE_DOC, CAPSULE_DOC, approved_by="adam@smyst.com",
        now=datetime(2026, 7, 2, 12, 0, tzinfo=timezone.utc),
    )
    base.update(overrides)
    return base


# --- Domain ---

def test_publish_record_contains_disclosure_and_references() -> None:
    rec = record()
    assert rec["slug"] == "charles-darwin"
    assert rec["ai_disclosure"].startswith("KI-Rekonstruktion")
    assert rec["capsule_key"] == "pipeline/capsules/Q1035/capsule.json"
    assert rec["approved_by"] == "adam@smyst.com"
    assert rec["visible"] is True
    assert rec["birth_date"] == "1809-02-12"
    assert rec["gender"] == "male"


def test_upsert_index_replaces_same_qid_and_blocks_conflicts() -> None:
    index = upsert_index([], record())
    assert len(index) == 1
    index = upsert_index(index, record(version=2))
    assert len(index) == 1 and index[0]["version"] == 2
    with pytest.raises(ValueError, match="Index-Konflikt"):
        upsert_index(index, record(wikidata_qid="Q999", name="CHARLES DARWIN"))


def test_unpublish_keeps_record_and_updates_sitemap() -> None:
    index = upsert_index([], record())
    index = mark_unpublished(index, "Q1035", reason="Meldung eingegangen")
    assert index[0]["visible"] is False
    assert index[0]["unpublish_reason"] == "Meldung eingegangen"
    fragment = build_sitemap_fragment(index)
    assert fragment["count"] == 0
    with pytest.raises(ValueError, match="nicht im Publish-Index"):
        mark_unpublished(index, "Q404", reason="x")


def test_visible_count_today_counts_only_todays_visible() -> None:
    index = [record(), record(wikidata_qid="Q2", slug="a", name="A",
                              published_at="2026-07-01T09:00:00+00:00")]
    assert visible_count_today(index, today_iso="2026-07-02") == 1


# --- Worker (Store gefakt) ---

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
        import io

        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def _prepared_store(status: str = "reviewed") -> CandidateStore:
    store = CandidateStore(FakeS3(), "smyst-memories")
    candidate = HistoricalCandidate(
        wikidata_qid="Q1035", name="Charles Darwin", death_date=date(1882, 4, 19),
        category="Wissenschaft", sitelink_count=250, source_count=3,
    )
    store.save_candidate(candidate)
    doc = store.load_candidate_document("Q1035")
    doc.update(CANDIDATE_DOC, status=status)
    store.save_candidate_document("Q1035", doc)
    store._client.put_object(
        Bucket="smyst-memories", Key="pipeline/capsules/Q1035/capsule.json",
        Body=json.dumps(CAPSULE_DOC).encode(), ContentType="application/json",
    )
    return store


def test_publish_one_requires_reviewed_and_writes_artifacts() -> None:
    from app.workers.publish_profiles import publish_one, unpublish_one

    store = _prepared_store()
    result = publish_one(
        "Q1035", store=store, config=CONFIG, approved_by="adam@smyst.com", dry_run=False
    )
    assert result.startswith("published")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "published"
    assert saved["reviewed_by"]
    assert saved["audit_trail"][-1]["to_status"] == "published"
    assert saved["audit_trail"][-1]["actor"]
    index = json.loads(store._client.objects[PUBLISH_INDEX_KEY])
    assert index[0]["slug"] == "charles-darwin"
    fragment = json.loads(store._client.objects[SITEMAP_FRAGMENT_KEY])
    assert fragment["count"] == 1
    assert "pipeline/published/Q1035/profile.json" in store._client.objects

    result = unpublish_one(
        "Q1035", store=store, config=CONFIG, approved_by="adam@smyst.com",
        reason="Meldung eingegangen", dry_run=False,
    )
    assert result.startswith("unpublished")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "unpublished"
    fragment = json.loads(store._client.objects[SITEMAP_FRAGMENT_KEY])
    assert fragment["count"] == 0


def test_publish_one_rejects_curated_live_duplicate() -> None:
    from app.workers.publish_profiles import publish_one

    store = _prepared_store()
    result = publish_one(
        "Q1035", store=store, config=CONFIG, approved_by="a@smyst.com",
        dry_run=True, live_slugs={"charles-darwin", "sokrates"},
    )
    assert result.startswith("abgelehnt: Slug 'charles-darwin'")

    # Re-Publish desselben Pipeline-Profils bleibt erlaubt (Slug im eigenen Index)
    store = _prepared_store()
    assert publish_one(
        "Q1035", store=store, config=CONFIG, approved_by="a@smyst.com", dry_run=False
    ).startswith("published")
    doc = store.load_candidate_document("Q1035")
    doc["status"] = "reviewed"
    store.save_candidate_document("Q1035", doc)
    assert publish_one(
        "Q1035", store=store, config=CONFIG, approved_by="a@smyst.com",
        dry_run=True, live_slugs={"charles-darwin"},
    ).startswith("published")


def test_select_reviewed_qids_requires_qa_passed() -> None:
    from app.workers.publish_profiles import select_reviewed_qids

    store = _prepared_store(status="reviewed")
    assert select_reviewed_qids(store) == ["Q1035"]

    doc = store.load_candidate_document("Q1035")
    doc["qa_passed"] = False
    store.save_candidate_document("Q1035", doc)
    assert select_reviewed_qids(store) == []


def test_status_report_lists_candidates() -> None:
    from app.workers.report_status import build_report

    store = _prepared_store(status="reviewed")
    report = build_report(store)
    assert report["counts"] == {"reviewed": 1}
    assert report["candidates"][0]["qid"] == "Q1035"
    assert report["candidates"][0]["qa_passed"] is True


def test_publish_one_rejects_wrong_status_and_daily_limit() -> None:
    from app.workers.publish_profiles import publish_one

    store = _prepared_store(status="generated")
    assert publish_one(
        "Q1035", store=store, config=CONFIG, approved_by="a@smyst.com", dry_run=True
    ).startswith("abgelehnt: Status")

    store = _prepared_store()
    limited = PipelineConfig(enabled=True, daily_publish_limit=0)
    assert publish_one(
        "Q1035", store=store, config=limited, approved_by="a@smyst.com", dry_run=True
    ).startswith("abgelehnt: Tageslimit")

    disabled = PipelineConfig(enabled=False)
    assert publish_one(
        "Q1035", store=store, config=disabled, approved_by="a@smyst.com", dry_run=True
    ).startswith("abgelehnt: Tageslimit")


def test_publish_record_prefers_candidate_life_data_and_carries_labels() -> None:
    cand = {**CANDIDATE_DOC, "wikidata_qid": "Q8018", "name": "Augustinus von Hippo",
            "birth_date": "0354-11-13", "death_date": "0430-08-28",
            "birth_label": None, "death_label": None}
    caps = {**CAPSULE_DOC, "slug": "augustinus-von-hippo", "name": "Augustinus von Hippo",
            "seo": {"json_ld": {"birthDate": None, "deathDate": "0430-08-28"}}}
    rec = build_publish_record(cand, caps, approved_by="adam@smyst.com",
                               now=datetime(2026, 7, 17, tzinfo=timezone.utc))
    assert rec["birth_date"] == "0354-11-13"
    assert rec["death_date"] == "0430-08-28"


def test_publish_record_keeps_approximate_labels() -> None:
    cand = {**CANDIDATE_DOC, "wikidata_qid": "Q131805", "name": "Erasmus",
            "birth_date": None, "death_date": "1536-07-12",
            "birth_label": "um 1466", "death_label": None}
    caps = {**CAPSULE_DOC, "slug": "erasmus",
            "seo": {"json_ld": {"birthDate": None, "deathDate": "1536-07-12"}}}
    rec = build_publish_record(cand, caps, approved_by="adam@smyst.com",
                               now=datetime(2026, 7, 17, tzinfo=timezone.utc))
    assert rec["birth_label"] == "um 1466"
    assert rec["death_date"] == "1536-07-12"
