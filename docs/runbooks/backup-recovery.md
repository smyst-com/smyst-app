# Backup Recovery Runbook

## Scope

Production backup and recovery targets Cloudflare-compatible state and IDrive e2 objects.

## IDrive e2

- Keep object keys deterministic and user-scoped.
- Store critical exports/backups under `users/{userSub}/backups/{YYYY-MM}/`.
- Keep checksums for important backup objects.
- Test signed download and restore/export flows regularly.

## Cloudflare State

- KV contains sessions, OAuth state, translation cache and quota counters.
- KV is operational state, not a permanent archive.
- Critical user-owned files and backups belong in IDrive e2.

## Forbidden Production Assumptions

- No database dump is required for production recovery.
- No server filesystem backup is required for production recovery.
- No container volume is a production source of truth.
