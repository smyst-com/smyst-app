from __future__ import annotations

import re

from app.ai.models import ModerationDecision, ModerationResult, Sensitivity


class ModerationLayer:
    """Rule-based safety baseline.

    This does not replace provider moderation. It is the local policy gate that
    always runs before retrieval, after retrieval, and after LLM generation.
    """

    prompt_injection_patterns = [
        re.compile(r"ignore (all )?(previous|prior) instructions", re.I),
        re.compile(r"reveal (the )?(system prompt|developer message|policy)", re.I),
        re.compile(r"act as (an )?(unrestricted|jailbroken)", re.I),
        re.compile(r"bypass (safety|policy|moderation|permissions)", re.I),
    ]

    high_risk_patterns = [
        re.compile(r"\b(password|api[_ -]?key|secret key|private key)\b", re.I),
        re.compile(r"\b(passport|national id|social security|ssn)\b", re.I),
        re.compile(r"\b(self[- ]?harm|suicide|kill myself)\b", re.I),
    ]

    sensitive_patterns = [
        re.compile(r"\b(health|diagnosis|religion|political|sexual|trauma|bank account)\b", re.I),
        re.compile(r"\b(stimme|gesundheit|religion|politik|trauma|konto)\b", re.I),
    ]

    def classify_sensitivity(self, text: str) -> Sensitivity:
        if any(pattern.search(text) for pattern in self.high_risk_patterns):
            return Sensitivity.HIGHLY_SENSITIVE
        if any(pattern.search(text) for pattern in self.sensitive_patterns):
            return Sensitivity.SENSITIVE
        return Sensitivity.PRIVATE

    def moderate_text(self, text: str, *, context: str) -> ModerationResult:
        categories: list[str] = []
        if any(pattern.search(text) for pattern in self.prompt_injection_patterns):
            categories.append("prompt_injection")
        if any(pattern.search(text) for pattern in self.high_risk_patterns):
            categories.append("high_risk_sensitive")

        if "prompt_injection" in categories and context in {"uploaded_content", "retrieval_context"}:
            return ModerationResult(
                decision=ModerationDecision.WARN,
                categories=categories,
                reason="Prompt injection markers found and isolated from system instructions.",
            )

        if "high_risk_sensitive" in categories and context == "public_answer":
            return ModerationResult(
                decision=ModerationDecision.BLOCK,
                categories=categories,
                reason="High-risk sensitive content cannot be disclosed in a public answer.",
            )

        return ModerationResult(
            decision=ModerationDecision.ALLOW if not categories else ModerationDecision.WARN,
            categories=categories,
            reason="Allowed by local moderation baseline.",
        )

