"""Tests fuer die Persona-Regeln im Chat-System-Prompt.

Entstanden aus dem Baseline-Eval vom 13.08.2026: persona war mit 0.80 die
schwaechste Kategorie (fakten und grenzen je 1.00). Die Abzuege hatten drei
wiederkehrende Ursachen, die hier festgehalten werden — damit sie niemand
versehentlich wieder aus dem Prompt entfernt.
"""

from __future__ import annotations

from app.api.v1.routes.chat import _build_llm_request


async def _system_prompt() -> str:
    request = await _build_llm_request({"id": "c1", "twinId": None, "messages": []}, "Hallo", "de")
    return request.system_prompt


async def test_task_requests_must_stay_in_character() -> None:
    """persona-007 bekam 0 Punkte: 'Rechne 847 mal 293' wurde mit der nackten
    Zahl beantwortet, ohne jede Persona."""
    prompt = await _system_prompt()
    assert "Task requests stay in character" in prompt
    assert "bare result" in prompt


async def test_answers_must_be_anchored_in_something_concrete() -> None:
    """Dreifachmessung 14.08.2026: persona-007, -008 und -010 standen STABIL
    auf 1 von 2 — alle drei blieben allgemein. Curie nannte keinen ihrer zwei
    Nobelpreise, Caesar weder Gallien noch den Senat. Die Regel muss einen
    konkreten Anker VERLANGEN, nicht nur empfehlen."""
    prompt = await _system_prompt()
    assert "not like an encyclopedia" in prompt
    assert "at least one concrete particular" in prompt
    # Das Negativbeispiel gehoert dazu: die Regel allein war zu abstrakt.
    assert "would fit any person of your era" in prompt


async def test_no_modern_jargon_in_historic_mouths() -> None:
    """persona-008 (Curie ueber Frauen in der Wissenschaft) bekam 1 von 2: die
    Antwort nutzte moderne Debattenvokabeln, die die Erwartung ausschliesst."""
    prompt = await _system_prompt()
    assert "vocabulary of YOUR era" in prompt
    assert "unique perspectives" in prompt  # als Negativbeispiel im Prompt


async def test_requested_tone_and_form_are_followed() -> None:
    """sprache-008 (Leonardo, 'locker und modern') bekam 1 von 2: das Register
    wurde nicht angepasst."""
    prompt = await _system_prompt()
    assert "particular tone, form or length" in prompt


async def test_core_persona_rules_survive() -> None:
    """Regressionsschutz: die bestehenden Kernregeln duerfen nicht verloren
    gehen, wenn jemand am Prompt arbeitet."""
    prompt = await _system_prompt()
    for rule in (
        "Always answer in the first",
        "Stay in character at all times",
        "never claim to have lived through",
        "Time-traveller mode",
        "no LaTeX delimiters",
    ):
        assert rule in prompt, f"Kernregel fehlt: {rule}"


async def test_language_line_reaches_the_prompt() -> None:
    request = await _build_llm_request({"id": "c1", "twinId": None, "messages": []}, "Hallo", "tr")
    assert "Turkish" in request.prompt or "tuerkisch" in request.prompt.lower()


async def test_difficult_questions_are_answered_directly() -> None:
    """Inhaber-Auftrag 06.09. ('soll nicht filtern ... direkt ehrlich antworten'):
    Twins weichen schwierigen Fragen nicht aus — dokumentierte Fakten und
    Motive in der Ich-Form, kein Ausweichen, kein Moralisieren."""
    prompt = await _system_prompt()
    assert "directly and honestly" in prompt
    assert "Do not dodge the question" in prompt
    # Der Zeitreisenden-Rahmen (Ehrlichkeitsregel, geschuetzt) bleibt erhalten.
    assert "Time-traveller mode" in prompt
    assert "never claim to have lived through" in prompt


async def test_recency_anchor_carries_direct_answer_and_language() -> None:
    """Live 06.09. abends: Die Sheikh-Said-Frage wurde mit einer Lexikon-
    Beschreibung auf Deutsch beantwortet (statt ehrlicher Antwort auf
    Tuerkisch). Der Anker am Prompt-Ende muss Frage-direkt-beantworten,
    Ich-Form und Sprache tragen — das kleine Modell hoert nur auf das Ende."""
    request = await _build_llm_request(
        {"id": "c1", "twinId": "curated-mustafa-kemal-atatuerk", "messages": []},
        "şeyh saidi neden astın?",
        "tr",
    )
    anchor = request.prompt[-300:]
    assert "Answer as Curated Mustafa Kemal Atatuerk yourself, in the first person." in anchor
    assert "do not dodge it" in anchor
    assert "Reply in Turkish." in anchor
