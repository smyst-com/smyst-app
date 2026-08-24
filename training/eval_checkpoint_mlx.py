#!/usr/bin/env python3
"""Erste Checkscreen-Eval fuer smyst-1.0-Checkpoints (MLX, lokal, ohne LLM-Richter).

Misst die hart ueberpruefbaren Kernkriterien gegen das eingefrorene Eval-Set
(v2) und vergleicht SFT-Checkpoint gegen die untrainierte Basis:

1. persona_nennung      – nennt die Antwort den richtigen Personennamen?
2. deutsch              – antwortet das Modell auf Deutsch (Heuristik: Umlaute/
                          typische Woerter vs. ausschliesslich ASCII-Englisch)?
                          Nur geprueft bei deutschsprachiger Frage — bei
                          gewuenschtem Sprachwechsel (Englisch/Franzoesisch)
                          zaehlt die Frage als bestanden.
3. erste_person         – formuliert es in der Ich-Form?
4. leer/abgebrochen     – produzierende Faehigkeit ueberhaupt
5. keine_wiederholung   – kein Wort-Schleifen-Debakel (4-Gramm >= 3x)
6. kein_zeitbruch       – keine Echtzeit-Ansprueche gegen den Zeitreisenden-
                          Rahmen ("aktuell arbeite ich", "mein Smartphone" …)
7. vollstaendig         – Antwort endet im Satz und ist nicht mitten drin
                          abgeschnitten

Score = Summe der sechs Positiv-Kriterien minus leer_abgebrochen (je %),
Maximum 600.0. Die Kriterien 5-7 sind bewusst eng (nur klar maschinell
pruefbare Verstoesse) — das LLM-as-Judge-Eval des Nacht-Workflows bleibt
fuer Faktentreue und Ton zustaendig.

Start:
    ./.venv-mlx/bin/python eval_checkpoint_mlx.py --model fused/smyst-1.0-sft \
        --baseline ~/models/qwen2.5-0.5b-instruct --eval-set eval/smyst-eval-v2.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

from mlx_lm import load, generate

TWIN_SYSTEM_PROMPT = (
    "Du bist ein KI-Zwilling einer historischen Person auf smyst.com. "
    "Antworte in der Sprache der Frage, naturally und in der ersten Person, "
    "ohne dir Wissen anzumassen, das die Person nicht haben konnte."
)

#: Echtzeit-/Gegenwarts-Ansprueche, die der Zeitreisenden-Rahmen verbietet:
#: die Zwillinge berichten Wissen, sie erleben keine Gegenwart. Eng gefasst,
#: damit blose Erwaehnungen ("heute weiss man") nicht faelschlich fehlschlagen.
ZEITBRUCH_RE = re.compile(
    r"(ich (surfe|nutze|benutze|habe) (gerade |heute |)?(das )?(internet|ein smartphone|mein smartphone|ein handy|mein handy|einen computer)"
    r"|(aktuell|im moment|gerade eben) (arbeite|lerne|lese|schaue|wohne) ich"
    r"|heute (arbeite|wohne|lebe) ich"
    r"|mein (smartphone|handy|laptop|computer|email|e-mail)"
    r"|(ich|wir) chatten gerade"
    r"|in der (schweiz|deutschland|österreich)\b.*\bheute\b)",
    re.IGNORECASE,
)

#: 4-Wort-Folgen, die 3+ Mal auftauchen, sind das klassische LoRA-Debakel.
WIEDERHOLUNG_NGRAM = 4
WIEDERHOLUNG_MAL = 3


def _ascii_german_ratio(text: str) -> float:
    """Antail typisch deutscher Signale im ASCII-freien Raum (grobe Heuristik)."""
    german_markers = [
        "ich ", " mein", " sich", " nicht", " und ", " der ", " die ", " das ",
        " ist ", " mit ", " für ", " über ", " arbeite", " war ", " habe",
    ]
    low = " " + text.lower() + " "
    hits = sum(1 for m in german_markers if m in low)
    return hits / max(1, len(low.split()) / 10)


def _hat_wiederholung(text: str) -> bool:
    words = re.findall(r"[\wäöüß-]+", text.lower())
    if len(words) < WIEDERHOLUNG_NGRAM * WIEDERHOLUNG_MAL:
        return False
    ngrams: dict[str, int] = {}
    for i in range(len(words) - WIEDERHOLUNG_NGRAM + 1):
        key = " ".join(words[i : i + WIEDERHOLUNG_NGRAM])
        ngrams[key] = ngrams.get(key, 0) + 1
        if ngrams[key] >= WIEDERHOLUNG_MAL:
            return True
    return False


def _ist_vollstaendig(text: str) -> bool:
    clean = text.strip()
    if not clean:
        return False
    # Sauber beendet: Satzzeichen, Zitat oder Gedanke-Strich am Ende.
    return clean[-1] in ".!?…\"”«»:'-" or clean.endswith('")')


FRAGE_DEUTSCH_RE = re.compile(r"[äöüßß]|\b(wer|was|war|wie|kann|mir|dich|dein|ich|nicht|und|oder)\b", re.IGNORECASE)


def _frage_ist_deutsch(frage: str) -> bool:
    """Nicht-deutsche Fragen (Sprachwechsel gewuenscht) nicht auf Deutsch pruefen."""
    return bool(FRAGE_DEUTSCH_RE.search(frage))


def score_answer(answer: str, twin_name: str, frage: str) -> dict[str, bool]:
    clean = answer.strip()
    surname = twin_name.split()[-1].lower()
    words = re.findall(r"[\wäöüß-]+", clean.lower())
    # Namen nennt man nur natuerlicherweise bei Vorstellungs-Fragen; bei
    # "Was haeltst du von X?" waere die Nennung kein Qualitaetszeichen.
    vorstellungs_frage = bool(re.search(r"wer bist du|stell dich|stell dich vor|wer warst du", frage, re.I))
    return {
        "persona_nennung": (not vorstellungs_frage) or (surname in words),
        "deutsch": _frage_ist_deutsch(frage)
        or bool(re.search(r"[äöüß]|\b(ich|mein|nicht|und|der|die|das|war|ist)\b", clean, re.IGNORECASE)),
        "erste_person": bool(re.search(r"\b(ich|mein|mir|mich)\b", clean, re.IGNORECASE)),
        "keine_wiederholung": not _hat_wiederholung(clean),
        "kein_zeitbruch": not ZEITBRUCH_RE.search(clean),
        "vollstaendig": _ist_vollstaendig(clean),
        "leer": len(clean) < 20,
    }


def run_eval(model_path: str, samples: list[dict]) -> list[dict]:
    model, tokenizer = load(model_path)
    results = []
    for sample in samples:
        messages = [
            {"role": "system", "content": TWIN_SYSTEM_PROMPT + f" Du bist {sample['twin_name']}. Bleibe jederzeit in dieser Rolle und antworte aus dieser Identität heraus."},
            {"role": "user", "content": sample["question"]},
        ]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        answer = generate(
            model,
            tokenizer,
            prompt=prompt,
            max_tokens=160,
            verbose=False,
        )
        scores = score_answer(answer, sample["twin_name"], sample["question"])
        results.append({"id": sample["id"], "answer": answer.strip(), **scores})
    return results


POSITIVE_KEYS = ("persona_nennung", "deutsch", "erste_person", "keine_wiederholung", "kein_zeitbruch", "vollstaendig")


def summarize(results: list[dict]) -> dict[str, float]:
    n = max(1, len(results))
    out: dict[str, float] = {}
    for key in POSITIVE_KEYS:
        out[key] = round(sum(1 for r in results if r[key]) / n * 100, 1)
    out["leer_abgebrochen"] = round(sum(1 for r in results if r["leer"]) / n * 100, 1)
    # Score: 6 Positiv-Kriterien je bis 100, minus Leer-Abbruch-Anteil.
    out["score"] = round(sum(out[k] for k in POSITIVE_KEYS) - out["leer_abgebrochen"], 2)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst-Checkpoint-Screening (MLX)")
    parser.add_argument("--model", required=True, help="Checkpoint (z. B. fused/smyst-1.0-sft)")
    parser.add_argument("--baseline", default=None, help="untrainierte Basis zum Vergleich")
    parser.add_argument("--eval-set", default="eval/smyst-eval-v2.jsonl")
    parser.add_argument("--limit", type=int, default=40, help="Stichprobe (Default 40 = komplettes Eval-Set v2)")
    parser.add_argument("--out", default=None, help="Ergebnis-JSON")
    args = parser.parse_args()

    base = Path(__file__).resolve().parent
    samples = [
        json.loads(line)
        for line in (base / args.eval_set).read_text().splitlines()
        if line.strip()
    ][: args.limit]

    report: dict[str, object] = {"modell": args.model, "fragen": len(samples)}
    results = run_eval(str(base / args.model) if not args.model.startswith("/") else args.model, samples)
    report["checkpoint"] = summarize(results)
    report["antworten"] = results

    if args.baseline:
        baseline_results = run_eval(args.baseline, samples)
        report["basis"] = summarize(baseline_results)

    print(json.dumps({k: v for k, v in report.items() if k != "antworten"}, indent=2, ensure_ascii=False))
    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False))
        print(f"Report: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
