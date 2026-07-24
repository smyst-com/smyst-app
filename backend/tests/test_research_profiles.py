from datetime import date

from app.ai.research_profiles import (
    SourceRef,
    check_consistency,
    evaluate_research,
    parse_entity,
    with_sources,
)
from app.ai.historical_pipeline import HistoricalCandidate
from app.integrations.candidate_store import (
    RESEARCH_PREFIX,
    SOURCE_PREFIX,
    CandidateStore,
)


class FakePaginator:
    def __init__(self, keys: list[str]) -> None:
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in self._keys if k.startswith(prefix)]}


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        import io

        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def make_candidate(qid: str = "Q1035") -> HistoricalCandidate:
    return HistoricalCandidate(
        wikidata_qid=qid,
        name="Charles Darwin",
        death_date=date(1882, 4, 19),
        category="Wissenschaft",
        sitelink_count=250,
    )


def entity_payload(
    qid: str = "Q1035",
    death: str = "+1882-04-19T00:00:00Z",
    *,
    with_image: bool = True,
) -> dict:
    claims = {
        "P570": [{"mainsnak": {"snaktype": "value", "datavalue": {"value": {"time": death}}}}],
        "P569": [{"mainsnak": {"snaktype": "value",
                               "datavalue": {"value": {"time": "+1809-02-12T00:00:00Z"}}}}],
        "P106": [{"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q901"}}}}],
        "P800": [{"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q20124"}}}}],
        "P21": [{"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q6581097"}}}}],
    }
    if with_image:
        claims["P18"] = [
            {"mainsnak": {"snaktype": "value", "datavalue": {"value": "Charles Darwin.jpg"}}}
        ]
    return {
        "entities": {
            qid: {
                "labels": {"de": {"value": "Charles Darwin"}},
                "descriptions": {"de": {"value": "britischer Naturforscher"}},
                "claims": claims,
                "sitelinks": {
                    "dewiki": {"title": "Charles Darwin"},
                    "enwiki": {"title": "Charles Darwin"},
                    "klingonwiki": {"title": "ignorieren"},
                },
            }
        }
    }


def sources(n: int) -> list[SourceRef]:
    return [SourceRef(f"Quelle {i}", "test", f"https://example.org/{i}", f"key/{i}") for i in range(n)]


# --- Parser ---

def test_parse_entity_extracts_all_fields() -> None:
    doc = parse_entity(entity_payload(), "Q1035")
    assert doc.name == "Charles Darwin"
    assert doc.description == "britischer Naturforscher"
    assert doc.death_date_wikidata == date(1882, 4, 19)
    assert doc.birth_date_wikidata == date(1809, 2, 12)
    assert doc.image_commons_file == "Charles Darwin.jpg"
    assert doc.occupation_qids == ("Q901",)
    assert doc.notable_work_qids == ("Q20124",)
    assert set(doc.wikipedia_titles) == {"dewiki", "enwiki"}
    assert doc.gender == "male"


def test_parse_entity_gender_female_and_unknown() -> None:
    payload = entity_payload()
    payload["entities"]["Q1035"]["claims"]["P21"] = [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q6581072"}}}}
    ]
    assert parse_entity(payload, "Q1035").gender == "female"
    # Nicht-binaerer oder fehlender P21-Wert -> None (neutraler Fallback).
    payload["entities"]["Q1035"]["claims"]["P21"] = [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q48270"}}}}
    ]
    assert parse_entity(payload, "Q1035").gender is None
    del payload["entities"]["Q1035"]["claims"]["P21"]
    assert parse_entity(payload, "Q1035").gender is None


def test_parse_entity_handles_unknown_month_day() -> None:
    doc = parse_entity(entity_payload(death="+1882-00-00T00:00:00Z"), "Q1035")
    assert doc.death_date_wikidata == date(1882, 1, 1)


def test_parse_entity_without_image() -> None:
    doc = parse_entity(entity_payload(with_image=False), "Q1035")
    assert doc.image_commons_file is None


# --- Konsistenz ---

def test_consistency_flags_date_mismatch_and_missing_year() -> None:
    doc = parse_entity(entity_payload(), "Q1035")
    conflicts = check_consistency(
        doc,
        candidate_death_date=date(1881, 1, 1),
        wikipedia_extracts={"dewiki": "starb 1882 in Downe"},
    )
    assert any("widerspruechlich" in c for c in conflicts)
    conflicts2 = check_consistency(
        doc,
        candidate_death_date=date(1882, 4, 19),
        wikipedia_extracts={"dewiki": "kein Jahr im Text"},
    )
    assert any("in keinem Wikipedia-Extract" in c for c in conflicts2)


