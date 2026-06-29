# Backup And Recovery Audit - 2026-06-11

## Scope

Geprueft wurden:

- Datenbank-Backups
- Medien-Backups
- Konfigurations-Backups
- Deployment-Backups
- Wiederherstellungszeit
- Datenverlust-Risiken

Rahmen:

- Nur kostenlose Dienste von GitHub.com und Legacy edge provider.
- IDrive e2 bleibt Hauptspeicher fuer Dateien, Medien, Backups und grosse Daten.
- Keine kostenpflichtigen Zusatzdienste.
- Kein Production-Deploy wurde ausgefuehrt.

## Executive Summary

Status: **Backup/Recovery ist fuer ein Free-only-MVP dokumentiert, aber noch nicht
production-bewiesen.**

Repo-seitig wurde die Strategie verbessert:

- `config/backup-recovery-manifest.json` als maschinenlesbarer Backup-/Restore-
  Vertrag.
- `scripts/check-backup-recovery.py` als automatischer Manifest-Check.
- `scripts/test-all.sh` fuehrt den Backup-Check aus.
- `docs/runbooks/backup-recovery.md` enthaelt jetzt RPO/RTO, Prefix-Strategie,
  Ausschluesse, Risiken, Restore Drill und Frequenz.
- `scripts/validate-foundation.py` erzwingt die neuen Backup-Artefakte.

Production bleibt trotzdem **NO-GO**, bis ein echter Legacy edge provider-KV- und IDrive-e2-
Restore-Dry-Run dokumentiert ist.

## Aktive Datenquellen

| Bereich | Source of Truth | Backup-Strategie | Production-Reife |
|---|---|---|---|
| Code und Doku | GitHub Repository | Git-History, Branches, Tags, Release-Notizen | Gut |
| Static App / PWA | IDrive e2 static hosting + GitHub build artifact | Gated Deploy + Pages Rollback | Mittel, Live-Drift noch offen |
| Worker-Code | GitHub + Legacy edge provider Worker Versions | Worker Rollback/Re-Deploy | Mittel |
| Sessions/OAuth State | Salad/IDrive metadata | Nicht langfristig sichern; Sicherheitsdaten kurzlebig | Gut als Ausschluss |
| User/Auth/Role Metadata | Salad/IDrive metadata | Prefix Export und Preview Restore Dry-Run | Noch nicht live bewiesen |
| Twin/Chat/Upload Metadata | Salad/IDrive metadata | Prefix Export, Integritaetszaehlung, Restore Dry-Run | Noch nicht live bewiesen |
| Public Twin Snapshots | Salad/IDrive metadata | Prefix Export und Slug-Integritaet | Noch nicht live bewiesen |
| Uploads/Medien/Backups | IDrive e2 | User-scoped Objektstruktur, Signed GET/PUT/HEAD Restore-Test | Noch nicht live bewiesen |
| Legacy SQL | Lokale Referenz | Blockiert fuer Production | Gut blockiert |

## RPO / RTO Zielwerte

| Target | RPO | RTO | Bewertung |
|---|---:|---:|---|
| Code/config | latest pushed commit | 30 Minuten | Realistisch |
| IDrive e2 static hosting | letzter gated Deploy | 15 Minuten | Realistisch, wenn Pages Rollback belegt ist |
| Salad API | committed source + deployed version id | 30 Minuten | Realistisch, wenn Worker-Versionen dokumentiert sind |
| Salad/IDrive metadata Metadata | 24 Stunden fuer MVP | 4 Stunden fuer kleinen Restore | Noch nicht belegt |
| IDrive e2 Objects | bestaetigter Object Write | 4 Stunden fuer kleinen User-Restore | Noch nicht belegt |
| Legacy SQL | nicht anwendbar | nicht anwendbar | Korrekt blockiert |

## Gefundene Schwachstellen

### Kritisch Vor Production

- Kein dokumentierter Legacy edge provider-KV-Export und Restore-Dry-Run.
- Kein dokumentierter IDrive-e2-Signed-Object-Restore-Test.
- Kein Beweis, dass KV-Metadaten und IDrive-e2-Objekte nach Restore konsistent
  zusammenpassen.
- Keine live bestaetigte Backup-Evidence in einem Release-Manifest.
- Kein belegter Rollback-Test fuer Pages + Worker im aktuellen Stand.

