# 03 API Architecture

## Ziel

Die API ist der stabile Vertrag zwischen Clients, Cloudflare Workers, IDrive e2 und spaeteren AI-Schichten. In der Free-Only-Phase ist Cloudflare Workers der Production-API-Layer.

## Production-Regel

- Keine Server-API als Production-Pflicht.
- Keine separat betriebene Datenbank oder Queue als Production-Pflicht.
- Keine externen Uebersetzungs-, Analytics- oder Google-Pflichtdienste.
- Dateiuebertragung erfolgt ueber signed URLs direkt zu IDrive e2.

## Aktive Worker-Routen

System:

- `GET /api/health`

Chat/API:

- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/chat/start`
- `POST /api/chat/messages`
- `GET /api/chat/list`
- `GET /api/chat/search`
- `GET /api/memories`
- `POST /api/memories`
- `GET /api/memories/{id}`
- `PATCH /api/memories/{id}`
- `DELETE /api/memories/{id}`
- `GET /api/account/export`
- `DELETE /api/account`
- `POST /api/support/report`
- `POST /api/twins`
- `GET /api/twins`
- `GET /api/twins/{id}`
- `PATCH /api/twins/{id}`
- `POST /api/twins/knowledge`
- `POST /api/twins/media`
- `GET /api/public/twins/{slug}`

Auth:

- `GET /auth/providers`
- `GET /auth/admin-2fa/status`
- `POST /auth/admin-2fa/verify`
- `GET /auth/github/start`
- `GET /auth/github/callback`
- `GET /auth/google/start` -> `501 auth_provider_not_active`
- `GET /auth/apple/start` -> `501 auth_provider_not_active`
- `POST /auth/magic/start` -> `501 auth_provider_not_active`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/logout-all`

Auth speichert ein zufaelliges opaque Session-Token als HttpOnly Secure Cookie. Rollen und Rechte werden in KV am User-Record und an der Session gehalten. `POST /auth/logout-all` entfernt die aktuelle bekannte User-Session-Liste aus KV und meldet alle gespeicherten Sessions ab. In Phase 1 ist GitHub OAuth der aktive Production-Provider; Google, Apple und Magic-Link sind im Vertrag sichtbar, aber bis zur Provider-, Abuse- und Legal-Freigabe nicht aktiv. Admin-API-Routen verlangen nach Login zusaetzlich eine frische TOTP-Verifikation ueber `/auth/admin-2fa/verify`; TOTP-Secrets werden ausschliesslich als Cloudflare Secrets/Umgebungsvariablen gesetzt.

Storage:

- `GET /storage/capabilities`
- `POST /storage/upload-url`
- `POST /storage/upload-complete`
- `GET /storage/uploads`
- `GET /storage/file/{key}`
- `DELETE /storage/file/{key}`
- `PUT /storage/object`
- `GET /storage/object/{key}`
- `DELETE /storage/object/{key}`
- `DELETE /storage/account`

Translation/Edge:

- Cloudflare Worker fuer statische/identische Free-Only-Translation.
- Kein DeepL- oder Google-Translate-Provider in Production.

## Standard-Response

Fehlerformat:

```json
{
  "error": {
    "code": "file_too_large",
    "message": "File too large: 52428801 > 52428800"
  }
}
```

Bekannte Route mit falscher HTTP-Methode liefert `405 method_not_allowed` und einen `Allow`-Header.
Rate-Limit-Fehler liefern `429 rate_limited` mit `Retry-After`, `X-RateLimit-Limit`,
`X-RateLimit-Remaining` und `X-RateLimit-Reset`.
Jede Worker-Antwort erhaelt `X-Smyst-Request-Id` und `Server-Timing` zur Diagnose.

## Chat API Zielbild

Der Chat-Pfad muss spaeter als Worker-first API entstehen:

- Sofortige Session-Erstellung.
- Streaming-faehige Antwortschnittstelle.
- Permission- und Privacy-Checks vor Retrieval.
- Harte Quotas fuer teure Aktionen.
- Degradierter Modus ohne Sicherheitsverlust.

## Datenhaltung pro API

Auth:

- Session-Cookie im Browser: HttpOnly, Secure, SameSite=Strict. Der OAuth-Callback nutzt eine same-origin Session-Ready-Antwort, damit der anschliessende App-Aufruf die Strict-Session zuverlaessig sendet.
- Session-Daten in Cloudflare KV.
- User-Rollen und Rechte in Cloudflare KV.
- OAuth-State in Cloudflare KV.
- Admin-2FA ist fuer Admin-API-Routen serverseitig erzwungen.

Storage:

- Upload-Intent, Upload-Status, Upload-Index und Quotas in Cloudflare KV.
- Dateiinhalt, Medien, Dokumente und Backups in IDrive e2.
- Browser erhaelt nur kurzlebige signed URLs, nie IDrive-e2-Secrets.

