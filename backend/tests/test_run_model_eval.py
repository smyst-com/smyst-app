"""Tests fuer den Modell-Eval-Runner (workers/run_model_eval)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.workers.run_model_eval import (
    DEGRADED_MODE,
    DegradedProviderError,
    aggregate,
    load_eval_set,
    parse_judge_verdict,
    resolve_twins,
    run_eval,
)

EVAL_SET_PATH = Path(__file__).resolve().parents[2] / "training" / "eval" / "smyst-eval-v1.jsonl"


def _question(id_: str = "persona-001", twin: str = "Albert Einstein", category: str = "persona") -> dict:
    return {
        "id": id_,
        "category": category,
        "twin_name": twin,
        "language": "de",
        "question": "Wer bist du?",
        "expect": "Bleibt in der Rolle.",
    }


def test_load_eval_set_reads_repo_v1() -> None:
    questions = load_eval_set(EVAL_SET_PATH)
    assert len(questions) == 40
    assert {question["category"] for question in questions} == {"persona", "fakten", "sprache", "grenzen"}
    assert len({question["id"] for question in questions}) == 40


def test_eval_set_twins_are_live_twins() -> None:
    """Jeder Twin im Set muss aufloesbar sein — sonst ist die Baseline luecken-
    haft. Genau das lief beim ersten Trockenlauf auf: 'Kleopatra' existiert
    nicht, 10 von 40 Fragen waeren stumm ausgefallen."""
    names = {question["twin_name"] for question in load_eval_set(EVAL_SET_PATH)}
    assert "Kleopatra" not in names
    # Die Namen muessen exakt so heissen wie in der Twin-API (kuratierte Twins).
    assert names == {
        "Albert Einstein",
        "Marie Curie",
        "Johann Wolfgang von Goethe",
        "Wolfgang Amadeus Mozart",
        "Leonardo da Vinci",
        "Julius Caesar",
    }


def test_load_eval_set_rejects_missing_field(tmp_path) -> None:
    broken = tmp_path / "eval.jsonl"
    broken.write_text(json.dumps({"id": "x", "category": "persona"}) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="twin_name"):
        load_eval_set(broken)


def test_resolve_twins_is_case_insensitive_and_exact_only() -> None:
    twins = [
        {"name": "Albert Einstein", "id": "curated-albert-einstein"},
        {"name": "Marie Curie", "id": "curated-marie-curie"},
    ]
    resolved = resolve_twins(twins, {"albert einstein", "Marie Curie", "Einstein"})
    assert resolved["albert einstein"]["id"] == "curated-albert-einstein"
    assert resolved["Marie Curie"]["id"] == "curated-marie-curie"
    assert "Einstein" not in resolved  # kein Teilstring-Raten


def test_resolve_twins_prefers_curated_on_name_collision() -> None:
    """Bei Namensgleichheit muss der kuratierte Twin gewinnen — er hat die
    handgepflegte Persona, die das Eval-Set meint."""
    twins = [
        {"name": "Julius Caesar", "id": "pipeline-julius-caesar"},
        {"name": "Julius Caesar", "id": "curated-julius-caesar"},
    ]
    assert resolve_twins(twins, {"Julius Caesar"})["Julius Caesar"]["id"] == "curated-julius-caesar"
    # ... auch wenn der kuratierte zuerst kommt
    assert resolve_twins(twins[::-1], {"Julius Caesar"})["Julius Caesar"]["id"] == "curated-julius-caesar"


def test_resolve_twins_ignores_nameless_entries() -> None:
    assert resolve_twins([{"id": "x", "name": ""}, {"id": "y"}], {"Irgendwer"}) == {}


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


def _run(questions, twins, *, judge=lambda question, answer: 2, ask=None):
    return run_eval(
        questions,
        twins,
        ask_fn=ask or (lambda twin_id, question, language: ("Eine Antwort.", "openrouter")),
        judge_fn=judge,
    )


def test_run_eval_scores_and_skips() -> None:
    questions = [_question(), _question("fakten-001", twin="Unbekannt", category="fakten")]
    rows = _run(questions, {"Albert Einstein": {"id": "curated-albert-einstein"}})
    assert rows[0]["score"] == 2
    assert rows[0]["mode"] == "openrouter"
    assert rows[1]["score"] is None
    assert rows[1]["skip"] == "twin nicht aufloesbar"


def test_run_eval_passes_twin_id_and_language_to_chat() -> None:
    seen: list[tuple[str, str, str | None]] = []

    def ask(twin_id: str, question: str, language: str | None):
        seen.append((twin_id, question, language))
        return "Antwort", "openrouter"

    _run([_question()], {"Albert Einstein": {"id": "curated-albert-einstein"}}, ask=ask)
    assert seen == [("curated-albert-einstein", "Wer bist du?", "de")]


def test_run_eval_aborts_on_degraded_fallback() -> None:
    """Eine Not-Fallback-Antwort hat keinen Bezug zur Persona — sie zu bewerten
    ergaebe eine erfundene Baseline."""
    def ask(twin_id: str, question: str, language: str | None):
        return "Ich bin gerade nicht erreichbar.", DEGRADED_MODE

    with pytest.raises(DegradedProviderError, match="Not-Fallback"):
        _run([_question()], {"Albert Einstein": {"id": "x"}}, ask=ask)


def test_run_eval_chat_error_becomes_skip() -> None:
    def ask(twin_id: str, question: str, language: str | None):
        raise TimeoutError("zu langsam")

    rows = _run([_question()], {"Albert Einstein": {"id": "x"}}, ask=ask)
    assert rows[0]["score"] is None
    assert rows[0]["skip"] == "Chat-Fehler TimeoutError"


def test_run_eval_empty_answer_becomes_skip() -> None:
    rows = _run(
        [_question()],
        {"Albert Einstein": {"id": "x"}},
        ask=lambda twin_id, question, language: ("   ", "openrouter"),
    )
    assert rows[0]["skip"] == "leere Antwort"


def test_run_eval_unreadable_judge_becomes_skip() -> None:
    rows = _run([_question()], {"Albert Einstein": {"id": "x"}}, judge=lambda question, answer: None)
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
