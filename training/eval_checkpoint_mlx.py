#!/usr/bin/env python3
"""Erste Checkscreen-Eval fuer smyst-1.0-Checkpoints (MLX, lokal, ohne LLM-Richter).

Misst die hart ueberpruefbaren Kernkriterien gegen das eingefrorene Eval-Set
(v2) und vergleicht SFT-Checkpoint gegen die untrainierte Basis:

1. persona_nennung   – nennt die Antwort den richtigen Personennamen?
2. deutsch           – antwortet das Modell auf Deutsch (Heuristik: Umlaute/
                       typische Woerter vs. ausschliesslich ASCII-Englisch)?
3. erste_person      – formuliert es in der Ich-Form?
4. leer/abgebrochen  – produzierende Faehigkeit ueberhaupt

Das ersetzt NICHT das LLM-as-Judge-Eval des Nacht-Workflows (Smaken,
Faktentreue) — es ist das schnelle lokale Vor-Gate: scheitert hier schon
die Persona, lohnt das teure Eval nicht. Ergebnis: JSON + Konsolensummary.

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


def _ascii_german_ratio(text: str) -> float:
    """Antail typisch deutscher Signale im ASCII-freien Raum (grobe Heuristik)."""
    german_markers = [
        "ich ", " mein", " sich", " nicht", " und ", " der ", " die ", " das ",
        " ist ", " mit ", " für ", " über ", " arbeite", " war ", " habe",
    ]
    low = " " + text.lower() + " "
    hits = sum(1 for m in german_markers if m in low)
    return hits / max(1, len(low.split()) / 10)


def score_answer(answer: str, twin_name: str, frage: str) -> dict[str, bool]:
    clean = answer.strip()
    surname = twin_name.split()[-1].lower()
    words = re.findall(r"[\wäöüß-]+", clean.lower())
    # Namen nennt man nur natuerlicherweise bei Vorstellungs-Fragen; bei
    # "Was haeltst du von X?" waere die Nennung kein Qualitaetszeichen.
    vorstellungs_frage = bool(re.search(r"wer bist du|stell dich|stell dich vor|wer warst du", frage, re.I))
    return {
        "persona_nennung": (not vorstellungs_frage) or (surname in words),
        "deutsch": bool(re.search(r"[äöüß]|\b(ich|mein|nicht|und|der|die|das|war|ist)\b", clean, re.IGNORECASE)),
        "erste_person": bool(re.search(r"\b(ich|mein|mir|mich)\b", clean, re.IGNORECASE)),
        "leer": len(clean) < 20,
    }


def run_eval(model_path: str, samples: list[dict]) -> list[dict]:
    model, tokenizer = load(model_path)
    results = []
    for sample in samples:
        messages = [
            {"role": "system", "content": TWIN_SYSTEM_PROMPT},
            {"role": "user", "content": f"Du bist {sample['twin_name']}. {sample['question']}"},
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


def summarize(results: list[dict]) -> dict[str, float]:
    n = max(1, len(results))
    out = {}
    for key in ("persona_nennung", "deutsch", "erste_person"):
        out[key] = round(sum(1 for r in results if r[key]) / n * 100, 1)
    out["leer_abgebrochen"] = round(sum(1 for r in results if r["leer"]) / n * 100, 1)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst-Checkpoint-Screening (MLX)")
    parser.add_argument("--model", required=True, help="Checkpoint (z. B. fused/smyst-1.0-sft)")
    parser.add_argument("--baseline", default=None, help="untrainierte Basis zum Vergleich")
    parser.add_argument("--eval-set", default="eval/smyst-eval-v2.jsonl")
    parser.add_argument("--limit", type=int, default=12, help="Stichprobe (Default 12)")
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
