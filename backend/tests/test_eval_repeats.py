"""Tests fuer die Mehrfachmessung im Modell-Eval.

Anlass (14.08.2026): Zwei Eval-Laeufe auf IDENTISCHEM Code ergaben 95,00 % und
93,75 %. 4 von 40 Fragen wichen ab, persona-007 sogar 2 gegen 0. Der gemessene
"Fortschritt" des Persona-Fixes (1,25 Punkte) lag damit exakt im Rauschen —
er war nicht belegt. Ohne Wiederholungen ist das Instrument blind fuer genau
die Groessenordnung, um die es beim Modelltraining gehen wird.
"""

from __future__ import annotations

from app.workers.run_model_eval import aggregate, run_eval


def _question(id_: str = "persona-001", category: str = "persona") -> dict:
    return {
        "id": id_,
        "category": category,
        "twin_name": "Albert Einstein",
        "language": "de",
        "question": "Wer bist du?",
        "expect": "Bleibt in der Rolle.",
    }


TWINS = {"Albert Einstein": {"id": "curated-albert-einstein"}}


def _ask(twin_id: str, question: str, language: str | None):
    return "Eine Antwort.", "openrouter"


def test_repeats_average_the_scores() -> None:
    verdicts = iter([2, 0, 1])
    rows = run_eval(
        [_question()], TWINS, ask_fn=_ask,
        judge_fn=lambda question, answer: next(verdicts), repeats=3,
    )
    assert rows[0]["scores"] == [2, 0, 1]
    assert rows[0]["score"] == 1.0
    assert rows[0]["spread"] == 2


def test_stable_question_has_no_spread() -> None:
    rows = run_eval(
        [_question()], TWINS, ask_fn=_ask,
        judge_fn=lambda question, answer: 2, repeats=3,
    )
    assert rows[0]["score"] == 2
    assert rows[0]["spread"] == 0


def test_single_repeat_stays_backwards_compatible() -> None:
    rows = run_eval(
        [_question()], TWINS, ask_fn=_ask, judge_fn=lambda question, answer: 2, repeats=1
    )
    assert rows[0]["score"] == 2
    assert rows[0]["scores"] == [2]


def test_unstable_questions_are_named_in_the_summary() -> None:
    """Sie duerfen sich nicht im Mittelwert verstecken — sonst haelt man
    Rauschen wieder fuer Fortschritt."""
    verdicts = iter([2, 0, 2, 2])
    rows = run_eval(
        [_question("persona-007"), _question("fakten-001", "fakten")],
        TWINS, ask_fn=_ask, judge_fn=lambda question, answer: next(verdicts), repeats=2,
    )
    summary = aggregate(rows)
    assert summary["unstable_questions"] == ["persona-007"]


def test_aggregate_handles_averaged_float_scores() -> None:
    rows = [
        {"id": "a", "category": "persona", "score": 1.5, "spread": 1},
        {"id": "b", "category": "persona", "score": 2, "spread": 0},
    ]
    summary = aggregate(rows)
    assert summary["score"] == 0.875
    assert summary["questions_scored"] == 2
    assert summary["unstable_questions"] == ["a"]


def test_chat_error_during_repeats_becomes_a_skip() -> None:
    def flaky(twin_id: str, question: str, language: str | None):
        raise TimeoutError("weg")

    rows = run_eval([_question()], TWINS, ask_fn=flaky,
                    judge_fn=lambda question, answer: 2, repeats=3)
    assert rows[0]["score"] is None
    # Typ UND Meldung: ohne die Meldung sagt der Grund nichts darueber,
    # was der Anbieter abgelehnt hat (16.08.2026).
    assert rows[0]["skip"].startswith("Chat-Fehler TimeoutError")
