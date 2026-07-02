"""smyst.com Pipeline-Status-Report (read-only).

Listet alle Kandidaten im IDrive-e2-Store mit Status, Risiko-Score und
QA-Ergebnis — die Entscheidungsgrundlage fuer die menschliche Freigabe.
Schreibt nichts.

    python -m app.workers.report_status
"""

from __future__ import annotations

import json
from collections import Counter

from app.integrations.candidate_store import CandidateStore, build_s3_client


def build_report(store: CandidateStore) -> dict:
    candidates = []
    counts: Counter[str] = Counter()
    for qid in sorted(store.existing_qids()):
        doc = store.load_candidate_document(qid)
        status = doc.get("status", "?")
        counts[status] += 1
        qa = doc.get("qa_report") or {}
        candidates.append(
            {
                "qid": qid,
                "name": doc.get("name"),
                "status": status,
                "category": doc.get("category"),
                "death_date": doc.get("death_date"),
                "risk_score": doc.get("risk_score"),
                "risk_flags": doc.get("risk_flags"),
                "qa_passed": doc.get("qa_passed", False),
                "qa_issues": qa.get("issues", []),
                "status_reason": doc.get("status_reason"),
            }
        )
    return {"counts": dict(counts), "candidates": candidates}


def main() -> int:  # pragma: no cover - CLI-Verdrahtung
    from app.core.config import settings

    store = CandidateStore(build_s3_client(), settings.idrive_e2_bucket)
    report = build_report(store)
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
