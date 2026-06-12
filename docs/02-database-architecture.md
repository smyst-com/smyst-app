# 02 Data Architecture

Status: verbindliche Free-Only-Datenarchitektur fuer Phase 1.

## Ziel

Production nutzt in Phase 1 keine separat betriebene Datenbank. Kleine Metadaten, Sessions, Quotas und Statuswerte liegen in Cloudflare KV Free. Dateien, Medien, Dokumente, Backups und Twin-Daten liegen in IDrive e2.

Relationale Schemas und SQL-Dateien im Repository bleiben nur lokale Modellierungs- und Entwicklungsreferenzen.

## Speicherklassen

| Datenklasse | Production-Speicher | Zweck |
| --- | --- | --- |
| Sessions | Cloudflare KV | Session-ID, User-Sub, Rolle, Ablaufzeit |
| Auth-State | Cloudflare KV | kurzlebiger OAuth/WebAuthn-State |
| Profile | Cloudflare KV + IDrive e2 | kleine oeffentliche Metadaten in KV, umfangreiche Daten in IDrive e2 |
| Twin-Metadaten | Cloudflare KV | Name, Slug, Sichtbarkeit, Sprache, Kategorien |
| Twin-Kontext | IDrive e2 | Wissenstexte, Dokument-Auszug, strukturierte Kontextobjekte |
| Upload-Intent | Cloudflare KV | Dateityp, Groesse, Kategorie, Ablaufzeit |
| Upload-Dateien | IDrive e2 | Bilder, Videos, Audio, Dokumente, Profilbilder |
| Chat-MVP | Cloudflare KV | kurze Demo-/MVP-Sessiondaten mit TTL |
| Backups | IDrive e2 | Nutzerexporte, Konfigurationssnapshots, Wiederherstellungsdaten |
| SEO-Index | Cloudflare KV + statische Dateien | oeffentliche, gefilterte Profil-Snapshots und Sitemap-Basis |

## KV Key-Schema

```text
s:{sessionId}
auth:user:{sub}
state:{nonce}
quota:user:{sub}:{yyyymm}
quota:global:{yyyymm}
meta:upload:{userSub}:{uploadId}
meta:uploads:{userSub}
storage:user:{userSub}:active
storage:global:active
meta:twin:{userSub}:{twinId}
meta:twins:{userSub}
public:twin:{slug}
meta:chat:{userSub}:{chatId}
meta:chats:{userSub}
```

KV speichert nur kleine JSON-Objekte. Private Upload-Inhalte, Rohtexte, Medien und Backups gehoeren nicht in KV.

## IDrive e2 Object Layout

```text
users/{userSub}/profiles/{profileId}/profile.json
users/{userSub}/profiles/{profileId}/avatar/{fileId}-{filename}
users/{userSub}/twins/{twinId}/context/{contextId}.json
users/{userSub}/twins/{twinId}/uploads/{category}/{fileId}-{filename}
users/{userSub}/backups/{yyyy-mm}/{backupId}.json
public/twins/{slug}/card.json
```

Private Objekte bleiben privat. Oeffentliche Objekte duerfen nur explizit freigegebene, bereinigte Daten enthalten.

## Konsistenzmodell

Cloudflare KV ist eventual consistent. Deshalb gilt:

- kritische Mutationen speichern eine eindeutige `version`.
- Upload-Status darf nur vorwaerts wechseln.
- Clients muessen idempotente Wiederholungen verkraften.
- Oeffentliche Snapshots werden aus privaten Daten erzeugt und duerfen keine Rohdaten enthalten.
- Abgelaufene Upload-Intents werden als `expired` markiert und Monats-Quota-Reservierungen werden freigegeben.
- Account-Loeschung ist zweistufig: bekannte IDrive-e2-Objekte ueber den Storage-Worker, danach KV-Metadaten ueber den API-Worker.

## Legacy-SQL-Referenz

`database/migrations/*.sql` beschreibt ein moegliches spaeteres relationales Domain-Modell. Diese Migrationen sind nicht Teil der aktuellen Production. Die lokale Hardening-Migration `0005_integrity_performance_hardening.sql` ergänzt fuer lokale Experimente:

- CHECK-Constraints fuer Status-, Sichtbarkeits- und Score-Felder,
- Foreign-Key- und Query-Indizes,
- `updated_at`-Trigger fuer zentrale Tabellen,
- Views fuer aktive Twins und indexierbare Public Pages.

## Loeschung

Loeschlogik muss beide Ebenen beruecksichtigen:

1. Zugriff sperren und Sichtbarkeit auf privat/deleted setzen.
2. Oeffentliche KV-Snapshots entfernen.
3. IDrive-e2-Objekte loeschen oder fuer Retention markieren.
4. Kurzlebige Sessions und Upload-Intents invalidieren.
5. Minimalen, nicht sensiblen Audit-Status speichern.

## Skalierungsrealitaet

KV plus IDrive e2 reicht fuer ein kontrolliertes MVP und einfache globale Edge-Auslieferung. Es ersetzt keine echte relationale, vektorbasierte oder transaktionale globale Datenplattform fuer Milliarden Nutzer pro Tag.

Langfristige Datenbanken, Vektorindizes und Event-Systeme brauchen eine neue Freigabe, weil sie nicht Teil der Free-Only-Regel sind.
