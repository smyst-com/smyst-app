# E2E Deployment Runbook

## Scope

Validate the free-only production path:

- GitHub Actions.
- Cloudflare Pages.
- Cloudflare Workers.
- Cloudflare KV.
- IDrive e2 signed uploads.

## Checks

1. `python3 scripts/validate-foundation.py`
2. `npm run lint:tsc`
3. `npm run build`
4. GitHub Actions `foundation-ci`
5. GitHub Actions `deploy` with manual approval
6. `WEB_BASE_URL=https://smyst.com scripts/live-test.sh`

## Expected Public Files

- `/`
- `/manifest.webmanifest`
- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`

## Expected Worker Flows

- Auth session check.
- GitHub OAuth start/callback.
- IDrive e2 signed upload URL.
- IDrive e2 signed download redirect.

