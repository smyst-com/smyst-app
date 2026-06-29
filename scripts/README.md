# Scripts

Scripts will contain setup, backup, restore, migration, health check, deployment, and maintenance helpers.

Rules:

- Scripts must be idempotent where possible.
- Scripts must never print secrets.
- Production scripts require a runbook entry.
- Production deployment requires `scripts/preflight-release.sh`.
- Production rollback uses Git revert/cherry-pick, IDrive e2 static artifacts and Salad backend deployment history.
- Legacy server/database scripts may remain for local reference only and must not be called by production workflows.
- `deploy-idrive-static.mjs` uploads the built PWA to IDrive e2 buckets for `smyst.com`, `app.smyst.com`, and `cdn.smyst.com` without printing secrets.
