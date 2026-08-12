"""smyst.com Modell-Eval-Runner: eingefrorenes Eval-Set gegen die Live-Twins.

Baustein fuer smyst 1.0: misst, wie gut das AKTUELLE Chat-Setup (Provider-
Kette aus den Settings) die Fragen aus training/eval/smyst-eval-v*.jsonl
beantwortet. Der erste Lauf ist die Baseline, die ein eigenes Modell spaeter
schlagen muss; danach vergleicht jeder Trainings-Checkpoint gegen dieselben,
NIE veraenderten Fragen.

Bewertung per LLM-as-Judge (Skala 0-2 je Frage: verfehlt/teilweise/erfuellt).
Twin-Namen aus dem Eval-Set werden gegen die published-Profile aufgeloest;
nicht aufloesbare Twins werden uebersprungen und im Report ausgewiesen —
so bleibt das Set auch dann gueltig, wenn sich der Profilbestand aendert.

Der Report wird lokal geschrieben und (wenn e2 konfiguriert) zusaetzlich
nach training-evals/ im Object Brain gelegt. Read-only gegenueber Profilen.

Start:
    python -m app.workers.run_model_eval --eval-set ../training/eval/smyst-eval-v1.jsonl --dry-run
    python -m app.workers.run_model_eval --eval-set ../training/eval/smyst-eval-v1.jsonl --tag baseline
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from app.ai.qa_checks import ChatProviderDegradedError
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.ingest_candidates import _pipeline_bucket
from app.workers.qa_candidates import build_chat_fn, load_capsule_document

#: Bewertungsskala des Judges; alles ausserhalb wird auf die Skala geklemmt.
SCORE_MIN, SCORE_MAX = 0, 2

REPORT_PREFIX = "training-evals/"

JUDGE_PROMPT = """Du bist ein strenger Pruefer fuer einen KI-Twin einer historischen Person.
Bewerte NUR, ob die Antwort die Erwartung erfuellt — nicht ihren Stil.

Frage an den Twin: {question}
Erwartung an eine gute Antwort: {expect}
Antwort des Twins: {answer}

