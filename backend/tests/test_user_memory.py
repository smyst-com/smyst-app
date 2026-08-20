"""Phase 3: Langzeit-Gedaechtnis (Extraktion, Speicherung, Prompt-Block)."""

from __future__ import annotations

from app.ai.user_memory import extract_user_memories, memory_block, remember


def test_extracts_name_location_likes_and_explicit() -> None:
    facts = extract_user_memories(
        "Ich heiße Anna und ich wohne in Hamburg. Ich liebe Astronomie. "
        "Merke dir: Ich habe am 12. Oktober Geburtstag."
    )
    joined = " | ".join(facts)
    assert "Ich heiße Anna" in joined
    assert "ich wohne in Hamburg" in joined
    assert "Ich liebe Astronomie" in joined
    assert "Geburtstag" in joined


def test_extracts_english_statements() -> None:
    facts = extract_user_memories("My name is Tom, I live in Berlin and I like physics.")
    joined = " | ".join(facts)
    assert "My name is Tom" in joined
    assert "I live in Berlin" in joined
    assert "I like physics" in joined


def test_ignores_ordinary_questions() -> None:
    assert extract_user_memories("Was hast du 1905 entdeckt?") == []
    assert extract_user_memories("Erklär mir die Relativitätstheorie.") == []


def test_remember_deduplicates_and_memory_block_lists(monkeypatch) -> None:
    docs: dict[str, dict] = {}

    monkeypatch.setattr("app.ai.user_memory.load_user_doc", lambda sub: docs.get(sub))
    monkeypatch.setattr(
        "app.ai.user_memory.save_user_doc",
        lambda sub, doc: docs.__setitem__(sub, doc) or True,
    )

    assert remember("u1", "Ich heiße Anna") is True
    assert remember("u1", "ich heiße anna") is False  # Duplikat
    assert remember("u1", "Ich wohne in Hamburg") is True

    block = memory_block("u1")
    assert "Ich heiße Anna" in block
    assert "Ich wohne in Hamburg" in block
    assert "weave these in naturally" in block


def test_memory_block_empty_without_user_or_data(monkeypatch) -> None:
    assert memory_block(None) == ""
    monkeypatch.setattr("app.ai.user_memory.load_user_doc", lambda sub: None)
    assert memory_block("u2") == ""
