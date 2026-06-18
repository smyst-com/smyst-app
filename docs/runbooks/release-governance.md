# Release Governance Runbook

## Release Gate

Production deployment is manual and requires the exact approval phrase configured in `.github/workflows/deploy.yml`.

Cloudflare Pages must not auto-deploy `main` outside this gate. If the Pages project is connected to GitHub, disable production auto-deploys in Cloudflare or point production deployment to the gated GitHub Actions workflow only. A release is blocked when a direct push to `main` can publish production without the `workflow_dispatch` approval phrase.

## Required Evidence

- Free-only policy validation passed.
- Change protection validation passed.
- TypeScript check passed.
- Root app build passed.
- Current UI browser E2E passed against the built Vite app.
- `WEB_BASE_URL` points to the approved preview or production URL.
- `scripts/live-test.sh` passed against `WEB_BASE_URL`.
- Public root does not send `X-Robots-Tag: noindex`.
- `ai.txt`, `llms.txt`, `robots.txt`, `sitemap.xml` and
  `/.well-known/security.txt` return their real static file content, not SPA HTML.
- `manifest.webmanifest` contains PNG PWA icons, maskable icon and screenshots.
- `/auth/me`, `/api/health`, `/api/twins` and `/storage/upload-url` return JSON
  contract responses, never HTML fallback.
- Cloudflare Pages deploy plan reviewed.
- Cloudflare Pages auto-deploy setting reviewed and confirmed gated.
- Cloudflare Worker deploy plan reviewed.
- IDrive e2 quotas reviewed.
- IDrive e2 CORS, server-side encryption, lifecycle rules and incomplete upload
  cleanup reviewed.
- Backup and restore dry-run evidence recorded for the release.

## Blockers

Block release if any production path requires:

- paid GitHub or Cloudflare add-ons,
- a hosted server,
- a server-side database/cache/queue,
- external translation API,
- external analytics,
- Google OAuth.

## Rollback

Rollback uses Cloudflare Pages deployments, Worker versions and Git revert/cherry-pick. Server rollback commands are not part of production.

## Production Go/No-Go

Production status can only be `GO` when all required evidence is present. If any
item is missing, the release status is `NO-GO` and only a preview/test deploy may
be used.

## Protected Production Mode

Protected Production Mode is enabled through
`config/change-protection-manifest.json` and enforced by
`scripts/check-change-protection.py`, which is part of `scripts/test-all.sh`.

This mode does not promise that smyst.com can never fail. It prevents unsafe
changes from being treated as releasable.

Protected mode blocks production release unless all of these are true:

- `npm ci` can install the committed dependency graph.
- `npm audit --audit-level=low` is green.
- TypeScript, build, artifact checks and profile checks are green.
- `scripts/preflight-release.sh` is green with the release gate variables.
- `scripts/live-test.sh` is green against the approved production URL.
- Backup/restore and rollback evidence have been reviewed.
- The deploy goes through the official GitHub Actions workflow and Cloudflare.

Critical production files listed in the change-protection manifest require
written approval, diff review and a rollback plan before they are changed. This
includes workflow files, Worker routes, storage/auth logic, PWA/SEO/security
files, release scripts, dependency manifests and the main app shell.

Data-shape changes require a backup and rollback plan before execution. Do not
delete or overwrite users, profiles, profile images, uploads, chats, API
structures, KV metadata or IDrive e2 objects without explicit destructive
approval and restore evidence.

Working design, routing, chat, upload, profile and security behavior must not be
rebuilt unless the task explicitly asks for that behavior change.

## Preflight Environment

Production preflight requires:

```bash
RELEASE_TARGET=production
RELEASE_APPROVAL="Ja OK"
RELEASE_VERSION="<matching VERSION when VERSION exists>"
RELEASE_FREEZE_CONFIRMED=yes
ROLLBACK_PLAN_CONFIRMED=yes
BACKUP_RESTORE_CONFIRMED=yes
WEB_BASE_URL="https://<approved-preview-or-production-host>"
```

The preflight script runs the local test suite and then executes live smoke tests
against `WEB_BASE_URL`. Missing `WEB_BASE_URL` blocks production.

## Destructive Action Protection

Destructive API calls are not protected by confirmation text alone. They also
require same-origin/CSRF checks and an explicit delete-confirm header:

- `DELETE /api/account`: `X-Smyst-Delete-Confirm: delete-account`
- `DELETE /storage/account`: `X-Smyst-Delete-Confirm: delete-account-storage`
- `DELETE /storage/file/{key}`: `X-Smyst-Delete-Confirm: delete-file`

Missing delete-confirm headers return `428 delete_confirmation_header_required`.
