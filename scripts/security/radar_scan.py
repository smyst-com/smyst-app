#!/usr/bin/env python3
"""SECURITY RADAR: weltweite Bedrohungslage gegen den smyst-Stack pruefen.

Quellen (alles kostenlos, keine Keys):
- OSV.dev Query-Batch-API: meldet pro (Paket, installierte Version) genau die
  Schwachstellen, die DIESE Version betreffen — das Version-Matching macht
  OSV serverseitig, wir raten nicht.
- CISA KEV (Known Exploited Vulnerabilities): aktiv ausgenutzte CVE-IDs.
  Treffer mit unserem Bestand = CRITICAL ACTION REQUIRED.

Klassifikation je Fund:
  CRITICAL  – in CISA-KEV (aktiv ausgenutzt) ODER OSV-Schweregrad critical
  RELEVANT  – OSV-Schweregrad high
  POSSIBLY  – medium/low/unbekannt (Pruefung wert)
  NOT RELEVANT wird nicht ausgegeben (nur Treffer landen im Report).

Ausgaben: .security/radar.json (+ Markdown-Summary auf stdout).
Kein Fund heisst NICHT '100 % sicher', sondern: im abgedeckten Quellen-
und Bestandsumfang aktuell keine bekannten Treffer.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / ".security" / "radar.json"
OSV_BATCH = "https://api.osv.dev/v1/querybatch"
OSV_VULN = "https://api.osv.dev/v1/vulns/"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
BATCH_SIZE = 500  # OSV erlaubt 1000 Abfragen pro Batch-Request


def _get_json(url: str, timeout: float = 30) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "smyst-security-radar/1.0 (+https://smyst.com)"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _post_json(url: str, payload: dict, timeout: float = 60) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def load_kev() -> set[str]:
    try:
        data = _get_json(KEV_URL)
        return {
            str(v.get("cveID", "")).upper()
            for v in data.get("vulnerabilities", [])
            if v.get("cveID")
        }
    except Exception as error:
        print(f"WARNUNG: KEV-Liste nicht erreichbar ({type(error).__name__}) — KEV-Abgleich dieses Lauf unvollstaendig.")
        return set()


def severity_of(vuln: dict) -> str:
    specific = vuln.get("database_specific") or {}
    for key in ("severity", "cvss"):
        value = str(specific.get(key, "")).lower()
        if value in {"critical", "high", "medium", "low"}:
            return value
    # GitHub-Advisories liefern oft severity im database_specific.severity;
    # PyPI/OSV teils unter severity[].type CVSS_V4/V3 — Label bleibt dann unbekannt.
    return "unknown"


def aliases_of(vuln: dict) -> list[str]:
    return [str(a).upper() for a in vuln.get("aliases", []) if a] + [str(vuln.get("id", "")).upper()]


def main() -> int:
    sbom_path = ROOT / ".security" / "sbom.json"
    if not sbom_path.exists():
        print("FEHLER: .security/sbom.json fehlt — zuerst generate_sbom.py laufen lassen.")
        return 2
    components = json.loads(sbom_path.read_text())["components"]
    kev = load_kev()

    findings: list[dict] = []
    checked = 0
    for start in range(0, len(components), BATCH_SIZE):
        chunk = components[start : start + BATCH_SIZE]
        queries = [
            {"package": {"name": c["name"], "ecosystem": c["ecosystem"]}, "version": c["version"]}
            for c in chunk
        ]
        try:
            response = _post_json(OSV_BATCH, {"queries": queries})
        except Exception as error:
            print(f"WARNUNG: OSV-Batch ab {start} fehlgeschlagen ({type(error).__name__}) — Teilbestand ungeprueft.")
            continue
        for component, result in zip(chunk, response.get("results", [])):
            checked += 1
            for vuln in result.get("vulns", []) or []:
                aliases = aliases_of(vuln)
                in_kev = bool(kev and (set(aliases) & kev))
                severity = severity_of(vuln)
                if in_kev or severity == "critical":
                    classification = "CRITICAL"
                elif severity == "high":
                    classification = "RELEVANT"
                else:
                    classification = "POSSIBLY"
                findings.append(
                    {
                        "package": component["name"],
                        "ecosystem": component["ecosystem"],
                        "installedVersion": component["version"],
                        "vulnId": vuln.get("id"),
                        "aliases": sorted(set(a for a in aliases if a))[:6],
                        "severity": severity,
                        "inCisaKev": in_kev,
                        "classification": classification,
                        "summary": str(vuln.get("summary") or vuln.get("details") or "")[:220],
                        "url": f"https://osv.dev/vulnerability/{vuln.get('id', '')}",
                    }
                )
        time.sleep(1.2)  # freundlich gegenueber der kostenlosen API

    # Duplikate (gleiche Vuln in mehreren Paketversionen) kompaktieren
    seen: dict[str, dict] = {}
    for finding in findings:
        key = f"{finding['vulnId']}@{finding['package']}"
        if key not in seen:
            seen[key] = finding

    critical = [f for f in seen.values() if f["classification"] == "CRITICAL"]
    relevant = [f for f in seen.values() if f["classification"] == "RELEVANT"]
    possibly = [f for f in seen.values() if f["classification"] == "POSSIBLY"]

    report = {
        "scannedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sources": ["osv.dev", "cisa-kev"],
        "componentsChecked": checked,
        "kevEntries": len(kev),
        "counts": {
            "critical": len(critical),
            "relevant": len(relevant),
            "possibly": len(possibly),
        },
        "findings": sorted(seen.values(), key=lambda f: (f["classification"] != "CRITICAL", f["classification"] != "RELEVANT", f["package"])),
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    print(f"RADAR: {checked} Komponenten geprueft | KEV-Eintraege: {len(kev)}")
    print(f"  CRITICAL: {len(critical)} | RELEVANT: {len(relevant)} | POSSIBLY: {len(possibly)}")
    for finding in critical[:10]:
        print(f"  !! {finding['vulnId']} {finding['package']}@{finding['installedVersion']} KEV={finding['inCisaKev']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
