"""Tests fuer das geschaerfte Eval-Set v2.

Anlass (14.08.2026): Zwei Dreifachmessungen auf IDENTISCHEM Code ergaben
92,92 % und 94,17 %. Die Verdreifachung der Messungen half NICHT — es kippten
immer dieselben fuenf Fragen. Ursache: ihre Erwartungen buendelten mehrere
Anforderungen in Prosa und enthielten unentscheidbare Kriterien ("Ton
lebendig", "differenziert"). Der Judge musste raten.

v2 aendert NUR die Erwartungstexte dieser fuenf Fragen — Fragen, Twins und
Kategorien bleiben identisch, damit die Antworten weiter vergleichbar sind.
v1 bleibt unveraendert liegen (Einfrier-Regel).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

EVAL_DIR = Path(__file__).resolve().parents[2] / "training" / "eval"
V1 = EVAL_DIR / "smyst-eval-v1.jsonl"
V2 = EVAL_DIR / "smyst-eval-v2.jsonl"

#: Genau diese fuenf kippten zwischen zwei identischen Laeufen.
GESCHAERFT = {"persona-004", "persona-007", "fakten-003", "sprache-006", "grenzen-009"}


def _load(path: Path) -> dict[str, dict]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return {row["id"]: row for row in rows}


def test_v2_has_the_same_questions_as_v1() -> None:
    """Nur die Erwartung darf sich aendern — sonst waeren die Antworten nicht
    mehr vergleichbar und v2 waere ein anderes Set, kein geschaerftes."""
    v1, v2 = _load(V1), _load(V2)
    assert set(v1) == set(v2)
    for qid, row in v2.items():
        for field in ("question", "twin_name", "category", "language"):
            assert row.get(field) == v1[qid].get(field), f"{qid}: {field} weicht ab"


def test_exactly_the_five_unstable_expectations_changed() -> None:
    v1, v2 = _load(V1), _load(V2)
    changed = {qid for qid in v2 if v2[qid]["expect"] != v1[qid]["expect"]}
    assert changed == GESCHAERFT


def test_v1_still_holds_the_original_wording() -> None:
    """Einfrier-Regel: v1 bleibt der unveraenderte Vergleichswert."""
    v1 = _load(V1)
    assert "Ton lebendig" in v1["persona-004"]["expect"]
    assert "differenziert" in v1["sprache-006"]["expect"]


@pytest.mark.parametrize("qid", sorted(GESCHAERFT))
def test_sharpened_expectations_are_enumerable(qid: str) -> None:
    """Der Judge muss benennen koennen, WELCHE Anforderung fehlt. Dafuer
    muessen die Anforderungen nummeriert und einzeln pruefbar sein."""
    expect = _load(V2)[qid]["expect"]
    assert "(1)" in expect and "(2)" in expect
    assert "pruefbare Anforderungen" in expect


@pytest.mark.parametrize(
    ("qid", "ausdruck"),
    [
        ("persona-004", "TON wird NICHT bewertet"),
        ("fakten-003", "Jahreszahlen sind NICHT erforderlich"),
        ("sprache-006", "wird NICHT"),
        ("grenzen-009", "NICHT erforderlich"),
    ],
)
def test_sharpened_expectations_say_what_is_NOT_required(qid: str, ausdruck: str) -> None:
    """Die Kippfaelle entstanden dort, wo unklar war, ob etwas noetig ist
    (Jahreszahl? Telefonnummer? lebendiger Ton?). v2 sagt es ausdruecklich."""
    assert ausdruck in _load(V2)[qid]["expect"]


def test_v2_is_loadable_by_the_runner() -> None:
    from app.workers.run_model_eval import load_eval_set

    questions = load_eval_set(V2)
    assert len(questions) == 40
    assert {question["category"] for question in questions} == {
        "persona", "fakten", "sprache", "grenzen"
    }
