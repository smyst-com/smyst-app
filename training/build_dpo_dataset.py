#!/usr/bin/env python3
"""smyst DPO-Datensatz: 👍/👎-Präferenzpaare -> MLX-DPO-Format.

Voraussetzung: preference-*.jsonl im Trainingsdaten-Export (Workflow
"Trainingsdaten-Export"). Format pro Zeile (vom Export): {"prompt": str,
"chosen": str, "rejected": str} – oder {"question","good","bad"}.

Ausgabe: --out/train.jsonl|valid.jsonl im MLX-DPO-Format
({"prompt", "chosen", "rejected"}), mit System-Rolle wie im SFT-Datensatz
(Persona im System-Prompt – gleiche Konvention wie v3/v4).

Gate: unter --min-pairs Paaren (Default 100) KEINE Ausgabe und Exit 0 mit
Hinweis – der Sonntags-Autopilot ueberspringt DPO dann sauber, bis echte
Nutzer-Feedbacks vorliegen.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SYSTEM_TMPL = (
    "Du bist ein KI-Zwilling einer historischen Person auf smyst.com. "
    "Antworte in der Sprache der Frage, natürlich und in der ersten Person. "
    "Du bist {persona}. Bleibe jederzeit in dieser Rolle und antworte aus "
    "dieser Identität heraus."
)


def _normalize(row: dict) -> dict | None:
    prompt = row.get("prompt") or row.get("question")
    chosen = row.get("chosen") or row.get("good") or row.get("up")
    rejected = row.get("rejected") or row.get("bad") or row.get("down")
    if not (prompt and chosen and rejected):
        return None
    persona = row.get("persona") or row.get("twin_name") or "der genannten Person"
    return {
        "prompt": prompt,
        "chosen": chosen,
        "rejected": rejected,
        "system": SYSTEM_TMPL.format(persona=persona),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="smyst DPO-Datensatz bauen")
    parser.add_argument("--export-dir", default=str(Path.home() / "smyst-train"))
    parser.add_argument("--out", default=str(Path.home() / "smyst-train/dpo-data"))
    parser.add_argument("--min-pairs", type=int, default=100)
    parser.add_argument("--valid-frac", type=float, default=0.05)
    args = parser.parse_args()

    export_dir = Path(args.export_dir)
    rows: list[dict] = []
    for path in sorted(export_dir.glob("preference-*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                normalized = _normalize(json.loads(line))
            except json.JSONDecodeError:
                continue
            if normalized:
                rows.append(normalized)

    if len(rows) < args.min_pairs:
        print(
            f"DPO uebersprungen: nur {len(rows)} Praeferenzpaare "
            f"(mindestens {args.min_pairs}). Sammle weiter Nutzer-Feedback."
        )
        return 0

    split = max(1, int(len(rows) * args.valid_frac))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "train.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows[split:]) + "\n",
        encoding="utf-8",
    )
    (out / "valid.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows[:split]) + "\n",
        encoding="utf-8",
    )
    print(f"DPO-Datensatz: train {len(rows) - split}, valid {split} Paare -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
