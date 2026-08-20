# smyst.com Infrastructure Setup

Stand: 2026-08-20. Diese Datei beschreibt den LIVE-Stand, nicht eine Zielvorstellung.

## Anbieter im Betrieb

| Anbieter | Aufgabe | Kosten |
|---|---|---|
| Spaceship | Domain `smyst.com`, DNS-Zone, Subdomains | Domain-Gebuehr |
| GitHub Free | Code, Pull Requests, Releases, GitHub Actions (CI, Cronjobs, Deploys) | 0 |
| GitHub Pages | Auslieferung der Website/PWA (`smyst.com`, `app.`, `cdn.`) | 0 |
| Zeabur | Backend-Container `smyst-backend` unter `api.smyst.com` | kostenpflichtig |
| IDrive e2 | S3-kompatibler Objektspeicher, zugleich Datenhaltung des Backends | Free-Tier |
| OpenRouter | LLM-Provider fuer den Live-Twin-Chat auf dem Server | ca. 5-6 USD/Tag |
| Groq | LLM-Free-Tier, in Pipeline/QA/Evals als erster Provider | 0 |
| Resend | E-Mail-Versand, nur aktiv wenn `RESEND_API_KEY` gesetzt ist | Free-Tier |

Nicht mehr im Betrieb:

- Salad.com: war bis Ende Juli 2026 der Compute-Layer. Die Workflows
  `salad-backend-deploy.yml` und `voice-worker-deploy.yml` stehen seit
  29.07.2026 auf `if: false` und existieren nur noch als Rollback-Pfad.
  Der Salad-Host antwortet seit Mitte August 2026 nicht mehr.
- Cloudflare: frueherer Edge-Provider, in aelteren Dokus als
  "Legacy edge provider" bezeichnet. Kein Produktionsbestandteil mehr.
- Codeberg oder andere Git-Hoster: werden nicht genutzt. Einziges Remote ist
  `https://github.com/smyst-com/smyst-app.git`.

## Kette einer Anfrage

```text
Nutzer
  -> Spaceship DNS
  -> GitHub Pages          statische Website/PWA (smyst.com)
  -> Zeabur                api.smyst.com, FastAPI-Backend
       -> IDrive e2        Nutzer, Chats, Profile, Pipeline-Daten (JSON-Objekte)
       -> OpenRouter/Groq  KI-Antworten
```

## Subdomains

```text
smyst.com        -> GitHub Pages (CNAME smyst-com.github.io), Website/PWA
app.smyst.com    -> GitHub Pages
cdn.smyst.com    -> GitHub Pages
api.smyst.com    -> Zeabur (smyst-backend), Alias von smyst-api.zeabur.app
files.smyst.com  -> IDrive e2, privat (403), von der App nicht genutzt
media.smyst.com  -> IDrive e2, privat (403), von der App nicht genutzt
```

Wichtig fuer Frontend-Code: `smyst.com` ist statisch. Relative `fetch()`-Aufrufe
auf `/api/...` laufen dort ins Leere. API-Aufrufe muessen immer ueber
`fetchService` aus `src/lib/serviceEndpoints.ts` gehen (404-Fallback auf
`smyst-api.zeabur.app`, Cross-Origin-Cookies brauchen `credentials: 'include'`).

## Warum GitHub Pages und nicht IDrive e2

IDrive e2 sperrt Public Bucket Access im Free-Plan serverseitig. Nachgewiesen
per S3-API (Run #26 `idrive-static-deploy`): `PutBucketPolicy` liefert
`AccessDenied` fuer alle Buckets. `smyst.com` lief nie ueber IDrive e2, sondern
immer ueber GitHub Pages. Der Workflow `idrive-static-deploy.yml` bleibt als
Reserve erhalten, ist aber kein aktiver Auslieferungspfad.

IDrive e2 bleibt Primaerspeicher fuer alle Backend-Daten (privat, ueber
S3-API/Signed URLs) - dafuer ist kein Public Access noetig.

## IDrive e2 Buckets

Region Los Angeles (`us-west-2`). Buckets: `smyst.com`, `app.smyst.com`,
`cdn.smyst.com`, `backup.smyst.com`, `smyst-memories`. Alle privat.

`smyst-memories` ist der Arbeitsbucket des Backends (`IDRIVE_E2_BUCKET`,
Default in `backend/app/core/config.py`). Die Objekt-Praefixe stehen in
`docs/FREE_ONLY_DATA_MAP.md`.

## Zeabur

- Service `smyst-backend`: gebaut aus `backend/Dockerfile` mit dem Repo-Root
  als Build-Kontext. Enthaelt Piper-TTS (13 Stimmen, DE/EN/TR) und
  Whisper `small` (int8) fest im Image - Standard-Sprachausgabe und
  Server-Diktat brauchen keinen separaten GPU-Dienst.
- Auto-Deploy aus GitHub. Der Auto-Deploy ist schon einmal ausgefallen
  (nach PR #266); dann im Portal manuell "Redeploy" ausloesen.
- Nach Aenderungen am Dockerfile: in Zeabur Settings -> Dockerfile
  "Load from GitHub" -> Save -> Redeploy.
- Log-Suche ist ein Pro-Feature (19 USD/Monat) und ist nicht aktiviert.
  Diagnose laeuft ueber Live-Endpunkte statt Logsuche.
- Secrets (`GOOGLE_OAUTH_CLIENT_SECRET`, `AUTH_SESSION_SECRET`,
  `OPENROUTER_API_KEY`, IDrive-Keys) liegen als Service-Variablen in Zeabur,
  niemals im Repository und niemals als IDrive-Objekt.

## GitHub Actions

Aktive Deploy-Wege:

- `github-pages.yml`: baut die PWA bei jedem Push auf `main` und deployt sie
  nach GitHub Pages. Setzt `VITE_API_BASE_URL=https://smyst-api.zeabur.app`
  und schreibt `dist/CNAME` mit `smyst.com`.
- `deploy.yml` (CI): install, typecheck, tests, build fuer PRs und `main`.
- `pipeline-run.yml`: die Profil-Pipeline als Cronjob (Worker 1-5), publiziert
  und triggert danach den Pages-Deploy.
- `quality-loop.yml`, `model-eval.yml`, `voice-qa-daily.yml`,
  `pipeline-backup.yml`, `pipeline-watchdog.yml`: wiederkehrende Qualitaets-,
  Mess- und Sicherungslaeufe.

Stillgelegt (`if: false`, nur Rollback): `salad-backend-deploy.yml`,
`voice-worker-deploy.yml`.

Reserve, nicht im Regelbetrieb: `idrive-static-deploy.yml`,
`idrive-static-reset.yml`.

## Datenhaltung

Es gibt in Produktion keine relationale Datenbank und keinen Redis. Nutzer,
Chats, Feedback, Profile und Pipeline-Status liegen als JSON-Objekte in
IDrive e2 (siehe `backend/app/integrations/*_store.py`).

PostgreSQL und Redis existieren nur in `docker-compose.yml` unter dem Profil
`legacy-local` fuer lokale Entwicklung.

## Google Login

Runbook: `docs/runbooks/google-salad-auth.md`. Die dort beschriebenen
Salad-Schritte sind durch Zeabur-Service-Variablen ersetzt; Google-Console-
und DNS-Schritte gelten unveraendert.
