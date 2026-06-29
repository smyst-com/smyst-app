# Production Release Preparation - 2026-06-11

## Ergebnis

Status: **NO-GO fuer Production**

Das System ist im Repository deutlich besser vorbereitet, aber nicht fuer eine
Production-Freigabe geeignet, solange die Live-Abnahme nicht gruen ist und keine
finale schriftliche Freigabe vorliegt.

Rahmen:

- Nur kostenlose Dienste von GitHub.com und Legacy edge provider.
- IDrive e2 bleibt Hauptspeicher fuer Dateien, Medien, Backups und grosse Daten.
- Kein Production-Deploy wurde ausgefuehrt.

## Automatisch Behoben

### Deployment / Routing

- `workers/translate.ts` leitet bekannte statische SEO/PWA/Well-known-Dateien jetzt
  direkt an den Pages-Origin weiter:
  - `/manifest.webmanifest`
  - `/sw.js`
  - `/logo.svg`
  - `/og-image.png`
  - `/robots.txt`
  - `/sitemap.xml`
  - `/llms.txt`
  - `/ai.txt`
  - `/apple-touch-icon.png`
  - `/.well-known/security.txt`
  - `/assets/*`, `/icons/*`, `/screenshots/*`, `/locales/*`
- `workers/translate.ts` entfernt fuer oeffentliche HTML-Seiten
  `X-Robots-Tag`, damit ein versehentliches Origin-`noindex` die oeffentliche
  Startseite nicht blockiert.

### Release Gate

- `.github/workflows/deploy.yml` setzt im Production-Live-Smoke jetzt explizit:
  `WEB_BASE_URL=https://smyst.com`.
- `scripts/live-test.sh` blockiert Production jetzt, wenn:
  - Root `X-Robots-Tag: noindex` sendet,
  - das Manifest keine PNG-PWA-Icons enthaelt,
  - `/ai.txt` nicht die echte AI-Policy ausliefert,
  - `/.well-known/security.txt` nicht die echte Security Policy ausliefert,
  - `GET /storage/upload-url` nicht `405 application/json` liefert.
- `scripts/check-dist-artifact.sh` prueft die neuen PWA/SEO/Security-Artefakte
  strenger im Build-Artefakt.
- `scripts/validate-foundation.py` erzwingt die neuen Release-Guardrails.

### Backup / Wiederherstellung

- `docs/runbooks/backup-recovery.md` erweitert:
  - Salad/IDrive metadata Export/Restore,
  - Restore-Dry-Run,
  - IDrive-e2-CORS,
  - server-side encryption,
  - Lifecycle und unvollstaendige Upload-Cleanup-Regeln,
  - Release Restore Drill.

### Release Governance

- `docs/runbooks/release-governance.md` erweitert:
  - Root darf kein `noindex` senden.
  - `ai.txt`, `llms.txt`, `robots.txt`, `sitemap.xml`,
    `/.well-known/security.txt` muessen echte Dateien sein, kein SPA HTML.
  - Manifest muss PNG Icons, Maskable Icon und Screenshots enthalten.
  - API/Auth/Storage muessen JSON-Vertraege liefern.
  - Backup/Restore-Dry-Run ist Pflicht-Evidence.

## Produktionskontrolle

| Bereich | Status | Ergebnis |
|---|---|---|
| Fehlerfreiheit | Eingeschraenkt | Foundation gruen, aber TypeScript/Build waren lokal zuletzt instabil/haengend. |
| Stabilitaet | NO-GO | Kein stabiler kompletter Build-/Preview-/Browser-E2E-Nachweis in dieser Runde. |
| Sicherheit | Eingeschraenkt | Repo-Baseline gut, aber `security.txt` ist live noch nicht korrekt ausgeliefert. |
| Skalierung | NO-GO fuer Milliarden | Free-only MVP ist nicht fuer Milliarden Nutzer pro Tag geeignet. |
| Monitoring | Eingeschraenkt | Request-ID/Server-Timing vorhanden, aber keine echte Production-Observability. |
| Logging | Eingeschraenkt | Worker-Logs vorhanden, aber kein Incident-Dashboard oder Alert-Prozess belegt. |
| Backup | Eingeschraenkt | Runbook verbessert, aber Restore-Dry-Run nicht live belegt. |
| Wiederherstellung | Eingeschraenkt | Rollback-Konzept vorhanden, aber keine reale Restore-Uebung dokumentiert. |
| Deployment | NO-GO | Live-Smoke gegen `https://smyst.com` faellt aktuell wegen Root-`noindex`. |
| SEO/PWA | NO-GO | Live liefert neue `ai.txt`, `security.txt` und neues Manifest noch nicht korrekt. |
| Upload/IDrive e2 | NO-GO | Kein echter OAuth + IDrive-e2 Upload/Complete/List/Download/Delete E2E belegt. |

