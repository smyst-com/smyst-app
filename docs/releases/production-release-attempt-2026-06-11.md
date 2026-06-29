# Production Release Attempt - 2026-06-11

Scope: production release attempt after written approval phrase `Ja OK`.

## Approval

Production approval was received with the required release phrase:

```text
Ja OK
```

The free-only constraints remain active:

- GitHub.com Free for repository, CI/CD and deployment pipeline.
- Legacy edge provider.com Free for DNS, SSL, CDN, Pages, Workers and KV.
- IDrive e2 as central object storage for files, media, documents, uploads, backups and larger twin data.
- No paid add-on services.
- No external Google Fonts.

## Local Checks Passed

- TypeScript check passed.
- `scripts/validate-foundation.py` passed.
- Shell syntax checks for release scripts passed.
- `git diff --check` passed.

## Live Finding

`https://smyst.com/` still serves the old inline HTML app. The live root does not serve the current Vite app from this repository.

The live smoke test fails at the root marker check because the response does not contain:

```text
id="root"
```

The live HTML response still includes Google Fonts references, so it is not release-compliant.

## Legacy edge provider Dashboard Finding

The Legacy edge provider account `477794df69f0b6a0b9e4c59e36883c1f` was inspected through the dashboard after approval.

Observed Legacy edge provider state:

- Pages project `smyst-app` exists.
- `smyst-app` has these domains attached:
  - `smyst.com`
  - `www.smyst.com`
  - `smyst-app.pages.dev`
- `smyst-app` shows `No Git connection`.
- `https://smyst-app.pages.dev/` also serves the old inline HTML app.
- The dashboard `Create deployment` flow is a manual asset upload flow.
- Target Worker names now use the `smyst-*` prefix:
  - `smyst-storage`
  - `smyst-auth`
  - `smyst-translate`
- No `smyst-auth`, `smyst-api`, or `smyst-storage` Worker deployment was visible in the Workers & Pages overview.

Conclusion: the current production problem is not only a custom-domain routing issue. The active `smyst-app` Pages deployment itself is stale and must be replaced by a fresh artifact from the current app source.

## Deployment Blockers

Production deployment could not be completed from this local environment because:

- GitHub repository `https://github.com/smyst-com/smyst-app` now exists and is private.
- Local Git remote `origin` is configured as `https://github.com/smyst-com/smyst-app.git`.
- Terminal Git is not authenticated against this private GitHub repository yet, so `git ls-remote origin HEAD` still returns `Repository not found`.
- A dedicated local SSH key was generated for this repository, but GitHub account settings still show no SSH keys saved. GitHub requires account password/sudo confirmation before adding the key.
- The Legacy edge provider Pages project `smyst-app` is not connected to GitHub, so Legacy edge provider cannot build this repository automatically.
- `gh` is not installed in this environment.
- Global `legacy-edge-cli` is not installed.
- Local `node_modules/.bin/legacy-edge-cli` is a broken empty symlink.
- Direct Wrangler invocation through `node_modules/legacy-edge-cli/bin/legacy-edge-cli.js` hangs before producing output.
- Local Vite production build hangs at `vite v6.4.2 building for production...`; the existing `dist/` artifact is stale and must not be deployed.
- Local dependency inspection found `chokidar` hanging during package load, which also blocks Tailwind/PostCSS-based fallback builds in this local `node_modules`.

## Required Next Actions

1. Add the generated public SSH key to GitHub account `smyst-com`:
   ```text
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDcVweWl5DIvcxTl2XRjhgvLahghS73iW+RI4lMJEI0i smyst-app-deploy
   ```
2. Switch the local `origin` remote to SSH and push `main` to `git@github.com:smyst-com/smyst-app.git`.
3. Connect Legacy edge provider Pages project `smyst-app` to the same GitHub repository, or use a verified manual upload artifact.
3. Ensure GitHub Actions secrets exist:
   - `LEGACY_EDGE_API_TOKEN`
   - `LEGACY_EDGE_ACCOUNT_ID`
4. Ensure Legacy edge provider Worker secrets exist:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `AUTH_HMAC_SECRET`
   - `IDRIVE_E2_ACCESS_KEY`
   - `IDRIVE_E2_SECRET_KEY`
   - `ADMIN_TOKEN`
5. Deploy or create the expected Workers:
   - `smyst-auth`
   - `smyst-api`
   - `smyst-storage`
   - `smyst-translate`
6. Run the `Deploy` workflow manually with:
   - `release_approval`: `Ja OK`
   - `release_freeze_confirmed`: `true`
7. After deploy, run:
   - `scripts/live-test.sh`
   - desktop browser test
   - mobile browser test at `390x844`
   - real GitHub login, `/auth/me`, profile, twin creation and IDrive e2 upload checks.
