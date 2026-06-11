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

Auth:

- `GET /auth/github/start`
- `GET /auth/github/callback`
- `GET /auth/me`
- `POST /auth/logout`

Auth speichert ein zufaelliges opaque Session-Token als HttpOnly Secure Cookie. Rollen und Rechte werden in KV am User-Record und an der Session gehalten.

Storage:

- `POST /storage/upload-url`
- `POST /storage/upload-complete`
- `GET /storage/uploads`
- `GET /storage/download`
- `DELETE /storage/delete`

Translation/Edge:

- Cloudflare Worker fuer statische/identische Free-Only-Translation.
- Kein DeepL- oder Google-Translate-Provider in Production.

## Standard-Response

Fehlerformat:

```json
{
  "error": "upload_too_large",
  "details": "File exceeds the configured free-only limit."
}
```

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
- Grosse Inhalte, exportierte Memories und Backups gehoeren nach IDrive e2.
- Kein Production-Pfad darf eine separat betriebene Datenbank voraussetzen.

## Skalierungsnotiz

Die Free-Only-API ist ein Kosten- und Abhaengigkeitsrahmen. Milliarden Nutzer pro Tag sind mit kostenlosen Kontingenten nicht realistisch erreichbar, aber die API-Grenzen werden so gelegt, dass spaeter horizontale Skalierung moeglich bleibt.
