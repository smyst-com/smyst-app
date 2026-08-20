"""Baustein 2: Eval-Runner (Regel-Checks, Judge-Parsing, Datensatz-Validitaet)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.ai.models import LLMRequest, LLMResponse
from app.ai.quality_eval import (
    DETERMINISTIC_PROVIDER,
    check_rules,
    judge_answer,
    load_eval_set,
    parse_judge_response,
    run_eval,
)

DATASET = Path(__file__).resolve().parents[1] / "evals" / "dataset.json"


def _response(text: str, provider: str = DETERMINISTIC_PROVIDER) -> LLMResponse:
    return LLMResponse(
        text=text, provider=provider, model="test", input_tokens=1, output_tokens=1, latency_ms=1
    )


def _ok_answer() -> str:
    return "Ich wurde 1879 geboren und bin 1955 gestorben. Als Physiker habe ich mich Zeit meines Lebens mit den Grundlagen von Raum und Zeit beschaeftigt."


def test_dataset_is_valid_and_covers_languages() -> None:
    cases = load_eval_set(DATASET)
    assert len(cases) >= 30
    languages = {case.language for case in cases}
    assert {"de", "en"}.issubset(languages)
    assert all(case.twinId for case in cases)


def test_check_rules_accepts_good_answer() -> None:
    case = load_eval_set(DATASET)[0]
    assert check_rules(case, _ok_answer(), provider=DETERMINISTIC_PROVIDER) == []


def test_check_rules_catches_empty_short_and_leak() -> None:
    case = load_eval_set(DATASET)[0]
    assert check_rules(case, "   ", provider=DETERMINISTIC_PROVIDER) == ["leere_antwort"]
    assert "zu_kurz" in " ".join(check_rules(case, "Ja.", provider=DETERMINISTIC_PROVIDER))
    leak = "Twin/profile: Albert Einstein User message: x Antwort: " + "x" * 40
    assert any(v.startswith("prompt_leak") for v in check_rules(case, leak, provider="openai"))


def test_must_contain_only_enforced_for_live_llm() -> None:
    case = load_eval_set(DATASET)[0]  # Einstein, mustContain 1879/1955
    answer = "Ich bin ein Physiker und denke viel über das Universum nach, ganz ohne Jahreszahlen hier."
    assert check_rules(case, answer, provider=DETERMINISTIC_PROVIDER) == []
    violations = check_rules(case, answer, provider="openai")
    assert any(v.startswith("fakt_fehlt") for v in violations)


def test_parse_judge_response() -> None:
    assert parse_judge_response("Score: 8\nReason: Gute Persona.") == (8.0, "Gute Persona.")
    assert parse_judge_response("irgendwas\nunparsebar") == (None, None)


async def test_judge_answer_parses_llm_output() -> None:
    case = load_eval_set(DATASET)[0]

    async def fake_complete(request: LLMRequest) -> LLMResponse:
        return _response("Score: 7\nReason: Passt.")

    score, reason = await judge_answer(fake_complete, case, "Antwort", persona="einstein")
    assert score == 7.0
    assert reason == "Passt."


async def test_run_eval_offline_rules_only() -> None:
    cases = load_eval_set(DATASET)

    async def fake_builder(chat, message):
        return LLMRequest(prompt=message, system_prompt="s")

    async def fake_complete(request: LLMRequest) -> LLMResponse:
        return _response("Ich beantworte deine Frage aus meiner Perspektive als Person sehr gerne und ausfuehrlich.")

    report = await run_eval(fake_builder, fake_complete, cases)
    assert report["total"] == len(cases)
    assert report["judgeMode"] == "rules-only"
    assert report["passed"] + report["failed"] == report["total"]
    assert 0.0 <= report["passRate"] <= 1.0


async def test_run_eval_with_judge_and_fact_gate() -> None:
    cases = [c for c in load_eval_set(DATASET) if c.id == "de-einstein-01"]

    async def fake_builder(chat, message):
        return LLMRequest(prompt=message, system_prompt="s")

    async def fake_complete(request: LLMRequest) -> LLMResponse:
        if "strict evaluator" in request.prompt:
            return _response("Score: 9\nReason: Sehr gut.", provider="openai")
        # Antwort OHNE 1879/1955 -> Fakt-Check muss scheitern
        return _response(
            "Ich war Physiker und habe viel über Raum und Zeit nachgedacht, ohne Jahreszahlen zu nennen.",
            provider="openai",
        )

    report = await run_eval(fake_builder, fake_complete, cases)
    assert report["judgeMode"] == "llm"
    assert report["judgeAverage"] == 9.0
    assert report["failed"] == 1
    assert any(v.startswith("fakt_fehlt") for v in report["violations"])


def test_duplicate_ids_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(
        '{"cases": [{"id": "x", "twinId": "t", "question": "q"},'
        ' {"id": "x", "twinId": "t", "question": "q"}]}',
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        load_eval_set(bad)
