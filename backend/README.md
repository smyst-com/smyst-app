# Backend

This folder is the Cloudflare-free API/auth foundation for Salad-hosted runtime work.

Production rule:

- Salad.com runs compute: API, auth, AI, search, indexing and cron jobs.
- IDrive e2 owns object storage: uploads, media, exports, backups, static assets, logs and archives.
- Spaceship.com owns domain and DNS records.
- GitHub remains code/versioning only.
- Secrets such as `GOOGLE_OAUTH_CLIENT_SECRET` must live in Salad runtime secrets/env vars, never as plain IDrive objects.

Current auth foundation:

- `GET /auth/google/start` starts Google OAuth.
- `GET /auth/google/callback` exchanges the code and sets an HttpOnly signed session cookie.
- `GET /auth/me` returns the frontend-compatible session contract.
- `POST /auth/logout` and `POST /auth/logout-all` clear the current stateless session.

Production environment sketch:

```bash
PUBLIC_BASE_URL=https://smyst.com
AUTH_PUBLIC_BASE_URL=https://api.smyst.com
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://api.smyst.com/auth/google/callback
AUTH_SESSION_SECRET=...
SMYST_OWNER_EMAILS=smyst247@gmail.com
CORS_ORIGINS=https://smyst.com,https://app.smyst.com
```

See `docs/runbooks/google-salad-auth.md` for Google Console, Salad secrets and DNS steps.
