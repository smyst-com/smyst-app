# Security-Zentrale — smyst.com

**Ampel: RED** (Stand: 2026-09-30 09:19 UTC, automatisch erstellt)

> Continuous Security Assurance: Aussagen gelten nur im überwachten und
> getesteten Umfang — niemals '100 % sicher'.

## SECURITY (Autopilot 1)

- Letzte Live-Probe: **20/22** Checks bestanden (2026-09-30T09:08)
- **Sicherheitsmechanismus-Regression:**
  - ❌ canary_clean: status=404 count=-1
- Verfügbarkeit/Able-Befunde (kein Sicherheitsregress, aber offenes Thema):
  - ⚠️ guest_chat_real_answer: Versuch 2: mode=local Antwort='Entschuldige - ich kann gerade nicht auf mein Wissen zugreif'
- Honeypot-Canary: Treffer! (RED)
- SBOM: 285 Komponenten (285 npm / 0 pypi), erstellt 2026-09-30T08:57
- Secret-Scan: Secret-Pilot (gitleaks) läuft bei jedem Push — Offene Leaks: siehe Issues mit Label `secret-leak`
- Dependency-Audit: npm audit + pip-audit wöchentlich (Dependency-Security-Pilot) — Issues mit Label `dependency-vulnerability`

## SECURITY RADAR (Autopilot 2)

- Letzter Lauf: 2026-09-30T09:01
- Quellen: OSV.dev (Version-Matching serverseitig), CISA-KEV-Abgleich (0 Einträge)
- Treffer: **0 CRITICAL** / 0 RELEVANT / 3 POSSIBLY bei 285 geprüften Komponenten
  - 🟡 GHSA-6j4f-fj2g-mc7p · brace-expansion@5.0.9 · POSSIBLY
    <https://osv.dev/vulnerability/GHSA-6j4f-fj2g-mc7p>
  - 🟡 GHSA-q2hr-2g5m-vwhr · brace-expansion@5.0.9 · POSSIBLY
    <https://osv.dev/vulnerability/GHSA-q2hr-2g5m-vwhr>
  - 🟡 GHSA-qhr7-859c-m2p7 · brace-expansion@5.0.9 · POSSIBLY
    <https://osv.dev/vulnerability/GHSA-qhr7-859c-m2p7>

## Bedeutung der Ampel

| Farbe | Bedeutung |
|---|---|
| GREEN | Im überwachten Umfang aktuell keine bekannten kritischen Probleme festgestellt |
| YELLOW | Neue/mittlere Risiken oder Availability-Befunde — untersuchen |
| ORANGE | Hoher Risiko-Fund oder Sicherheitsmechanismus-Regression |
| RED | Kritische Lücke (inkl. CISA-KEV) oder Honeypot-Treffer — Produktionssperre prüfen |

## Alarme & Wiederherstellung

- Alarm-Issues: Label `security-alert` (Radar/Probe), `secret-leak`, `dependency-vulnerability`
- Incident-Ablauf: siehe `docs/SECURITY_AUDIT_2026-09-28.md` + Memory_Bank
- Rollback jeder Änderung: `git revert` des zugehörigen Merge-Commits
