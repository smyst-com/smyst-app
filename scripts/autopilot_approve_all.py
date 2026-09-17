"""Ein-Klick-Freigabe fuer den Versions-Autopilot (Inhaber-Delegation).

Fuehrt exakt dieselbe, getestete Backend-Logik aus wie der Button
'Alle freigeben' im Admin-Cockpit (app.api.v1.routes.admin_versions):
jeder offene Staging-Eintrag wird nach QA-Ergebnis live geschaltet,
die alte Version archiviert, die Entscheidung in applied/ gesichert und
der Marker als Tombstone geschlossen. Nichts wird geloescht.

Nur per workflow_dispatch mit Bestaetigung, damit kein Lauf versehentlich
feuert. Der Inhaber hat die Freigabe im Chat erteilt (17.09.2026:
'Mach du Alle freigeben'); approved_by vermerkt das ehrlich.

    python scripts/autopilot_approve_all.py --dry-run   # nur zeigen
    python scripts/autopilot_approve_all.py             # freigeben
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.api.v1.routes import admin_versions as av  # noqa: E402

APPROVED_BY = "inhaber-delegation (Alle freigeben, Chat 17.09.2026)"
WORKERS = 12


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nur auflisten, nichts schalten")
    args = parser.parse_args()

    store = av._store()
    cards = av._load_pending(store)
    print(f"Offene Freigaben: {len(cards)}")
    for card in cards[:10]:
        print(f"  z. B. {card['qid']}: v{card.get('old_version')} -> v{card.get('new_version')} "
              f"(Eval {card.get('old_score')} -> {card.get('new_score')}, {card.get('staged_at', '')[:16]})")
    if len(cards) > 10:
        print(f"  ... und {len(cards) - 10} weitere")
    if args.dry_run:
        print("DRY-RUN — nichts geschaltet.")
        return 0
    if not cards:
        print("Nichts zu tun — Liste ist leer.")
        return 0

    qids = [c["qid"] for c in cards]

    def _apply_one(qid: str) -> str:
        try:
            return av._apply_pending(store, qid, APPROVED_BY)
        except Exception as error:  # noqa: BLE001 - EinzelneProfile stoppen den Stapel nicht
            return f"abgebrochen (Fehler: {error}) — Live unveraendert"

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = dict(zip(qids, pool.map(_apply_one, qids)))

    applied = sum(1 for value in results.values() if value.startswith("live"))
    skipped = sum(1 for value in results.values() if value.startswith("uebersprungen"))
    aborted = sum(1 for value in results.values() if value.startswith("abgebrochen"))
    print(f"Ergebnis: {applied} live geschaltet, {skipped} uebersprungen, {aborted} abgebrochen "
          f"von {len(results)} insgesamt.")
    for qid, value in results.items():
        if not value.startswith("live"):
            print(f"  {qid}: {value}")
    print(json.dumps({"applied": applied, "skipped": skipped, "aborted": aborted,
                      "total": len(results)}, ensure_ascii=False))
    return 0 if applied + skipped == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
