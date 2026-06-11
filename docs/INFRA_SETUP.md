# Smyst Infrastructure Setup

Production folgt ausschliesslich der Free-Only-Regel:

- GitHub.com Free fuer Code, CI/CD, Dokumentation und Deployment-Pipelines
- Cloudflare.com Free fuer DNS, SSL, CDN, Pages, Workers, KV, WAF-Basis und Edge
- IDrive e2 als zentraler Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und sonstige Daten

Alle anderen Dienste sind in Production optional/verboten und duerfen nicht als Start- oder Betriebsbedingung auftauchen.

## 1. GitHub

```text
Owner: smyst-com
Repository: smyst-app
Visibility: Private
```

GitHub Actions fuehrt nur Free-Only-kompatible Checks, Builds und Cloudflare-Deploys aus.

## 2. Cloudflare

Cloudflare-Ressourcen:

```text
Pages project: smyst-app
Domain: smyst.com
Workers: smyst-translate, smyst-warmup, smyst-auth, smyst-storage, smyst-api
KV namespaces: TRANSLATIONS, TRANSLATIONS_PREVIEW, WARMUP_CONFIG, SESSIONS, OAUTH_STATE, METADATA
```

Pages build:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
```

## 3. Auth

Production-Login nutzt GitHub OAuth. Google OAuth ist deaktiviert.

Secrets:

```bash
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID --env auth
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --env auth
npx wrangler secret put AUTH_HMAC_SECRET --env auth
```

## 4. IDrive e2

IDrive e2 ist der zentrale S3-kompatible Speicher.

```text
Bucket name: smyst-memories
Object layout:
users/{userId}/uploads/{category}/{fileId}-{filename}
```

Secrets:

```bash
npx wrangler secret put IDRIVE_E2_ACCESS_KEY --env storage
npx wrangler secret put IDRIVE_E2_SECRET_KEY --env storage
```

Vars:

```text
IDRIVE_E2_ENDPOINT
IDRIVE_E2_BUCKET
IDRIVE_E2_REGION
IDRIVE_E2_MAX_FILE_BYTES
IDRIVE_E2_USER_MONTHLY_BYTES
IDRIVE_E2_GLOBAL_BYTES
```

## 5. Nicht erlaubte Production-Abhaengigkeiten

Diese Bausteine duerfen nicht als Production-Pflicht verwendet werden:

```text
VPS / RackNerd
Docker-Production
FastAPI-Backend
PostgreSQL / Redis / pgvector
Caddy
DeepL / Google Translate
Google OAuth
GA4
Google Search Console als Pflichtbestandteil
```

## 6. Deploy Order

```text
1. Code nach GitHub pushen
2. GitHub Actions Free-Only Checks bestehen lassen
3. Cloudflare Pages Artifact bauen
4. Cloudflare Pages deployen
5. Cloudflare Workers deployen
6. Storage/Auth/Translation smoke testen
```

## 7. Skalierung

Die Free-Only-Architektur ist eine Kosten- und Abhaengigkeitsregel fuer den aktuellen Stand. Die langfristige Milliarden-Nutzer-Vision bleibt ein Architekturziel, ist aber mit kostenlosen Kontingenten allein nicht erreichbar.

## 8. Datenablage

Siehe `docs/FREE_ONLY_DATA_MAP.md`.

- Cloudflare KV: Sessions, OAuth-State, Quotas, Upload-Intent, Upload-Status, kleine Indizes.
- IDrive e2: Dateien, Medien, Dokumente, Profilbilder, Uploads, Backups, KI-Zwilling-Daten, Archivobjekte.
- GitHub: Code und Dokumentation.
- Cloudflare Pages: statische Web-/PWA-Artefakte.
