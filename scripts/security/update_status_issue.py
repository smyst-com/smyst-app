#!/usr/bin/env python3
"""Security-Zentrale als Dauerdashboard-Issue.

Der Autopilot pusht nicht direkt auf main (Repo-Regeln: PR-only). Stattdessen
traegt EIN offenes Issue die Ampel im TITEL (Security-Zentrale — Ampel X),
aktualisiert bei jedem Lauf ohne Kommentar-Spam; ein Kommentar entsteht NUR
bei Ampel-Wechsel (oder mit --comment erzwungen).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SEC = ROOT / ".security"
TITLE_PREFIX = "Security-Zentrale — Ampel"
LABEL = "security-alert"


def _gh(args: list[str]) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
    return result.stdout.strip()


def _find_dashboard_issue() -> tuple[str | None, str | None]:
    raw = _gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number,title", "--limit", "50"])
    try:
        issues = json.loads(raw)
    except Exception:
        return None, None
    for issue in issues:
        if str(issue.get("title", "")).startswith(TITLE_PREFIX):
            return str(issue["number"]), str(issue["title"])
    return None, None


def main() -> int:
    force_comment = "--comment" in sys.argv
    state_data = json.loads((SEC / "state.json").read_text())
    state = state_data["state"]

    issue, current_title = _find_dashboard_issue()
    title = f"{TITLE_PREFIX} {state}"
    if issue is None:
        _gh(["issue", "create", "--title", title, "--label", LABEL, "--body",
             "Dauerdashboard des Security-Autopiloten. Der Titel trägt die aktuelle Ampel.\n"
             "Kommentare nur bei Ampel-Wechsel; Alarme (Radar CRITICAL/RELEVANT) kommen zusätzlich.\n\n"
             "Einzelheiten je Lauf: Workflow-Summary von Security-Autopilot / Security-Radar\n"
             "sowie docs/security/SECURITY_STATUS.md im Repo (Momentaufnahme des letzten Release-Laufs)."])
        print("Dashboard-Issue erstellt:", title)
        return 0

    if current_title != title:
        _gh(["issue", "edit", issue, "--title", title])
        drivers = json.dumps(state_data.get("drivers", {}), ensure_ascii=False)
        previous = (current_title or "?").removeprefix(TITLE_PREFIX).strip()
        _gh(["issue", "comment", issue, "--body",
             f"Ampel-Wechsel: **{previous} → {state}**\n\nTreiber: {drivers}\n\n"
             "Details: Workflow-Summary des auslösenden Laufs."])
        print(f"Ampel-Wechsel kommentiert: {previous} -> {state}")
    elif force_comment:
        _gh(["issue", "comment", issue, "--body",
             f"Bestätigt: Ampel bleibt **{state}** ({state_data.get('updatedAtUtc', '')[:16]} UTC)."])
        print("Zwangs-Kommentar gesetzt")
    else:
        print("Ampel unverändert:", title)
    return 0


if __name__ == "__main__":
    sys.exit(main())
