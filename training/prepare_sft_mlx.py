#!/usr/bin/env python3
"""Konvertiert smyst-Trainingsexporte in das Chat-Format von MLX (mlx_lm.lora).

Eingabe (aus dem Artefakt des Workflows Trainingsdaten-Export):
    sft-<datum>.jsonl          User->Twin-Austausche (immer dabei)
    qa-judgments-<datum>.jsonl QA-Urteile der Pipeline (optional)

Quellen aus qa-judgments (Schalter):
    --from-qa   Die Antwort-Texte der Urteile sind GPT-4o-generierte
                Twin-Antworten MIT Profilkontext — mit --from-qa werden alle
                verdict=pass-Paare als Persona-SFT-Beispiele aufbereitet
                ("Du bist <Name> (<Kategorie>, <Lebensdaten>) ..."). Das ist
                der Fast-Track-Datensatz: die Pipeline erzeugt ihr eigenes
                Trainingsmaterial als Nebenprodukt (Beschluss 20.08.).
    --with-qa   Urteils-Training (pass/fail) — NUR mit >= 5 % fail_ratio,
                sonst bricht das Skript ab (siehe export_qa_judgments).

Ausgabe (je Zeile ein dict mit "messages"): train.jsonl / valid.jsonl im
Zielverzeichnis. mlx_lm.lora erwartet genau dieses Format.

Regeln:
- Nur Records mit nicht-leerem prompt UND response bzw. answer.
- history (max. 8 Turns laut Export) wird als Vorverlauf uebernommen.
- Deduplizierung ueber den user-Turn-Inhalt — dieselbe Frage mehrfach
  bringt kein zusaetzliches Signal, verzoerrt aber die Verteilung.
- Deterministischer Shuffle (seed 42) vor dem 98/2-Split.

Nutzung:
    python3 prepare_sft_mlx.py --in ../training-export --out ../mlx-data
    python3 prepare_sft_mlx.py --in ../training-export --out ../mlx-data --from-qa
    python3 prepare_sft_mlx.py --in ../training-export --out ../mlx-data --with-qa
"""

from __future__ import annotations

import argparse
import glob
import json
import random
import sys
from pathlib import Path

TWIN_SYSTEM_PROMPT = (
    "Du bist ein KI-Zwilling einer historischen Person auf smyst.com. "
    "Antworte in der Sprache der Frage, naturally und in der ersten Person, "
    "ohne dir Wissen anzumassen, das die Person nicht haben konnte."
)

QA_SYSTEM_PROMPT = (
    "Du pruefst Antworten eines Profil-Zwillings gegen seine Qualitaetsregeln. "
    "Antworte nur mit 'pass' oder 'fail'."
)

#: Eine QA-Frage mit Antwort wird nur verwertet, wenn sie das Urteil wirklich
#: trainierbar macht — siehe Mindest-fail_ratio im Modul-Docstring.
MIN_FAIL_RATIO = 0.05


def _records(paths: list[str]) -> list[dict]:
    out: list[dict] = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    out.append(record)
    return out


