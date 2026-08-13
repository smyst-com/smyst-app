"""Tests fuer den Modell-Eval-Runner (workers/run_model_eval)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.ai.qa_checks import ChatProviderDegradedError
from app.workers.run_model_eval import (
    aggregate,
    load_eval_set,
    parse_judge_verdict,
    resolve_twins,
    run_eval,
)


def _question(id_: str = "persona-001", twin: str = "Albert Einstein", category: str = "persona") -> dict:
    return {"id": id_, "category": category, "twin_name": twin, "question": "Wer bist du?", "expect": "Bleibt in der Rolle."}


def test_load_eval_set_reads_repo_v1() -> None:
    path = Path(__file__).resolve().parents[2] / "training" / "eval" / "smyst-eval-v1.jsonl"
    questions = load_eval_set(path)
    assert len(questions) == 40
    assert {question["category"] for question in questions} == {"persona", "fakten", "sprache", "grenzen"}
    assert len({question["id"] for question in questions}) == 40


def test_load_eval_set_rejects_missing_field(tmp_path) -> None:
    broken = tmp_path / "eval.jsonl"
    broken.write_text(json.dumps({"id": "x", "category": "persona"}) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="twin_name"):
        load_eval_set(broken)


def test_resolve_twins_is_case_insensitive_and_exact_only() -> None:
    documents = [
        {"name": "Albert Einstein", "wikidata_qid": "Q937"},
        {"name": "Marie Curie", "wikidata_qid": "Q7186"},
    ]
    twins = resolve_twins(documents, {"albert einstein", "Marie Curie", "Einstein"})
    assert twins["albert einstein"]["wikidata_qid"] == "Q937"
    assert twins["Marie Curie"]["wikidata_qid"] == "Q7186"
    assert "Einstein" not in twins  # kein Teilstring-Raten


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('{"score": 2, "grund": "gut"}', 2),
        ('Vorwort {"score": 0} Nachwort', 0),
        ("Score: 1", 1),
        ('{"score": 7}', 2),  # auf Skala geklemmt
        ("voellig unlesbar", None),
        ("", None),
    ],
)
def test_parse_judge_verdict(raw: str, expected: int | None) -> None:
    assert parse_judge_verdict(raw) == expected


def _run(questions, twins, *, judge=lambda question, answer: 2, chat=lambda q: "Antwort"):
    return run_eval(
        questions,
        twins,
        chat_fn_factory=lambda capsule: chat,
        judge_fn=judge,
        capsule_loader=lambda document: document,
    )


def test_run_eval_scores_and_skips() -> None:
    questions = [_question(), _question("fakten-001", twin="Unbekannt", category="fakten")]
    rows = _run(questions, {"Albert Einstein": {"wikidata_qid": "Q937"}})
    assert rows[0]["score"] == 2
    assert rows[1]["score"] is None
    assert rows[1]["skip"] == "twin nicht aufloesbar"


def test_run_eval_degraded_provider_aborts() -> None:
    def degraded(question: str) -> str:
        raise ChatProviderDegradedError("fallback")

    with pytest.raises(ChatProviderDegradedError):
        _run([_question()], {"Albert Einstein": {}}, chat=degraded)


def test_run_eval_unreadable_judge_becomes_skip() -> None:
    rows = _run([_question()], {"Albert Einstein": {}}, judge=lambda question, answer: None)
    assert rows[0]["score"] is None
    assert rows[0]["skip"] == "Judge-Antwort unlesbar"


def test_aggregate_scores_by_category() -> None:
    rows = [
        {"category": "persona", "score": 2},
        {"category": "persona", "score": 1},
        {"category": "fakten", "score": 0},
        {"category": "fakten", "score": None, "skip": "twin nicht aufloesbar"},
    ]
    summary = aggregate(rows)
    assert summary["questions_total"] == 4
    assert summary["questions_scored"] == 3
    assert summary["questions_skipped"] == 1
    assert summary["by_category"]["persona"] == 0.75
    assert summary["by_category"]["fakten"] == 0.0
    assert summary["score"] == 0.5