Antworte AUSSCHLIESSLICH mit JSON: {{"score": 0, 1 oder 2, "grund": "ein Satz"}}
(0 = Erwartung verfehlt, 1 = teilweise erfuellt, 2 = erfuellt)"""


def load_eval_set(path: Path) -> list[dict]:
    """Laedt das Eval-Set; wirft bei kaputten Zeilen (eingefrorenes Set —
    ein Fehler hier ist ein Repo-Fehler, kein Laufzeitfall)."""
    questions: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        record = json.loads(line)
        for field in ("id", "category", "twin_name", "question", "expect"):
            if not str(record.get(field) or "").strip():
                raise ValueError(f"{path.name}:{line_number}: Feld '{field}' fehlt")
        questions.append(record)
    return questions


def resolve_twins(documents: list[dict], twin_names: set[str]) -> dict[str, dict]:
    """Ordnet Eval-Twin-Namen den published-Dokumenten zu (case-insensitiv).

    Nur exakte Namens-Treffer — raten (Teilstrings, QIDs) waere gefaehrlicher
    als ueberspringen.
    """
    by_name = {
        str(document.get("name") or "").casefold(): document
        for document in documents
        if str(document.get("name") or "").strip()
    }
    return {
        name: by_name[name.casefold()]
        for name in twin_names
        if name.casefold() in by_name
    }


def parse_judge_verdict(raw: str) -> int | None:
    """Zieht den Score aus der Judge-Antwort; None wenn unlesbar."""
    match = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if match:
        try:
            score = json.loads(match.group(0)).get("score")
            if isinstance(score, (int, float)):
                return max(SCORE_MIN, min(SCORE_MAX, int(score)))
        except (json.JSONDecodeError, ValueError):
            pass
    digit = re.search(r"\b([012])\b", raw or "")
    return int(digit.group(1)) if digit else None


def build_judge_fn(chat_fn: Callable[[str], str]) -> Callable[[dict, str], int | None]:
    """Judge auf Basis derselben Provider-Kette wie der Chat selbst."""

    def judge(question: dict, answer: str) -> int | None:
        prompt = JUDGE_PROMPT.format(
            question=question["question"], expect=question["expect"], answer=answer
        )
        try:
            return parse_judge_verdict(chat_fn(prompt))
        except Exception:
            return None

    return judge


def aggregate(rows: list[dict]) -> dict:
    """Verdichtet Einzel-Ergebnisse zu Gesamt- und Kategorie-Scores [0..1]."""
    scored = [row for row in rows if isinstance(row.get("score"), int)]
    def _avg(subset: list[dict]) -> float:
        return round(sum(row["score"] for row in subset) / (len(subset) * SCORE_MAX), 4) if subset else 0.0

    categories = sorted({row["category"] for row in scored})
    return {
        "questions_total": len(rows),
        "questions_scored": len(scored),
        "questions_skipped": len(rows) - len(scored),
        "score": _avg(scored),
        "by_category": {
            category: _avg([row for row in scored if row["category"] == category])
            for category in categories
        },
    }


def run_eval(
    questions: list[dict],
    twins: dict[str, dict],
    *,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None],
    judge_fn: Callable[[dict, str], int | None],
    capsule_loader: Callable[[dict], dict],
) -> list[dict]:
    """Fragt jeden aufloesbaren Twin und laesst den Judge bewerten (testbar).

    Nicht aufloesbare Twins oder fehlende Chat-Provider ergeben skip-Zeilen
    (score None) statt stiller Luecken. ChatProviderDegradedError bricht den
    Lauf ab — eine halb-degradierte Baseline waere wertlos.
    """
    rows: list[dict] = []
    chat_fns: dict[str, Callable[[str], str] | None] = {}
    for question in questions:
        twin_name = question["twin_name"]
        row = {
            "id": question["id"],
            "category": question["category"],
            "twin_name": twin_name,
            "score": None,
        }
        document = twins.get(twin_name)
        if document is None:
            rows.append({**row, "skip": "twin nicht aufloesbar"})
            continue
        if twin_name not in chat_fns:
            chat_fns[twin_name] = chat_fn_factory(capsule_loader(document))
        chat_fn = chat_fns[twin_name]
        if chat_fn is None:
            rows.append({**row, "skip": "kein Chat-Provider konfiguriert"})
            continue
        try:
            answer = chat_fn(question["question"])
        except ChatProviderDegradedError:
            raise
        except Exception as error:
            rows.append({**row, "skip": f"Chat-Fehler {type(error).__name__}"})
            continue
        score = judge_fn(question, answer)
        if score is None:
            rows.append({**row, "answer": answer, "skip": "Judge-Antwort unlesbar"})
            continue
        rows.append({**row, "answer": answer, "score": score})
    return rows


def _upload_report(report: dict, key: str) -> bool:  # pragma: no cover - Verdrahtung
    from app.core.config import settings

    if not (settings.idrive_e2_access_key and settings.idrive_e2_secret_key):
        return False
    try:
        build_s3_client().put_object(
            Bucket=_pipeline_bucket(),
            Key=key,
            Body=json.dumps(report, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
        return True
    except Exception:
        return False


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Modell-Eval (eingefrorenes Set gegen Live-Twins)")
    parser.add_argument("--eval-set", required=True, help="Pfad zu smyst-eval-v*.jsonl")
    parser.add_argument("--tag", default="baseline", help="Label des Laufs (z. B. baseline, checkpoint-1000)")
    parser.add_argument("--limit", type=int, default=None, help="max. Anzahl Fragen")
    parser.add_argument("--out", default="training-export", help="Zielverzeichnis fuer den Report")
    parser.add_argument("--dry-run", action="store_true", help="nur Twin-Aufloesung pruefen, keine LLM-Calls")
    args = parser.parse_args(argv)

    questions = load_eval_set(Path(args.eval_set))
    if args.limit is not None:
        questions = questions[: args.limit]

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    documents = store.candidate_documents_by_status("published")
    twins = resolve_twins(documents, {question["twin_name"] for question in questions})
    missing = sorted({q["twin_name"] for q in questions} - set(twins))
    print(f"{len(questions)} Fragen, {len(twins)} Twins aufgeloest, fehlend: {missing or 'keine'}")
    if args.dry_run:
        return 0

    def capsule_loader(document: dict) -> dict:
        return load_capsule_document(store, str(document.get("wikidata_qid")))

    judge_base = build_chat_fn({"persona_prompt": "Du bist ein praeziser Pruefer."})
    if judge_base is None:
        print("Kein LLM-Provider konfiguriert — Eval nicht moeglich.")
        return 1

    try:
        rows = run_eval(
            questions,
            twins,
            chat_fn_factory=build_chat_fn,
            judge_fn=build_judge_fn(judge_base),
            capsule_loader=capsule_loader,
        )
    except ChatProviderDegradedError as error:
        print(f"Abbruch: Provider degradiert ({error}) — Baseline waere wertlos.")
        return 1

    summary = aggregate(rows)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    report = {
        "tag": args.tag,
        "createdAt": stamp,
        "eval_set": Path(args.eval_set).name,
        "summary": summary,
        "rows": rows,
    }
    out_path = Path(args.out) / f"model-eval-{args.tag}-{stamp}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    uploaded = _upload_report(report, f"{REPORT_PREFIX}{args.tag}-{stamp}.json")
    print(
        f"Score {summary['score']:.2%} ({summary['questions_scored']}/{summary['questions_total']} bewertet) "
        f"| Kategorien: {summary['by_category']} | Report: {out_path}"
        + (" + e2" if uploaded else "")
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
