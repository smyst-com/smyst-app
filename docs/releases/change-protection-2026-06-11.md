# Change Protection - 2026-06-11

## Scope

Implementiert und dokumentiert wurden Schutzmechanismen gegen:

- versehentliches Loeschen,
- versehentliche Aenderungen,
- fehlerhafte Deployments,
- beschaedigte Daten,
- falsche Konfigurationen.

Rahmen:

- Nur kostenlose Dienste von GitHub.com und Legacy edge provider.
- IDrive e2 bleibt Hauptspeicher fuer Dateien, Medien, Backups und grosse Daten.
- Kein Production-Deploy wurde ausgefuehrt.

## Eingebaute Schutzmassnahmen

### 1. Schutz Vor Versehentlichem Loeschen

- Alle mutierenden Cookie-Routen verlangen weiterhin:
  - same-origin `Origin` oder gueltigen same-origin `Referer`,
  - `X-Smyst-CSRF: 1`,
  - Fetch-Metadata-Schutz gegen cross-site Requests.
- Neue zweite Loeschbestaetigung per Header:
  - `DELETE /api/account` verlangt `X-Smyst-Delete-Confirm: delete-account`.
  - `DELETE /storage/account` verlangt `X-Smyst-Delete-Confirm: delete-account-storage`.
  - `DELETE /storage/file/{key}` verlangt `X-Smyst-Delete-Confirm: delete-file`.
- Fehlender Delete-Confirm-Header liefert:
  - HTTP `428`,
  - `delete_confirmation_header_required`.
- Account-Loeschung verlangt weiterhin zusaetzlich JSON `confirm: DELETE`.
- Storage-Loeschungen pruefen weiter:
  - Login,
  - `storage:delete` Permission,
  - User-scoped IDrive-e2-Key,
  - Rate-Limit.
- Datei-Loeschung entfernt Metadaten nicht blind, sondern markiert Upload-Records als
  `deleted` und reduziert aktive Speicherzaehler.

Geaenderte Dateien:

- `workers/_shared.ts`
- `workers/api.ts`
- `workers/storage-idrive.ts`
- `src/lib/useTwinMvp.ts`

### 2. Schutz Vor Versehentlichen Aenderungen

- `config/change-protection-manifest.json` definiert verbindlich:
  - destruktive Routen,
  - erforderliche Schutzmechanismen,
  - Deployment-Schutz,
  - Rollback-Schutz,
  - Datenintegritaets-Schutz.
- `scripts/check-change-protection.py` prueft dieses Manifest automatisch.
- `scripts/test-all.sh` fuehrt den Schutzcheck mit aus.
- `scripts/validate-foundation.py` erzwingt die Schutzartefakte.

### 3. Schutz Vor Fehlerhaften Deployments

- Production-Deploy bleibt nur per `workflow_dispatch` moeglich.
- Production-Deploy verlangt:
  - `release_approval` exakt `Ja OK`,
  - `release_version`,
  - `release_freeze_confirmed`,
  - `rollback_plan_confirmed`,
  - `backup_restore_confirmed`.
- `scripts/preflight-release.sh` blockiert Production ohne:
  - Freigabe,
  - Version,
  - Freeze,
  - Rollback-Plan,
  - Backup-/Restore-Bestaetigung,
  - `WEB_BASE_URL`.
- GitHub Actions Deploy wartet auf:
  - CI,
  - TypeScript,
  - Build,
  - Artifact-Check,
  - Release-Gate.
- Nach Deploy laeuft Live-Smoke gegen `WEB_BASE_URL=https://smyst.com`.
- Concurrency verhindert ueberlappende Deployments.

Geaenderte Dateien:

- `.github/workflows/deploy.yml`
- `scripts/preflight-release.sh`
- `scripts/live-test.sh`
- `scripts/check-dist-artifact.sh`

### 4. Schutz Vor Beschaedigten Daten

- Upload-Complete verifiziert IDrive-e2-Objekte per signed `HEAD`.
- Downloads brauchen KV-Metadaten mit Status `uploaded`.
- IDrive-e2-Objektschluessel sind user-scoped.
- `meta:upload-by-key:{userSub}:{sha256(key)}` verhindert unsichere Listen-Scans
  auf Hot Paths.
