"""Tests fuer den Trainings-Export (workers/export_training_data)."""

from __future__ import annotations

import json

from app.workers.export_training_data import HISTORY_LIMIT, build_training_records, write_jsonl


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
