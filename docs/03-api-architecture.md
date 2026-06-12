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

- `POST /api/chat/start`
- `POST /api/chat/messages`
- `GET /api/chat/list`
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

- `GET /auth/github/start`
- `GET /auth/github/callback`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/logout-all`

Auth speichert ein zufaelliges opaque Session-Token als HttpOnly Secure Cookie. Rollen und Rechte werden in KV am User-Record und an der Session gehalten. `POST /auth/logout-all` entfernt die aktuelle bekannte User-Session-Liste aus KV und meldet alle gespeicherten Sessions ab.

Storage:

- `POST /storage/upload-url`
- `POST /storage/upload-complete`
- `GET /storage/uploads`
- `GET /storage/file/{key}`
- `DELETE /storage/file/{key}`
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

- Session-Cookie im Browser: HttpOnly, Secure, SameSite=Lax.
- Session-Daten in Cloudflare KV.
- User-Rollen und Rechte in Cloudflare KV.
- OAuth-State in Cloudflare KV.

Storage:

- Upload-Intent, Upload-Status, Upload-Index und Quotas in Cloudflare KV.
- Dateiinhalt, Medien, Dokumente und Backups in IDrive e2.
- Browser erhaelt nur kurzlebige signed URLs, nie IDrive-e2-Secrets.

Profile/Twins/Chat:

- In der Free-Only-Phase nur kleine Status- und Demo-Metadaten in KV.
- Chat-Demo-Zustaende liegen unter `meta:chat:{userSub}:{chatId}` und `meta:chats:{userSub}`.
- Twin-Metadaten liegen unter `meta:twin:{userSub}:{twinId}` und `meta:twins:{userSub}`.
- Oeffentliche Twin-Slugs liegen unter `public:twin:{slug}`.
- Support-/Trust-Meldungen liegen unter `meta:support-report:{createdAt}:{reportId}`.
- Grosse Inhalte, exportierte Memories und Backups gehoeren nach IDrive e2.
- Kein Production-Pfad darf eine separat betriebene Datenbank voraussetzen.

## Nicht vorhanden in Phase 1

- Keine GraphQL-API.
- Keine Webhooks.
- Keine externe KI-/LLM-API.
- Keine externe Such-API.
- Keine bezahlten Queue-, Datenbank-, Analytics- oder Observability-Dienste.

## Skalierungsnotiz

Die Free-Only-API ist ein Kosten- und Abhaengigkeitsrahmen. Milliarden Nutzer pro Tag sind mit kostenlosen Kontingenten nicht realistisch erreichbar, aber die API-Grenzen werden so gelegt, dass spaeter horizontale Skalierung moeglich bleibt.
