# smyst.com Infrastructure Policy

Stand: 2026-08-20. Status: verbindliche Produktionsvorgabe.

Diese Datei hiess frueher "Free-Only Infrastructure Policy" und verbot jeden
kostenpflichtigen Dienst. Diese Regel ist ueberholt: smyst.com betreibt seit
Ende Juli 2026 ein bezahltes Backend-Hosting (Zeabur) und einen bezahlten
LLM-Provider (OpenRouter). Die Regel lautet jetzt "Free zuerst, bezahlte
Ausnahmen namentlich benannt" - nicht mehr "Free-only". Der Dateiname bleibt,
weil andere Dokumente darauf verweisen.

## Grundregel

Erlaubt sind ausschliesslich die hier namentlich gelisteten Anbieter. Ein
neuer Anbieter braucht eine ausdrueckliche Freigabe des Inhabers und einen
Eintrag in dieser Liste.

Kostenlos:

- GitHub Free - Code, Pull Requests, Releases, Actions.
- GitHub Pages - Auslieferung von Website und PWA.
- IDrive e2 - Objektspeicher und Datenhaltung, solange der Free-Tier reicht.
- Groq - LLM-Free-Tier, erster Provider in Pipeline, QA und Evals.
- Resend - E-Mail-Versand im Free-Tier, optional.
- Spaceship - Domain und DNS (nur die Domain-Gebuehr selbst).
- Codeberg - privater Spiegel des Repositories als Ausfallsicherung
  (`codeberg.org/smyst/smyst-app`, Automatik ueber
  `.github/workflows/codeberg-mirror.yml`). Nur Sicherung, kein Betriebspfad.

Kostenpflichtig, bewusst freigegeben:

- Zeabur - Hosting des Backend-Containers `smyst-backend` unter
  `api.smyst.com`. Ersetzt seit Ende Juli 2026 Salad.com.
- OpenRouter - LLM-Provider des Live-Twin-Chats, rund 5-6 USD/Tag.

Alles andere ist keine Production-Abhaengigkeit: keine VPS, keine Managed
Databases, kein Redis-Hosting, keine Analytics-SaaS, keine Monitoring-SaaS,
keine Payment-Dienste, keine externen Uebersetzungs-APIs, keine weiteren
AI-Provider ohne Freigabe.

## Nicht mehr im Betrieb

- Salad.com - Compute bis Ende Juli 2026. Die Workflows
  `salad-backend-deploy.yml` und `voice-worker-deploy.yml` stehen seit
  29.07.2026 auf `if: false` und dienen nur noch als Rollback-Pfad.
- Cloudflare Pages/Workers/KV - in aelteren Dokumenten als "Legacy edge provider" bezeichnet.
- IDrive e2 als Website-Host - Public Bucket Access ist im Free-Plan
  serverseitig gesperrt (`PutBucketPolicy` -> `AccessDenied`).
- Codeberg als Ersatz fuer GitHub - Codeberg dient ausschliesslich als
  privater Spiegel des Repositories, nicht als Betriebsplattform.

## Zielarchitektur

```text
Clients
  Web / PWA / Capacitor Shells

Spaceship
  Domain smyst.com, DNS-Zone, Subdomains

GitHub Free
  Code, Docs, Issues, Actions (CI, Cronjobs, Deploys)

GitHub Pages
  smyst.com, app.smyst.com, cdn.smyst.com - statische Auslieferung

Zeabur
  api.smyst.com - FastAPI-Backend, Auth, Chat, TTS/ASR, Admin
  Piper-TTS und Whisper small liegen im Container

IDrive e2
  Objektspeicher UND Datenhaltung: Nutzer, Chats, Feedback,
  Pipeline-Artefakte, Backups, Exporte - alles als JSON/Objekte

OpenRouter (Live-Chat) / Groq (Pipeline, QA, Evals)
  LLM-Inferenz
```

## Keine Datenbank in Production

Es laeuft weder PostgreSQL noch Redis in Produktion. Die Stores unter
`backend/app/integrations/` schreiben JSON-Objekte direkt per S3-API nach
IDrive e2. PostgreSQL und Redis existieren nur im Profil `legacy-local` von
`docker-compose.yml` fuer lokale Entwicklung.

Die genaue Ablage pro Datentyp steht in `docs/FREE_ONLY_DATA_MAP.md`.

## Produktgrenzen

Dieser Aufbau traegt:

- Landingpage, PWA und oeffentliche Profile.
- Auth mit Google-Login und signierten Session-Cookies.
- Live-Twin-Chat mit echter LLM-Inferenz.
- Sprachausgabe (Piper, DE/EN/TR) und Server-Diktat (Whisper small).
- Eine taegliche Profil-Pipeline mit QA-Gate.

Dieser Aufbau kann nicht zusagen:

- Milliarden Nutzer pro Tag.
- Unbegrenzte Uploads.
- Grosse relationale Datenbanken.
- Professionelle semantische Suche ueber riesige Datenmengen.
- Eigene Modellqualitaet oberhalb der grossen Anbieter.

Das Milliarden-Ziel bleibt Produktvision, nicht Leistungszusage dieses Aufbaus.

## Harte Betriebsregeln

- Keine Secrets im Repository. Backend-Secrets leben als Zeabur-Service-
  Variablen, CI-Secrets als GitHub-Actions-Secrets.
- Free-Tier zuerst: `LLM_PROVIDER_ORDER` beginnt mit `groq`, OpenRouter ist
  Rueckfall. Ausnahme: der Live-Chat-Server nutzt bewusst OpenRouter.
- OpenRouter-Guthaben UND Key-Limit aktiv nachfuehren. Ein erschoepftes
  Key-Limit hat am 17.08.2026 den Live-Chat auf den Not-Fallback
  (`mode=local`) fallen lassen und die Pipeline vier Tage blockiert.
- Uploads muessen stoppen, bevor IDrive e2 kostenpflichtig wird.
- GitHub Actions bleiben innerhalb der kostenlosen Limits.
- Mehrsprachigkeit wird statisch im Repository gepflegt, ohne externe
  Translation-API.
- Kein Deployment darf einen nicht gelisteten kostenpflichtigen Dienst
  voraussetzen.
