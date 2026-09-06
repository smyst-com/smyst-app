"""Tests fuer die Erkennung degenerierter Antworten (app/ai/degeneration).

Anlass live 06.09.2026: Der Atatuerk-Twin antwortete auf eine tuerkische
Frage mit derselben fuenf-Wort-Phrase rund zwanzigmal hintereinander —
als komplette "Antwort". Genau solche Schleifen muss is_degenerate_answer
erkennen, ohne normale Antworten (Kehrreim, Aufzaehlung, kurze Antwort)
falsch zu treffen.
"""

from __future__ import annotations

from app.ai.degeneration import is_degenerate_answer


def _turkish_loop() -> str:
    """Der Live-Vorfall nachgebaut: Phrase + Schleife bis zum Token-Limit."""
    return (
        "Bu konuyu sadece bu soruyu sorduğunuz zaman açıklayabilirim. "
        + "sadece bu soruyu sorduğunuz zaman " * 20
    )


def test_live_turkish_repetition_loop_is_degenerate() -> None:
    assert is_degenerate_answer(_turkish_loop()) is True


def test_single_word_loop_is_degenerate() -> None:
    assert is_degenerate_answer("Antwort: " + "evet " * 30) is True


def test_sentence_loop_is_degenerate() -> None:
    sentence = "Das kann ich dir heute nicht mehr sagen. "
    assert is_degenerate_answer(sentence * 8) is True


def test_normal_answer_is_not_degenerate() -> None:
    text = (
        "Sie fragen, warum ich es angeordnet habe. Der Aufstand im Osten "
        "bedrohte die junge Republik im Jahr 1925, und die Unabhaengigkeits-"
        "gerichte haben ihn nach damaligem Recht verhandelt. Ich trage die "
        "Verantwortung dafuer, dass der Staat Bestand hatte — das war meine "
        "Pflicht, auch wenn der Preis hoch war."
    )
    assert is_degenerate_answer(text) is False


def test_refrain_in_poem_is_not_degenerate() -> None:
    """Kehrreim kehrt zurueck, aber nicht UNMITTELBAR hintereinander."""
    text = (
        "Die Nacht war kalt, der Wind stand still, never more. "
        "Ich sass am Fenster, dachte lang, never more. "
        "Die Sterne zaehlte ich bis hundertzehn, never more. "
        "Und alles war fuer immer hin, never more. "
        "Die Stadt schlief tief, ich wachte wach, never more."
    )
    assert is_degenerate_answer(text) is False


def test_enumeration_is_not_degenerate() -> None:
    text = (
        "Ich habe drei Dinge gelernt: erstens Geduld, zweitens Geduld, "
        "drittens Geduld — und dann Paris, Berlin und schliesslich Wien, "
        "wo ich das Wichtigste schrieb. Danach lehrte ich, reiste und las."
    )
    assert is_degenerate_answer(text) is False


def test_short_answers_are_never_degenerate() -> None:
    assert is_degenerate_answer("Ja. Ja. Ja.") is False
    assert is_degenerate_answer("") is False
    assert is_degenerate_answer("Das liegt nach meiner Zeit.") is False


def test_mid_stream_partial_loop_with_two_repeats_is_not_flagged() -> None:
    """Zwei Wiederholungen allein duerfen nicht schlagen (Stream-Randfall)."""
    text = "Ich sage es nochmal: " + "Diese Sache war so. " * 2
    assert is_degenerate_answer(text) is False