### Mittel

- Salad/IDrive metadata ist eventual consistent und kein transaktionales Backup-System.
- Quota- und Storage-Counter koennen bei Parallelitaet driften.
- User-Dateien koennen als IDrive-Objekte existieren, waehrend KV-Metadaten fehlen.
- KV-Metadaten koennen auf geloeschte IDrive-Objekte zeigen.
- `state:` und `s:` duerfen aus Sicherheitsgruenden nicht wiederhergestellt werden,
  wodurch eingeloggte Sessions nach Restore bewusst verloren gehen.
- IDrive-e2-CORS, Encryption, Lifecycle und incomplete-upload cleanup sind
  Console-/Provider-Konfigurationen und muessen live belegt werden.

### Niedrig

- Legacy-Postgres-Backup/Restore-Skripte existieren, sind aber korrekt blockiert.
- Kein automatischer scheduled Backup-Job ist aktiv. Innerhalb Free-only ist
  zunaechst ein manueller Release-Dry-Run vertretbar, aber fuer Production-Betrieb
  nicht ausreichend.
- Es gibt noch keine User-facing Restore-/Export-Historie.

## Durchgefuehrte Optimierungen

### Maschinenlesbarer Backup-Vertrag

Neu:

- `config/backup-recovery-manifest.json`

Enthaelt:

- erlaubte Dienste,
- aktive Production-Datenquellen,
- RPO/RTO,
- Restore-Methoden,
- KV-Include-/Exclude-Prefixe,
- IDrive-e2-Objektprefixe,
- Pflicht-Evidence fuer Release,
- blockierende Risiken.

### Automatischer Backup-Check

Neu:

- `scripts/check-backup-recovery.py`

Prueft:

- keine bezahlten Dienste,
- Production-Datenmodell bleibt Salad/IDrive metadata + IDrive e2,
- Legacy SQL ist nicht Production,
- wichtige KV-Prefixe sind enthalten,
- Session/OAuth-State-Prefixe sind ausgeschlossen,
- IDrive-e2-Bucket-Kontrollen sind als Pflicht markiert,
- Release-Evidence und Blocker sind definiert.

### Test-Integration

Geaendert:

- `scripts/test-all.sh`
- `scripts/validate-foundation.py`

Damit wird die Backup-Strategie Teil der lokalen Release-Baseline.

### Runbook-Erweiterung

Geaendert:

- `docs/runbooks/backup-recovery.md`

Ergaenzt:

- RPO/RTO-Matrix,
- KV Export/Restore,
- ausgeschlossene Sicherheits-Prefixe,
- Data-Loss-Risk-Matrix,
- Backup-Frequenz,
- Release Restore Drill.

## Optimierte Zielstrategie

### Datenbank-Backups

Production hat keine relationale Datenbank. Backup bedeutet:

- Salad/IDrive metadata Prefix-Export fuer langlebige Metadaten.
- Kein Restore von Live-Sessions `s:`.
- Kein Restore von OAuth-State `state:`.
- Restore immer zuerst in Preview/Test-KV.

Pflicht-Prefixe:

- `auth:user:`
- `auth:sessions:`
- `meta:twin:`
- `meta:twins:`
- `meta:chat:`
- `meta:chats:`
- `meta:upload:`
- `meta:uploads:`
- `meta:upload-by-key:`
- `meta:support-report:`
- `public:twin:`
- `quota:user:`
- `quota:global:`
- `storage:user:`
- `storage:global:`

### Medien-Backups

IDrive e2 bleibt Source of Truth fuer:

- `users/{userSub}/uploads/`
- `users/{userSub}/profile/images/`
- `users/{userSub}/backups/`
- `users/{userSub}/twins/{twinId}/data/`

Pflichtkontrollen:

- private-by-default Bucket,
- CORS nur fuer erlaubte smyst Origins,
- server-side encryption,
- lifecycle cleanup,
- incomplete multipart cleanup vor Multipart-Aktivierung,
- signed HEAD/GET/PUT Smoke Test.

### Konfigurations-Backups

GitHub ist Source of Truth fuer:

- Source Code,
- Worker-Konfiguration,
- Release-Dokumentation,
- Runbooks,
- statische Assets.

Nicht in GitHub:

- Secrets,
- private Userdaten,
- IDrive-e2-Objekte,
- KV-Exports mit personenbezogenen Daten.

