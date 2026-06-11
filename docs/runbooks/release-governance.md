# Release Governance Runbook

## Release Gate

Production deployment is manual and requires the exact approval phrase configured in `.github/workflows/deploy.yml`.

## Required Evidence

- Free-only policy validation passed.
- TypeScript check passed.
- Root app build passed.
- Cloudflare Pages deploy plan reviewed.
- Cloudflare Worker deploy plan reviewed.
- IDrive e2 quotas reviewed.

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

