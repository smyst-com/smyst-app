# Twynt Infrastructure Setup

This is the practical connection plan for GitHub, Cloudflare and IDrive E2.

## 1. GitHub

Create a private repository:

```text
Owner: twyntcom
Repository: twynt-app
Visibility: Private
Initialize README: No
Initialize .gitignore: No
Initialize license: No
```

Then initialize local Git from this project folder:

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit: Twynt platform foundation"
git remote add origin https://github.com/twyntcom/twynt-app.git
git push -u origin main
```

If GitHub asks for a password, use a GitHub Personal Access Token or GitHub CLI login.

## 2. Cloudflare

Use Cloudflare for:

- DNS
- CDN
- WAF
- Pages deployment
- Workers
- KV namespaces
- Rate limiting
- Edge routing

Required Cloudflare resources:

```text
Pages project:
twynt-app

Domain:
twynt.com

Workers:
twynt-translate
twynt-warmup
twynt-auth
twynt-storage

KV namespaces:
TRANSLATIONS
TRANSLATIONS_PREVIEW
WARMUP_CONFIG
SESSIONS
OAUTH_STATE
```

Cloudflare Pages build settings:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: empty
```

After Pages creates the project URL, update `wrangler.toml`:

```toml
[vars]
ORIGIN_URL = "https://YOUR-PAGES-URL.pages.dev"
CANONICAL_HOST = "https://twynt.com"
```

## 3. IDrive E2

Create bucket:

```text
Bucket name: twynt-memories
Region: eu-frankfurt-1 or eu-amsterdam-1
Versioning: Off for MVP
Object Lock: Off for MVP
```

Create access keys:

```text
Access Key ID: stored as Cloudflare secret
Secret Access Key: stored as Cloudflare secret
Endpoint URL: stored in wrangler.toml vars
```

Recommended object structure:

```text
users/{userId}/twins/{twinId}/audio/{fileId}
users/{userId}/twins/{twinId}/video/{fileId}
users/{userId}/twins/{twinId}/images/{fileId}
users/{userId}/twins/{twinId}/documents/{fileId}
public/{twinId}/assets/{fileId}
```

Security rule:

```text
Never expose IDrive E2 access keys to the app or browser.
Only the backend/Worker creates signed upload or download URLs.
```

## 4. Cloudflare Secrets

Set secrets through Wrangler:

```bash
npx wrangler secret put DEEPL_API_KEY
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID --env auth
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --env auth
npx wrangler secret put AUTH_HMAC_SECRET --env auth
npx wrangler secret put IDRIVE_E2_ACCESS_KEY --env storage
npx wrangler secret put IDRIVE_E2_SECRET_KEY --env storage
```

Generate an auth secret:

```bash
openssl rand -base64 48
```

## 5. Deploy Order

Use this order:

```text
1. Push code to GitHub
2. Connect GitHub to Cloudflare Pages
3. Verify Pages build
4. Connect twynt.com custom domain
5. Create KV namespaces
6. Update wrangler.toml with real KV IDs and Pages origin URL
7. Set Cloudflare secrets
8. Deploy Workers
9. Test auth, translation and storage endpoints
```

## 6. Production Checklist

Before launch:

- Cloudflare SSL mode is `Full (strict)`
- `twynt.com` and `www.twynt.com` resolve correctly
- Pages deploys from GitHub `main`
- Worker routes are active
- KV namespace IDs are real, not placeholders
- Secrets are set in Cloudflare, not committed to Git
- Storage keys are not exposed in frontend code
- Uploads require login
- Private downloads use signed URLs
- Google OAuth redirect URLs match production URLs
- Sitemap is generated
- Google Search Console verifies domain ownership