## Live-Smoke Ergebnis

Ausgefuehrt:

```bash
WEB_BASE_URL=https://smyst.com sh scripts/live-test.sh
```

Ergebnis:

- `https://smyst.com/` antwortet `200`.
- Der Test bricht korrekt ab, weil die oeffentliche Root-Seite live
  `X-Robots-Tag: noindex, nofollow` sendet.

## Ausgefuehrte Lokale Checks

Gruen:

- `python3 scripts/validate-foundation.py`
- `sh -n scripts/check-dist-artifact.sh scripts/live-test.sh scripts/preflight-release.sh scripts/test-all.sh`
- `python3 -m json.tool public/manifest.webmanifest`
- `git diff --check`

Eingeschraenkt:

- Ein gezielter TypeScript-Check fuer `workers/translate.ts` blieb in der lokalen
  Umgebung ohne Fehlerausgabe haengen und wurde beendet. Das gleiche Verhalten trat
  bereits bei frueheren lokalen `tsc`-Pruefungen auf. CI muss `npm run lint:tsc`
  vor einer Release-Freigabe gruen ausfuehren.

Zusatzbefunde aus dem End-Audit:

- `/auth/me` liefert JSON.
- `/api/health` liefert JSON.
- `/api/twins` liefert JSON `401`.
- `/storage/upload-url` liefert JSON statt HTML, aber live noch nicht den neuesten
  `405`-Methodenvertrag.
- `/ai.txt` und `/.well-known/security.txt` fallen live noch auf HTML zurueck.
- `/manifest.webmanifest` ist live noch alt und SVG-only.

## Warum Production Noch Nicht Freigegeben Werden Darf

- Live-SEO ist blockiert, solange Root `X-Robots-Tag: noindex, nofollow` sendet.
- Neue PWA/SEO/Security-Dateien sind live noch nicht korrekt ausgeliefert.
- Der neueste Worker-/Pages-Stand ist nicht live verifiziert.
- Kein echter Login-/Profil-/Twin-/IDrive-e2-Upload-End-to-End-Test ist belegt.
- Keine Backup-/Restore-Probe fuer KV + IDrive e2 ist belegt.
- Keine echte iPhone-/Android-/PWA-Installationspruefung ist belegt.
- Keine juristische Freigabe fuer Impressum, Datenschutz und Nutzungsbedingungen ist
  belegt.

## Produktionsfreigabe Nur Wenn Alle Punkte Gruen Sind

1. Preview-Deploy der aktuellen Repo-Version erstellen.
2. Worker und Pages gegen die Preview deployen, nicht direkt Production.
3. `WEB_BASE_URL=<preview-url> sh scripts/live-test.sh` muss gruen sein.
4. Root darf kein `X-Robots-Tag: noindex` senden.
5. `ai.txt`, `llms.txt`, `robots.txt`, `sitemap.xml`,
   `/.well-known/security.txt`, Manifest, Icons, Screenshots und Service Worker
   muessen echte Dateien mit korrektem Content-Type liefern.
6. Authenticated E2E muss bestanden sein:
   - GitHub Login,
   - `/auth/me`,
   - Twin erstellen,
   - Upload-URL,
   - IDrive e2 PUT,
   - Upload Complete,
   - List,
   - Download,
   - Delete,
   - Account Export/Delete.
7. Backup/Restore-Dry-Run fuer Salad/IDrive metadata und IDrive e2 muss dokumentiert sein.
8. IDrive e2 static hosting Auto-Deploy muss sicher gegated sein.
9. GitHub/Legacy edge provider/IDrive Secrets und Bindings muessen live bestaetigt sein.
10. Finale schriftliche Production-Freigabe muss vorliegen.

## Fazit

Repo-Status nach dieser Vorbereitung: **Release-vorbereitet, aber Production
gesperrt.**

Production-Status: **NO-GO**, bis Preview und Live-Smoke vollstaendig gruen sind.
