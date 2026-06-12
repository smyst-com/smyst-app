# Security Audit - 2026-06-11

## Scope

Geprueft wurden Authentication, Authorization, Session Management, JWT, Cookies,
CSRF, XSS, SQL Injection, Prompt Injection, File Upload Security, API Security,
DDoS/Abuse/Spam/Bot-Schutz und Datenschutz. Production bleibt auf kostenlose
Dienste von GitHub.com und Cloudflare.com beschraenkt; IDrivee2.com bleibt der
Hauptspeicher fuer Dateien, Medien und Datenobjekte.

## Kritische Schwachstellen

Keine aktiv ausnutzbare kritische Schwachstelle im geprueften Repo-Pfad gefunden.

Wichtige Einordnung:

- Es gibt keine Production-SQL-Datenbank; klassische SQL-Injection ist in den
  aktiven Worker-Routen nicht anwendbar.
- Es gibt keine JWT-basierte Production-Session; JWT-Algorithmus-/Key-Fehler sind
  aktuell nicht vorhanden.
- Es gibt keine externe LLM-API; Prompt-Injection kann aktuell keine Modell-Tools
  oder Retrieval-Pipeline kompromittieren.

## Mittlere Schwachstellen

Gefunden:

- Session-Cookies waren `SameSite=Lax`; fuer die aktuelle reine App-/API-Nutzung ist
  `SameSite=Strict` staerker.
- Mutierende Requests hatten Origin/Referer plus CSRF-Header, aber noch keinen
  zusaetzlichen Fetch-Metadata-Check.
- Ungueltig formatierte Session-Cookie-Werte wurden nicht frueh verworfen.
- Auth-Worker validierte die Staerke von `AUTH_HMAC_SECRET` und HTTPS fuer
  `CANONICAL_HOST` nicht explizit zur Laufzeit.
- GitHub OAuth Token Response validierte `token_type` nicht.
- Twin-Bild-URLs wurden fuer private Twin-Datensaetze nicht streng genug auf
  erlaubte same-origin Pfade begrenzt.

Behoben:

- Session-Cookies sind jetzt `HttpOnly`, `Secure`, `SameSite=Strict`,
  `Priority=High`.
- Ungueltige Session-Cookies werden geloescht.
- `requireSameOrigin` blockiert Cross-Site Fetch-Metadata per `Sec-Fetch-Site`.
- Auth-Konfiguration wird auf starkes HMAC-Secret und HTTPS-Canonical-Host geprueft.
- GitHub OAuth `token_type` muss, falls vorhanden, `bearer` sein.
- `/auth/me` ist jetzt ebenfalls KV-rate-limitiert.
- Twin-Bild-URLs duerfen nur same-origin `/storage/file/`, `/assets/` oder `/public/`
  verwenden.

## Niedrige Schwachstellen Und Restrisiken

- KV-basierte Rate-Limits und Quota-Counter sind nicht atomar. Fuer Free-only-MVP
  akzeptabel, fuer massive Parallelitaet nicht ausreichend.
- Es gibt keinen kostenlosen integrierten Malware-Scanner fuer Uploads.
- Kein Bot-Management/WAF-Paid-Feature wird vorausgesetzt; Schutz erfolgt ueber
  Rate-Limits, harte Upload-Limits und Cloudflare-Edge-Basics.
- Prompt-Injection bleibt Zukunftsrisiko, sobald echte KI, Retrieval oder Tools
  angebunden werden.
- Live-IDrive-e2 Upload/Download/Delete mit echter GitHub-Session muss vor
  Production-Freigabe noch praktisch getestet werden.

## Security-Stand Nach Fixes

Authentication:

- GitHub OAuth only.
- HMAC-signierter, kurzlebiger OAuth-State.
- OAuth-State wird nach Nutzung geloescht.
- OAuth-Callback nutzt neues zufaelliges Session-Token.

Authorization:

- Rollen/Rechte werden serverseitig geprueft.
- Storage-, Twin-, Chat- und Account-Routen verlangen konkrete Permissions.
- User-Objekte sind an `userSub` und User-Prefix gebunden.

Session Management:

- Opaque Session-ID im HttpOnly Secure Strict Cookie.
- Kein JWT im Browser.
- Ungueltige Session-Cookies werden entfernt.
- Session-Daten liegen in Cloudflare KV.

CSRF/CORS:

- Mutierende Cookie-Routen verlangen `X-Smyst-CSRF: 1`.
- Origin/Referer muss same-origin sein.
- `Sec-Fetch-Site` darf nicht cross-site sein.
- CORS ist auf den kanonischen Origin beschraenkt.

XSS:

- React escaped Nutzerdaten.
- Worker entfernen Steuerzeichen und spitze Klammern aus Profiltexten.
- Twin-Bild-URLs sind auf erlaubte same-origin Pfade eingeschraenkt.
- CSP in `public/_headers` blockiert fremde Skripte und Frames.

File Upload Security:

- Dateityp, Kategorie, Groesse, Quotas und Pfad werden serverseitig erzwungen.
- Uploads laufen per kurzlebiger signed PUT URL direkt zu IDrive e2.
- Upload-Complete verifiziert per signed `HEAD`.
- Downloads brauchen KV-Metadaten und Status `uploaded`.
- Dokumente, Backups und `twin_data` werden als Attachment ausgeliefert.

API/DDoS/Abuse:

- API-Routen liefern JSON-Fehler, `405` fuer falsche Methoden und Rate-Limit-Header.
- Auth, Chat, Twin und Storage-Routen sind rate-limitiert.
- Harte Free-only Upload- und Speicherlimits verhindern Kostenexplosionen.

Datenschutz:

- Keine privaten Dateien in GitHub.
- Keine IDrive-e2-Secrets im Browser.
- Account-Export und zweistufige Loeschung fuer bekannte KV-/IDrive-e2-Daten sind
  vorhanden.
- Private API- und Profilpfade sind `noindex,nofollow`.

## Empfehlungen

- Vor Production-Deploy echte Auth-/Storage-E2E ausfuehren:
  Login, `/auth/me`, Twin anlegen, Upload, Complete, List, Download, Delete.
- Wenn echte KI angebunden wird: Prompt-Injection-Policy, Tool-Sandboxing,
  Retrieval-Isolation, Output-Filter und Audit-Logs vor dem ersten Live-Test bauen.
- Fuer Milliarden-Nutzer-Scale: atomare Rate-/Quota-Schicht, verteilte Abuse-
  Controls, Bot-Schutz, Observability und Incident-Runbooks brauchen eine neue
  Architekturfreigabe. Reine Free-Kontingente reichen dafuer realistisch nicht aus.
