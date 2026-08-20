# 07 Deployment Architecture

Stand: 2026-08-20. Beschreibt den Live-Stand.

## Ziel

Statische Auslieferung ueber GitHub Pages, dynamische Rechenarbeit im
Backend-Container auf Zeabur, alle Daten und Dateien in IDrive e2, Domain und
DNS bei Spaceship, Code und Automatisierung bei GitHub.

Die Betriebsarchitektur traegt einen kleinen Produktivbetrieb. Milliarden
Nutzer pro Tag sind damit nicht erreichbar und bleiben eine Langfristvision,
keine Leistungszusage dieses Aufbaus.

## Umgebungen

- `local`: Entwicklerrechner. Backend per `uv`, optional der
  `legacy-local`-Stack aus `docker-compose.yml`.
- `preview`: PR-Checks in GitHub Actions (install, lint, typecheck, tests,
  build, Browser-E2E). Kein eigener Preview-Host.
- `production`: GitHub Pages (Frontend) + Zeabur (Backend) + IDrive e2 (Daten).

## Services in Production

- Spaceship: Registrar, Domain-Besitz, DNS-Zone.
- GitHub Free: Code, Versionierung, Releases, Issues, Actions.
- GitHub Pages: Auslieferung von Website und PWA fuer `smyst.com`,
  `app.smyst.com` und `cdn.smyst.com`.
- Zeabur: Backend-Container `smyst-backend` unter `api.smyst.com` - API, Auth,
  Chat, TTS/ASR, Admin-Endpunkte.
- IDrive e2: Objektspeicher und zugleich Datenhaltung - Nutzer, Chats,
  Feedback, Pipeline-Artefakte, Backups, Exporte.
- OpenRouter: LLM-Provider des Live-Chats.
- Groq: LLM-Free-Tier, erster Provider in Pipeline, QA und Evals.
- Resend: E-Mail-Versand, optional ueber `RESEND_API_KEY`.

Nicht mehr in Production:

- Salad.com (Compute bis Ende Juli 2026, Deploy-Workflows seit 29.07.2026
  `if: false`).
- Cloudflare Pages/Workers/KV (in aelteren Dokus "Legacy edge provider").
- IDrive e2 als Website-Host (Public Bucket Access im Free-Plan gesperrt).

Nicht erlaubt in Production:

- GitHub als Hauptspeicher fuer Medien, Modelle, App-Dateien oder Backups.
- IDrive e2 als Ersatz fuer Auth-Logik, Chat-Berechnung, KI-Antwort oder
  Live-Admin-Dashboard. IDrive e2 speichert, es rechnet nicht.
- API-Keys oder Secrets im Repository.

## Deploy-Wege

Frontend (automatisch):

```text
Push auf main
  -> github-pages.yml
  -> npm ci, npm run build (VITE_API_BASE_URL=https://smyst-api.zeabur.app)
  -> optional: published Pipeline-Profile aus IDrive e2 mergen
  -> dist/CNAME = smyst.com
  -> GitHub Pages Deploy
```

Backend (Zeabur-Auto-Deploy):

```text
Merge auf main
  -> Zeabur baut backend/Dockerfile (Build-Kontext = Repo-Root)
  -> Service smyst-backend neu ausgerollt
```