# --- Bewertung ---

def test_evaluate_ready_with_enough_sources_and_consistent_dates() -> None:
    doc = with_sources(parse_entity(entity_payload(), "Q1035"), sources(3))
    outcome = evaluate_research(
        doc,
        candidate_death_date=date(1882, 4, 19),
        min_sources=3,
        wikipedia_extracts={"dewiki": "Darwin starb am 19. April 1882."},
    )
    assert outcome.ready and outcome.reject_reason is None


def test_evaluate_rejects_on_date_conflict_even_with_sources() -> None:
    doc = with_sources(parse_entity(entity_payload(), "Q1035"), sources(5))
    outcome = evaluate_research(
        doc, candidate_death_date=date(1900, 1, 1), min_sources=3, wikipedia_extracts={}
    )
    assert not outcome.ready
    assert "widerspruechlich" in outcome.reject_reason


def test_evaluate_rejects_on_too_few_sources() -> None:
    doc = with_sources(parse_entity(entity_payload(), "Q1035"), sources(2))
    outcome = evaluate_research(
        doc,
        candidate_death_date=date(1882, 4, 19),
        min_sources=3,
        wikipedia_extracts={"dewiki": "1882"},
    )
    assert not outcome.ready and "Quellen" in outcome.reject_reason


def test_missing_wikipedia_year_is_note_not_rejection() -> None:
    doc = with_sources(parse_entity(entity_payload(), "Q1035"), sources(3))
    outcome = evaluate_research(
        doc,
        candidate_death_date=date(1882, 4, 19),
        min_sources=3,
        wikipedia_extracts={"dewiki": "ohne Jahresangabe"},
    )
    assert outcome.ready
    assert any("in keinem Wikipedia-Extract" in n for n in outcome.notes)


# --- Store-Erweiterungen ---

def test_store_snapshot_research_and_status_scan() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    store.save_candidate(make_candidate("Q1035"))
    store.save_candidate(make_candidate("Q2000"))

    snapshot_key = store.save_source_snapshot("Q1035", "wikidata-entitydata.json", b"{}")
    assert snapshot_key == f"{SOURCE_PREFIX}Q1035/wikidata-entitydata.json"

    research_key = store.save_research_document("Q1035", {"wikidata_qid": "Q1035"})
    assert research_key == f"{RESEARCH_PREFIX}Q1035.json"

    docs = store.candidate_documents_by_status("candidate")
    assert [d["wikidata_qid"] for d in docs] == ["Q1035", "Q2000"]
    assert store.candidate_documents_by_status("published") == []
    assert store.existing_qids() == {"Q1035", "Q2000"}  # Snapshots verschmutzen den Index nicht

    updated = {**docs[0], "status": "researched"}
    store.save_candidate_document("Q1035", updated)
    assert [d["wikidata_qid"] for d in store.candidate_documents_by_status("researched")] == ["Q1035"]


# --- Worker-Orchestrierung (Netzwerk gepatcht) ---

def test_research_one_transitions_candidate_to_researched(monkeypatch=None) -> None:
    import json

    from app.ai.historical_pipeline import PipelineConfig
    from app.workers import research_candidates as worker

    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    store.save_candidate(make_candidate("Q1035"))

    def fake_get_json(url: str, **kwargs) -> dict:
        if "EntityData" in url:
            return entity_payload()
        return {"extract": "Charles Darwin starb am 19. April 1882 in Downe."}

    original = worker._get_json
    worker._get_json = fake_get_json
    try:
        document = store.load_candidate_document("Q1035")
        qid, result = worker.research_one(
            document,
            store=store,
            config=PipelineConfig(enabled=True),
            dry_run=False,
        )
    finally:
        worker._get_json = original

    assert (qid, result) == ("Q1035", "researched")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "researched"
    assert saved["source_count"] == 3  # EntityData + de + en
    assert len(saved["audit_trail"]) == 1
    assert saved["audit_trail"][0]["to_status"] == "researched"
    research = json.loads(fake.objects[f"{RESEARCH_PREFIX}Q1035.json"])
    assert research["name"] == "Charles Darwin"
    assert f"{SOURCE_PREFIX}Q1035/wikidata-entitydata.json" in fake.objects
    assert f"{SOURCE_PREFIX}Q1035/wikipedia-de.json" in fake.objects