Secrets muessen als Inventory dokumentiert und nach Rotation per Smoke-Test
verifiziert werden.

### Deployment-Backups

Pflicht-Evidence pro Release:

- Git commit hash,
- IDrive e2 static hosting deployment id,
- Worker version ids,
- KV namespace inventory,
- Backup/restore dry-run result,
- IDrive e2 bucket config confirmation,
- Rollback target.

### Wiederherstellungsablauf

1. Incident klassifizieren: Pages, Worker, KV, IDrive e2, Secrets oder Userdaten.
2. Neuen Writes stoppen, wenn Datenintegritaet betroffen ist.
3. Letzten bekannten guten Git Commit, Pages Deploy und Worker Version notieren.
4. Pages/Worker rollbacken, falls Code/Deploy defekt ist.
5. KV Restore nur in Preview/Test-Namespace ausfuehren.
6. Integritaet pruefen:
   - public slug count,
   - twin count,
   - upload metadata count,
   - IDrive signed HEAD/GET fuer Stichproben,
   - storage counter plausibel.
7. Erst nach Review in Production promote.
8. Incident-Bericht und Follow-up schreiben.

## Datenverlust-Risiken Und Mitigation

| Risiko | Datenverlust | Mitigation |
|---|---|---|
| KV-Namespace geloescht | User-/Twin-/Upload-Metadaten weg | Prefix-Export, Restore-Dry-Run, Namespace Inventory |
| IDrive-Objekte geloescht | Medien/Backups weg | Lifecycle vorsichtig konfigurieren, signed object restore test |
| KV zeigt auf fehlende IDrive-Objekte | Defekte Downloads | Orphan-/HEAD-Audit |
| IDrive-Objekte ohne KV | Dateien nicht auffindbar | Orphan-object audit ueber User-Prefixe |
| Bad Pages Deploy | App nicht nutzbar | Pages Rollback, artifact check, live smoke |
| Bad Worker Deploy | Auth/API/Storage nicht nutzbar | Worker version rollback, JSON route smoke |
| Secret-Rotation falsch | Login/Upload defekt | Secret inventory, post-rotation smoke |
| Legacy SQL als Backup missverstanden | Falscher Restore | Scripts blockieren, Runbook markiert Legacy klar |
| Session Restore versucht | Security-Risiko | `s:` und `state:` explizit ausschliessen |

## Bewertung

| Bereich | Bewertung | Begruendung |
|---|---:|---|
| Datenbank-/KV-Backups | 6/10 | Strategie jetzt klar, Restore-Dry-Run fehlt live. |
| Medien-/IDrive-Backups | 6/10 | Objektstruktur gut, aber echte Restore-Probe fehlt. |
| Konfigurations-Backups | 8/10 | GitHub ist sauberer Source of Truth; Secrets bleiben offen zu inventarisieren. |
| Deployment-Backups | 7/10 | Rollback-Konzept vorhanden, reale Uebung fehlt. |
| RPO/RTO | 6/10 | Zielwerte definiert, aber nicht bewiesen. |
| Datenverlust-Schutz | 5/10 | Risiken erkannt, automatische Orphan-Audits fehlen. |
| Production-Readiness | 5/10 | Repo-seitig verbessert, aber ohne echte KV/IDrive-Restore-Evidence NO-GO. |

## Offene Punkte

- Echten Legacy edge provider-KV-Export und Restore-Dry-Run in Preview/Test-Namespace
  ausfuehren.
- Echten IDrive-e2-Signed-Object-Restore-Test ausfuehren.
- Orphan-Audit fuer KV <-> IDrive e2 bauen.
- Release-Manifest mit Backup-Evidence pro Deploy erzwingen.
- Secrets-Inventar und Rotation-Runbook vervollstaendigen.
- Optional: geplanter GitHub Actions Monitor, der nur nicht-sensitive
  Backup-Evidence prueft.

## Production-Freigabe

Backup/Recovery-Status: **NO-GO fuer Production**

Freigabe erst nach:

1. KV Restore-Dry-Run bestanden.
2. IDrive-e2 Object Restore Test bestanden.
3. Pages/Worker Rollback-Ziel dokumentiert.
4. Backup-Evidence im Release-Manifest erfasst.
5. `scripts/check-backup-recovery.py` und `scripts/validate-foundation.py` gruen.
