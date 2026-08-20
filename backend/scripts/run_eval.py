#!/usr/bin/env python3
"""Eval-Lauf fuer den smyst-Chat (Baustein 2): python scripts/run_eval.py

Offline (ohne LLM-Keys) laufen nur Regel-Checks; mit konfiguriertem
Provider zustzlich Fakten-Checks + LLM-as-Judge. Der Report landet in
evals/reports/<datum>-<modus>.json und ist die Baseline fuer den
naechsten Vergleich (Release-Gate auf dem Weg zu smyst 1.1).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.ai.llm_router import build_default_router  # noqa: E402
from app.ai.quality_eval import DETERMINISTIC_PROVIDER, load_eval_set, run_eval  # noqa: E402
from app.api.v1.routes.chat import _build_llm_request  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description="smyst Chat-Qualitaets-Eval")
    parser.add_argument(
        "--dataset", default=str(BACKEND_ROOT / "evals" / "dataset.json"), help="Pfad zum Eval-Set"
    )
    parser.add_argument(
        "--out-dir", default=str(BACKEND_ROOT / "evals" / "reports"), help="Report-Verzeichnis"
    )
    args = parser.parse_args()

    cases = load_eval_set(args.dataset)
    router = build_default_router()
    report = await run_eval(_build_llm_request, router.complete, cases)

    mode = report["judgeMode"]
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H%M%S")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{stamp}-{mode}.json"
    report["generatedAt"] = stamp
    report["dataset"] = args.dataset
    report["providerChain"] = getattr(router, "provider_order", None)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Eval-Report: {out_path}")
    print(
        f"Modus: {mode} | Provider: {report['results'][0]['provider'] if report['results'] else '-'}"
        f" | Faelle: {report['total']} | Bestanden: {report['passed']}"
        f" ({report['passRate']:.0%})"
    )
    if report["judgeAverage"] is not None:
        print(f"LLM-Judge Durchschnitt: {report['judgeAverage']:.1f}/10")
    if report["violations"]:
        print(f"Verletzungs-Typen: {', '.join(report['violations'])}")
    failed = [r for r in report["results"] if not r["passed"]]
    for item in failed[:10]:
        print(f"  FAIL {item['id']}: {', '.join(item['violations']) or 'Judge-Score < 5'}")
    if len(failed) > 10:
        print(f"  ... und {len(failed) - 10} weitere Fehler")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
