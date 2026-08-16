from __future__ import annotations

from app.api.v1.routes.chat import question_for_research


def test_voice_language_prefix_is_removed_before_search() -> None:
    # Genau die Nutzlast der Oberflaeche (src/lib/voiceLanguage.ts), live mitgeschnitten
    # am 16.08.2026: 450 von 490 Zeichen waren Regieanweisung. So kam bei SearXNG eine
    # unbrauchbare Anfrage an und der Twin blieb bei "das liegt nach meiner Zeit".
    message = (
        "[Voice language: German (de). Answer in German by default. You speak every language "
        'fluently. Highest priority: if the user asks you to talk in another language (e.g. '
        '"kannst du tuerkisch reden", "speak English"), your ENTIRE reply must already be in '
        "that requested language.]\n\nWie ist das Wetter morgen in Berlin?"
    )

    assert question_for_research(message) == "Wie ist das Wetter morgen in Berlin?"


def test_multiple_leading_blocks_are_removed() -> None:
    message = "[a]\n[b]\n\nWas kostet Brot heute?"

    assert question_for_research(message) == "Was kostet Brot heute?"


def test_plain_question_stays_untouched() -> None:
    assert question_for_research("  Wie geht es dir?  ") == "Wie geht es dir?"


def test_message_that_is_only_a_block_keeps_original() -> None:
    # Kein Rest uebrig: lieber die Originalnachricht durchreichen als eine leere Suche.
    assert question_for_research("[nur Regie]") == "[nur Regie]"


def test_brackets_inside_the_question_are_kept() -> None:
    assert question_for_research("Was bedeutet [sic] in Zitaten?") == "Was bedeutet [sic] in Zitaten?"
