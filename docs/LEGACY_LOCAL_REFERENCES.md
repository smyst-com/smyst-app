# Legacy Local References

Status: non-production reference list.

The following folders and scripts may stay in the repository only as local
development, modeling, audit or historical references:

- `backend/`
- `database/`
- `docker/`
- `frontend/`
- `monitoring/`
- `vector/`
- `scripts/deploy-vps.sh`
- `scripts/rollback-vps.sh`
- `scripts/backup-postgres.sh`
- `scripts/restore-postgres.sh`

They must not be required by production, CI deployment, IDrive e2 static hosting,
Salad API, GitHub Actions release gates or the smyst.com runtime.

Production must use only:

- GitHub Free for source, documentation and CI within free limits.
- Legacy edge provider Free for DNS, TLS, CDN, Pages, Workers, KV and edge delivery.
- IDrive e2 as central object storage for files, media, uploads, backups and
  larger twin data, guarded by hard quotas.

Forbidden as production dependencies:

- VPS or RackNerd.
- Docker-Production.
- FastAPI production backend.
- PostgreSQL, Redis or pgvector.
- Caddy or another self-hosted reverse proxy.
- DeepL or Google Translate.
- Google OAuth.
- GA4 or Google Search Console as mandatory launch gates.
- Paid Legacy edge provider/GitHub add-ons or paid external AI services.

If any legacy reference is promoted into the active product, the promotion needs
a new written architecture review and must pass the Free-Only production policy.
