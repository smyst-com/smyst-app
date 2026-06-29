# Backup Recovery Runbook

## Scope

Production backup and recovery targets GitHub source, IDrive e2 objects/static
artifacts, Salad backend deployments and Spaceship DNS. Legacy edge provider is legacy
only and must not be a required restore target.

The machine-readable release contract lives in
`config/backup-recovery-manifest.json` and is validated by
`scripts/check-backup-recovery.py`.

## Recovery Objectives

| Target | RPO | RTO | Notes |
|---|---:|---:|---|
| Code and config | latest pushed commit | 30 minutes | Restore through Git revert/cherry-pick and gated redeploy. |
| IDrive e2 static deployment | last successful gated deployment | 30 minutes | Re-sync known-good `dist/` artifact to website buckets. |
| Salad backend | committed source plus deployed image/deployment id | 30 minutes | Roll Salad container group to a known-good image or redeploy backend. |
| Salad/IDrive metadata | 24 hours for MVP metadata after first production release | 4 hours for small restore dry-run | Restore selected prefixes into staging metadata first. |
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

## Metadata Export And Restore

Salad/IDrive metadata is operational production state. It must be treated as
small, sensitive metadata while large files remain in IDrive e2.

Minimum backup evidence before production:

- Metadata inventory for sessions, OAuth state, user/twin metadata and public
  profile snapshots.
- Sample export of non-sensitive key prefixes:
  - `auth:user:`
  - `meta:twin:`
  - `meta:twins:`
  - `meta:upload:`
  - `meta:uploads:`
  - `public:twin:`
  - `quota:user:`
  - `storage:user:`
- Restore dry-run into a staging metadata/API namespace.
- Integrity check that restored public twin slugs, upload records and storage
  counters match expected counts.

Never export OAuth state or live sessions into public artifacts.

Excluded prefixes:

- `s:` live session records.
- `state:` OAuth state records.

These are intentionally short-lived security records. They must not be restored
into production from a backup artifact.

## Legacy Legacy edge provider State

- If any Salad/IDrive metadata state still exists, export or intentionally discard it
  before deleting the Legacy edge provider account.
- Legacy edge provider is not a permanent archive and not a production target.
- Critical user-owned files and backups belong in IDrive e2.

## Release Restore Drill

Before a production release, record:

1. Latest Git commit and IDrive e2 static deployment artifact id.
2. Salad backend deployment/container image id.
3. Metadata inventory and a small restore dry-run result.
4. IDrive e2 bucket, region, CORS, encryption and lifecycle confirmation.
5. Rollback target for static artifacts and Salad backend.

If any restore step cannot be demonstrated, production release is blocked.

## Data Loss Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Metadata accidentally deleted | Twins, upload records, quotas or public slugs may disappear | Prefix export, staging restore dry-run and integrity counts before release. |
| IDrive object exists but metadata is missing | User file cannot be discovered through app | Orphan-object audit and signed object restore test. |
| Metadata exists but IDrive object is missing | Broken downloads and profile media | Signed HEAD/GET verification in restore drill. |
| IDrive static deploy is bad | Broken app shell or missing static files | Gated deploy, artifact check, live smoke, static artifact rollback. |
| Salad backend deploy is bad | Auth/API/Storage outage | Salad image rollback and route contract smoke test. |
| Secrets lost or rotated incorrectly | Auth/storage outage | Secret inventory, scoped recreation procedure and post-rotation smoke test. |
| Legacy SQL assumed as source of truth | False restore path and data loss | Legacy SQL scripts remain blocked for production. |

## Backup Frequency

- Code/config: every commit through GitHub history.
- Static/Salad deploys: every gated deployment records deploy/version ids.
- Metadata: daily export after first approved production release, plus manual
  export before risky migrations.
- IDrive e2: object durability is the primary backup layer in the free-only phase;
  additionally keep user-requested exports under `users/{userSub}/backups/`.
- Restore drill: before every production release and after any secret/bucket/route
  change.

## Forbidden Production Assumptions

- No database dump is required for production recovery.
- No server filesystem backup is required for production recovery.
- No container volume is a production source of truth.