- Backup-/Restore-Manifest schliesst Live-Sessions und OAuth-State vom Restore aus:
  - `s:`
  - `state:`
- Backup-/Restore-Dry-Run fuer KV + IDrive e2 ist jetzt Release-Pflicht.

Geaenderte/ergaenzte Dateien:

- `config/backup-recovery-manifest.json`
- `scripts/check-backup-recovery.py`
- `docs/runbooks/backup-recovery.md`

### 5. Schutz Vor Falscher Konfiguration

- `scripts/validate-foundation.py` prueft:
  - Free-only Architektur,
  - Worker-Routen,
  - PWA/SEO/Security-Dateien,
  - Backup-/Restore-Artefakte,
  - Change-Protection-Artefakte.
- `scripts/check-dist-artifact.sh` blockiert Builds ohne:
  - Manifest,
  - PNG-PWA-Icons,
  - Maskable Icon,
  - Screenshots,
  - `ai.txt`,
  - `security.txt`.
- `scripts/live-test.sh` blockiert Production, wenn:
  - Root `X-Robots-Tag: noindex` sendet,
  - statische Systemdateien als HTML-Fallback ausgeliefert werden,
  - API/Auth/Storage nicht JSON liefern,
  - neues Manifest nicht live ist.
- `workers/translate.ts` leitet bekannte statische Systemdateien direkt an Pages
  weiter und entfernt fuer oeffentliche HTML-Seiten versehentliche
  `X-Robots-Tag` Origin-Header.

### 6. Rollback-Moeglichkeiten

- Git-Rollback:
  - revert/cherry-pick auf bekannten guten Commit.
- IDrive e2 static hosting:
  - Rollback auf bekannte gute Pages Deployment ID.
- Salad API:
  - Rollback auf bekannte Worker Version oder Redeploy aus Git.
- Daten:
  - KV Restore zuerst in Preview/Test-Namespace.
  - IDrive-e2 signed Object Restore Test vor Production.
- Release-Gate verlangt explizit bestaetigten Rollback-Plan.

### 7. Versionskontrolle

- GitHub bleibt Source of Truth fuer Code, Config, Docs und Workflows.
- Production-Release verlangt `release_version`.
- `scripts/preflight-release.sh` gleicht `RELEASE_VERSION` mit `VERSION` ab, wenn
  `VERSION` existiert.
- Build-Artefakte werden in GitHub Actions erzeugt und validiert.

### 8. Freigabeprozesse

- Keine Production ohne schriftliche Phrase `Ja OK`.
- Keine Production ohne Release-Freeze.
- Keine Production ohne Rollback-Bestaetigung.
- Keine Production ohne Backup-/Restore-Bestaetigung.
- Keine Production ohne Live-Smoke.
- Keine Production ohne finale schriftliche Freigabe.

## Automatisch Pruefbar

Neue Checks:

- `python3 scripts/check-change-protection.py`
- `python3 scripts/check-backup-recovery.py`
- `python3 scripts/validate-foundation.py`
- `sh scripts/check-dist-artifact.sh` nach Build
- `WEB_BASE_URL=<target> sh scripts/live-test.sh`

## Noch Offen

- Echte IDrive e2 static hosting/Workers Rollback-Uebung.
- Echte Salad/IDrive metadata Restore-Dry-Run-Uebung.
- Echter IDrive-e2 signed restore test.
- GitHub Branch Protection und IDrive e2 static hosting Auto-Deploy-Einstellung muessen in
  den Portalen live bestaetigt werden.
- Admin-/Owner-Konsole fuer Reports, Audit-Events und Sicherheitsaktionen fehlt
  noch.

## Ergebnis

Repo-Status: **Schutzmechanismen erweitert und automatisch pruefbar.**

Production-Status: **weiterhin NO-GO**, bis Preview, Live-Smoke, Rollback-Uebung
und Backup-/Restore-Dry-Run gruen dokumentiert sind.
