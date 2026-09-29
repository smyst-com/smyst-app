"""Tests fuer den Trainings-Export (workers/export_training_data)."""

from __future__ import annotations

import json

from app.workers.export_training_data import (
    HISTORY_LIMIT,
    build_training_records,
    feedback_to_preference,
    merge_feedback_records,
    write_jsonl,
)


def _chat(messages: list[dict], twin_id: str | None = "albert-einstein") -> dict:
    return {"id": "chat-1", "twinId": twin_id, "messages": messages}


def _exchange(prompt: str, response: str, **assistant_extra: object) -> list[dict]:
    return [
        {"role": "user", "content": prompt, "language": "de"},
        {"role": "assistant", "content": response, **assistant_extra},
    ]


def test_exchange_becomes_sft_record() -> None:
    sft, preference = build_training_records(_chat(_exchange("Wer bist du?", "Ich bin Albert.")))
    assert len(sft) == 1
    assert preference == []
    record = sft[0]
    assert record["twinId"] == "albert-einstein"
    assert record["prompt"] == "Wer bist du?"
    assert record["response"] == "Ich bin Albert."
    assert record["language"] == "de"
    assert record["history"] == []


def test_rated_answer_becomes_preference_record() -> None:
    messages = _exchange("Frage?", "Antwort.", feedback={"rating": "down", "comment": "falsch"})
    _, preference = build_training_records(_chat(messages))
    assert len(preference) == 1
    assert preference[0]["rating"] == "down"
    assert preference[0]["comment"] == "falsch"


def test_report_feedback_is_not_a_training_signal() -> None:
    messages = _exchange("Frage?", "Antwort.", feedback={"rating": "report"})
    sft, preference = build_training_records(_chat(messages))
    assert len(sft) == 1
    assert preference == []


def test_chat_without_twin_is_skipped() -> None:
    assert build_training_records(_chat(_exchange("Hi", "Hallo"), twin_id=None)) == ([], [])


def test_history_carries_previous_exchanges_and_is_capped() -> None:
    messages: list[dict] = []
    for index in range(HISTORY_LIMIT):
        messages.extend(_exchange(f"Frage {index}", f"Antwort {index}"))
    sft, _ = build_training_records(_chat(messages))
    last = sft[-1]
    assert last["prompt"] == f"Frage {HISTORY_LIMIT - 1}"
    assert len(last["history"]) <= HISTORY_LIMIT
    assert last["history"][-1]["content"] == f"Antwort {HISTORY_LIMIT - 2}"


def test_empty_or_orphaned_messages_are_ignored() -> None:
    messages = [
        {"role": "assistant", "content": "Antwort ohne Frage"},
        {"role": "user", "content": "   "},
        {"role": "assistant", "content": "Antwort auf Leerfrage"},
        "kaputt",
    ]
    assert build_training_records(_chat(messages)) == ([], [])


def test_write_jsonl_roundtrip(tmp_path) -> None:
    records = [{"prompt": "a", "response": "ä"}, {"prompt": "b", "response": "c"}]
    target = tmp_path / "out" / "sft.jsonl"
    write_jsonl(records, target)
    lines = target.read_text(encoding="utf-8").strip().split("\n")
    assert [json.loads(line) for line in lines] == records


def _feedback_row(rating: str = "up", frage: str = "Wer bist du?", antwort: str = "Ich bin Albert.") -> dict:
    return {
        "chatId": "chat-9",
        "messageId": "msg-9",
        "twinId": "albert-einstein",
        "rating": rating,
        "comment": None,
        "question": frage,
        "answer": antwort,
        "createdAt": 1759100000000,
    }


def test_feedback_record_becomes_preference_record() -> None:
    pref = feedback_to_preference(_feedback_row(rating="up"))
    assert pref is not None
    assert pref["twinId"] == "albert-einstein"
    assert pref["prompt"] == "Wer bist du?"
    assert pref["response"] == "Ich bin Albert."
    assert pref["rating"] == "up"
    assert pref["source"] == "chat-feedback"


def test_feedback_without_signal_is_rejected() -> None:
    assert feedback_to_preference(_feedback_row(rating="report")) is None
    ohne_frage = _feedback_row() | {"question": "  "}
    assert feedback_to_preference(ohne_frage) is None
    ohne_twin = _feedback_row() | {"twinId": None}
    assert feedback_to_preference(ohne_twin) is None


def test_merge_dedupes_against_archive_embedding() -> None:
    # Dieselbe Bewertung steckt bereits im Archiv ( eingebettetes feedback)
    archiv = [{
        "twinId": "albert-einstein", "rating": "up",
        "prompt": "Wer bist du?", "response": "Ich bin Albert.",
    }]
    ergaenzt = merge_feedback_records(archiv, [_feedback_row()])
    assert ergaenzt == []

    # Eine NUR in chat-feedback/ liegende Bewertung kommt hinzu
    neu = merge_feedback_records(archiv, [_feedback_row(antwort="Ich bin Albert Einstein.")])
    assert len(neu) == 1
    assert neu[0]["response"] == "Ich bin Albert Einstein."

    # Dieselbe chat-feedback/-Bewertung zweimal zaehlt einfach
    assert len(merge_feedback_records(archiv, [_feedback_row(antwort="Andere."), _feedback_row(antwort="Andere.")])) == 1