def sft_examples(records: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    examples: list[dict] = []
    for record in records:
        prompt = str(record.get("prompt") or "").strip()
        response = str(record.get("response") or "").strip()
        if not prompt or not response:
            continue
        key = (str(record.get("twinId") or ""), prompt)
        if key in seen:
            continue
        seen.add(key)
        messages: list[dict[str, str]] = [{"role": "system", "content": TWIN_SYSTEM_PROMPT}]
        for turn in record.get("history") or []:
            role = turn.get("role")
            content = str(turn.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": prompt})
        messages.append({"role": "assistant", "content": response})
        examples.append({"messages": messages})
    return examples


def qa_answer_examples(records: list[dict]) -> list[dict]:
    """Persona-SFT aus QA-Antworten: nur verdict=pass, Persona im Prompt.

    Ohne Profilkontext waeren die Antworten verwaist (die Antwort gehoert zu
    einer konkreten Person); das Profil-Feld des Urteils liefert genau den
    noetigen Kontext in kompakter Form.
    """
    examples: list[dict] = []
    for record in records:
        if record.get("verdict") != "pass":
            continue
        question = str(record.get("question") or "").strip()
        answer = str(record.get("answer") or "").strip()
        profile = record.get("profile") if isinstance(record.get("profile"), dict) else {}
        name = str(profile.get("name") or "").strip()
        if not question or not answer or not name:
            continue
        facts = [str(profile.get("category") or "").strip()]
        birth = str(profile.get("birth_date") or "").strip()
        death = str(profile.get("death_date") or "").strip()
        if birth:
            facts.append(f"{birth}–{death}" if death else birth)
        persona = f"Du bist {name}"
        if facts:
            persona += f" ({', '.join(f for f in facts if f)})"
        examples.append(
            {
                "messages": [
                    {"role": "system", "content": TWIN_SYSTEM_PROMPT},
                    {"role": "user", "content": f"{persona}. {question}"},
                    {"role": "assistant", "content": answer},
                ]
            }
        )
    return examples


def qa_examples(records: list[dict]) -> list[dict]:
    if not records:
        return []
    fails = sum(1 for record in records if record.get("verdict") == "fail")
    fail_ratio = fails / len(records)
    if fail_ratio < MIN_FAIL_RATIO:
        sys.exit(
            f"fail_ratio {fail_ratio:.1%} unter {MIN_FAIL_RATIO:.0%} — "
            "QA-Urteile taugen nicht zum Training (siehe export_qa_judgments). "
            "Ohne --with-qa weiterarbeiten oder mehr echte Fail-Faelle sammeln."
        )
    examples: list[dict] = []
    for record in records:
        question = str(record.get("question") or "").strip()
        answer = str(record.get("answer") or "").strip()
        verdict = str(record.get("verdict") or "").strip()
        if not question or not answer or verdict not in ("pass", "fail"):
            continue
        examples.append(
            {
                "messages": [
                    {"role": "system", "content": QA_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Frage: {question}\n\nAntwort: {answer}"},
                    {"role": "assistant", "content": verdict},
                ]
            }
        )
    return examples


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst-Export -> MLX-Chat-Format")
    parser.add_argument("--in", dest="indir", required=True, help="Verzeichnis mit den Export-JSONLs")
    parser.add_argument("--out", dest="outdir", required=True, help="Zielverzeichnis (train/valid)")
    parser.add_argument("--from-qa", action="store_true", help="QA-Antworten (nur pass) als Persona-SFT aufbereiten — der Fast-Track-Datensatz")
    parser.add_argument("--with-qa", action="store_true", help="QA-Urteile (pass/fail) zumischen (mit fail_ratio-Gate)")
    parser.add_argument("--valid-frac", type=float, default=0.02, help="Anteil Validierung (Default 0.02)")
    args = parser.parse_args()

    sft_files = sorted(glob.glob(str(Path(args.indir) / "sft-*.jsonl")))
    if not sft_files:
        sys.exit(f"keine sft-*.jsonl in {args.indir} — zuerst Trainingsdaten-Export laufen lassen")
    examples = sft_examples(_records(sft_files))

    qa_files = sorted(glob.glob(str(Path(args.indir) / "qa-judgments-*.jsonl")))
    if args.with_qa and qa_files:
        examples += qa_examples(_records(qa_files))
    if args.from_qa and qa_files:
        examples += qa_answer_examples(_records(qa_files))

    if len(examples) < 50:
        sys.exit(f"nur {len(examples)} Beispiele — fuer ein SFT sind 50 das absolute Minimum, mehr Sammeln lohnt")

    random.Random(42).shuffle(examples)
    valid_count = max(1, int(len(examples) * args.valid_frac))
    split = len(examples) - valid_count

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train.jsonl", examples[:split]), ("valid.jsonl", examples[split:])):
        with (outdir / name).open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(
        f"train: {split}  valid: {valid_count}  "
        f"(SFT-Chats: {len(sft_files)} Quelldatei(en), QA-Persona: {'an' if args.from_qa else 'aus'}, "
        f"QA-Urteile: {'an' if args.with_qa else 'aus'})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
