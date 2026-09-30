#!/usr/bin/env python3
"""Security-Status-Composer: Ampel + zentrale Sicherheits-Datei (Teil H/I).

Liest .security/{live_probe,radar}.json (+ optionale Zusaetze) und erzeugt:
- .security/state.json          (GREEN/YELLOW/ORANGE/RED, maschinenlesbar)
- docs/security/SECURITY_STATUS.md  (Dashboard fuer Inhaber + Agenten)

Ampel-Logik (bewusst einfach und dokumentierbar):
- RED      : CRITICAL-Radarfund (inkl. CISA-KEV) ODER Canary-Treffer>0
- ORANGE   : Live-Probe-GUARD-Check fehlgeschlagen (Sicherheitsmechanismus weg)
             ODER RELEVANT-Radarfund
- YELLOW   : sonstiger Live-Probe-Fail (Availability) ODER POSSIBLY-Funde
- GREEN    : alles bestanden

Sprache: niemals '100 % sicher' — nur 'im geprueften Umfang keine bekannten
kritischen Probleme festgestellt'.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SEC = ROOT / ".security"
DOCS = ROOT / "docs" / "security"

GUARD_CHECK_PREFIXES = ("guard_", "forged_", "openapi_", "providers_", "ads_", "hsts", "csp_", "nosniff", "anti_frame", "canary_clean", "session_revocation")


def _load(name: str) -> dict | None:
    path = SEC / name
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return None
    return None


def main() -> int:
    probe = _load("live_probe.json") or {}
    radar = _load("radar.json") or {}
    sbom = _load("sbom.json") or {}
    now = datetime.now(timezone.utc)

    failed = [r for r in probe.get("results", []) if not r.get("ok")]
    guard_fails = [r for r in failed if str(r.get("name", "")).startswith(GUARD_CHECK_PREFIXES)]
    avail_fails = [r for r in failed if r not in guard_fails]
    counts = radar.get("counts", {})
    critical = int(counts.get("critical", 0))
    relevant = int(counts.get("relevant", 0))
    possibly = int(counts.get("possibly", 0))
    canary_hit = any(r.get("name") == "canary_clean" and not r.get("ok") for r in failed)

    if critical > 0 or canary_hit:
        state = "RED"
    elif guard_fails:
        state = "ORANGE"
    elif relevant > 0:
        state = "ORANGE"
    elif avail_fails or possibly > 0:
        state = "YELLOW"
    else:
        state = "GREEN"

    (SEC / "state.json").write_text(
        json.dumps(
            {
                "state": state,
                "updatedAtUtc": now.isoformat(),
                "drivers": {
                    "criticalRadar": critical,
                    "relevantRadar": relevant,
                    "possiblyRadar": possibly,
                    "guardFails": len(guard_fails),
                    "availabilityFails": len(avail_fails),
                    "canaryHit": canary_hit,
                },
            },
            indent=1,
        )
        + "\n"
    )

    lines = [
        "# Security-Zentrale — smyst.com",
        "",
        f"**Ampel: {state}** (Stand: {now.strftime('%Y-%m-%d %H:%M')} UTC, automatisch erstellt)",
        "",
        "> Continuous Security Assurance: Aussagen gelten nur im überwachten und",
        "> getesteten Umfang — niemals '100 % sicher'.",
        "",
        "## SECURITY (Autopilot 1)",
        "",
        f"- Letzte Live-Probe: **{probe.get('checksTotal', 0) - len(failed)}/{probe.get('checksTotal', 0)}** Checks bestanden"
        + (f" ({probe.get('probedAtUtc', '')[:16]})" if probe else " (noch kein Lauf)"),
    ]
    if guard_fails:
        lines.append("- **Sicherheitsmechanismus-Regression:**")
        lines += [f"  - ❌ {r['name']}: {r['detail']}" for r in guard_fails]
    else:
        lines.append("- Sicherheitsmechanismen (Guards, Header, Redaction, Limits): alle aktiv ✅")
    if avail_fails:
        lines.append("- Verfügbarkeit/Able-Befunde (kein Sicherheitsregress, aber offenes Thema):")
        lines += [f"  - ⚠️ {r['name']}: {r['detail']}" for r in avail_fails]
    canary = "Treffer! (RED)" if canary_hit else "unberührt ✅"
    lines += [
        f"- Honeypot-Canary: {canary}",
        f"- SBOM: {sbom.get('counts', {}).get('total', '?')} Komponenten ({sbom.get('counts', {}).get('npm', '?')} npm / {sbom.get('counts', {}).get('pypi', '?')} pypi)"
        + (f", erstellt {sbom.get('generatedAtUtc', '')[:16]}" if sbom else ""),
        "- Secret-Scan: Secret-Pilot (gitleaks) läuft bei jedem Push — Offene Leaks: siehe Issues mit Label `secret-leak`",
        "- Dependency-Audit: npm audit + pip-audit wöchentlich (Dependency-Security-Pilot) — Issues mit Label `dependency-vulnerability`",
        "",
        "## SECURITY RADAR (Autopilot 2)",
        "",
        f"- Letzter Lauf: {radar.get('scannedAtUtc', 'noch keiner')[:16] if radar else 'noch keiner'}",
        f"- Quellen: OSV.dev (Version-Matching serverseitig), CISA-KEV-Abgleich ({radar.get('kevEntries', '?')} Einträge)",
        f"- Treffer: **{critical} CRITICAL** / {relevant} RELEVANT / {possibly} POSSIBLY"
        f" bei {radar.get('componentsChecked', '?')} geprüften Komponenten",
    ]
    for finding in radar.get("findings", [])[:8]:
        flag = "🔴" if finding["classification"] == "CRITICAL" else ("🟠" if finding["classification"] == "RELEVANT" else "🟡")
        kev = " · CISA-KEV!" if finding.get("inCisaKev") else ""
        lines.append(f"  - {flag} {finding['vulnId']} · {finding['package']}@{finding['installedVersion']} · {finding['classification']}{kev}")
        if finding.get("url"):
            lines.append(f"    <{finding['url']}>")
    if not radar.get("findings"):
        lines.append("  - Keine Treffer im geprüften Bestand.")
    lines += [
        "",
        "## Bedeutung der Ampel",
        "",
        "| Farbe | Bedeutung |",
        "|---|---|",
        "| GREEN | Im überwachten Umfang aktuell keine bekannten kritischen Probleme festgestellt |",
        "| YELLOW | Neue/mittlere Risiken oder Availability-Befunde — untersuchen |",
        "| ORANGE | Hoher Risiko-Fund oder Sicherheitsmechanismus-Regression |",
        "| RED | Kritische Lücke (inkl. CISA-KEV) oder Honeypot-Treffer — Produktionssperre prüfen |",
        "",
        "## Alarme & Wiederherstellung",
        "",
        "- Alarm-Issues: Label `security-alert` (Radar/Probe), `secret-leak`, `dependency-vulnerability`",
        "- Incident-Ablauf: siehe `docs/SECURITY_AUDIT_2026-09-28.md` + Memory_Bank",
        "- Rollback jeder Änderung: `git revert` des zugehörigen Merge-Commits",
        "",
    ]
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "SECURITY_STATUS.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"STATUS: {state} (guards={len(guard_fails)}F avail={len(avail_fails)}F radar C/R/P={critical}/{relevant}/{possibly}) -> docs/security/SECURITY_STATUS.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