Der Auto-Deploy ist schon einmal stumm ausgefallen (nach PR #266). Wenn ein
Backend-Change live nicht ankommt: im Zeabur-Portal manuell "Redeploy".

Wiederkehrende Jobs in GitHub Actions: `pipeline-run.yml` (Profil-Pipeline,
Cron), `quality-loop.yml`, `model-eval.yml`, `voice-qa-daily.yml`,
`pipeline-backup.yml`, `pipeline-watchdog.yml`.

## Secrets

GitHub Actions:

- `IDRIVE_E2_ACCESS_KEY`, `IDRIVE_E2_SECRET_KEY`
- LLM-Keys fuer Pipeline/QA (`GROQ_API_KEY`, `OPENROUTER_API_KEY`)
- `AUTH_SESSION_SECRET`, wo Jobs signierte Aufrufe brauchen

Zeabur-Service-Variablen (Laufzeit des Backends):

- `OPENROUTER_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- `AUTH_SESSION_SECRET`
- `IDRIVE_E2_*`
- `VOICE_WORKER_URL`, `VOICE_WORKER_TOKEN` (aktuell nicht gesetzt, siehe
  Abschnitt "Bekannte Luecken")

Keine Secrets im Repository, `.env.production` wird nicht committet.

## Release-Prozess

1. Feature-Branch `claude/<thema>` oder `codex/<thema>`, kein Direkt-Push auf
   `main`.
2. Pull Request, alle Checks gruen (inklusive Browser-E2E).
3. Review und Merge nach `main`.
4. GitHub Pages Deploy laeuft automatisch.
5. Zeabur rollt das Backend automatisch aus; bei Backend-Aenderungen im Portal
   pruefen, ob der Deploy wirklich lief.
6. Pflicht-Smoke nach Backend-Deploy: `GET /api/tts/voices` muss 200 mit
   `ready:true` liefern (Funktions-Freeze Sprachsystem, siehe AGENTS.md).
7. Nach Frontend-Merge: Bundle muss `/api/tts` enthalten.
8. Smoke gegen `smyst.com`, `api.smyst.com` und ein oeffentliches Profil.

## Rollback

- Frontend: Revert-PR auf `main`, Pages baut neu. Alternativ frueheren
  Pages-Deploy im Actions-Log erneut ausfuehren.
- Backend: im Zeabur-Portal das vorherige Deployment reaktivieren, oder
  Revert-PR und Redeploy.
- Daten: IDrive-e2-Objekte sind versioniert abgelegt; Pipeline-Stand liegt
  zusaetzlich im Branch `pipeline-backup` (`pipeline-backup.yml`).
- Notfall-Pfad Compute: `salad-backend-deploy.yml` durch Entfernen der
  `if: false`-Zeile reaktivierbar.

## Kostenregeln

- Free-Tier zuerst: `LLM_PROVIDER_ORDER` beginnt in Pipeline, Eval,
  Quality-Loop und Model-Compare mit `groq`; OpenRouter ist Rueckfall.
- Der Live-Chat-Server nutzt bewusst OpenRouter (Antwortqualitaet).
- OpenRouter-Verbrauch liegt bei rund 5-6 USD/Tag. Key-Limit und Guthaben
  muessen aktiv nachgefuehrt werden - ein erschoepftes Key-Limit hat am
  17.08.2026 den kompletten Live-Chat auf den Not-Fallback (`mode=local`)
  fallen lassen und die Profil-Pipeline vier Tage lang blockiert.
- Uploads muessen stoppen, bevor IDrive e2 kostenpflichtig wird.
- GitHub Actions bleiben innerhalb der kostenlosen Limits.

## Bekannte Luecken

- Dem `smyst-backend` auf Zeabur fehlen seit dem Umzug `VOICE_WORKER_URL` und
  `VOICE_WORKER_TOKEN`. Folge: 12 von 15 Sprachen synthetisieren mit
  englischer Ersatzstimme; DE/EN/TR laufen korrekt ueber Piper im Container.

## Skalierungspfad

Stufe 1: PWA, oeffentliche Profile, statische Inhalte, IDrive-e2-Speicher.
Stufe 2: Login, Nutzerprofile, Uploads, private Dateien, signierte URLs.
Stufe 3: KI-Chat, RAG, Profilwissen, Suchindex, Embeddings.
Stufe 4: iOS-, Android- und Huawei-App anbinden.
Stufe 5: globale Edge-Router, regionale API-Cluster, regionale
Datenschutz-Partitionen, Multi-Provider-AI-Routing, getrennte Realtime-,
Upload-, Retrieval- und Admin-Kapazitaeten, Disaster-Recovery-Regionen mit
getesteten Restore-Prozessen, SLO-basierte Autoskalierung.
