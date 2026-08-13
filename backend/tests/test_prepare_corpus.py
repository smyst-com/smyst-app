"""Tests fuer die Korpus-Planung und den Deutsch-Qualitaetsfilter."""

from __future__ import annotations

import pytest

from app.workers.prepare_corpus import (
    AVG_TOKENS_PER_DOCUMENT,
    DEFAULT_REPLAY_RATIO,
    SAMPLE_TARGET_TOKENS,
    build_pipeline,
    build_source_plan,
    document_limit,
    duplicate_line_ratio,
    german_stopword_ratio,
    is_quality_german,
    plan_summary,
)

GERMAN_PROSE = (
    "Albert Einstein wurde im Jahr 1879 in Ulm geboren und gilt als einer der "
    "bedeutendsten Physiker der Geschichte. Seine Arbeiten zur Relativitaet haben "
    "das Verstaendnis von Raum und Zeit grundlegend veraendert. Er erhielt den "
    "Nobelpreis fuer Physik, allerdings nicht fuer die Relativitaetstheorie, "
    "sondern fuer die Erklaerung des photoelektrischen Effekts, die er in einem "
    "seiner Arbeiten aus dem Jahr 1905 vorgelegt hatte."
)

ENGLISH_PROSE = (
    "Albert Einstein was born in the city of Ulm in the year 1879 and is widely "
    "regarded as one of the most important physicists in history. His work on "
    "relativity changed the way we understand space and time, and he received the "
    "Nobel Prize in Physics for his explanation of the photoelectric effect."
)


def test_plan_hits_target_and_replay_ratio() -> None:
    plan = build_source_plan(12_000_000_000)
    summary = plan_summary(plan)
    assert summary["tokens_total"] == 12_000_000_000
    assert summary["replay_ratio"] == pytest.approx(DEFAULT_REPLAY_RATIO, abs=0.001)
    assert summary["tokens_replay"] > 0


def test_plan_prefers_quality_sources_before_web_dump() -> None:
    plan = build_source_plan(12_000_000_000)
    names = [source.name for source in plan]
    assert names.index("wikipedia_de") < names.index("fineweb2_deu")
    # Der Web-Dump fuellt nur den Rest, ist aber trotzdem die groesste Quelle.
    web = next(source for source in plan if source.name == "fineweb2_deu")
    assert web.token_budget > 0


def test_small_target_skips_web_dump_entirely() -> None:
    plan = build_source_plan(1_000_000_000, replay_ratio=0.0)
    names = [source.name for source in plan]
    assert "wikipedia_de" in names
    assert "fineweb2_deu" not in names  # Wikipedia allein deckt das Budget
    assert plan_summary(plan)["tokens_total"] == 1_000_000_000


def test_sample_mode_budget_is_small_but_complete() -> None:
    summary = plan_summary(build_source_plan(SAMPLE_TARGET_TOKENS))
    assert summary["tokens_total"] == SAMPLE_TARGET_TOKENS
    assert summary["estimated_gb"] < 2.0


def test_zero_replay_ratio_produces_german_only() -> None:
    plan = build_source_plan(5_000_000_000, replay_ratio=0.0)
    assert {source.language for source in plan} == {"de"}
    assert plan_summary(plan)["tokens_replay"] == 0


def test_epochs_reflect_actual_usage() -> None:
    plan = build_source_plan(12_000_000_000)
    wikipedia = next(source for source in plan if source.name == "wikipedia_de")
    assert wikipedia.epochs == 2.0  # kleine Top-Quelle wird doppelt genutzt
    web = next(source for source in plan if source.name == "fineweb2_deu")
    assert web.epochs < 1.0  # vom Web-Dump wird nur ein Bruchteil gebraucht


@pytest.mark.parametrize("bad_target", [0, -1])
def test_invalid_target_rejected(bad_target: int) -> None:
    with pytest.raises(ValueError, match="target_tokens"):
        build_source_plan(bad_target)


@pytest.mark.parametrize("bad_ratio", [-0.1, 1.0, 1.5])
def test_invalid_replay_ratio_rejected(bad_ratio: float) -> None:
    with pytest.raises(ValueError, match="replay_ratio"):
        build_source_plan(1_000_000, replay_ratio=bad_ratio)


def test_german_prose_passes_quality_gate() -> None:
    assert is_quality_german(GERMAN_PROSE) == (True, None)


def test_english_text_is_rejected_as_not_german() -> None:
    ok, reason = is_quality_german(ENGLISH_PROSE)
    assert (ok, reason) == (False, "nicht_deutsch")


def test_short_snippet_is_rejected() -> None:
    assert is_quality_german("Zu kurz.") == (False, "zu_kurz")


def test_symbol_soup_is_rejected() -> None:
    ok, reason = is_quality_german("#" * 150 + "|||" * 60)
    assert (ok, reason) == (False, "zu_wenig_text")


def test_navigation_boilerplate_is_rejected() -> None:
    text = ("Startseite und Impressum\n" * 20) + GERMAN_PROSE
    ok, reason = is_quality_german(text)
    assert (ok, reason) == (False, "boilerplate")


def test_stopword_ratio_separates_languages() -> None:
    assert german_stopword_ratio(GERMAN_PROSE) > 0.10
    assert german_stopword_ratio(ENGLISH_PROSE) < 0.05
    assert german_stopword_ratio("") == 0.0


def test_duplicate_line_ratio() -> None:
    assert duplicate_line_ratio("a\nb\nc") == 0.0
    assert duplicate_line_ratio("a\na\na\na") == pytest.approx(0.75)
    assert duplicate_line_ratio("nur eine Zeile") == 0.0


def test_document_limit_is_bounded_and_never_unlimited() -> None:
    assert document_limit(600_000) == 600_000 // AVG_TOKENS_PER_DOCUMENT
    assert document_limit(0) == 1  # nie unbegrenzt lesen
    assert document_limit(-5) == 1


def test_datatrove_pipeline_wiring(tmp_path) -> None:
    """Prueft die echte datatrove-Verdrahtung, wo die Bibliothek vorhanden ist.

    In CI (ohne datatrove) uebersprungen; auf der Korpus-Maschine faengt der
    Test falsche Signaturen ab, bevor ein mehrstuendiger Lauf startet.
    """
    pytest.importorskip("datatrove")
    source = build_source_plan(1_000_000_000, replay_ratio=0.0)[0]
    steps = build_pipeline(source, str(tmp_path))
    reader = steps[0]
    assert reader.limit == document_limit(source.token_budget)
    assert reader.streaming is True  # sonst laedt der Reader den ganzen Datensatz
    assert [type(step).__name__ for step in steps[1:]] == [
        "GopherRepetitionFilter",
        "GopherQualityFilter",
        "LambdaFilter",
        "JsonlWriter",
    ]
