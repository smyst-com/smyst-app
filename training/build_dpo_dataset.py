#!/usr/bin/env python3
"""smyst DPO-Datensatz: 👍/👎-Praeferenzen -> MLX-DPO-Format.

Voraussetzung: preference-*.jsonl im Trainingsdaten-Export (Workflow
"Trainingsdaten-Export"). Der Export liefert JEDE bewertete Antwort als
Einzelrecord ({prompt, response, rating, twinId, ...}) — rating up/down.
Zusaetzlich werden fertig gepaarte Zeilen ({prompt, chosen, rejected})
unterstuetzt und gehen unangetastet durch.

Paar-Bau (29.09.2026, Inhaber-Auftrag 'DPO-Startkriterium vorziehen'):
Bewertete Antworten werden nach (Twin, normalisierte Frage) gruppiert;
eine Gruppe mit mindestens einer 👍- und einer 👎-Antwort liefert Paare
(chosen = 👍-Antwort, rejected = 👎-Antwort, maximal 3 pro Gruppe, damit
oft bewertete Fragen den Datensatz nicht dominieren). Gruppen ohne beide
Richtungen sind kein DPO-Signal und entfallen.

Ausgabe: --out/train.jsonl|valid.jsonl im MLX-DPO-Format
({"prompt", "chosen", "rejected", "system"}) mit System-Rolle wie im
SFT-Datensatz (Persona im System-Prompt – gleiche Konvention wie v3/v4).

Gate: unter --min-pairs Paaren (Default 30, Inhaber-Freigabe 29.09. —
vorher 100) KEINE Ausgabe und Exit 0 mit Hinweis – der Autopilot
ueberspringt DPO dann sauber, bis echte Nutzer-Feedbacks vorliegen.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SYSTEM_TMPL = (
    "Du bist ein KI-Zwilling einer historischen Person auf smyst.com. "
    "Antworte in der Sprache der Frage, natürlich und in der ersten Person. "
    "Du bist {persona}. Bleibe jederzeit in dieser Rolle und antworte aus "
    "dieser Identität heraus."
)

#: Maximal so viele Paare pro (Twin, Frage)-Gruppe — oft bewertete Fragen
#: sollen den Datensatz nicht dominieren.
MAX_PAARE_PRO_GRUPPE = 3

_LEERZEICHEN = re.compile(r"\s+")


def _norm(text: str) -> str:
    return _LEERZEICHEN.sub(" ", (text or "").strip().lower())


def _lade_zeilen(export_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for path in sorted(export_dir.glob("preference-*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def baue_paare(rows: list[dict]) -> list[dict]:
    """Bewertete Einzelrecords + fertige Paare -> Liste DPO-Paare (rein, testbar)."""
    fertige_paare: list[dict] = []
    gruppen: dict[tuple[str, str], dict[str, list[tuple[str, dict]]]] = {}
    for row in rows:
        prompt = (row.get("prompt") or row.get("question") or "").strip()
        chosen = row.get("chosen") or row.get("good") or row.get("up")
        rejected = row.get("rejected") or row.get("bad") or row.get("down")
        antwort = row.get("response") or row.get("answer")
        rating = row.get("rating")
        persona = row.get("persona") or row.get("twin_name") or row.get("twinId") or ""
        if prompt and isinstance(chosen, str) and chosen.strip() and isinstance(rejected, str) and rejected.strip():
            fertige_paare.append(
                {
                    "prompt": prompt,
                    "chosen": chosen.strip(),
                    "rejected": rejected.strip(),
                    "system": SYSTEM_TMPL.format(persona=persona or "der genannten Person"),
                }
            )
            continue
        if not prompt or not isinstance(antwort, str) or not antwort.strip():
            continue
        if rating not in ("up", "down"):
            continue
        gruppe = gruppen.setdefault((_norm(str(persona)), _norm(prompt)), {"up": [], "down": []})
        gruppe[rating].append((antwort.strip(), row))

    for gruppe in gruppen.values():
        paare = 0
        for antwort_up, row_up in gruppe["up"]:
            for antwort_down, _row_down in gruppe["down"]:
                if paare >= MAX_PAARE_PRO_GRUPPE:
                    break
                persona = (
                    row_up.get("persona")
                    or row_up.get("twin_name")
                    or row_up.get("twinId")
                    or "der genannten Person"
                )
                fertige_paare.append(
                    {
                        "prompt": (row_up.get("prompt") or row_up.get("question") or "").strip(),
                        "chosen": antwort_up,
                        "rejected": antwort_down,
                        "system": SYSTEM_TMPL.format(persona=persona),
                    }
                )
                paare += 1
            if paare >= MAX_PAARE_PRO_GRUPPE:
                break
    return fertige_paare


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst DPO-Datensatz bauen")
    parser.add_argument("--export-dir", default=str(Path.home() / "smyst-train"))
    parser.add_argument("--out", default=str(Path.home() / "smyst-train/dpo-data"))
    parser.add_argument("--min-pairs", type=int, default=30)
    parser.add_argument("--valid-frac", type=float, default=0.05)
    args = parser.parse_args()

    rows = _lade_zeilen(Path(args.export_dir))
    paare = baue_paare(rows)

    if len(paare) < args.min_pairs:
        print(
            f"DPO uebersprungen: nur {len(paare)} Praeferenzpaare aus {len(rows)} "
            f"bewerteten Antworten (mindestens {args.min_pairs}). Sammle weiter "
            f"Nutzer-Feedback — Paare entstehen nur, wenn dieselbe Frage mindestens "
            f"einmal 👍 und einmal 👎 erhielt."
        )
        return 0

    split = max(1, int(len(paare) * args.valid_frac))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "train.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in paare[split:]) + "\n",
        encoding="utf-8",
    )
    (out / "valid.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in paare[:split]) + "\n",
        encoding="utf-8",
    )
    print(f"DPO-Datensatz: {len(rows)} bewertete Antworten -> {len(paare)} Paare "
          f"(train {len(paare) - split}, valid {split}) -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
