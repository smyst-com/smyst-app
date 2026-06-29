# Smyst Free-Only Data Map

Status: verbindliche Production-Datenlandkarte.

## Production-Bausteine

| Ebene | Dienst | Aufgabe | Gespeicherte Daten |
|---|---|---|---|
| Code | GitHub Free | Repository, Versionierung, CI/CD, Dokumentation | Quellcode, Markdown-Doku, Workflows, Release-Notizen |
| Web/PWA | IDrive e2 static hosting Free | Vite/React Build ausliefern | statische Assets aus `dist/`, HTML, CSS, JS, Manifest, Sitemap, `robots.txt`, `llms.txt` |
| API | Salad API Free | Auth, Storage-Signing, kleine API-Flows, Sprache/Edge-Routing | keine grossen Dateien, keine dauerhafte grosse Datenbank |
| Sessions | Salad/IDrive metadata Free | Session-, User-, Rollen-/Rechte- und OAuth-State | `s:{sessionId}`, `auth:sessions:{userSub}`, `auth:user:{sub}`, `state:{nonce}` |
| Metadaten | Salad/IDrive metadata Free | kleine User-/Upload-/Twin-/Profil-/Chat-/Quota-/Support-/Statusdaten | `meta:upload:{userSub}:{uploadId}`, `meta:uploads:{userSub}`, `meta:upload-by-key:{userSub}:{sha256(key)}`, `meta:twin:{userSub}:{twinId}`, `meta:twins:{userSub}`, `public:twin:{slug}`, `meta:chat:{userSub}:{chatId}`, `meta:chats:{userSub}`, `meta:support-report:{createdAt}:{reportId}`, `quota:user:{userSub}:{month}`, `quota:global:{month}` |
| Dateien | IDrive e2 | zentraler Speicher fuer Uploads, Profilbilder, Backups und Twin-Daten | `users/{userSub}/uploads/...`, `users/{userSub}/profile/images/...`, `users/{userSub}/backups/...`, `users/{userSub}/twins/{twinId}/data/...` |

## Nicht in Production speichern

- Keine privaten Dateien in GitHub.
- Keine IDrive-e2-Secrets im Browser.
- Keine grossen Dateien in Salad/IDrive metadata.
- Keine permanenten Tokens im Client.
- Keine Produktdaten in externen Analytics- oder Translation-Diensten.
- Keine Production-Daten in Legacy-Server-, Docker- oder Datenbankpfaden.

## User Session

Salad/IDrive metadata:

```text
s:{sessionId}
auth:sessions:{userSub}
```

Inhalt:

```json
{
  "sub": "github:123456",
  "email": "user@example.com",
  "name": "User",
  "picture": "https://...",
  "createdAt": 1760000000000,
  "expiresAt": 1762592000000
}
```

Der Browser sieht nur ein HttpOnly Secure Cookie. JavaScript liest die Session nicht direkt.

`auth:sessions:{userSub}` enthaelt eine kleine Liste aktiver Session-IDs. Sie dient nur dazu, `POST /auth/logout-all` ohne externen Dienst auszufuehren und alle bekannten Sessions eines Users zu loeschen.

## Auth Rollen Und Rechte

Salad/IDrive metadata:

```text
auth:user:{sub}
```

Rollen:

```text
member
admin
owner
```

Rechte:

```text
auth:read
profile:read
storage:read
storage:write
storage:delete
twin:read
twin:write
chat:read
chat:write
admin:read
admin:write
```

Owner/Admin-Zuordnung erfolgt ueber Worker-Variablen:

```text
SMYST_OWNER_GITHUB_IDS
SMYST_OWNER_EMAILS
SMYST_ADMIN_GITHUB_IDS
SMYST_ADMIN_EMAILS
```

## Upload Intent

Salad/IDrive metadata:

```text
meta:upload:{userSub}:{uploadId}
meta:uploads:{userSub}
meta:upload-by-key:{userSub}:{sha256(key)}
quota:user:{userSub}:{YYYY-MM}
quota:global:{YYYY-MM}
```

IDrive e2:

```text
users/{userSub}/uploads/audio/{uuid}.{ext}
users/{userSub}/uploads/images/{uuid}.{ext}
users/{userSub}/uploads/videos/{uuid}.{ext}
users/{userSub}/uploads/documents/{uuid}.{ext}
users/{userSub}/profile/images/{uuid}.{ext}
users/{userSub}/backups/{YYYY-MM}/{uuid}.{ext}
users/{userSub}/twins/{twinId}/data/{uuid}.{ext}
```

Flow:

1. Client fragt `POST /storage/upload-url`.
2. Worker prueft Auth, Dateityp, Dateigroesse und Quotas.
3. Worker schreibt kleines Intent-Objekt in KV.
4. Worker gibt signed PUT URL fuer IDrive e2 zurueck.
5. Client laedt direkt zu IDrive e2 hoch.
6. Client ruft `POST /storage/upload-complete`.
7. Worker prueft das Objekt per signed `HEAD`.
8. Worker setzt KV-Status auf `uploaded`.
9. Downloads ueber `GET /storage/file/{key}` brauchen User-Prefix, KV-Metadaten und Status `uploaded`.
10. Der direkte `meta:upload-by-key:{userSub}:{sha256(key)}` Index verhindert Upload-Listen-Scans beim Dateiabruf.

