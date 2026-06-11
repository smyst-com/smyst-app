# Build, Tests And Open Items

Status: local verification report for the Free-Only MVP.

## Fixed During This Pass

- `vite.config.ts` now uses an ESM-safe project root via `import.meta.url` instead of `__dirname`.
- `public/logo.svg` was added so `index.html`, `manifest.webmanifest` and `sw.js` point to an existing public asset.
- `android/gradlew` was made executable.
- `scripts/test-all.sh` now runs the TypeScript fallback when `node` is available but `npm` is missing.

## Passed

- Free-only production validator: `python3 scripts/validate-foundation.py`.
- Shell script syntax: `sh -n scripts/*.sh`.
- TypeScript check: `node node_modules/typescript/bin/tsc --noEmit`.
- Vite config import after fix.
- PWA checks: `public/sw.js` syntax, `public/manifest.webmanifest` JSON and `public/logo.svg`.
- Locale JSON checks for all 10 supported languages.
- Sitemap generation and XML parse.
- Static local link check for `index.html` and `public/**/*.html`.
- Worker bundles with native esbuild:
  - `workers/api.ts`
  - `workers/auth-github.ts`
  - `workers/storage-idrive.ts`
  - `workers/translate.ts`
  - `workers/warmup-translations.ts`
- React/App single-file transpilation checks for main UI files.
- App library single-file transpilation checks.
- Capacitor config bundle check.
- Android XML parse:
  - `AndroidManifest.xml`
  - `strings.xml`
  - `file_paths.xml`
  - `network_security_config.xml`
  - `data_extraction_rules.xml`
- iOS `Info.plist` parse.
- Production forbidden-pattern search across active paths.
- `git diff --check`.

## Blocked Locally

- Full `npm ci`, `npm run lint:tsc` and `npm run build`: local shell has no `npm`, `corepack`, `pnpm` or `yarn`.
- Direct Vite build through bundled Node starts but hangs in the local esbuild service after `vite v6.4.2 building for production...`.
- Android Gradle build: no Java Runtime is installed.
- iOS Xcode build: active developer directory is Command Line Tools, not full Xcode.
- CocoaPods check: `pod` is not installed.
- Python `pytest`: module is not installed locally.
- Capacitor CLI `config`/doctor: hangs in this local workspace, so config was validated through TypeScript/esbuild and native file parsing instead.

## CI Expectation

GitHub Actions uses `actions/setup-node` and `npm ci`, so the canonical CI path remains:

```text
npm ci
npm run lint:tsc
npm run build
python3 scripts/validate-foundation.py
```

Production must still stay within GitHub Free, Cloudflare Free and IDrive e2 with no paid add-on services.
