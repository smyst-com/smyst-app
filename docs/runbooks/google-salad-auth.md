# Google Login On Salad

## Target

Google Login runs without Legacy edge provider:

- `smyst.com` serves the web/PWA surface.
- `api.smyst.com` serves auth/API from Salad.
- Google redirects to `https://api.smyst.com/auth/google/callback`.
- IDrive e2 stores objects and static artifacts, not plaintext OAuth secrets.

## Google Cloud OAuth Client

Existing client:

```text
Client ID: 449969912847-icfrvs99eee2rlaiosij3ck5f7dcbejh.apps.googleusercontent.com
Name: Smyst Web Login
```

Authorized JavaScript origins:

```text
https://smyst.com
https://app.smyst.com
https://api.smyst.com
```

Authorized redirect URIs:

```text
https://api.smyst.com/auth/google/callback
https://smyst.com/auth/google/callback
```

The `smyst.com` callback can remain during migration. The production target is `api.smyst.com`.

## Salad Runtime Secrets

Set these in the Salad container/app environment. Never store the Google client secret as a plain IDrive object.

```text
APP_ENV=production
PUBLIC_BASE_URL=https://smyst.com
AUTH_PUBLIC_BASE_URL=https://api.smyst.com
CORS_ORIGINS=https://smyst.com,https://app.smyst.com
GOOGLE_OAUTH_CLIENT_ID=449969912847-icfrvs99eee2rlaiosij3ck5f7dcbejh.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<new Google secret>
GOOGLE_OAUTH_REDIRECT_URI=https://api.smyst.com/auth/google/callback
AUTH_SESSION_SECRET=<at least 32 bytes random>
SMYST_OWNER_EMAILS=smyst247@gmail.com
```

Current portal status:

- Salad organization created: `smyst-com`.
- Default project exists.
- Container group creation is blocked until credits are added.
- Because no container group exists yet, there is currently no safe Salad runtime target for `GOOGLE_OAUTH_CLIENT_SECRET`.

Frontend build:

```text
VITE_AUTH_BASE_URL=https://api.smyst.com/auth
```

## DNS

Spaceship DNS should point:

```text
api.smyst.com -> Salad public endpoint
```

Use HTTPS only. Do not route auth through IDrive static hosting.

## Preflight

Before live testing:

```bash
node scripts/check-auth-production-env.mjs
```

Expected live behavior:

- `GET https://api.smyst.com/auth/me` returns JSON.
- Anonymous response is `{"authenticated": false}`.
- `GET https://api.smyst.com/auth/google/start` redirects to Google.
- Successful callback sets an HttpOnly Secure cookie on `api.smyst.com`.
- Frontend calls `https://api.smyst.com/auth/me` with credentials.

## Rollback

If Google login fails:

- Keep GitHub fallback active in the menu.
- Revert `VITE_AUTH_BASE_URL` to `/auth` only if the legacy same-origin auth route is intentionally restored.
- Do not delete the Google client. Disable the new secret first, then remove the `api.smyst.com` callback only after traffic is back to the old path.
