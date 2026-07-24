import json
from datetime import date
from uuid import UUID

import pytest

from app.ai.capsule_builder import build_capsule, slugify
from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig
from app.integrations.candidate_store import CandidateStore

CONFIG = PipelineConfig(enabled=True)

RESEARCH = {
    "wikidata_qid": "Q1035",
    "description": "britischer Naturforscher",
    "birth_date_wikidata": "1809-02-12",
    "image_commons_file": "Charles Darwin.jpg",
    "gender": "male",
    "sources": [
        {"title": "Wikidata EntityData", "url": "https://w.wiki/x", "snapshot_key": "pipeline/sources/Q1035/wikidata-entitydata.json"},
        {"title": "Charles Darwin", "url": "https://de.wikipedia.org/x", "snapshot_key": "pipeline/sources/Q1035/wikipedia-de.json"},
        {"title": "Charles Darwin", "url": "https://en.wikipedia.org/x", "snapshot_key": "pipeline/sources/Q1035/wikipedia-en.json"},
    ],
}


def make_candidate(**overrides) -> HistoricalCandidate:
    defaults = dict(
        wikidata_qid="Q1035",
        name="Charles Darwin",
        death_date=date(1882, 4, 19),
        category="Wissenschaft",
        sitelink_count=250,
        source_count=3,
        risk_score=0.0,
        risk_flags={"works": "pass", "image": "pass", "publicity": "pass", "ethics": "pass"},
        image_status="commons_ok",
    )
    defaults.update(overrides)
    return HistoricalCandidate(**defaults)


def test_slugify_handles_umlauts_and_specials() -> None:
    assert slugify("Käthe Kollwitz") == "kathe-kollwitz"
    assert slugify("Antoine de Saint-Exupéry") == "antoine-de-saint-exupery"
    assert slugify("!!!") == "profil"


def test_capsule_contains_all_mandatory_parts() -> None:
    capsule = build_capsule(make_candidate(), RESEARCH, config=CONFIG)
    assert capsule.gender == "male"
    assert capsule.slug == "charles-darwin"
    assert isinstance(capsule.twin_id, UUID)
    assert "KI-Rekonstruktion" in capsule.persona_prompt
    assert "Sprache des Nutzers" in capsule.persona_prompt
    assert "nach meiner Zeit" in capsule.persona_prompt
    assert len(capsule.rag_chunks) == 4  # 3 Quellen + Beschreibung
    assert capsule.seo["json_ld"]["@type"] == "Person"
    assert capsule.seo["json_ld"]["deathDate"] == "1882-04-19"
    assert capsule.seo["canonical"] == "https://smyst.com/twin/charles-darwin"
    assert capsule.image["mode"] == "commons"
    assert json.dumps(capsule.as_document())  # serialisierbar


def test_restricted_works_adds_quote_ban() -> None:
    candidate = make_candidate(
        death_date=date(1965, 9, 4),
        risk_flags={"works": "restricted", "image": "pass", "publicity": "pass", "ethics": "pass"},
    )
    capsule = build_capsule(candidate, RESEARCH, config=CONFIG)
    assert "KEINE woertlichen Zitate" in capsule.persona_prompt


def test_generated_image_instruction_when_no_commons_ok() -> None:
    candidate = make_candidate(image_status="generated")
    capsule = build_capsule(candidate, dict(RESEARCH, image_commons_file=None), config=CONFIG)
    assert capsule.image["mode"] == "generated"
    assert capsule.image["label"] == "KI-generierte Darstellung"


def test_build_requires_risk_check_and_rejects_blocked() -> None:
    with pytest.raises(ValueError, match="Risiko-Check"):
        build_capsule(make_candidate(risk_score=None, risk_flags={}), RESEARCH, config=CONFIG)
    with pytest.raises(ValueError, match="blockierte"):
        build_capsule(
            make_candidate(risk_flags={"publicity": "block"}), RESEARCH, config=CONFIG
        )


# --- Worker-Orchestrierung (Store gefakt) ---

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

        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def test_build_one_transitions_verified_to_generated() -> None:
    from app.workers.build_capsules import CAPSULE_PREFIX, build_one

    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    store.save_candidate(make_candidate())
    doc = store.load_candidate_document("Q1035")
    doc.update(status="verified", risk_score=0.0, image_status="commons_ok",
               risk_flags={"works": "pass", "image": "pass", "publicity": "pass", "ethics": "pass"})
    store.save_candidate_document("Q1035", doc)
    store.save_research_document("Q1035", RESEARCH)

    qid, result = build_one(
        store.load_candidate_document("Q1035"), store=store, config=CONFIG, dry_run=False
    )
    assert qid == "Q1035" and result.startswith("generated")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "generated"
    assert saved["twin_id"]
    assert saved["prompt_key"] == f"{CAPSULE_PREFIX}Q1035/prompt.json"
    assert f"{CAPSULE_PREFIX}Q1035/capsule.json" in fake.objects
    assert f"{CAPSULE_PREFIX}Q1035/seo.json" in fake.objects
    assert saved["audit_trail"][-1]["to_status"] == "generated"
    capsule = json.loads(fake.objects[f"{CAPSULE_PREFIX}Q1035/capsule.json"])
    assert capsule["name"] == "Charles Darwin"
    assert capsule["risk_score"] == 0.0
