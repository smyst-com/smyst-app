"""Der Modell-Vergleich muss fair und ehrlich sein.

Zwei Fehler machen so einen Vergleich wertlos, beide werden hier festgehalten:
1. Ein Unterschied im Rauschen wird als Befund verkauft.
2. Der Bericht verschweigt, dass ein Kandidat Fragen gar nicht beantwortet hat.
"""

from __future__ import annotations

from app.workers.compare_models import (
    NOISE_THRESHOLD_PP,
    _percent,
    build_markdown,
    summarise,
)


def _rows(scores: list[float | None], spread: int = 0) -> list[dict]:
    rows = []
    for index, score in enumerate(scores):
        row = {"id": f"q-{index}", "category": "persona", "twin_name": "T", "score": score}
        if score is not None:
            row["spread"] = spread
        rows.append(row)
    return rows


def test_summary_counts_answered_and_skipped() -> None:
    entry = summarise("m", _rows([1.0, 1.0, None, 0.0]), [100.0, 200.0, 300.0])

    assert entry["quality"]["questions_scored"] == 3
    assert entry["quality"]["questions_skipped"] == 1
    assert entry["first_token_ms"]["median"] == 200.0
    assert entry["first_token_ms"]["samples"] == 3


def test_summary_survives_a_candidate_without_any_latency() -> None:
    """Ein Kandidat, der nie antwortete, darf den Lauf nicht sprengen."""
    entry = summarise("kaputt", _rows([None, None]), [])

    assert entry["quality"]["questions_scored"] == 0
    assert entry["first_token_ms"]["median"] is None
    # 0 bewertete Fragen ergibt score 0.0 — das darf NICHT als "0 %" im
    # Bericht landen, sonst liest es sich wie ein katastrophales Modell.
    assert _percent(entry) is None
    assert "keine Daten" in build_markdown([entry], "kaputt")


def test_small_difference_is_called_noise_not_a_win() -> None:
    baseline = summarise("basis", _rows([1.0, 1.0, 1.0, 1.0]), [500.0])
    # Ein Punkt weniger von vieren waeren 25 pp — deshalb hier gleiche Scores
    # und der Unterschied wird kuenstlich knapp gesetzt.
    challenger = summarise("schnell", _rows([1.0, 1.0, 1.0, 1.0]), [200.0])
    challenger["quality"]["score"] = (
        baseline["quality"]["score"] - (NOISE_THRESHOLD_PP / 2) / 100
    )

    markdown = build_markdown([baseline, challenger], "basis")

    assert "im Rauschen" in markdown
    assert "besser" not in markdown


def test_real_drop_is_named_clearly(monkeypatch) -> None:
    baseline = summarise("basis", _rows([1.0, 1.0, 1.0, 1.0]), [500.0])
    challenger = summarise("schnell", _rows([1.0, 1.0, 1.0, 1.0]), [200.0])
    challenger["quality"]["score"] = baseline["quality"]["score"] - 0.12

    markdown = build_markdown([baseline, challenger], "basis")

    assert "SCHLECHTER" in markdown
    assert "-12.00 pp" in markdown


def test_markdown_names_the_baseline_and_the_noise_floor() -> None:
    baseline = summarise("basis", _rows([1.0]), [500.0])

    markdown = build_markdown([baseline], "basis")

    assert "(aktuell)" in markdown
    assert str(NOISE_THRESHOLD_PP) in markdown
    assert "nicht deutbar" in markdown
