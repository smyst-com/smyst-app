"""Tests fuer Baustein 1: Profil-Evals (Domain + Worker)."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

from app.ai.profile_evals import (
    MAX_FEEDBACK_CASES,
    build_eval_questions,
    build_feedback_questions,
    build_profile_questions,
    evaluate_eval_answers,
    run_profile_eval,
)
from app.ai.qa_checks import QA_QUESTIONS, ChatProviderDegradedError
from app.integrations.candidate_store import CANDIDATE_PREFIX, CandidateStore
from app.workers.build_capsules import CAPSULE_PREFIX
from app.workers.eval_profiles import run_eval_batch

CANDIDATE_DOC = {
    "wikidata_qid": "Q1035",
    "name": "Charles Darwin",
    "birth_date": "1809-02-12",
    "death_date": "1882-04-19",
    "category": "Wissenschaft",
    "status": "published",
}

GOOD_ANSWERS = {
    "identity": "Ich bin das KI-Profil von Charles Darwin, eine KI-Rekonstruktion auf Basis oeffentlicher Quellen.",
    "lifework": "Mein wichtigstes Werk ist die Evolutionstheorie, dargelegt in 'On the Origin of Species'.",
    "after_death": "Das Internet entstand lange nach meiner Zeit, dazu habe ich keine eigene Erfahrung.",
    "language": "I was born in Shrewsbury, England, in the year 1809.",
    "trap": "Nein, das stimmt nicht — dafuer gibt es keine Belege in meinen Quellen.",
    "profile_birth": "Geboren wurde ich im Jahr 1809 in Shrewsbury.",
    "profile_last_years": "Meine letzten Jahre verbrachte ich in Down House mit Studien an Regenwuermern.",
    "profile_category": "Die Reise mit der HMS Beagle fuehrte mich zur Naturforschung und Wissenschaft.",
}


# --- Fragen-Erzeugung ---

def test_build_profile_questions_from_master_data() -> None:
    questions = build_profile_questions(CANDIDATE_DOC)
    ids = [q["id"] for q in questions]
    assert ids == ["profile_birth", "profile_last_years", "profile_category"]
    birth = questions[0]
    assert birth["kind"] == "expect_text" and birth["expect"] == "1809"
    assert "Wissenschaft" in questions[2]["frage"]


def test_build_profile_questions_skips_missing_data() -> None:
    assert build_profile_questions({"wikidata_qid": "Q1"}) == []


def test_build_feedback_questions_filters_dedupes_and_limits() -> None:
    records = [
        {"rating": "up", "question": "Gute Frage?", "createdAt": 99},
        {"rating": "down", "question": "  ", "createdAt": 98},
        {"rating": "down", "question": "Was haeltst du von Regenwuermern?", "answer": "Schlecht.", "createdAt": 5},
        {"rating": "report", "question": "was haeltst du von REGENWUERMERN?", "answer": "Egal.", "createdAt": 7},
    ] + [
        {"rating": "down", "question": f"Frage Nummer {i}?", "answer": "x", "createdAt": 10 + i}
        for i in range(MAX_FEEDBACK_CASES + 3)
    ]
    cases = build_feedback_questions(records)
    assert len(cases) == MAX_FEEDBACK_CASES
    texts = [case["frage"] for case in cases]
    assert len({" ".join(t.casefold().split()) for t in texts}) == len(texts)
    assert all(case["kind"] == "improve_on" for case in cases)


def test_build_eval_questions_combines_all_sources() -> None:
    questions = build_eval_questions(
        CANDIDATE_DOC, [{"rating": "down", "question": "Warum Tauben?", "answer": "…", "createdAt": 1}]
    )
    ids = [q["id"] for q in questions]
    assert ids[: len(QA_QUESTIONS)] == [q["id"] for q in QA_QUESTIONS]
    assert "profile_birth" in ids and "feedback_1" in ids


# --- Bewertung ---

def test_evaluate_expect_text_requires_birth_year() -> None:
    questions = build_eval_questions(CANDIDATE_DOC, [])
    answers = dict(GOOD_ANSWERS, profile_birth="Das weiss ich nicht mehr so genau, es ist lange her.")
    results, issues = evaluate_eval_answers(questions, answers, CANDIDATE_DOC)
    assert results["profile_birth"] == "fail"
    assert any("1809" in issue for issue in issues)
    assert results["identity"] == "pass" and results["profile_category"] == "pass"


def test_evaluate_improve_on_fails_when_answer_unchanged() -> None:
    bad = "Dazu sage ich nichts."
    feedback = [{"rating": "down", "question": "Warum Tauben?", "answer": bad, "createdAt": 1}]
    questions = build_eval_questions(CANDIDATE_DOC, feedback)
    answers = dict(GOOD_ANSWERS, feedback_1="  dazu   SAGE ich nichts. ")
    results, issues = evaluate_eval_answers(questions, answers, CANDIDATE_DOC)
    assert results["feedback_1"] == "fail"
    assert any("gemeldeten schlechten Antwort" in issue for issue in issues)

    answers["feedback_1"] = "Tauben zuechtete ich, um Variation unter Haustieren zu studieren."
    results, _ = evaluate_eval_answers(questions, answers, CANDIDATE_DOC)
    assert results["feedback_1"] == "pass"


def test_run_profile_eval_scores_and_flags_regression() -> None:
    def chat_fn(question: str) -> str:
        for q in build_eval_questions(CANDIDATE_DOC, []):
            if q["frage"] == question:
                return GOOD_ANSWERS.get(q["id"], "Ausreichend lange Antwort fuer die Pruefung.")
        return "Ausreichend lange Antwort fuer die Pruefung."

    report = run_profile_eval(CANDIDATE_DOC, [], chat_fn=chat_fn, previous_score=0.5)
    assert report.score == 1.0
    assert report.regression is False

    def broken_chat_fn(question: str) -> str:
        return "zu kurz"

    worse = run_profile_eval(CANDIDATE_DOC, [], chat_fn=broken_chat_fn, previous_score=report.score)
    assert worse.score < report.score
    assert worse.regression is True
    assert worse.as_document()["previous_score"] == 1.0


# --- Worker ---

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


def _store_with_published(qids: list[str]) -> tuple[CandidateStore, FakeS3]:
    client = FakeS3()
    store = CandidateStore(client, "test-bucket")
    for qid in qids:
        doc = dict(CANDIDATE_DOC, wikidata_qid=qid)
        client.objects[f"{CANDIDATE_PREFIX}{qid}.json"] = json.dumps(doc).encode("utf-8")
        client.objects[f"{CAPSULE_PREFIX}{qid}/capsule.json"] = json.dumps(
            {"persona_prompt": "Profil.", "slug": f"slug-{qid.lower()}"}
        ).encode("utf-8")
    return store, client


def _good_chat_factory(capsule_doc):
    def chat_fn(question: str) -> str:
        for q in build_eval_questions(CANDIDATE_DOC, []):
            if q["frage"] == question:
                return GOOD_ANSWERS.get(q["id"], "Ausreichend lange Antwort fuer die Pruefung.")
        return "Ausreichend lange Antwort fuer die Pruefung."

    return chat_fn


def test_run_eval_batch_saves_report_history_and_changelog() -> None:
    store, client = _store_with_published(["Q1", "Q2"])
    report = run_eval_batch(
        store=store,
        limit=10,
        dry_run=False,
        run_date=date(2026, 8, 1),
        chat_fn_factory=_good_chat_factory,
        feedback_loader=lambda slug: [],
        now=datetime(2026, 8, 1, 6, 0, tzinfo=timezone.utc),
    )
    assert set(report["results"]) == {"Q1", "Q2"}
    assert report["regressions"] == []
    saved = store.load_candidate_document("Q1")
    assert saved["eval_report"]["score"] == 1.0
    assert saved["eval_report"]["finished_at"].startswith("2026-08-01")
    assert len(saved["eval_history"]) == 1
    assert saved["status"] == "published"  # Status bleibt unangetastet
    assert any(key.endswith("2026-08-01-evals.json") for key in client.objects)


def test_run_eval_batch_prefers_never_evaluated_profiles() -> None:
    store, client = _store_with_published(["Q1", "Q2"])
    doc = store.load_candidate_document("Q1")
    doc["eval_report"] = {"score": 1.0, "finished_at": "2026-07-01T06:00:00+00:00"}
    client.objects[f"{CANDIDATE_PREFIX}Q1.json"] = json.dumps(doc).encode("utf-8")

    report = run_eval_batch(
        store=store,
        limit=1,
        dry_run=True,
        run_date=date(2026, 8, 1),
        chat_fn_factory=_good_chat_factory,
        feedback_loader=lambda slug: [],
    )
    assert list(report["results"]) == ["Q2"]


def test_run_eval_batch_detects_regression_and_skips_degraded() -> None:
    store, client = _store_with_published(["Q1", "Q2"])
    doc = store.load_candidate_document("Q1")
    doc["eval_report"] = {"score": 1.0, "finished_at": "2026-07-01T06:00:00+00:00"}
    client.objects[f"{CANDIDATE_PREFIX}Q1.json"] = json.dumps(doc).encode("utf-8")

    def factory(capsule_doc):
        if capsule_doc.get("slug") == "slug-q2":
            def degraded(question: str) -> str:
                raise ChatProviderDegradedError("provider=fallback")

            return degraded

        def short(question: str) -> str:
            return "zu kurz"

        return short

    report = run_eval_batch(
        store=store,
        limit=10,
        dry_run=False,
        run_date=date(2026, 8, 1),
        chat_fn_factory=factory,
        feedback_loader=lambda slug: [],
    )
    assert report["regressions"] == ["Q1"]
    assert "unbewertet" in report["results"]["Q2"]
    # Degradiertes Profil bleibt ohne eval_report
    assert "eval_report" not in store.load_candidate_document("Q2")
