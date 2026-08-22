# Backend

FastAPI-Backend von smyst.com. Laeuft als Container `smyst-backend` auf Zeabur
unter `api.smyst.com` (Alias von `smyst-api.zeabur.app`).

Production rule:

- Zeabur runs compute: API, auth, chat, TTS/ASR, search and admin endpoints.
- IDrive e2 owns object storage AND persistence: users, chats, feedback,
  pipeline artefacts, uploads, media, exports, backups and archives. There is
  no PostgreSQL and no Redis in production.
- OpenRouter serves the live twin chat; Groq is the free-tier provider used
  first by pipeline, QA and evals.
- Spaceship owns domain and DNS records.
- GitHub owns code, CI and the cron pipelines; GitHub Pages serves the
  frontend.
- Secrets such as `GOOGLE_OAUTH_CLIENT_SECRET` and `OPENROUTER_API_KEY` must
  live in Zeabur service variables, never in the repository and never as plain
  IDrive objects.

Build: `backend/Dockerfile`, Build-Kontext ist das REPO-ROOT (alle COPY-Pfade
tragen den `backend/`-Prefix). Das Image enthaelt Piper-TTS mit 13 kuratierten
Stimmen (DE/EN/TR) und Whisper `small` (int8) fuer Server-Diktat. Nach
Aenderungen am Dockerfile: in Zeabur Settings -> Dockerfile "Load from GitHub"
-> Save -> Redeploy.

Tests: `cd backend && uv run pytest` (Python 3.12).

Current auth foundation:

- `GET /auth/google/start` starts Google OAuth.
- `GET /auth/google/callback` exchanges the code and sets an HttpOnly signed session cookie.
- `GET /auth/me` returns the frontend-compatible session contract.
- `POST /auth/logout` and `POST /auth/logout-all` clear the current stateless session.

Production environment sketch (Zeabur service variables):

```bash
PUBLIC_BASE_URL=https://smyst.com
AUTH_PUBLIC_BASE_URL=https://api.smyst.com
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://api.smyst.com/auth/google/callback
AUTH_SESSION_SECRET=...
SMYST_OWNER_EMAILS=smyst247@gmail.com
CORS_ORIGINS=https://smyst.com,https://app.smyst.com
OPENROUTER_API_KEY=...
IDRIVE_E2_ENDPOINT=...
IDRIVE_E2_BUCKET=smyst-memories
IDRIVE_E2_ACCESS_KEY=...
IDRIVE_E2_SECRET_KEY=...
VOICE_WORKER_URL=...      # fehlt aktuell, siehe unten
VOICE_WORKER_TOKEN=...    # fehlt aktuell, siehe unten
```

Pflicht-Smoke nach jedem Deploy: `GET /api/tts/voices` muss 200 mit
`ready:true` liefern (Funktions-Freeze Sprachsystem, siehe AGENTS.md).

Bekannte Luecke: `VOICE_WORKER_URL` und `VOICE_WORKER_TOKEN` sind beim Umzug
von Salad nach Zeabur verloren gegangen. Solange sie fehlen, meldet
`/api/tts/voices` `workerConfigured=false` und 12 von 15 Sprachen
synthetisieren mit englischer Ersatzstimme; DE/EN/TR laufen ueber Piper im
Container korrekt.

Siehe `docs/runbooks/google-salad-auth.md` fuer die Google-Console- und
DNS-Schritte. Die dort beschriebenen Salad-Schritte sind durch
Zeabur-Service-Variablen ersetzt.
