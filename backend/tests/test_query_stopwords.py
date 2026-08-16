from __future__ import annotations

from app.ai.web_research import QueryCategory, rewrite_query


def test_question_words_are_dropped_from_the_search_query() -> None:
    # Live gemessen 16.08.2026 gegen die eigene Instanz: als Frage formuliert lieferte
    # "Wie ist das Wetter morgen in Berlin?" IEEE Women in Engineering, Wiktionary "wie"
    # und ein Woerterbuch - die Suchmaschine hing am Fragewort. Stichworte trafen sofort.
    assert rewrite_query(
        "Wie ist das Wetter morgen in Berlin?", category=QueryCategory.WEATHER
    ).query == "Wetter morgen Berlin weather"


def test_news_question_becomes_keywords() -> None:
    assert rewrite_query(
        "Was sind heute die wichtigsten Nachrichten aus Deutschland?",
        category=QueryCategory.NEWS,
    ).query == "heute wichtigsten Nachrichten Deutschland news"


def test_content_words_survive() -> None:
    assert rewrite_query(
        "Wer ist Bundeskanzler von Deutschland?", category=QueryCategory.GENERAL_PUBLIC_FACT
    ).query == "Bundeskanzler Deutschland"


def test_query_of_only_stopwords_keeps_its_words() -> None:
    # Lieber die ungekuerzte Frage schicken als eine leere Anfrage.
    assert rewrite_query("Wie ist das?").query == "Wie ist das"


def test_privacy_rewriting_still_wins() -> None:
    rewritten = rewrite_query(
        "Wie ist die Adresse von alan@example.com?", category=QueryCategory.PUBLIC_PROFILE
    )

    assert "alan@example.com" not in rewritten.query
    assert rewritten.redacted is True