Profile/Twins/Chat:

- In der Free-Only-Phase nur kleine Status- und Demo-Metadaten in KV.
- Chat-Demo-Zustaende liegen unter `meta:chat:{userSub}:{chatId}` und `meta:chats:{userSub}`.
- Private Chatverlaeufe bleiben im Nutzerprofil sichtbar; jeder Chat fuehrt eine Summary und einen IDrive-e2-Archivpfad.
- Chat-Suche nutzt nur KV-Metadaten, gespeicherte Chat-Summaries und die im MVP gehaltenen Nachrichten.
- Profil-Metadaten liegen unter `meta:profile:{userSub}:default`.
- Memory-Metadaten liegen unter `meta:memory:{userSub}:{memoryId}` und `meta:memories:{userSub}`.
- Memory-Objekte tragen Quelle, Sensitivity, Sichtbarkeit, Confidence, Status und erlaubte Twin-IDs.
- Twin-Metadaten liegen unter `meta:twin:{userSub}:{twinId}` und `meta:twins:{userSub}`.
- Oeffentliche Twin-Slugs liegen unter `public:twin:{slug}`.
- Support-/Trust-Meldungen liegen unter `meta:support-report:{createdAt}:{reportId}`.
- Grosse Inhalte, exportierte Memories und Backups gehoeren nach IDrive e2.
- Kein Production-Pfad darf eine separat betriebene Datenbank voraussetzen.

## Profil-, Chat- und Memory-API

Die Phase-1-API hat einen Free-Only-Pfad fuer professionelle Profile,
Chatverlaeufe und bestaetigte Memories. Sie nutzt Cloudflare KV fuer kleine
Metadaten und IDrive-e2-Objektschluessel als dauerhafte Speicherstruktur.

| Route | Methode | Zweck | Speicher |
| --- | --- | --- | --- |
| `/api/profile` | `GET` | privates Nutzerprofil, Qualitaet, Limits | Cloudflare KV |
| `/api/profile` | `PATCH` | Profilfelder, Rollen, Expertise, Ziele, Sprache, Sichtbarkeit | Cloudflare KV |
| `/api/chat/start` | `POST` | Chat sofort starten | Cloudflare KV + IDrive-e2-Archivpfad |
| `/api/chat/messages` | `POST` | Nachricht speichern, Antwort erzeugen, Summary aktualisieren | Cloudflare KV |
| `/api/chat/list` | `GET` | Chatverlauf im Profil listen | Cloudflare KV |
| `/api/chat/search` | `GET` | Chat-Summaries und gespeicherte Nachrichten durchsuchen | Cloudflare KV |
| `/api/memories` | `GET` | bestaetigte, pending oder gefilterte Memories listen | Cloudflare KV |
| `/api/memories` | `POST` | Memory mit Quelle, Sensitivity und Twin-Zugriff erstellen | Cloudflare KV + IDrive-e2-Objektschluessel |
| `/api/memories/{id}` | `GET` | einzelne Memory lesen | Cloudflare KV |
| `/api/memories/{id}` | `PATCH` | Memory bestaetigen, bearbeiten, sperren oder Twins zuweisen | Cloudflare KV |
| `/api/memories/{id}` | `DELETE` | Memory tombstonen, nicht blind entfernen | Cloudflare KV |
| `/api/account/export` | `GET` | Profil, Chatmetadaten, Memories, Twins und Objektlayout exportieren | Cloudflare KV + IDrive-e2-Referenzen |

Destruktive Memory-Aktionen brauchen `X-Smyst-Delete-Confirm:
delete-memory`. Account-Loeschung loescht Profil-, Chat-, Memory- und
Twin-Metadaten und verweist auf den Storage-Worker fuer bekannte IDrive-e2-
Objekte.

Der Storage-Worker stellt `PUT /storage/object` fuer kleine verwaltete JSON-
Objekte bereit. Damit schreibt der API-Worker Profil-, Memory- und Chat-
Archivobjekte serverseitig nach IDrive e2, ohne IDrive-e2-Secrets an den
Browser zu geben. `GET /storage/object/{key}` und `DELETE /storage/object/{key}`
sind auf eigene User-Prefixe beschraenkt.

## Nicht vorhanden in Phase 1

- Keine GraphQL-API.
- Keine Webhooks.
- Keine externe KI-/LLM-API.
- Keine externe Such-API.
- Keine bezahlten Queue-, Datenbank-, Analytics- oder Observability-Dienste.

## Skalierungsnotiz

Die Free-Only-API ist ein Kosten- und Abhaengigkeitsrahmen. Milliarden Nutzer pro Tag sind mit kostenlosen Kontingenten nicht realistisch erreichbar, aber die API-Grenzen werden so gelegt, dass spaeter horizontale Skalierung moeglich bleibt.
