"""smyst.com Export der QA-Urteile als Trainingsdaten fuer das eigene Modell.

Ziel (Nutzerwunsch 13.08.2026): smyst 1.0 soll die Pruefarbeit der Pipeline
selbst uebernehmen — das QA-Gate, das heute fremde Provider erledigen. Dafuer
braucht das Modell Beispiele der Form "Profil + Frage + Antwort -> Urteil".

Genau die fallen bei JEDEM echten Pipeline-Lauf ohnehin an: qa_candidates legt
zu jedem geprueften Kandidaten einen qa_report ab, mit den Chat-Antworten und
den gefundenen Maengeln. Bei 250 Kandidaten x 5 Standardfragen sind das ~1250
Urteile pro Lauf — die Trainingsdaten entstehen also als Nebenprodukt des
Normalbetriebs, ohne einen einzigen zusaetzlichen LLM-Aufruf.

Read-only gegenueber dem Kandidatenspeicher. Der Export enthaelt KEINE
Nutzerdaten (nur oeffentliche Profildaten und maschinell erzeugte Antworten),
gehoert aber trotzdem nicht ins Repo — er ist gross und regeneriebar.

Start:
    python -m app.workers.export_qa_judgments --dry-run
    python -m app.workers.export_qa_judgments --out ../training-export
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.ai.qa_checks import QA_QUESTIONS

#: So formatiert qa_checks die Maengel der Chat-Fragen: "Chat-Test <id>: <text>".
#: Die Frage-Urteile stehen NICHT einzeln im Report — nur die vier Prueferblocks
#: (completeness, date_consistency, duplicate, chat_smoke_test). Pro Frage muss
#: das Urteil deshalb aus den issues abgeleitet werden, genau wie in
#: ai/profile_evals.
FAILURE_PREFIX = "Chat-Test "


def failed_question_ids(issues: Any) -> dict[str, str]:
    """Frage-ID -> Mangeltext, abgeleitet aus den issues-Strings."""
    failures: dict[str, str] = {}
    for issue in issues or []:
        text = str(issue)
        if not text.startswith(FAILURE_PREFIX):
            continue
        head, _, reason = text.partition(":")
        question_id = head.removeprefix(FAILURE_PREFIX).strip()
        if question_id:
            failures.setdefault(question_id, reason.strip())
    return failures


def build_judgment_records(document: dict) -> list[dict]:
    """Zerlegt EIN Kandidaten-Dokument in Urteils-Beispiele (rein, testbar).

    Unbeantwortete Fragen werden uebersprungen: ohne Antwort gibt es kein
    Urteil und damit keinen Trainingswert.
    """
    report = document.get("qa_report")
    if not isinstance(report, dict):
        return []
    answers = report.get("chat_answers")
    if not isinstance(answers, dict) or not answers:
        return []

    failures = failed_question_ids(report.get("issues"))
    profile = {
        "qid": document.get("wikidata_qid"),
        "name": document.get("name"),
        "category": document.get("category"),
        "birth_date": document.get("birth_date"),
        "death_date": document.get("death_date"),
    }

    records: list[dict] = []
    for question in QA_QUESTIONS:
        question_id = question["id"]
        answer = str(answers.get(question_id) or "").strip()
        if not answer:
            continue
        records.append(
            {
                "profile": profile,
                "question_id": question_id,
                "question": question["frage"],
                "answer": answer,
                "verdict": "fail" if question_id in failures else "pass",
                "reason": failures.get(question_id),
            }
        )
    return records


def summarize(records: list[dict]) -> dict:
    """Kennzahlen inkl. Klassenverteilung.

    Die Verteilung ist die wichtigste Zahl: ein Datensatz mit 99 % 'pass' taugt
    nicht zum Trainieren eines Pruefers — er lernt dann einfach immer 'pass'.
    """
    verdicts = collections.Counter(record["verdict"] for record in records)
    per_question = collections.Counter(
        (record["question_id"], record["verdict"]) for record in records
    )
    total = len(records) or 1
    return {
        "records": len(records),
        "profiles": len({record["profile"]["qid"] for record in records}),
        "verdicts": dict(verdicts),
        "fail_ratio": round(verdicts.get("fail", 0) / total, 4),
        "per_question": {
            question["id"]: {
                "pass": per_question.get((question["id"], "pass"), 0),
                "fail": per_question.get((question["id"], "fail"), 0),
            }
            for question in QA_QUESTIONS
        },
    }


def write_jsonl(records: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(
        description="smyst.com Export der QA-Urteile (Trainingsdaten fuer das Pipeline-Modell)"
    )
    parser.add_argument("--out", default="training-export", help="Zielverzeichnis")
    parser.add_argument("--limit", type=int, default=None, help="max. Anzahl Kandidaten")
    parser.add_argument("--dry-run", action="store_true", help="nur zaehlen, nichts schreiben")
    args = parser.parse_args(argv)

    from app.integrations.candidate_store import CandidateStore, build_s3_client
    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    records: list[dict] = []
    scanned = 0
    for qid in sorted(store.existing_qids()):
        if args.limit is not None and scanned >= args.limit:
            break
        scanned += 1
        try:
            document = store.load_candidate_document(qid)
        except Exception:
            continue
        records.extend(build_judgment_records(document))

    summary = summarize(records)
    print(json.dumps({"scanned": scanned, **summary}, ensure_ascii=False, indent=2))
    if summary["fail_ratio"] < 0.05:
        print(
            "WARNUNG: unter 5 % 'fail' — zum Trainieren eines Pruefers zu einseitig. "
            "Mehr abgelehnte Kandidaten sammeln oder Negativbeispiele erzeugen.",
            file=sys.stderr,
        )
    if args.dry_run:
        print("Dry-Run: nichts geschrieben.")
        return 0

    stamp = datetime.now(timezone.utc).date().isoformat()
    target = Path(args.out) / f"qa-judgments-{stamp}.jsonl"
    write_jsonl(records, target)
    print(f"Geschrieben nach {target}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
