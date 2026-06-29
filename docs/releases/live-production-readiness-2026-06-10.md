# Live Production Readiness - 2026-06-10

Scope: read-only live check for `https://smyst.com/` plus local release-gate updates.

## Current Live Finding

`https://smyst.com/` is still serving an old inline HTML app, not the current root Vite app from this repository.

Observed live problems:

- Root HTML does not contain `id="root"`.
- Root HTML contains `fonts.googleapis.com` and `fonts.gstatic.com`.
- `manifest.webmanifest`, `sw.js`, `logo.svg`, `og-image.png`, `robots.txt`, `sitemap.xml`, and `llms.txt` return HTML fallback content instead of the expected file content.
- `/auth/me`, `/api/health`, `/api/twins`, and `/storage/upload-url` return HTML fallback content instead of JSON/API responses.

## Prepared Safeguards

- `scripts/live-test.sh` now checks expected body markers and content types instead of accepting any `200`.
- `scripts/check-dist-artifact.sh` validates the Legacy edge provider Pages build artifact before deployment.
- Deploy workflows run the dist artifact check before uploading/deploying.
- Deploy workflow runs `scripts/live-test.sh` after Pages and Workers deploy.
- `workers/translate.ts` returns a JSON `503 route_not_deployed` if the catch-all translate Worker receives `/api/*`, `/auth/*`, or `/storage/*`, preventing silent HTML fallback for API routes.
- `scripts/validate-foundation.py` blocks Google Fonts in active production surfaces.

## Required GitHub Actions Secrets

These must exist in GitHub Actions before production deployment:

- `LEGACY_EDGE_API_TOKEN`
- `LEGACY_EDGE_ACCOUNT_ID`

Optional GitHub Actions variable:

- `VITE_CANONICAL_HOST` (defaults to `https://smyst.com` if absent)

## Required Legacy edge provider Worker Secrets

These must exist in Legacy edge provider for the relevant Workers/environments:

- Auth Worker:
  - `GITHUB_OAUTH_CLIENT_ID`
  - `GITHUB_OAUTH_CLIENT_SECRET`
  - `AUTH_HMAC_SECRET`
- Storage Worker:
  - `IDRIVE_E2_ACCESS_KEY`
  - `IDRIVE_E2_SECRET_KEY`
- Translate/Warmup Worker:
  - `ADMIN_TOKEN`

## Required Legacy edge provider Routes

Expected routes from `legacy-edge-cli.toml`:

- `smyst.com/*` -> `smyst-translate`
- `smyst.com/auth/*` -> `smyst-auth`
- `smyst.com/api/*` -> `smyst-api`
- `smyst.com/storage/*` -> `smyst-storage`

The specific routes must be active so they win over the catch-all translate route.

## Blocked Checks

Remote secret/route inspection could not be completed locally:

- `gh` is not installed in this environment.
- `legacy-edge-cli` commands hang in this local workspace before producing output.
- No production deploy was performed because final written production approval was not provided.

## Release Requirement

Production deployment must remain blocked until the release owner provides the required written approval phrase used by the workflow gate: `Ja OK`.
