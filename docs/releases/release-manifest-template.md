# Release Manifest Template

## Release Identity

- Product: smyst.com
- Version:
- Git commit:
- Release owner:
- Freeze start:
- Planned deployment window:
- Target environment: production

## Written Approval

Production deployment is blocked until the release owner records the required approval phrase here.

- Approval phrase:
- Approval timestamp:
- Approver:

## Free-Only Evidence

- GitHub Free only:
- Cloudflare Free only:
- IDrive e2 storage only:
- No paid add-on dependency:
- No legacy server/database production dependency:

## Test Evidence

- `scripts/validate-foundation.py`:
- `scripts/test-all.sh`:
- TypeScript check:
- Root app build:
- Cloudflare Pages build:
- Worker deployment:
- Upload signed URL check:
- Auth check:

## Security And Privacy Evidence

- Security review:
- Consent checks:
- Deletion/export planning:
- Rate limiting checks:
- Storage key exposure check:
- Data processing impact:

## Storage Evidence

- IDrive e2 bucket:
- Upload quota values:
- Global quota values:
- Backup object location:
- Last restore/export drill:

## Deployment Plan

- GitHub workflow:
- Cloudflare Pages command:
- Cloudflare Workers command:
- Expected Pages URL:
- Expected Worker routes:

## Rollback Plan

- Git rollback ref:
- Cloudflare Pages rollback:
- Worker rollback:
- Storage rollback needed: no/yes
- Maximum tolerated outage:

## Post-Deploy Verification

- `/`:
- `/manifest.webmanifest`:
- `/sitemap.xml`:
- `/robots.txt`:
- `/llms.txt`:
- `/auth/me`:
- `/storage/upload-url`:

## Decision Log

- Decision:
- Reason:
- Owner:
- Time:
