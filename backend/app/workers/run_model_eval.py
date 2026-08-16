"""smyst.com Modell-Eval-Runner: eingefrorenes Eval-Set gegen die Live-Twins.

Baustein fuer smyst 1.0: misst, wie gut das AKTUELLE Setup die Fragen aus
training/eval/smyst-eval-v*.jsonl beantwortet. Der erste Lauf ist die Baseline,
die ein eigenes Modell spaeter schlagen muss; danach vergleicht jeder
Trainings-Checkpoint gegen dieselben, NIE veraenderten Fragen.

Die Antworten kommen ueber die OEFFENTLICHE Chat-API — denselben Weg, den ein
Nutzer nimmt (/api/chat/start + /api/chat/messages). Das hat zwei Gruende:
1. Es prueft den echten Produktionspfad samt Persona-Aufbau und Sprachlogik.
2. Es braucht KEINE e2-Zugaenge; der Kandidatenspeicher enthaelt die
   kuratierten Twins ohnehin nicht (die 100 beruehmten Figuren liegen als
   'curated-*' nur in der Twin-API, nicht in der Pipeline).

Nur die Bewertung laeuft ueber die Provider-Kette (LLM-as-Judge, Skala 0-2) —
in GitHub Actions traegt sie das CI-Gateway, ohne dass ein Key noetig ist.

Antworten aus dem Not-Fallback (mode=local) werden NICHT bewertet, sondern
brechen den Lauf ab: eine degradierte Baseline waere schlimmer als keine.

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
from typing import Any, Callable

#: Bewertungsskala des Judges; alles ausserhalb wird auf die Skala geklemmt.
SCORE_MIN, SCORE_MAX = 0, 2

#: Oeffentliche API (folgt Redirects; smyst.com leitet auf den Backend-Host um).
DEFAULT_API_BASE = "https://api.smyst.com"

REPORT_PREFIX = "training-evals/"

#: Provider-Kennung des deterministischen Not-Fallbacks. Antworten daraus haben
#: keinen Bezug zur Persona — sie zu bewerten ergaebe eine erfundene Baseline.
DEGRADED_MODE = "local"

#: Der Judge benennt ZUERST die fehlende Anforderung und punktet erst danach.
#: Ohne diese Bindung schwankte er: bei der Dreifachmessung am 14.08.2026 waren
#: 10 von 40 Fragen instabil, darunter Faktenfragen mit [2, 2, 1] — dieselbe
#: Antwortart, dreimal unterschiedlich bewertet. Ein Urteil, das eine konkrete
#: Luecke benennen muss, faellt reproduzierbarer aus als eine freie Zahl.
JUDGE_PROMPT = """Du bist ein strenger Pruefer fuer einen KI-Twin einer historischen Person.
Nur der INHALT zaehlt, nicht Stil, Laenge oder Ton.

Frage an den Twin: {question}
Erwartung an eine gute Antwort: {expect}
Antwort des Twins: {answer}

Gehe in dieser Reihenfolge vor:
1. Nenne knapp, welche Anforderung aus der Erwartung NICHT erfuellt ist —
   oder "keine", wenn alles erfuellt ist.
2. Vergib danach die Punktzahl:
   2 = jede Anforderung der Erwartung ist erfuellt
   1 = mindestens eine Anforderung fehlt, die Antwort geht aber in die
       richtige Richtung
   0 = die Erwartung ist verfehlt oder die Antwort widerspricht ihr

Antworte AUSSCHLIESSLICH mit JSON: {{"fehlt": "...", "score": 0, 1 oder 2}}"""


class DegradedProviderError(RuntimeError):
    """Die Chat-API lieferte eine Not-Fallback-Antwort statt einer echten."""


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


def fetch_twins(api_base: str = DEFAULT_API_BASE, *, timeout: float = 180.0) -> list[dict]:  # pragma: no cover - Netz
    """Holt alle Live-Twins (kuratiert + Pipeline) aus der oeffentlichen API."""
    import httpx

    response = httpx.get(
        f"{api_base}/api/public/twins/",
        params={"limit": 100000},
        timeout=timeout,
        follow_redirects=True,
    )
    response.raise_for_status()
    payload = response.json()
    twins = payload.get("twins") if isinstance(payload, dict) else payload
    return [twin for twin in (twins or []) if isinstance(twin, dict) and twin.get("id")]


def resolve_twins(twins: list[dict], twin_names: set[str]) -> dict[str, dict]:
    """Ordnet Eval-Twin-Namen den Live-Twins zu (case-insensitiv).

    Nur exakte Namens-Treffer — raten (Teilstrings, Slugs) waere gefaehrlicher
    als ueberspringen. Bei Namensdubletten gewinnt der kuratierte Twin: er hat
    die handgepflegte Persona, die das Eval-Set meint.
    """
    by_name: dict[str, dict] = {}
    for twin in twins:
        name = str(twin.get("name") or "").strip()
        if not name:
            continue
        key = name.casefold()
        existing = by_name.get(key)
        if existing is None or (
            str(twin.get("id") or "").startswith("curated-")
            and not str(existing.get("id") or "").startswith("curated-")
        ):
            by_name[key] = twin
    return {name: by_name[name.casefold()] for name in twin_names if name.casefold() in by_name}


def ask_twin(
    twin_id: str,
    question: str,
    language: str | None = None,
    *,
    api_base: str = DEFAULT_API_BASE,
    timeout: float = 180.0,
) -> tuple[str, str | None]:  # pragma: no cover - Netz
    """Stellt EINE Frage ueber die oeffentliche Chat-API; (Antwort, Provider).

    Pro Frage ein frischer Chat — sonst faerbt der Verlauf die naechste Antwort
    und die Fragen waeren nicht mehr unabhaengig bewertbar.
    """
    import httpx

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        start = client.post(f"{api_base}/api/chat/start", json={"twinId": twin_id})
        start.raise_for_status()
        chat_id = start.json()["chat"]["id"]
        body: dict[str, Any] = {"chatId": chat_id, "message": question}
        if language:
            body["language"] = language
        answer = client.post(f"{api_base}/api/chat/messages", json=body)
        answer.raise_for_status()
        payload = answer.json()
        return str(payload["message"]["content"] or ""), payload.get("mode")


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
    """Judge auf Basis der Provider-Kette (in Actions: CI-Gateway)."""

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
    scored = [row for row in rows if isinstance(row.get("score"), (int, float))]

    def _avg(subset: list[dict]) -> float:
        return round(sum(row["score"] for row in subset) / (len(subset) * SCORE_MAX), 4) if subset else 0.0

    categories = sorted({row["category"] for row in scored})
    unstable = [row["id"] for row in scored if row.get("spread")]
    return {
        "questions_total": len(rows),
        "questions_scored": len(scored),
        "questions_skipped": len(rows) - len(scored),
        "score": _avg(scored),
        "by_category": {
            category: _avg([row for row in scored if row["category"] == category])
            for category in categories
        },
        # Fragen, die bei Wiederholung unterschiedlich bewertet wurden. Sie
        # begrenzen die Aussagekraft des Gesamtwerts — ohne diese Liste wuerde
        # man Rauschen fuer Fortschritt halten (Vorfall 14.08.2026).
        "unstable_questions": unstable,
    }


def run_eval(
    questions: list[dict],
    twins: dict[str, dict],
    *,
    ask_fn: Callable[[str, str, str | None], tuple[str, str | None]],
    judge_fn: Callable[[dict, str], int | None],
    repeats: int = 1,
) -> list[dict]:
    """Fragt jeden aufloesbaren Twin und laesst den Judge bewerten (testbar).

    Nicht aufloesbare Twins und Fehler ergeben skip-Zeilen (score None) statt
    stiller Luecken. Eine Not-Fallback-Antwort bricht den Lauf ab.

    repeats > 1 stellt jede Frage mehrfach und mittelt — noetig, weil das
    Instrument sonst zu unscharf ist: zwei Laeufe auf IDENTISCHEM Code ergaben
    am 14.08.2026 95,00 % und 93,75 %, 4 von 40 Fragen wichen ab (persona-007
    sogar 2 gegen 0). Unterschiede unter dieser Streuung sind nicht deutbar.
    Jede Zeile fuehrt zusaetzlich 'scores' (alle Einzelwerte) und 'spread'
    (max-min), damit instabile Fragen sichtbar bleiben statt sich im
    Mittelwert zu verstecken.
    """
    rows: list[dict] = []
    for question in questions:
        twin_name = question["twin_name"]
        row: dict[str, Any] = {
            "id": question["id"],
            "category": question["category"],
            "twin_name": twin_name,
            "score": None,
        }
        twin = twins.get(twin_name)
        if twin is None:
            rows.append({**row, "skip": "twin nicht aufloesbar"})
            continue
        scores: list[int] = []
        answer = ""
        skip: str | None = None
        for _ in range(max(1, repeats)):
            try:
                answer, mode = ask_fn(
                    str(twin["id"]), question["question"], question.get("language")
                )
            except DegradedProviderError:
                raise
            except Exception as error:
                # Mit Meldung, nicht nur Typ: "Chat-Fehler HTTPStatusError"
                # sagt nichts darueber, WAS der Anbieter abgelehnt hat.
                # Gekuerzt, damit ein geschwaetziger Fehler den Bericht nicht
                # flutet; httpx nennt Status und URL, keine Schluessel.
                detail = str(error).replace("\n", " ")[:200]
                skip = f"Chat-Fehler {type(error).__name__}: {detail}"
                break
            if mode == DEGRADED_MODE:
                raise DegradedProviderError(
                    f"Twin {twin_name} antwortete aus dem Not-Fallback (mode={mode})"
                )
            row["mode"] = mode
            if not answer.strip():
                skip = "leere Antwort"
                break
            score = judge_fn(question, answer)
            if score is None:
                skip = "Judge-Antwort unlesbar"
                break
            scores.append(score)

        if not scores:
            rows.append({**row, "answer": answer or None, "skip": skip or "kein Ergebnis"})
            continue
        rows.append({
            **row,
            "answer": answer,
            "score": round(sum(scores) / len(scores), 4),
            "scores": scores,
            "spread": max(scores) - min(scores),
        })
    return rows


def _upload_report(report: dict, key: str) -> bool:  # pragma: no cover - Verdrahtung
    from app.core.config import settings

    if not (settings.idrive_e2_access_key and settings.idrive_e2_secret_key):
        return False
    try:
        from app.integrations.candidate_store import build_s3_client
        from app.workers.ingest_candidates import _pipeline_bucket

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
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="Basis der oeffentlichen API")
    parser.add_argument(
        "--repeats", type=int, default=3,
        help="wie oft jede Frage gestellt wird (Default 3; 1 ist zu verrauscht, "
             "siehe run_eval)",
    )
    parser.add_argument("--out", default="training-export", help="Zielverzeichnis fuer den Report")
    parser.add_argument("--dry-run", action="store_true", help="nur Twin-Aufloesung pruefen, keine LLM-Calls")
    args = parser.parse_args(argv)

    questions = load_eval_set(Path(args.eval_set))
    if args.limit is not None:
        questions = questions[: args.limit]

    wanted = {question["twin_name"] for question in questions}
    twins = resolve_twins(fetch_twins(args.api_base), wanted)
    missing = sorted(wanted - set(twins))
    print(f"{len(questions)} Fragen, {len(twins)}/{len(wanted)} Twins aufgeloest, fehlend: {missing or 'keine'}")
    if args.dry_run:
        return 0
    if not twins:
        print("Kein einziger Twin aufgeloest — Lauf abgebrochen (Report waere wertlos).")
        return 1

    from app.workers.qa_candidates import build_chat_fn

    # temperature=0: der Judge soll dieselbe Antwort immer gleich bewerten.
    judge_base = build_chat_fn(
        {"persona_prompt": "Du bist ein praeziser Pruefer."}, temperature=0.0
    )
    if judge_base is None:
        print("Kein LLM-Provider fuer den Judge konfiguriert — Eval nicht moeglich.")
        return 1

    def ask(twin_id: str, question: str, language: str | None) -> tuple[str, str | None]:
        return ask_twin(twin_id, question, language, api_base=args.api_base)

    try:
        rows = run_eval(questions, twins, ask_fn=ask,
                        judge_fn=build_judge_fn(judge_base), repeats=args.repeats)
    except DegradedProviderError as error:
        print(f"Abbruch: {error} — eine degradierte Baseline waere wertlos.")
        return 1

    summary = aggregate(rows)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    report = {
        "tag": args.tag,
        "createdAt": stamp,
        "eval_set": Path(args.eval_set).name,
        "api_base": args.api_base,
        "repeats": args.repeats,
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
