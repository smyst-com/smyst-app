#!/usr/bin/env python3
"""Schreibt die Radar-Kurzfassung in die Workflow-Step-Summary."""
from __future__ import annotations

import json
from pathlib import Path

data = json.loads((Path(__file__).resolve().parent.parent.parent / ".security" / "radar.json").read_text())
print("## Security Radar")
print(
    f"- {data['componentsChecked']} Komponenten gegen OSV.dev + "
    f"{data['kevEntries']} CISA-KEV-Einträge"
)
counts = data["counts"]
print(f"- Treffer: {counts['critical']} CRITICAL / {counts['relevant']} RELEVANT / {counts['possibly']} POSSIBLY")
for finding in data.get("findings", [])[:10]:
    kev = " · CISA-KEV!" if finding.get("inCisaKev") else ""
    print(f"- {finding['classification']}: {finding['vulnId']} · {finding['package']}@{finding['installedVersion']}{kev}")
print("\n> Ampel-Komposition macht der Security-Autopilot (alle 6 h, gleiche Datenbasis).")
