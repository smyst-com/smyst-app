#!/usr/bin/env python3
"""Alarm-Issue pflegen (security-alert, idempotent) fuer Autopilot + Radar.

Laesst sich nur um GitHub-CLI kuemmern (GH_TOKEN im Environment) und baut
den Issue-Body aus .security/*.json — bewusst ohne Secrets, ohne Heredocs.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SEC = ROOT / ".security"


def _gh(args: list[str], check: bool = True) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[:200])
    return result.stdout.strip()


def main() -> int:
    source = "autopilot"
    state = "YELLOW"
    for index, arg in enumerate(sys.argv):
        if arg == "--source" and index + 1 < len(sys.argv):
            source = sys.argv[index + 1]
        if arg == "--state" and index + 1 < len(sys.argv):
            state = sys.argv[index + 1]

    lines: list[str] = []
    try:
        state_data = json.loads((SEC / "state.json").read_text())
        lines.append(f"Ampel: **{state_data['state']}** ({state_data['updatedAtUtc'][:16]} UTC) — Quelle: {source}")
    except Exception:
        lines.append(f"Ampel: {state} — Quelle: {source}")
    try:
        probe = json.loads((SEC / "live_probe.json").read_text())
        for result in probe.get("results", []):
            if not result.get("ok"):
                grave = str(result.get("name", "")).startswith(("guard_", "canary_", "forged_"))
                lines.append(f"- {'X' if grave else '!'} {result['name']}: {result['detail']}")
    except Exception:
        pass
    try:
        radar = json.loads((SEC / "radar.json").read_text())
        for finding in radar.get("findings", []):
            if finding.get("classification") in ("CRITICAL", "RELEVANT"):
                kev = " · CISA-KEV (aktiv ausgenutzt)!" if finding.get("inCisaKev") else ""
                lines.append(
                    f"- {finding['classification']}: {finding['vulnId']} · {finding['package']}@{finding['installedVersion']}{kev}"
                    f" ({finding['url']})"
                )
    except Exception:
        pass
    body = "\n".join(lines) or "Keine Details verfuegbar."

    open_issues = _gh(["issue", "list", "--label", "security-alert", "--state", "open", "--json", "number", "--jq", "length"])
    title = f"Security-Alarm ({source}): Ampel {state} — {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')} UTC"
    if open_issues == "0":
        _gh(["issue", "create", "--title", title, "--label", "security-alert", "--body", body])
        print("Alarm-Issue erstellt")
    else:
        number = _gh(["issue", "list", "--label", "security-alert", "--state", "open", "--json", "number", "--jq", ".[0].number"])
        _gh(["issue", "comment", number, "--body", body])
        print(f"Alarm-Issue #{number} aktualisiert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
