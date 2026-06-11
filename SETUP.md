# Smyst — Free-Only Setup

Diese Anleitung ist die verbindliche Production-Setup-Quelle fuer die aktuelle Free-Only-Architektur.

## Grundregel

Production darf nur diese Dienste verwenden:

- GitHub.com Free fuer Code, CI/CD, Dokumentation und Deploy-Pipelines
- Cloudflare.com Free fuer DNS, SSL, CDN, Pages, Workers, KV, WAF-Basis und Edge-Auslieferung
- IDrive e2 als zentraler S3-kompatibler Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und sonstige Daten

Nicht als Production-Pflicht erlaubt:

- VPS, RackNerd, Docker-Production, Caddy
- FastAPI-Backend als Production-Abhaengigkeit
- PostgreSQL, Redis, pgvector
- DeepL, Google Translate
- Google OAuth
- GA4 oder Google Search Console als Pflichtbestandteil

Lokale Legacy-Ordner duerfen als Entwicklungsreferenz bleiben, muessen aber optional bleiben.

## Setup-Reihenfolge

1. GitHub-Repository anlegen oder verbinden.
2. Cloudflare-Domain `smyst.com` aktivieren.
3. Cloudflare Pages mit GitHub verbinden.
4. Cloudflare Workers und KV-Namespaces anlegen.
5. GitHub OAuth App fuer Login anlegen.
6. IDrive e2 Bucket und Access Keys anlegen.
7. Cloudflare Secrets setzen.
8. Production per GitHub Actions Workflow `Deploy` ausrollen.

## GitHub

Repository:

```text
Owner: smystcom
Repository: smyst-app
Visibility: Private
```

CI/CD laeuft ueber `.github/workflows/`.

## Cloudflare

Pages:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: empty
```

Workers:

```text
smyst-translate
smyst-warmup
smyst-auth
smyst-storage
smyst-api
```

KV:

```text
TRANSLATIONS
TRANSLATIONS_PREVIEW
WARMUP_CONFIG
SESSIONS
OAUTH_STATE
METADATA
```

`wrangler.toml` muss echte KV-IDs und die Pages-Origin enthalten.

## GitHub OAuth

Google OAuth ist in Production deaktiviert. Fuer Login wird GitHub OAuth verwendet.

Cloudflare Secrets:

```bash
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID --env auth
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --env auth
npx wrangler secret put AUTH_HMAC_SECRET --env auth
```

Optionale Rollen-Variablen in Cloudflare:

```text
SMYST_OWNER_GITHUB_IDS
SMYST_OWNER_EMAILS
SMYST_ADMIN_GITHUB_IDS
SMYST_ADMIN_EMAILS
```

Redirect URLs:

```text
https://smyst.com/auth/github/callback
https://smyst-app.pages.dev/auth/github/callback
http://localhost:8787/auth/github/callback
```

## IDrive e2

Bucket:

```text
Bucket name: smyst-memories
Region: EU region preferred
```

Cloudflare Storage-Worker Secrets:

```bash
npx wrangler secret put IDRIVE_E2_ACCESS_KEY --env storage
npx wrangler secret put IDRIVE_E2_SECRET_KEY --env storage
```

Cloudflare Storage-Worker Vars:

```text
IDRIVE_E2_ENDPOINT
IDRIVE_E2_BUCKET
IDRIVE_E2_REGION
IDRIVE_E2_MAX_FILE_BYTES
IDRIVE_E2_USER_MONTHLY_BYTES
IDRIVE_E2_GLOBAL_BYTES
IDRIVE_E2_USER_STORAGE_BYTES
IDRIVE_E2_GLOBAL_STORAGE_BYTES
IDRIVE_E2_MAX_IMAGE_BYTES
IDRIVE_E2_MAX_VIDEO_BYTES
IDRIVE_E2_MAX_AUDIO_BYTES
IDRIVE_E2_MAX_DOCUMENT_BYTES
IDRIVE_E2_MAX_PROFILE_IMAGE_BYTES
IDRIVE_E2_MAX_BACKUP_BYTES
IDRIVE_E2_MAX_TWIN_DATA_BYTES
```

Die Limits sind absichtlich niedrig startend, damit IDrive e2 nicht unkontrolliert Kosten erzeugt.

## Datenablage

Die verbindliche Datenlandkarte steht in `docs/FREE_ONLY_DATA_MAP.md`.

Kurz:

- Sessions, OAuth-State, Upload-Intent, Upload-Status, Quotas und kleine Metadaten liegen in Cloudflare KV.
- Dateien, Medien, Dokumente, Profilbilder, Uploads, Backups, KI-Zwilling-Daten und Archivobjekte liegen in IDrive e2.
- Das Vite/React/PWA-Frontend liegt als statisches Cloudflare-Pages-Artefakt vor.

## Analytics, Translation, SEO

- Externe Analytics sind deaktiviert; `src/lib/analytics.ts` ist ein lokaler Consent/No-Op Adapter.
- Translation nutzt keine DeepL- oder Google-API. Statische/identische Inhalte sind die Free-Only-Basis.
- SEO/AEO/GEO laufen ueber statische Dateien, strukturierte Daten, Sitemap, `robots.txt` und `llms.txt`.
- Suchmaschinen-Verifizierungstools sind kein Production-Bestandteil und duerfen keinen Deploy blockieren.

## Deploy

Production-Deploy:

```text
GitHub Actions -> Cloudflare Pages -> Cloudflare Workers
```

Legacy-Server-, Datenbank- und Container-Skripte sind fuer Production blockiert und duerfen nur als lokale Referenz dienen.

## Skalierungsrealitaet

Die Codebasis ist auf eine Cloudflare-Edge-Architektur ausgerichtet. Milliarden Nutzer pro Tag sind mit reinen kostenlosen Kontingenten nicht realistisch erreichbar. Die Architektur vermeidet aber jetzt harte Abhaengigkeiten von bezahlten Zusatzdiensten und haelt den spaeteren Ausbau auf echte horizontale Skalierung offen.
