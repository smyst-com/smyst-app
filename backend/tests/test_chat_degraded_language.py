"""Tests: die Wartemeldung bei Provider-Ausfall kommt in Nutzersprache.

Live beobachtet am 15.08.2026 waehrend eines kompletten Provider-Ausfalls
(OpenRouter 403, DeepSeek 402, OpenAI/Groq 429, Anthropic/xAI/Gemini 400):
Ein Chat mit language="de" bekam die ENGLISCHE Meldung "I'm sorry - I can't
reach my knowledge right now", obwohl die deutsche Uebersetzung existiert.

Ursache: _build_llm_request setzte keine metadata. resolve_degraded_language
sucht die Sprache zuerst dort und faellt sonst auf den Voice-Marker im Prompt
zurueck — den setzt aber nur der Sprach-Pfad. Im Text-Chat blieb nichts uebrig.
"""

from __future__ import annotations

import pytest

from app.ai.degraded_messages import degraded_fallback_message
from app.api.v1.routes.chat import _build_llm_request

CHAT = {"id": "c1", "twinId": None, "messages": []}


@pytest.mark.parametrize("code", ["de", "tr", "fr", "es", "ja"])
async def test_language_reaches_the_request_metadata(code: str) -> None:
    request = await _build_llm_request(CHAT, "Hallo", code)
    assert request.metadata.get("language") == code


async def test_german_chat_gets_the_german_waiting_message() -> None:
    """Der eigentliche Fehlerfall vom 15.08.2026."""
    request = await _build_llm_request(CHAT, "Wer bist du?", "de")
    message = degraded_fallback_message(request.prompt, request.metadata)
    assert message.startswith("Entschuldige")
    assert "I'm sorry" not in message


async def test_turkish_chat_gets_the_turkish_waiting_message() -> None:
    request = await _build_llm_request(CHAT, "Kimsin?", "tr")
    assert degraded_fallback_message(request.prompt, request.metadata).startswith("Uzgunum")


async def test_without_language_english_stays_the_fallback() -> None:
    request = await _build_llm_request(CHAT, "Who are you?", None)
    assert request.metadata == {}
    assert degraded_fallback_message(request.prompt, request.metadata).startswith("I'm sorry")


async def test_unknown_language_falls_back_to_english_without_crashing() -> None:
    request = await _build_llm_request(CHAT, "Hallo", "xx")
    assert degraded_fallback_message(request.prompt, request.metadata).startswith("I'm sorry")


async def test_web_research_evidence_keeps_the_language() -> None:
    """_attach_web_research_evidence baut die Anfrage neu — dabei darf die
    Sprache nicht verloren gehen, sonst kehrt der Fehler durch die Hintertuer
    zurueck."""
    from app.api.v1.routes.chat import _attach_web_research_evidence

    request = await _build_llm_request(CHAT, "Wer bist du?", "de")
    assert _attach_web_research_evidence(request, None).metadata.get("language") == "de"
