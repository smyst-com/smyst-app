# Backup Recovery Runbook

## Scope

Production backup and recovery targets Cloudflare-compatible state and IDrive e2 objects.

The machine-readable release contract lives in
`config/backup-recovery-manifest.json` and is validated by
`scripts/check-backup-recovery.py`.

## Recovery Objectives

| Target | RPO | RTO | Notes |
|---|---:|---:|---|
| Code and config | latest pushed commit | 30 minutes | Restore through Git revert/cherry-pick and gated redeploy. |
| Cloudflare Pages | last successful gated deployment | 15 minutes | Roll back to known-good Pages deployment. |
| Cloudflare Workers | committed source plus deployed version id | 30 minutes | Roll back Worker version or redeploy committed source. |
| Cloudflare KV metadata | 24 hours for MVP after first production release | 4 hours for small restore dry-run | Restore selected prefixes into preview namespace first. |
| IDrive e2 user objects | acknowledged object write | 4 hours for small user restore test | Restore user-scoped objects only. |
| Legacy SQL | not applicable | not applicable | Blocked for production. |

## IDrive e2

- Keep object keys deterministic and user-scoped.
- Store critical exports/backups under `users/{userSub}/backups/{YYYY-MM}/`.
- Keep checksums for important backup objects.
- Test signed download and restore/export flows regularly.
- Confirm bucket CORS only allows approved smyst origins before production.
- Confirm server-side encryption and lifecycle cleanup rules in the IDrive e2
  console before production.
- Confirm incomplete multipart upload cleanup before enabling multipart uploads.

## Cloudflare KV Export And Restore

Cloudflare KV is the active metadata layer for the free-only MVP. It must be
treated as operational production state even though large files remain in IDrive e2.

Minimum backup evidence before production:

- Namespace inventory for `SESSIONS`, `OAUTH_STATE`, `METADATA` and
  `TRANSLATIONS`.
- Sample export of non-sensitive key prefixes:
  - `auth:user:`
  - `meta:twin:`
  - `meta:twins:`
  - `meta:upload:`
  - `meta:uploads:`
  - `public:twin:`
  - `quota:user:`
  - `storage:user:`
- Restore dry-run into a preview/test namespace.
- Integrity check that restored public twin slugs, upload records and storage
  counters match expected counts.

Never export OAuth state or live sessions into public artifacts.

Excluded prefixes:

- `s:` live session records.
- `state:` OAuth state records.

These are intentionally short-lived security records. They must not be restored
into production from a backup artifact.

## Cloudflare State

- KV contains sessions, OAuth state, translation cache and quota counters.
- KV is operational state, not a permanent archive.
- Critical user-owned files and backups belong in IDrive e2.

## Release Restore Drill

Before a production release, record:

1. Latest Git commit and Cloudflare Pages deployment id.
2. Worker versions for translate, auth, api, storage and warmup.
3. KV namespace ids and a small restore dry-run result.
4. IDrive e2 bucket, region, CORS, encryption and lifecycle confirmation.
5. Rollback target for Pages and Workers.

If any restore step cannot be demonstrated, production release is blocked.

## Data Loss Risks

| Risk | Impact | Mitigation |
|---|---|---|
| KV metadata accidentally deleted | Twins, upload records, quotas or public slugs may disappear | Prefix export, preview restore dry-run and integrity counts before release. |
| IDrive object exists but KV metadata is missing | User file cannot be discovered through app | Orphan-object audit and signed object restore test. |
| KV metadata exists but IDrive object is missing | Broken downloads and profile media | Signed HEAD/GET verification in restore drill. |
| Cloudflare Pages bad deploy | Broken app shell or missing static files | Gated deploy, artifact check, live smoke, Pages rollback. |
| Worker bad deploy | Auth/API/Storage outage | Worker version rollback and route contract smoke test. |
| Secrets lost or rotated incorrectly | Auth/storage outage | Secret inventory, scoped recreation procedure and post-rotation smoke test. |
| Legacy SQL assumed as source of truth | False restore path and data loss | Legacy SQL scripts remain blocked for production. |

## Backup Frequency

- Code/config: every commit through GitHub history.
- Pages/Workers: every gated deployment records deploy/version ids.
- KV metadata: daily export after first approved production release, plus manual
  export before risky migrations.
- IDrive e2: object durability is the primary backup layer in the free-only phase;
  additionally keep user-requested exports under `users/{userSub}/backups/`.
- Restore drill: before every production release and after any secret/bucket/route
  change.

## Forbidden Production Assumptions

- No database dump is required for production recovery.
- No server filesystem backup is required for production recovery.
- No container volume is a production source of truth.
