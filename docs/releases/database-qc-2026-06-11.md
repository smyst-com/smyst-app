# Database QC - 2026-06-11

## Scope

Production currently does not use a separately hosted relational database. The active free-only data layer is:

- Salad/IDrive metadata for sessions, auth state, roles, upload intents/status, quotas, twin metadata, chat MVP state and public twin snapshots.
- IDrive e2 for user files, media, backup objects and large twin data.

The SQL files under `database/` are legacy/local domain-model references. They were audited and hardened for local experiments only.

## Findings

### Production KV/IDrive Model

- The documentation in `docs/02-database-architecture.md` had stale KV key names such as `upload:intent`, `upload:status`, `twin:{twinId}` and `chat:{sessionId}`.
- Active Workers use the newer keys:
  - `meta:upload:{userSub}:{uploadId}`
  - `meta:uploads:{userSub}`
  - `meta:twin:{userSub}:{twinId}`
  - `meta:twins:{userSub}`
  - `meta:chat:{userSub}:{chatId}`
  - `meta:chats:{userSub}`
  - `public:twin:{slug}`
  - `storage:user:{userSub}:active`
  - `storage:global:active`
- Upload reservations could previously remain in `url_issued` state until TTL expiry without explicitly releasing reserved monthly quota.
- Account deletion needed a coordinated KV and IDrive e2 path.

### Legacy SQL Reference

- Many status-like text columns had no CHECK constraints.
- Confidence/trust score fields were not consistently range-constrained to `0..1`.
- Several foreign-key columns lacked supporting indexes for local analytical queries and delete cascades.
- Tables with `updated_at` columns had no trigger to keep timestamps fresh.
- There were no views for common “active twin” or “indexable public page” read models.
- No active SQL backups are required for production because production source-of-truth is KV + IDrive e2.

## Changes Made

- Updated `docs/02-database-architecture.md` to match the actual Worker KV key schema.
- Added `database/migrations/0005_integrity_performance_hardening.sql` as a local-only hardening migration.
- Added `database/init/006_run_integrity_migrations.sql` so local Postgres experiments load the new hardening migration after the existing schema.
- Extended `scripts/validate-foundation.py` so the KV key schema and hardening migration are checked.
- Production Worker changes from the adjacent implementation pass now provide:
  - `GET /api/account/export`
  - `DELETE /api/account`
  - `DELETE /storage/account`
  - expired upload reservation cleanup.

## Optimizations

The local SQL hardening migration adds:

- CHECK constraints for user/twin/upload/job/chat/SEO statuses.
- Score constraints for trust and confidence fields.
- FK and query indexes for auth, sessions, roles, uploads, media, jobs, memory, chat, moderation, audit and semantic index tables.
- `smyst_touch_updated_at()` trigger function and triggers for key tables.
- Views:
  - `active_twins`
  - `indexable_public_pages`

## Integrity Notes

- The hardening constraints are created with `NOT VALID` where appropriate so existing local experimental data is not destroyed automatically.
- Production KV remains eventually consistent. It is suitable for the current MVP, not a transactional global database for billions of daily users.
- For billion-scale architecture, a future data platform decision will be required and must be explicitly approved because it is outside the current free-only constraint.

## Recommendations

- Keep production within Salad/IDrive metadata + IDrive e2 until the free-only MVP is proven.
- Do not promote `database/`, `backend/`, `docker/`, `vector/` or local SQL scripts into production without a new architecture decision.
- Add periodic KV consistency audits through Workers for orphaned public twin snapshots, upload records and storage counters.
- For future high scale, define a new approved data tier with transactions, global indexing, queueing, vector search and observability.
- Continue treating SQL as a domain-model reference, not a launch requirement.

