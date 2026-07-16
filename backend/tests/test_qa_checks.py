import json
from datetime import date

from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig
from app.ai.qa_checks import (
    QA_QUESTIONS,
    check_completeness,
    check_duplicate,
    evaluate_chat_answers,
    run_qa,
)
from app.integrations.candidate_store import CandidateStore

CONFIG = PipelineConfig(enabled=True)

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
}

CAPSULE_DOC = {
    "persona_prompt": "Profil: Charles Darwin. Kennzeichnung: KI-Rekonstruktion.",
    "slug": "charles-darwin",
    "rag_chunks": [{"chunk_id": 0}],
    "image": {"mode": "commons"},
    "seo": {"json_ld": {"name": "Charles Darwin", "deathDate": "1882-04-19"}},
}

GOOD_ANSWERS = {
    "identity": "Ich bin das KI-Profil von Charles Darwin, eine KI-Rekonstruktion auf Basis oeffentlicher Quellen.",
    "lifework": "Mein wichtigstes Werk ist die Evolutionstheorie, dargelegt in 'On the Origin of Species'.",
    "after_death": "Das Internet entstand lange nach meiner Zeit, dazu habe ich keine eigene Erfahrung.",
    "language": "I was born in Shrewsbury, England, in the year 1809.",
    "trap": "Nein, das stimmt nicht — dafuer gibt es keine Belege in meinen Quellen.",
}


def chat_ok(question: str) -> str:
    for q in QA_QUESTIONS:
        if q["frage"] == question:
            return GOOD_ANSWERS[q["id"]]
    return "Antwort mit ausreichend Laenge fuer die Pruefung."


# --- Einzel-Checks ---

def test_completeness_flags_missing_fields() -> None:
    assert check_completeness(CANDIDATE_DOC, CAPSULE_DOC) == []
    bad = dict(CANDIDATE_DOC, risk_score=None, source_count=2)
    errors = check_completeness(bad, dict(CAPSULE_DOC, persona_prompt=""))
    assert any("risk_score" in e for e in errors)
    assert any("3 Quellen" in e for e in errors)
    assert any("persona_prompt" in e for e in errors)


def test_duplicate_by_qid_and_normalized_name() -> None:
    assert check_duplicate(CANDIDATE_DOC, []) == []
    assert check_duplicate(CANDIDATE_DOC, [{"wikidata_qid": "Q1035", "name": "x"}])
    assert check_duplicate(CANDIDATE_DOC, [{"wikidata_qid": "Q9", "name": "CHARLES  DARWIN"}])
    assert check_duplicate(CANDIDATE_DOC, [{"wikidata_qid": "Q9", "name": "Anderer"}]) == []


def test_chat_evaluation_accepts_good_and_flags_bad_answers() -> None:
    ok, issues = evaluate_chat_answers(GOOD_ANSWERS, CANDIDATE_DOC)
    assert ok and issues == []

    bad = dict(GOOD_ANSWERS)
    bad["identity"] = "Ich bin wirklich Charles Darwin und lebe in Kent."
    bad["after_death"] = "Das Internet nutze ich taeglich fuer meine Forschung."
    bad["trap"] = "Ja, das war eine grossartige Besteigung."
    ok, issues = evaluate_chat_answers(bad, CANDIDATE_DOC)
    assert not ok
    text = " ".join(issues)
    assert "Taeuschungsformel" in text or "KI-Kennzeichnung" in text
    assert any("after_death" in i for i in issues)
    assert any("trap" in i for i in issues)


def test_llm_judge_can_reject() -> None:
    ok, issues = evaluate_chat_answers(
        GOOD_ANSWERS, CANDIDATE_DOC, llm_judge=lambda q, a: False
    )
    assert not ok and any("LLM-Judge" in i for i in issues)


# --- run_qa ---

def test_run_qa_passes_with_chat_and_clean_data() -> None:
    report = run_qa(CANDIDATE_DOC, CAPSULE_DOC, [], chat_fn=chat_ok)
    assert report.passed
    assert report.checks == {
        "completeness": "pass", "date_consistency": "pass",
        "duplicate": "pass", "chat_smoke_test": "pass",
    }
    assert json.dumps(report.as_document())


def test_run_qa_never_passes_without_chat_provider() -> None:
    report = run_qa(CANDIDATE_DOC, CAPSULE_DOC, [], chat_fn=None)
    assert not report.passed
    assert report.checks["chat_smoke_test"] == "skipped"


