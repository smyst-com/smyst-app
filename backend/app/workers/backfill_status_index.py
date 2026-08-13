"""smyst.com Einmal-Backfill: Status-Marker fuer den Kandidaten-Bestand.

Messung 13.08.2026: `candidate_documents_by_status` lud JEDES Kandidaten-
Dokument einzeln, nur um nach Status zu filtern — bei ~14.000 Kandidaten ~12
Minuten pro Aufruf und viermal pro Pipeline-Lauf, also ~48 Minuten reiner
Leerlauf, linear mit dem Bestand wachsend. Belegt durch Laeufe, in denen die
Stufen `{"results": 0, "errors": 0}` meldeten und trotzdem 12 Minuten brauchten.

Seit dem Umbau genuegt ein LIST-Aufruf je Status — sofern Marker existieren.
Dieser Worker legt sie fuer den Bestand einmalig an. Danach greift der schnelle
Weg automatisch; neue Kandidaten pflegen ihren Marker beim Speichern selbst.

Bis dieser Lauf durch ist, arbeitet die Pipeline unveraendert weiter (der Store
faellt ohne Marker auf den alten Voll-Scan zurueck) — die Umstellung kann also
keinen Lauf leerlaufen lassen.

Start:
    python -m app.workers.backfill_status_index --dry-run
    python -m app.workers.backfill_status_index
"""

from __future__ import annotations

import argparse
import collections
import json
import sys

from app.integrations.candidate_store import CandidateStore, build_s3_client


def plan_markers(documents: dict[str, dict]) -> dict[str, str]:
    """QID -> Status fuer alle Dokumente mit brauchbarem Status (rein, testbar)."""
    plan: dict[str, str] = {}
    for qid, document in documents.items():
        status = document.get("status")
        if isinstance(status, str) and status and qid:
            plan[qid] = status
    return plan


def summarize(plan: dict[str, str]) -> dict:
    counts = collections.Counter(plan.values())
    return {"markers": len(plan), "by_status": dict(sorted(counts.items()))}


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Status-Marker-Backfill (einmalig)")
    parser.add_argument("--dry-run", action="store_true", help="nur zaehlen, nichts schreiben")
    parser.add_argument("--limit", type=int, default=None, help="max. Anzahl Kandidaten")
    args = parser.parse_args(argv)

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    qids = sorted(store.existing_qids())
    if args.limit is not None:
        qids = qids[: args.limit]

    documents: dict[str, dict] = {}
    unreadable = 0
    for qid in qids:
        try:
            documents[qid] = store.load_candidate_document(qid)
        except Exception:
            unreadable += 1

    plan = plan_markers(documents)
    print(json.dumps({"scanned": len(qids), "unreadable": unreadable, **summarize(plan)}, indent=2))
    if args.dry_run:
        print("Dry-Run: keine Marker geschrieben.")
        return 0

    written = 0
    for qid, status in plan.items():
        store.write_status_marker(qid, status)
        written += 1
        if written % 1000 == 0:
            print(f"  {written}/{len(plan)} Marker geschrieben", flush=True)
    print(f"Fertig: {written} Marker geschrieben. Der schnelle Weg greift ab sofort.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
