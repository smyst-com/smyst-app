"""Tests fuer den Export der QA-Urteile (workers/export_qa_judgments)."""

from __future__ import annotations

import json

from app.ai.qa_checks import QA_QUESTIONS
from app.workers.export_qa_judgments import (
    build_judgment_records,
    failed_question_ids,
    summarize,
    write_jsonl,
)

ALL_ANSWERS = {question["id"]: f"Antwort zu {question['id']}." for question in QA_QUESTIONS}


def _document(*, answers: dict | None = None, issues: list | None = None) -> dict:
    return {
        "wikidata_qid": "Q937",
        "name": "Albert Einstein",
        "category": "Wissenschaft",
        "birth_date": "1879-03-14",
        "death_date": "1955-04-18",
        "qa_report": {
            "passed": not issues,
            "checks": {"chat_smoke_test": "fail" if issues else "pass"},
            "issues": issues or [],
            "chat_answers": ALL_ANSWERS if answers is None else answers,
        },
    }


def test_every_answered_question_becomes_one_record() -> None:
    records = build_judgment_records(_document())
    assert len(records) == len(QA_QUESTIONS)
    assert {record["verdict"] for record in records} == {"pass"}
    assert records[0]["profile"]["name"] == "Albert Einstein"
    assert records[0]["question"] == QA_QUESTIONS[0]["frage"]


def test_failed_question_gets_fail_verdict_and_reason() -> None:
    records = build_judgment_records(
        _document(issues=["Chat-Test trap: Antwort bestaetigt eine falsche Behauptung"])
    )
    by_id = {record["question_id"]: record for record in records}
    assert by_id["trap"]["verdict"] == "fail"
    assert by_id["trap"]["reason"] == "Antwort bestaetigt eine falsche Behauptung"
    assert by_id["identity"]["verdict"] == "pass"
    assert by_id["identity"]["reason"] is None


def test_unanswered_questions_are_skipped() -> None:
    """Ohne Antwort gibt es kein Urteil — solche Zeilen haetten keinen
    Trainingswert und wuerden die Klassenverteilung verfaelschen."""
    records = build_judgment_records(_document(answers={"identity": "Ich bin Albert.", "trap": "  "}))
    assert [record["question_id"] for record in records] == ["identity"]


def test_document_without_qa_report_yields_nothing() -> None:
    assert build_judgment_records({"wikidata_qid": "Q1"}) == []
    assert build_judgment_records({"wikidata_qid": "Q1", "qa_report": "kaputt"}) == []
    assert build_judgment_records({"wikidata_qid": "Q1", "qa_report": {"chat_answers": {}}}) == []


def test_failed_question_ids_ignores_other_issue_kinds() -> None:
    failures = failed_question_ids(
        [
            "Chat-Test language: Antwort nicht auf Englisch",
            "Pflichtfeld fehlt: birth_date",
            "Chat-Smoke-Test nicht ausgefuehrt (kein Chat-Provider konfiguriert)",
            "Chat-Test : leer",
        ]
    )
    assert failures == {"language": "Antwort nicht auf Englisch"}


def test_failed_question_ids_keeps_first_reason_per_question() -> None:
    failures = failed_question_ids(
        ["Chat-Test trap: erster Grund", "Chat-Test trap: zweiter Grund"]
    )
    assert failures == {"trap": "erster Grund"}


def test_summarize_reports_class_balance() -> None:
    records = build_judgment_records(_document(issues=["Chat-Test trap: falsch"]))
    summary = summarize(records)
    assert summary["records"] == len(QA_QUESTIONS)
    assert summary["profiles"] == 1
    assert summary["verdicts"] == {"pass": len(QA_QUESTIONS) - 1, "fail": 1}
    assert summary["fail_ratio"] == round(1 / len(QA_QUESTIONS), 4)
    assert summary["per_question"]["trap"] == {"pass": 0, "fail": 1}


def test_summarize_handles_empty_input() -> None:
    summary = summarize([])
    assert summary["records"] == 0
    assert summary["fail_ratio"] == 0.0


def test_write_jsonl_roundtrip(tmp_path) -> None:
    records = build_judgment_records(_document())
    target = tmp_path / "out" / "qa.jsonl"
    write_jsonl(records, target)
    lines = target.read_text(encoding="utf-8").strip().split("\n")
    assert [json.loads(line) for line in lines] == records