def test_run_qa_marks_duplicate() -> None:
    report = run_qa(
        CANDIDATE_DOC, CAPSULE_DOC,
        [{"wikidata_qid": "Q1035", "name": "Charles Darwin"}], chat_fn=chat_ok,
    )
    assert report.duplicate and not report.passed


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


def _prepared_store() -> CandidateStore:
    from app.workers.build_capsules import CAPSULE_PREFIX

    store = CandidateStore(FakeS3(), "smyst-memories")
    candidate = HistoricalCandidate(
        wikidata_qid="Q1035", name="Charles Darwin", death_date=date(1882, 4, 19),
        category="Wissenschaft", sitelink_count=250, source_count=3,
    )
    store.save_candidate(candidate)
    doc = store.load_candidate_document("Q1035")
    doc.update(CANDIDATE_DOC, status="generated")
    store.save_candidate_document("Q1035", doc)
    store._client.put_object(
        Bucket="smyst-memories", Key=f"{CAPSULE_PREFIX}Q1035/capsule.json",
        Body=json.dumps(CAPSULE_DOC).encode(), ContentType="application/json",
    )
    return store


def test_qa_one_transitions_generated_to_reviewed() -> None:
    from app.workers.qa_candidates import qa_one

    store = _prepared_store()
    qid, result = qa_one(
        store.load_candidate_document("Q1035"), store=store, config=CONFIG,
        dry_run=False, chat_fn_factory=lambda capsule: chat_ok,
    )
    assert qid == "Q1035" and result.startswith("reviewed")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "reviewed"
    assert saved["qa_passed"] is True
    assert saved["qa_report"]["checks"]["chat_smoke_test"] == "pass"
    assert saved["audit_trail"][-1]["to_status"] == "reviewed"


def test_qa_one_keeps_generated_without_chat_provider() -> None:
    from app.workers.qa_candidates import qa_one

    store = _prepared_store()
    qid, result = qa_one(
        store.load_candidate_document("Q1035"), store=store, config=CONFIG,
        dry_run=False, chat_fn_factory=lambda capsule: None,
    )
    assert "QA nicht bestanden" in result
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "generated"
    assert saved["qa_passed"] is False
    assert saved["qa_report"]["checks"]["chat_smoke_test"] == "skipped"


def test_run_qa_batch_prioritizes_untested_candidates() -> None:
    """Queue-Fairness: ungetestete Kandidaten vor bereits durchgefallenen.

    Ohne den Fix belegen QA-Verlierer (qa_report vorhanden) bei limit=N die
    vorderen Queue-Plaetze (QID-Sortierung) und ungetestete kommen nie dran.
    """
    from app.workers.build_capsules import CAPSULE_PREFIX
    from app.workers.qa_candidates import run_qa_batch

    store = CandidateStore(FakeS3(), "smyst-memories")
    for qid, name in (("Q1035", "Charles Darwin"), ("Q1339", "Johann Sebastian Bach")):
        candidate = HistoricalCandidate(
            wikidata_qid=qid, name=name, death_date=date(1882, 4, 19),
            category="Wissenschaft", sitelink_count=250, source_count=3,
        )
        store.save_candidate(candidate)
        doc = store.load_candidate_document(qid)
        doc.update(CANDIDATE_DOC, status="generated")
        doc["wikidata_qid"] = qid
        doc["name"] = name
        store.save_candidate_document(qid, doc)
        store._client.put_object(
            Bucket="smyst-memories", Key=f"{CAPSULE_PREFIX}{qid}/capsule.json",
            Body=json.dumps(CAPSULE_DOC).encode(), ContentType="application/json",
        )

    # Q1035 (per QID-Sortierung vorn) ist bereits durchgefallen
    failed = store.load_candidate_document("Q1035")
    failed["qa_report"] = {"passed": False, "issues": ["Chat-Test identity"], "checks": {}}
    failed["qa_passed"] = False
    store.save_candidate_document("Q1035", failed)

    report = run_qa_batch(
        store=store, config=CONFIG, limit=1, dry_run=True,
        run_date=date(2026, 7, 17), chat_fn_factory=lambda capsule: chat_ok,
    )
    assert list(report["results"]) == ["Q1339"]
