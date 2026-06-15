# Authenticated Chat Stability Harness

This runbook covers the live browser/session harness for authenticated Smyst chat POSTs.
It does not create, delete, migrate, or seed production data.

## Auth sources

Use one of these inputs:

- `SMYST_AUTH_STORAGE_STATE=/absolute/path/to/storage-state.json`
- `SMYST_SESSION_COOKIE='smyst_session=...'`
- `SMYST_SESSION_VALUE='...'`
- `SMYST_AUTH_INTERACTIVE_LOGIN=1` for a one-time headed GitHub login that saves `frontend/test-results/smyst-auth-state.json`

The harness calls `/auth/me` before any chat POST. If the session is missing or expired, it exits with a failure.

## Standard 100-profile run

```sh
cd frontend
WEB_BASE_URL=https://smyst.com \
SMYST_AUTH_STORAGE_STATE=/absolute/path/to/storage-state.json \
npm run e2e:auth-chat
```

The default run checks:

- 100 public profiles from `/api/public/twins`
- authenticated `/api/chat/start`
- authenticated `/api/chat/messages`
- profile switching across browser contexts
- mobile/PWA manifest and service worker assets
- session stability via `/auth/me`
- p95 chat-start and answer timings
- error-rate threshold

Reports are written to `frontend/test-results/authenticated-chat-harness-*.json`.

## Multi-hour soak

Keep the default delay unless you intentionally change the API rate profile. The live API rate limits are 30 chat starts/minute and 60 messages/minute per client IP.

```sh
cd frontend
WEB_BASE_URL=https://smyst.com \
SMYST_AUTH_STORAGE_STATE=/absolute/path/to/storage-state.json \
SMYST_SOAK_MINUTES=180 \
SMYST_BROWSER_SESSIONS=2 \
SMYST_PROFILE_DELAY_MS=2200 \
npm run e2e:auth-chat
```

Useful tuning variables:

- `SMYST_PROFILE_LIMIT=100`
- `SMYST_MESSAGES_PER_PROFILE=1`
- `SMYST_MAX_CHAT_START_P95_MS=2500`
- `SMYST_MAX_ANSWER_P95_MS=3500`
- `SMYST_MAX_ERROR_RATE=0.01`

## Local fallback without installed frontend modules

If `frontend/node_modules` is not installed but a Playwright package exists elsewhere:

```sh
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/node_modules/playwright \
node frontend/scripts/authenticated-chat-harness.mjs
```