Direct-PUT ist der aktive Phase-1-Pfad. Chunk Upload und bytegenaue Wiederaufnahme
sind noch nicht aktiviert und werden in der Upload-URL-Antwort explizit als
`supportsChunkUpload: false` und `supportsResume: false` gemeldet.

## Backup

Backups liegen als User-scoped Objekte in IDrive e2:

```text
users/{userSub}/backups/{YYYY-MM}/{uuid}.{ext}
```

Backup-Metadaten duerfen klein in KV liegen. Der eigentliche Backup-Inhalt gehoert nach IDrive e2.

## Chat

Salad/IDrive metadata:

```text
meta:chat:{userSub}:{chatId}
meta:chats:{userSub}
```

In der Free-Only-Phase speichert der API-Worker nur kleine Chat-Zustaende. Es werden keine externen Modell-APIs verwendet. Twin-Chats koennen optional `twinId` enthalten und nutzen eine regelbasierte MVP-Antwortlogik.

## Support, Abuse Und Privacy Reports

Salad/IDrive metadata:

```text
meta:support-report:{createdAt}:{reportId}
```

Diese Records speichern kleine In-App-Meldungen fuer Fehler, Missbrauch, Datenschutz, Sicherheit und Feedback. Erlaubt sind nur begrenzte Textfelder, optionale Kontaktangaben und ein same-origin Pfad aus der App. Es werden keine externen Ticketing-, Analytics- oder Support-Dienste genutzt.

## KI-Zwilling MVP

Salad/IDrive metadata:

```text
meta:twin:{userSub}:{twinId}
meta:twins:{userSub}
public:twin:{slug}
```

Inhalt:

```json
{
  "id": "uuid",
  "userSub": "github:123456",
  "name": "Maya",
  "slug": "maya",
  "description": "Kurzprofil",
  "imageUrl": "https://...",
  "categories": ["KI-Zwilling", "Wissen"],
  "languages": ["de", "en"],
  "visibility": "private",
  "style": "warm",
  "knowledgeTexts": [{ "id": "uuid", "title": "Werte", "text": "...", "createdAt": 1760000000000 }],
  "mediaRefs": [{ "id": "uuid", "key": "users/github:123456/uploads/images/file.jpg", "category": "image" }],
  "contextSummary": "kleiner regelbasierter Kontext",
  "status": "ready",
  "createdAt": 1760000000000,
  "updatedAt": 1760000000000
}
```

Der MVP-Kontext bleibt klein genug fuer KV. Dokumente, Bilder, Videos, Audio, Backups und groessere Twin-Daten liegen als Objekte in IDrive e2 und werden nur referenziert. Phase 1 erzeugt Antworten regelbasiert aus `description`, `knowledgeTexts`, `mediaRefs`, `categories`, `languages` und `style`; echte Modelle duerfen spaeter nur als austauschbare Schicht angebunden werden, ohne GitHub-Free/Legacy edge provider-Free/IDrive-e2 als Production-Regel zu brechen.

## Öffentliche Und Private Profile

Öffentliche Profile:

```text
/t/{slug}
GET /api/public/twins/{slug}
public:twin:{slug}
```

Öffentliche Profile sind kleine, suchmaschinenlesbare Profilobjekte aus Salad/IDrive metadata. Sie enthalten Name, Bild-URL oder Bildreferenz, Beschreibung, Kategorien, Sprachen, Sichtbarkeit, Inhaltszaehler, Chat-Pfad, Canonical-URL und Schema.org-ProfilePage-Daten. Grosse Medieninhalte bleiben in IDrive e2.

Private Profile:

```text
/private/twins/{twinId}
meta:twin:{userSub}:{twinId}
```

Private Profile werden nur fuer den authentifizierten Owner aus `meta:twin:{userSub}:{twinId}` gelesen. Sie muessen `noindex,nofollow` setzen und duerfen keinen `public:twin:{slug}` Eintrag behalten. Wenn ein Profil von public auf private umgestellt wird, entfernt der API-Worker den alten Public-Slug.

IDrive e2 Twin-Daten:

```text
users/{userSub}/twins/{twinId}/data/{uuid}.json
users/{userSub}/twins/{twinId}/data/{uuid}.txt
users/{userSub}/twins/{twinId}/data/{uuid}.md
```

`twinId` ist fuer `twin_data` Uploads Pflicht.

## Speicherlimits

Der Storage-Worker prueft:

- erlaubte Kategorie,
- erlaubten MIME-Type pro Kategorie,
- Extension passend zum MIME-Type,
- maximale Dateigroesse pro Kategorie,
- monatliches User-Uploadlimit,
- monatliches globales Uploadlimit,
- aktives User-Speicherlimit,
- aktives globales Speicherlimit.

Aktive Speicherzaehler:

```text
storage:user:{userSub}:active
storage:global:active
```

Sie werden nach erfolgreicher IDrive-e2-`HEAD`-Verifikation hochgezaehlt und bei Delete wieder reduziert.

Dokumente, Backups und `twin_data` werden beim Abruf als Attachment ausgeliefert.
Bilder, Videos, Audio und Avatare duerfen inline streamen.

## Skalierungsgrenze

Diese Datenlandkarte ist fuer die Free-Only-Phase gebaut. Sie minimiert Kosten und externe Abhaengigkeiten, ersetzt aber keine echte Milliarden-Nutzer-Infrastruktur. Fuer globale Massenlast braucht Smyst spaeter dedizierte Daten-, Compute-, Retrieval- und AI-Kapazitaeten.
