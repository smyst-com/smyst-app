# 10 Coding Standards

## Ziel

Coding Standards sichern Wartbarkeit, Erweiterbarkeit, Security und Performance.

## Free-Only Production Standards

- Production-Code darf keine bezahlten Zusatzdienste voraussetzen.
- Production-Code darf nur GitHub Free, Cloudflare Free und IDrive e2 verwenden.
- Legacy-Servercode muss als lokal/optional markiert bleiben.
- Secrets gehoeren in Cloudflare Secrets oder GitHub Secrets, nie in den Browser.
- Uploads laufen direkt zu IDrive e2 ueber signed URLs.
- Quotas sind Pflicht, bevor Uploads oder AI-relevante Aktionen freigegeben werden.

## Frontend

- Vite, React, TypeScript und Capacitor sind der aktive App-Stack.
- Mobile-First.
- Keine externen Analytics-Skripte.
- Keine Google-Service-Pflicht.
- Auth ueber sichere Cookies.
- Accessibility von Anfang an.

## Workers

- Worker bleiben klein und klar abgegrenzt.
- Jede Route validiert Auth, Input und Quotas.
- Fehler sind strukturiert und maschinenlesbar.
- Keine geheimen Keys im Response.
- Externe API-Calls nur, wenn sie zur Free-Only-Regel passen.

## Security

- Input Validation fuer alle externen Daten.
- Output Encoding im Frontend.
- CSRF-Schutz bei Cookie-Auth.
- Rate Limits fuer teure oder missbrauchsgefaehrdete Endpunkte.
- Admin-Aktionen voll auditieren.
- Negative Permission Tests fuer jede geschuetzte Domain.

## Testing

Pflicht im aktuellen Production-Pfad:

- TypeScript Check.
- Root-App Build.
- Free-Only-Policy-Check.
- Shell-Syntax-Check.
- Worker-smoke-faehige Tests, sobald Endpunkte stabil sind.

## Legacy

Backend-, SQL-, Docker- und Vector-Dateien duerfen als lokale Entwicklungsreferenz bleiben. Sie duerfen keine CI-, Deploy- oder Production-Pflicht sein.

