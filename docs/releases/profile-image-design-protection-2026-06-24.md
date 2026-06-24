# Profile Image And Light Theme Protection - 2026-06-24

Status: Protected and verified.

Scope:

- Curated public profile images.
- Public twin image metadata in `workers/curated-public-twin-data.ts`.
- Local profile image files in `public/public/profile-images/`.
- Light theme profile name, subtitle and badge contrast in `src/index.css`.
- CI release guard in `.github/workflows/deploy.yml`.
- Local aggregate guard in `scripts/test-all.sh`.

Protected Invariants:

- Exactly 100 curated public profiles are expected.
- Every curated public profile must have `imageFile`, `contentType` and `size`.
- Every referenced image must exist locally and be a raster file.
- Image size metadata must match the committed image file size.
- No curated public profile may fall back to `/api/public/twin-images/*.svg`.
- Light theme profile names must remain readable dark text.
- Light theme profile subtitles and badges must remain readable muted text.
- Production deploy remains gated by written release approval, rollback plan, backup/restore confirmation and live smoke checks.

Mandatory Checks:

- `python3 scripts/check-profile-image-design-guard.py`
- `python3 scripts/check-change-protection.py`
- `sh scripts/test-all.sh`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/generate-sitemap.mjs && node node_modules/vite/bin/vite.js build`

Live Validation:

- `https://smyst.com/api/public/twins` returns 100 profiles.
- All 100 live profiles return an `imageUrl`.
- Zero live profile image URLs use `/api/public/twin-images/`.
- Sample live profile image files return HTTP 200.
- Light theme profile names render as dark readable text.

Change Rule:

Do not remove, weaken or bypass these protections without explicit written approval, diff review and rollback plan.
