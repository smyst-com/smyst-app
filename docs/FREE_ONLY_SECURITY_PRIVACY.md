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
- Cookie-basierte Schreib-Endpunkte verlangen zusätzlich den absichtlich gesetzten Header `X-Smyst-CSRF: 1`.
- Cookie-basierte Schreib-Endpunkte werten zusaetzlich `Sec-Fetch-Site` aus und blockieren Cross-Site-Requests.
- CORS-Preflights erlauben nur den kanonischen smyst.com-Origin.
- Session-Cookies sind `HttpOnly`, `Secure`, `SameSite=Strict` und `Priority=High`.
- Ungueltig formatierte Session-Cookies werden verworfen und geloescht.
- OAuth-State ist HMAC-signiert, kurzlebig und wird nach Nutzung gelöscht.
- Die Auth-Konfiguration verlangt HTTPS fuer `CANONICAL_HOST` und ein starkes HMAC-Secret.
- `POST /auth/logout-all` entfernt bekannte Sessions des aktuellen Users aus Cloudflare KV.

## Upload-Schutz

- Uploads gehen direkt per kurzlebiger Presigned-URL zu IDrive e2.
- Der Storage-Worker erzwingt Kategorie, Content-Type, Dateigröße, Quotas und Nutzerpfad.
- Upload-Completion verifiziert Objektgröße und Content-Type per IDrive-e2-HEAD.
- Dateinamen werden normalisiert; echte Objekt-Keys werden serverseitig generiert.
- Löschungen laufen serverseitig über den Worker, nicht über User-gereichte IDrive-Secrets.
- Abgelaufene Upload-Intents werden beim naechsten Upload/List-Aufruf als `expired` markiert und reservierte Monats-Quotas werden freigegeben.

## Export und Löschung

- `GET /api/account/export` exportiert eigene Cloudflare-KV-Metadaten wie User-Record, Twins und Chats als JSON.
- `DELETE /storage/account` loescht bekannte User-Objekte in IDrive e2 ueber serverseitig erzeugte kurzlebige Delete-Signaturen.
- `DELETE /api/account` loescht eigene Chat-, Twin-, Public-Profile- und Account-Metadaten aus KV und beendet die Session.
- Account-Loeschung ist zweistufig: zuerst Storage-Objekte ueber den Storage-Worker, danach KV-Metadaten ueber den API-Worker.

## Trust, Support und Meldungen

- `POST /api/support/report` speichert Feedback, Fehler-, Datenschutz-, Safety- und Missbrauchsmeldungen als kleine KV-Records.
- Meldungen sind rate-limitiert und nutzen keine externen Ticket- oder Analytics-Dienste.
- `/.well-known/security.txt` nennt den Security-Kontakt und das Trust Center.
- `/trust`, `/privacy`, `/terms` und `/imprint` sind als Produktseiten vorhanden; finale juristische Freigabe bleibt vor Production erforderlich.

## XSS, Headers und öffentliche Daten

- API-Antworten haben sichere JSON- und No-Store-Header.
- Cloudflare Pages setzt CSP, Framing-Schutz, Referrer-Policy, Permissions-Policy und `nosniff`.
- React rendert Nutzerdaten escaped; Worker entfernen Steuerzeichen und spitze Klammern aus Profiltexten.
- Twin-Bild-URLs duerfen nur auf same-origin `/storage/file/`, `/assets/` oder `/public/` zeigen.
- Öffentliche Twin-Profile geben keine privaten Medien-Keys, User-IDs, `imageKey` oder Wissenstexte aus. Das öffentliche KV enthält nur einen entschärften Snapshot mit Zählwerten und Profilmetadaten.
- Private Profile und private API-Pfade sind `noindex,nofollow`.

## Injection-Risiken

- Production nutzt aktuell keine SQL-Datenbank; klassische SQL-Injection ist in den aktiven Worker-Pfaden nicht anwendbar.
- Production nutzt keine JWTs; Token-Fehler wie unsichere JWT-Signaturalgorithmen sind im aktiven Pfad nicht vorhanden.
- Chat-Antworten sind regelbasiert und rufen keine externe LLM-API auf. Prompt-Injection bleibt als Zukunftsrisiko dokumentiert, sobald Retrieval oder echte Modelle angebunden werden.
- File-Uploads werden nicht ausgefuehrt, sondern als IDrive-e2-Objekte gespeichert und nur typ-/statusgeprueft ausgeliefert.

## Phase-1-Grenzen

- Phase 1 ist ein Free-Only-MVP, keine Milliarden-Nutzer-Produktionsplattform.
- Milliarden-Skalierung bleibt Langfristvision und erfordert spaeter zusätzliche Architekturentscheidungen, ohne die aktuelle Free-Only-Regel zu verletzen.
