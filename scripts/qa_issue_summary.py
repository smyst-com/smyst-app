"""Read-only Diagnose: Warum lehnt die QA Kandidaten ab? (11.09.2026 Stillstand)

Liest Status-Verteilung + QA-Reports aus dem IDrive-e2-Store und aggregiert:
- Trichter-Zahlen je Status (candidate .. published)
- Haeufigkeit der QA-Issues (Top 25) ueber alle 'generated'-Kandidaten
- 3 Beispiel-Antworten (identity/after_death/trap) durchgefallener Kandidaten

Schreibt NICHTS in den Store. Aufruf nur innerhalb der Pipeline-Workflows
(benoetigt IDRIVE_E2_* Secrets):

    python scripts/qa_issue_summary.py [--scan 500] [--examples 3]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.ai.historical_pipeline import PipelineStatus  # noqa: E402
from app.integrations.candidate_store import CandidateStore, build_s3_client  # noqa: E402
from app.workers.ingest_candidates import _pipeline_bucket  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="QA-Issue-Diagnose (read-only)")
    parser.add_argument("--scan", type=int, default=500, help="maximal zu scannende generated-Docs")
    parser.add_argument("--examples", type=int, default=3, help="Beispiel-Antworten anzeigen")
    args = parser.parse_args()

    store = CandidateStore(build_s3_client(), _pipeline_bucket())

    funnel: dict[str, int] = {}
    for status in PipelineStatus:
        try:
            docs = store.candidate_documents_by_status(status.value, limit=5000)
        except Exception as error:  # noqa: BLE001 - Diagnose soll weiterlaufen
            print(f"funnel[{status.value}]: FEHLER {type(error).__name__}: {error}")
            continue
        funnel[status.value] = len(docs)

    print("=== TRICHTER ===")
    print(json.dumps(funnel, ensure_ascii=False, indent=2))

    generated = store.candidate_documents_by_status(
        PipelineStatus.GENERATED.value, limit=args.scan
    )
    issue_counter: Counter[str] = Counter()
    checks_counter: Counter[str] = Counter()
    with_report = 0
    passed_but_still_generated = 0
    examples: list[dict] = []
    for doc in generated:
        report = doc.get("qa_report")
        if not report:
            continue
        with_report += 1
        if report.get("passed"):
            passed_but_still_generated += 1
        for issue in report.get("issues", []):
            issue_counter[issue] += 1
        for check, status in (report.get("checks") or {}).items():
            checks_counter[f"{check}={status}"] += 1
        if args.examples > 0 and not report.get("passed") and len(examples) < args.examples:
            examples.append(
                {
                    "qid": doc.get("wikidata_qid"),
                    "name": doc.get("name"),
                    "issues": report.get("issues", [])[:6],
                    "chat_answers": {
                        k: (v or "")[:400]
                        for k, v in (report.get("chat_answers") or {}).items()
                    },
                }
            )

    print(f"\n=== QA-REPORTS in 'generated' ({with_report} von {len(generated)} gescannten) ===")
    print(f"passed=True aber noch generated: {passed_but_still_generated}")
    print("\n--- Checks ---")
    for key, count in checks_counter.most_common(20):
        print(f"{count:6d}  {key}")
    print("\n--- Issues (Top 25) ---")
    for key, count in issue_counter.most_common(25):
        print(f"{count:6d}  {key}")
    print("\n--- BEISPIELE durchgefallener Kandidaten ---")
    print(json.dumps(examples, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
