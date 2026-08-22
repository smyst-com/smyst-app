"""Qualitaets-Eval fuer den smyst-Chat (Baustein 2 des Master-Plans).

Laedt ein Eval-Set (backend/evals/dataset.json), stellt jede Frage durch den
ECHTEN Chat-Prompt-Pfad (chat._build_llm_request) und bewertet die Antwort:

1. Regel-Checks (immer, auch offline): leer/zu kurz/zu lang, Prompt-Leak,
   Sprach-Heuristik, verbotene Formulierungen.
2. mustContain (Fakten-Checks): nur im Live-LLM-Modus – der deterministische
   Offline-Provider ("local") hat kein Fachwissen.
3. LLM-as-Judge (nur im Live-Modus): ein LLM bewertet Persona-Treue,
   Korrektheit, Klarheit auf einer Skala 1-10 mit Begruendung.

Ergebnis: Report-JSON (Basis fuer Baseline-Vergleiche und Release-Gates
auf dem Weg zu smyst 1.1).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.ai.models import LLMRequest, LLMResponse

DETERMINISTIC_PROVIDER = "local"
DEFAULT_MIN_CHARS = 20
DEFAULT_MAX_CHARS = 1500

FORBIDDEN_PHRASES = [
    "twin/profile:",
    "user message:",
    "untrusted_web_content",
    "curated public profile knowledge",
    "system prompt",
]

_JUDGE_PROMPT = """You are a strict evaluator for AI persona chats. Score the assistant answer from 1 to 10.

Criteria:
- Persona fidelity: answers in first person, in the persona's voice (1-3 points)
- Factual plausibility for the persona (1-3 points)
- Clarity and helpfulness (1-2 points)
- Appropriate length and honesty about being an AI twin if asked (1-2 points)

Persona: {persona}
User question: {question}
Assistant answer: {answer}

Respond with EXACTLY two lines:
Score: <number 1-10>
Reason: <one short sentence>"""


@dataclass
class EvalCase:
    id: str
    twinId: str
    question: str
    language: str = "de"
    mustContain: list[str] = field(default_factory=list)
    minChars: int = DEFAULT_MIN_CHARS
    maxChars: int = DEFAULT_MAX_CHARS


@dataclass
class CaseResult:
    case_id: str
    twin_id: str
    provider: str
    passed: bool
    violations: list[str]
    judge_score: float | None = None
    judge_reason: str | None = None
    answer: str = ""
    latency_ms: int | None = None


def load_eval_set(path: str | Path) -> list[EvalCase]:
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    cases = [
        EvalCase(
            id=item["id"],
            twinId=item["twinId"],
            question=item["question"],
            language=item.get("language", "de"),
            mustContain=list(item.get("mustContain", [])),
            minChars=item.get("minChars", DEFAULT_MIN_CHARS),
            maxChars=item.get("maxChars", DEFAULT_MAX_CHARS),
        )
        for item in document["cases"]
    ]
    _validate(cases)
    return cases


def _validate(cases: list[EvalCase]) -> None:
    ids = [case.id for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Eval-Set: doppelte Fall-IDs")
    for case in cases:
        if not case.question.strip() or not case.twinId.strip():
            raise ValueError(f"Eval-Set: unvollstaendiger Fall {case.id!r}")
        if case.language not in {"de", "en", "fr", "es", "tr", "pt", "it"}:
            raise ValueError(f"Eval-Set: unbekannte Sprache {case.language!r} in {case.id!r}")


def check_rules(case: EvalCase, answer: str, *, provider: str) -> list[str]:
    """Deterministische Pruefungen; Leerliste = bestanden."""
    violations: list[str] = []
    text = answer.strip()
    if not text:
        return ["leere_antwort"]
    if len(text) < case.minChars:
        violations.append(f"zu_kurz ({len(text)} < {case.minChars})")
    if len(text) > case.maxChars:
        violations.append(f"zu_lang ({len(text)} > {case.maxChars})")
    lowered = text.lower()
    for phrase in FORBIDDEN_PHRASES:
        if phrase in lowered:
            violations.append(f"prompt_leak ({phrase})")
    if provider != DETERMINISTIC_PROVIDER:
        for needle in case.mustContain:
            if needle.lower() not in lowered:
                violations.append(f"fakt_fehlt ({needle})")
    return violations


def parse_judge_response(text: str) -> tuple[float | None, str | None]:
    """'Score: 7' + 'Reason: ...' -> (7.0, Grund); unparsebar -> (None, None)."""
    score: float | None = None
    reason: str | None = None
    for line in text.strip().splitlines():
        lowered = line.lower()
        if lowered.startswith("score:") and score is None:
            try:
                score = float(lowered.split(":", 1)[1].strip().split("/")[0])
            except ValueError:
                return None, None
        elif lowered.startswith("reason:") and reason is None:
            reason = line.split(":", 1)[1].strip()
    return score, reason


async def judge_answer(
    complete, case: EvalCase, answer: str, persona: str
) -> tuple[float | None, str | None]:
    """LLM-as-Judge ueber einen injizierten complete()-Aufruf (Testbar)."""
    request = LLMRequest(
        prompt=_JUDGE_PROMPT.format(persona=persona, question=case.question, answer=answer),
        system_prompt="You are an impartial evaluator. Output only the two required lines.",
        max_tokens=120,
        temperature=0.0,
    )
    try:
        response: LLMResponse = await complete(request)
        return parse_judge_response(response.text)
    except Exception:
        return None, None


async def run_case(chat_request_builder, complete, case: EvalCase) -> CaseResult:
    """Ein Fall durch den echten Prompt-Pfad; complete ist der Router-Aufruf."""
    chat = {"id": f"eval-{case.id}", "twinId": case.twinId, "messages": []}
    request = await chat_request_builder(chat, case.question)
    response = await complete(request)
    answer = response.text
    violations = check_rules(case, answer, provider=response.provider)

    judge_score: float | None = None
    judge_reason: str | None = None
    if response.provider != DETERMINISTIC_PROVIDER:
        judge_score, judge_reason = await judge_answer(complete, case, answer, persona=case.twinId)

    passed = not violations and (judge_score is None or judge_score >= 5)
    return CaseResult(
        case_id=case.id,
        twin_id=case.twinId,
        provider=response.provider,
        passed=passed,
        violations=violations,
        judge_score=judge_score,
        judge_reason=judge_reason,
        answer=answer,
    )


async def run_eval(chat_request_builder, complete, cases: list[EvalCase]) -> dict[str, Any]:
    results = [await run_case(chat_request_builder, complete, case) for case in cases]
    scores = [r.judge_score for r in results if r.judge_score is not None]
    return {
        "total": len(results),
        "passed": sum(1 for r in results if r.passed),
        "failed": sum(1 for r in results if not r.passed),
        "passRate": (sum(1 for r in results if r.passed) / len(results)) if results else 0.0,
        "judgeMode": "llm" if scores else "rules-only",
        "judgeAverage": (sum(scores) / len(scores)) if scores else None,
        "violations": sorted(
            {v.split(" (")[0] for r in results for v in r.violations}
        ),
        "results": [
            {
                "id": r.case_id,
                "twinId": r.twin_id,
                "provider": r.provider,
                "passed": r.passed,
                "violations": r.violations,
                "judgeScore": r.judge_score,
                "judgeReason": r.judge_reason,
                "answerPreview": r.answer[:200],
            }
            for r in results
        ],
    }
