# Smyst Production Without Cloudflare

Status: target architecture for the Cloudflare exit.

## Target

- Spaceship owns DNS for `smyst.com`.
- GitHub Free is used only for source code, CI, releases and GitHub Actions.
- IDrive e2 stores static PWA files, user files, media, AI data, archives, backups and knowledge data.
- Salad runs compute: FastAPI, auth/API, AI inference, indexing, search and scheduled jobs.
- Cloudflare Pages, Workers, KV, routes, DNS and API tokens are not part of the active production path.

## GitHub Actions

Use only these production workflows:

- `Salad Backend Deploy`: builds `backend/`, pushes GHCR image and deploys `smyst-backend-api` on Salad.
- `IDrive e2 Static Deploy`: builds the PWA and uploads `dist/` to IDrive e2 static buckets.
- `CI`: type-checks and builds only. It does not deploy.

Do not use Cloudflare workflows. They have been removed from the active workflow set.

## GitHub Secrets

Required for Salad:

- `SALAD_API_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `AUTH_SESSION_SECRET`
- `IDRIVE_E2_ACCESS_KEY`
- `IDRIVE_E2_SECRET_KEY`
- At least one LLM key, preferably `OPENROUTER_API_KEY`

Optional LLM keys:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `MOONSHOT_API_KEY`
- `MANUS_API_KEY`
- `ZHIPU_API_KEY`
- `DASHSCOPE_API_KEY`
- `MISTRAL_API_KEY`
- `GROQ_API_KEY`
- `TOGETHER_API_KEY`
- `COHERE_API_KEY`
- `PERPLEXITY_API_KEY`

Required for IDrive e2 static deploy:

- `IDRIVE_E2_ACCESS_KEY`
- `IDRIVE_E2_SECRET_KEY`

Recommended GitHub Variables:

- `VITE_CANONICAL_HOST=https://smyst.com`
- `VITE_AUTH_BASE_URL=https://api.smyst.com/auth`
- `IDRIVE_E2_ENDPOINT=https://s3.us-west-2.idrivee2.com`
- `IDRIVE_E2_REGION=us-west-2`
- `IDRIVE_E2_SITE_BUCKET=smyst.com`
- `IDRIVE_E2_APP_BUCKET=app.smyst.com`
- `IDRIVE_E2_CDN_BUCKET=cdn.smyst.com`

## Deploy Order

1. Run `Salad Backend Deploy` on `main` with approval `Ja OK`.
2. Copy the Salad public endpoint from the workflow output.
3. Run `IDrive e2 Static Deploy` on `main` with approval `Ja OK`.
4. In Spaceship DNS, point `api.smyst.com` to the Salad public endpoint.
5. In Spaceship DNS, point `smyst.com`, `www.smyst.com`, `app.smyst.com` and `cdn.smyst.com` to the IDrive e2 static website/custom-domain targets.
6. Verify all endpoints.
7. Only after verification, delete Cloudflare Worker routes, Workers, Pages projects, KV namespaces and DNS zone.
8. Cancel Cloudflare plan/account access.

## Spaceship DNS

Create the DNS zone in Spaceship and remove Cloudflare nameservers at the registrar.

Records:

- `api.smyst.com` -> CNAME to the Salad public endpoint host, for example `cherry-asparagus-a32jleuk8dgn22zu.salad.cloud`.
- `www.smyst.com` -> CNAME to the IDrive e2 static website/custom-domain target for the `smyst.com` bucket.
- `app.smyst.com` -> CNAME to the IDrive e2 static website/custom-domain target for the `app.smyst.com` bucket.
- `cdn.smyst.com` -> CNAME to the IDrive e2 static website/custom-domain target for the `cdn.smyst.com` bucket.
- `smyst.com` apex -> use Spaceship ALIAS/ANAME if available; otherwise configure Spaceship forwarding from apex to `https://www.smyst.com` until the static host supports apex directly.

Keep TTL low during migration, for example 300 seconds.

## Verification

After DNS propagation:

```sh
curl -I https://smyst.com
curl -I https://www.smyst.com
curl -I https://app.smyst.com
curl -I https://cdn.smyst.com/manifest.webmanifest
curl -i https://api.smyst.com/api/v1/health/live
curl -i https://api.smyst.com/api/v1/health/ready
```

Expected:

- Static hosts return `200`.
- API live health returns `200`.
- API ready health returns `200` once required backing services are configured.
- Responses no longer include Cloudflare-specific headers such as `cf-ray`.

## Cloudflare Deletion Checklist

Do this only after the verification above passes:

- Export anything that might still matter from Cloudflare KV.
- Delete Worker routes for `smyst.com/*`, `smyst.com/api/*`, `api.smyst.com/*`, `smyst.com/auth/*` and `smyst.com/storage/*`.
- Delete Workers: `smyst-api`, `smyst-auth`, `smyst-storage`, `smyst-translate`, warmup/redirect workers.
- Delete Pages projects for Smyst.
- Delete KV namespaces that belong only to Smyst.
- Remove Cloudflare API tokens from GitHub Secrets.
- Remove Cloudflare nameservers from the registrar.
- Cancel Cloudflare paid services/account if nothing else uses it.
