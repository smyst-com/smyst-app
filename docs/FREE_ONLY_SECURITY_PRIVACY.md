# Free-Only Sicherheit und Datenschutz

Status: Phase-1-MVP auf GitHub Free, Cloudflare Free und IDrive e2.

## Grundsatz

Production darf keine kostenpflichtigen Zusatzdienste voraussetzen. Sensible Daten bleiben privat, solange ein Nutzer sie nicht ausdrücklich als öffentliche Profilmetadaten freigibt.

## Zugriffskontrollen

- Auth läuft über GitHub OAuth und HttpOnly-Session-Cookies.
- Sessions liegen in Cloudflare KV.
- Rollen und Rechte werden serverseitig geprüft: `storage:*`, `twin:*`, `chat:*`, `admin:*`.
- Private Daten werden nur über usergebundene KV-Keys und IDrive-e2-Pfade unter `users/{userSub}/...` gelesen.

## CSRF, CORS und Sessions

- Cookie-basierte Schreib-Endpunkte prüfen `Origin` oder `Referer` gegen `CANONICAL_HOST`.
- CORS-Preflights erlauben nur den kanonischen smyst.com-Origin.
- Session-Cookies sind `HttpOnly`, `Secure`, `SameSite=Lax` und `Priority=High`.
- OAuth-State ist HMAC-signiert, kurzlebig und wird nach Nutzung gelöscht.

## Upload-Schutz

- Uploads gehen direkt per kurzlebiger Presigned-URL zu IDrive e2.
- Der Storage-Worker erzwingt Kategorie, Content-Type, Dateigröße, Quotas und Nutzerpfad.
- Upload-Completion verifiziert Objektgröße und Content-Type per IDrive-e2-HEAD.
- Dateinamen werden normalisiert; echte Objekt-Keys werden serverseitig generiert.
- Löschungen laufen serverseitig über den Worker, nicht über User-gereichte IDrive-Secrets.

## XSS, Headers und öffentliche Daten

- API-Antworten haben sichere JSON- und No-Store-Header.
- Cloudflare Pages setzt CSP, Framing-Schutz, Referrer-Policy, Permissions-Policy und `nosniff`.
- React rendert Nutzerdaten escaped; Worker entfernen Steuerzeichen und spitze Klammern aus Profiltexten.
- Öffentliche Twin-Profile geben keine privaten Medien-Keys, User-IDs, `imageKey` oder Wissenstexte aus. Das öffentliche KV enthält nur einen entschärften Snapshot mit Zählwerten und Profilmetadaten.
- Private Profile und private API-Pfade sind `noindex,nofollow`.

## Phase-1-Grenzen

- Phase 1 ist ein Free-Only-MVP, keine Milliarden-Nutzer-Produktionsplattform.
- Milliarden-Skalierung bleibt Langfristvision und erfordert spaeter zusätzliche Architekturentscheidungen, ohne die aktuelle Free-Only-Regel zu verletzen.
