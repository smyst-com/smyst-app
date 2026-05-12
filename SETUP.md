# Twynt — Setup-Guide

Schritt-für-Schritt-Anleitung für alle manuellen Klicks in den Konsolen, die ich nicht für dich machen kann. Geplante Dauer: ~45 Minuten beim ersten Mal.

> **Architektur-Unterlagen**
> - Gesamtplan: `docs/ARCHITECTURE.md`
> - Phasenplan: `docs/ROADMAP.md`
> - GitHub/Cloudflare/IDrive-Verbindung: `docs/INFRA_SETUP.md`
> - Schnell kopierbare Kurzfassung: `docs/COPY_PASTE_ARCHITECTURE.txt`

> **Account-Info**
> - Login überall: `twyntcom@gmail.com`
> - Cloudflare Account-ID: `477794df69f0b6a0b9e4c59e36883c1f` (bereits in `wrangler.toml` eingetragen)
> - Domain: `twynt.com`

---

## Reihenfolge

1. [Cloudflare KV-Namespaces anlegen](#1-cloudflare-kv-namespaces) — 5 Min
2. [Cloudflare R2 oder IDrive E2 Bucket](#2-storage-für-memory-files) — 10 Min
3. [Domain twynt.com bei Cloudflare](#3-domain-twyntcom-zu-cloudflare-bringen) — 15 Min (DNS-Propagation)
4. [GitHub-Repo + Push](#4-github-repo-anlegen) — 5 Min
5. [Cloudflare Pages mit GitHub verbinden](#5-cloudflare-pages-deployment) — 5 Min
6. [Google Cloud Projekt + OAuth-Client](#6-google-oauth-clientid--secret) — 10 Min
7. [Google Search Console](#7-google-search-console-gsc) — 5 Min
8. [Google Analytics 4](#8-google-analytics-4) — 5 Min
9. [Translation API-Keys (DeepL + Google)](#9-translation-api-keys) — 5 Min
10. [Secrets in Cloudflare setzen](#10-secrets-in-cloudflare-setzen) — 5 Min
11. [Erstes Workers-Deploy](#11-erstes-workers-deploy) — 2 Min

---

## 1. Cloudflare KV-Namespaces

KV speichert die übersetzten HTML-Seiten + Sessions + OAuth-State.

1. Öffne <https://dash.cloudflare.com/477794df69f0b6a0b9e4c59e36883c1f/workers/kv/namespaces>
2. Klicke **"Create a namespace"** und lege folgende vier Namespaces an (eins nach dem anderen):

   | Name | Verwendung |
   |------|------------|
   | `TRANSLATIONS` | Übersetzte HTML pro Sprache + content_hash |
   | `TRANSLATIONS_PREVIEW` | Dev-Variante (für `wrangler dev`) |
   | `WARMUP_CONFIG` | Optionale Pfad-Liste für Pre-Translation |
   | `SESSIONS` | OAuth-Sessions (User-Login) |
   | `OAUTH_STATE` | Kurzlebige OAuth-Flow-States (10 min TTL) |

3. **IDs kopieren**: Cloudflare zeigt nach dem Anlegen pro Namespace eine 32-Zeichen-ID (z. B. `abc123def456...`). Kopiere alle fünf IDs in eine Notiz und schicke sie mir, damit ich `wrangler.toml` aktualisieren kann.

   Alternativ kannst du die IDs auch selbst eintragen — Datei: `wrangler.toml`, suche `REPLACE_WITH_TRANSLATIONS_KV_ID`, `REPLACE_WITH_TRANSLATIONS_KV_PREVIEW_ID`, `REPLACE_WITH_WARMUP_CONFIG_KV_ID`. Für Sessions+OAuth-State werden noch zwei weitere Bindings nötig, die kommen mit dem Auth-Worker-Deploy.

---

## 2. Storage für Memory-Files

Für Voice-Memories, Bilder und Videos brauchst du Object-Storage. Zwei Optionen:

### Option A: Cloudflare R2 (empfohlen)

1. <https://dash.cloudflare.com/477794df69f0b6a0b9e4c59e36883c1f/r2>
2. **"Create bucket"** → Name: `twynt-memories` → Region: `Automatic` (Cloudflare wählt nächstgelegenen Edge) → Create
3. Notiere den Bucket-Namen.

Vorteil: Native Cloudflare-Integration, keine Egress-Gebühren, einfach.

### Option B: IDrive E2 (S3-kompatibel)

1. <https://console.idrivee2.com/welcome> mit `twyntcom@gmail.com` einloggen
2. **"Create Bucket"**:
   - Name: `twynt-memories`
   - Region: `eu-frankfurt-1` (DSGVO-relevant!) oder `eu-amsterdam-1`
   - Versioning: Off (vorerst)
   - Object Lock: Off
3. Nach Bucket-Anlage: **"Access Keys"** → Create new Access Key
   - Notiere `Access Key ID` und `Secret Access Key`
4. Notiere außerdem die **Endpoint-URL** (z. B. `https://b2x4.fra.idrivee2-31.com`)

Vorteil: Externe Redundanz, S3-Kompatibilität für externe Tools.

> **Empfehlung**: Beide. R2 als Hot-Storage (Zugriff aus Workers), IDrive E2 als Cold-Backup. Das deckt das im Strategie-Review empfohlene Multi-Anbieter-Pattern ab.

---

## 3. Domain twynt.com zu Cloudflare bringen

Falls die Domain noch bei einem anderen Registrar liegt:

1. <https://dash.cloudflare.com/477794df69f0b6a0b9e4c59e36883c1f/add-site>
2. Domain `twynt.com` eingeben → Plan: **Free** reicht zum Start
3. Cloudflare scannt vorhandene DNS-Einträge → übernimmt automatisch
4. Cloudflare gibt dir **2 Nameserver** wie `xxx.ns.cloudflare.com` und `yyy.ns.cloudflare.com`
5. Bei deinem aktuellen Registrar (z. B. GoDaddy, Namecheap, IONOS): Nameserver auf die zwei von Cloudflare ändern
6. DNS-Propagation: 5–60 Minuten warten. Cloudflare schickt Email wenn aktiv.

Nach Aktivierung: **SSL/TLS-Modus auf "Full (strict)"** stellen unter `SSL/TLS` → `Overview`.

---

## 4. GitHub-Repo anlegen

1. <https://github.com/new> mit `twyntcom@gmail.com` einloggen
2. Repository-Name: `twynt-app`
3. **Private** (sensible Daten + Geschäftslogik)
4. NICHT initialisieren mit README/Gitignore (haben wir lokal)
5. **Create**

Dann lokal in Terminal (im Projekt-Ordner):

```bash
cd "/Users/abest/Library/CloudStorage/GoogleDrive-a17023373371@gmail.com/Meine Ablage/03. Akdeniz.Group/- - Projects/twynt.com info/twynt.com app"

git init
git branch -M main
git add .
git commit -m "Initial commit: Twynt platform foundation"
git remote add origin https://github.com/twyntcom/twynt-app.git
git push -u origin main
```

Falls Git nach Login fragt: GitHub erlaubt seit 2021 keine Passwörter mehr. Stattdessen:

- **Personal Access Token** unter <https://github.com/settings/tokens> → `Generate new token (classic)` → Scope `repo` → Token kopieren → als Passwort eingeben
- ODER: GitHub CLI installieren (`brew install gh`) → `gh auth login`

---

## 5. Cloudflare Pages Deployment

Verbindet dein GitHub-Repo mit Cloudflare Pages — bei jedem `git push` zu `main` baut Cloudflare automatisch das Frontend.

1. <https://dash.cloudflare.com/477794df69f0b6a0b9e4c59e36883c1f/pages>
2. **"Create a project"** → **"Connect to Git"**
3. GitHub autorisieren → Repo `twyntcom/twynt-app` wählen
4. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output**: `dist`
   - **Root directory**: leer lassen
   - **Environment variables**:
     - `VITE_GA_MEASUREMENT_ID` = (kommt aus Schritt 8 — leer lassen vorerst)
5. **"Save and Deploy"** → erster Build läuft (~2 Min)
6. Du bekommst eine URL wie `twynt-app.pages.dev` — das ist die Origin-URL für `wrangler.toml`
7. **Custom Domain** binden: `Pages` → `twynt-app` → `Custom domains` → `Set up a custom domain` → `twynt.com` → DNS wird automatisch konfiguriert

Update `wrangler.toml`:

```toml
[vars]
ORIGIN_URL = "https://twynt-app.pages.dev"
CANONICAL_HOST = "https://twynt.com"
```

(Falls deine Pages-URL anders heißt, anpassen.)

---

## 6. Google OAuth Client-ID + Secret

Für "Mit Google fortfahren"-Login.

1. <https://console.cloud.google.com/> mit `twyntcom@gmail.com` einloggen
2. **"Select a project" → "New Project"**:
   - Name: `Twynt`
   - Organization: leer
   - **Create**
3. **APIs & Services → OAuth consent screen**:
   - User Type: **External** (du willst öffentliche Nutzer)
   - App name: `Twynt`
   - User support email: `i@twynt.com` (oder twyntcom@gmail.com)
   - App logo: optional, dein `logo.svg` als PNG (256×256)
   - App domain: `twynt.com`
   - Authorized domains: `twynt.com`
   - Developer contact: `twyntcom@gmail.com`
   - **Save and continue**
   - Scopes: NUR `openid`, `email`, `profile` hinzufügen → **Save**
   - Test users: für Dev erstmal `twyntcom@gmail.com`. Später (vor Launch): Status auf **Production** setzen, das löst eine Verification durch Google aus (kann 4-6 Wochen dauern bei sensiblen Scopes — `openid/email/profile` sind aber non-sensitive, sollte schnell durchgehen).
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**:
   - Application type: **Web application**
   - Name: `Twynt Web`
   - Authorized JavaScript origins:
     - `https://twynt.com`
     - `https://twynt-app.pages.dev`
     - `http://localhost:5173` (für lokales Dev)
     - `http://localhost:8787` (für `wrangler dev`)
   - Authorized redirect URIs:
     - `https://twynt.com/auth/google/callback`
     - `https://twynt-app.pages.dev/auth/google/callback`
     - `http://localhost:8787/auth/google/callback`
   - **Create**
5. **Client ID** und **Client Secret** kopieren — beides notieren.

---

## 7. Google Search Console (GSC)

Damit Google deine 50 Sprach-Versionen indexiert.

1. <https://search.google.com/search-console/welcome> mit `twyntcom@gmail.com` einloggen
2. **"URL prefix"** wählen → `https://twynt.com` eingeben → Continue
3. Verifikations-Methode: **"HTML tag"** wählen
4. Du bekommst ein Meta-Tag wie:
   ```html
   <meta name="google-site-verification" content="XYZ_HASH_ABC123" />
   ```
5. Den `content`-Wert (nur den HASH, nicht das ganze Tag) notieren — kommt in `index.html`.
6. **NICHT** auf "Verify" klicken bevor das Meta-Tag deployed ist.

Sobald das Meta-Tag im Live-`index.html` steht (nach Deploy), zurück zu GSC und **"Verify"**.

Nach Verifikation:
- **Sitemaps** → `https://twynt.com/sitemap.xml` einreichen (Sitemap baue ich in Phase 14)
- **International Targeting** → Hreflang wird automatisch erkannt
- **Settings → Users and permissions** → Owner ist du, weiter Owner hinzufügen falls Team

---

## 8. Google Analytics 4

1. <https://analytics.google.com/> mit `twyntcom@gmail.com` einloggen
2. **Admin** (Zahnrad unten links) → **Create → Account**:
   - Account name: `Twynt`
   - Land: Deutschland
   - Data sharing: alle abwählen außer du willst aktiv etwas teilen
3. **Create → Property**:
   - Property name: `twynt.com`
   - Time zone: `(GMT+01:00) Berlin`
   - Currency: EUR
4. Business details: Größe `Small`, Vertical `Technology`
5. **Create → Web data stream**:
   - Website URL: `https://twynt.com`
   - Stream name: `Twynt Web`
6. **Measurement ID** kopieren — Format `G-XXXXXXXXXX`. Das ist dein `VITE_GA_MEASUREMENT_ID`.
7. Nach Anlage:
   - **Admin → Data Settings → Data Collection** → Region: EU einstellen
   - **Admin → Data Settings → Data Retention** → 14 Monate
   - **Admin → Property Settings → Property Settings** → Domain: twynt.com
   - **Admin → Property Settings → Data Streams → Twynt Web → Configure tag settings → "Define internal traffic"** → IP-Bereich deines Office hinzufügen (interne Zugriffe filtern)
8. **DSGVO-Pflicht**: Auftragsverarbeitungsvertrag (AVV) akzeptieren unter `Admin → Account Settings → Data Processing Terms` — anwählen, akzeptieren.

In Cloudflare Pages Environment Variables (`Settings → Environment variables`):
- `VITE_GA_MEASUREMENT_ID` = dein G-XXX-Wert
- `VITE_GSC_VERIFICATION` = der HASH aus Schritt 7

---

## 9. Translation API-Keys

### DeepL Pro

1. <https://www.deepl.com/pro-api> mit `twyntcom@gmail.com` registrieren
2. **API for Developers** auswählen
3. Plan: **Starter** (5 €/Monat, 1 Mio Zeichen inklusive) reicht zum Start. **Advanced** (25 €/Monat) für mehr.
4. **Konto → Plan → API Keys** → Auth-Key kopieren (Format: `xxxx-xxxx-xxxx-xxxx-xxxx:fx` für Free, ohne `:fx` für Pro)

### Google Cloud Translation v2

Im selben Google-Cloud-Projekt wie OAuth (Schritt 6):

1. <https://console.cloud.google.com/apis/library/translate.googleapis.com> → **Enable**
2. **APIs & Services → Credentials → Create Credentials → API Key**
3. **Edit API Key**:
   - Name: `Twynt Translate`
   - **API restrictions**: nur `Cloud Translation API` aktivieren
   - **Application restrictions**: HTTP referrers — `*.twynt.com/*`, `*.pages.dev/*`, `*.workers.dev/*`
   - Save
4. API-Key kopieren (Format: `AIza...`)
5. **Billing**: Achtung, Google Translate kostet ab dem ersten Zeichen. Free Tier: 500.000 Zeichen/Monat. Plane Budget-Alert unter `Billing → Budgets & Alerts → Create budget`.

---

## 10. Secrets in Cloudflare setzen

Zurück im Terminal, im Projekt-Ordner:

```bash
# Wrangler installieren (falls nicht):
npm install
npx wrangler login   # öffnet Browser, mit twyntcom@gmail.com einloggen

# Translate-Worker Secrets:
npx wrangler secret put DEEPL_API_KEY               # → DeepL-Key einfügen
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY    # → Google API-Key einfügen
npx wrangler secret put ADMIN_TOKEN                 # → eigenen langen Random-String erfinden (>= 32 Zeichen) und merken

# Auth-Worker Secrets (falls als separater Worker deployed):
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put AUTH_HMAC_SECRET            # weiteren Random-String, separat von ADMIN_TOKEN

# Warmup-Worker bekommt dieselben Translation-Secrets:
npx wrangler secret put DEEPL_API_KEY --env warmup
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY --env warmup
npx wrangler secret put ADMIN_TOKEN --env warmup
```

**Random-Strings generieren** (für ADMIN_TOKEN und AUTH_HMAC_SECRET):

```bash
openssl rand -base64 48
# → liefert z. B. "k3J9...verkürzt...xPq=" — als Token verwenden
```

---

## 11. Erstes Workers-Deploy

```bash
# Translate-Worker:
npm run workers:deploy

# Warmup-Worker:
npm run workers:warmup:deploy
```

Wenn alles passt: Workers laufen unter `twynt-translate.<account>.workers.dev` und `twynt-warmup.<account>.workers.dev`.

**Verbinde Translate-Worker mit deiner Domain:**

In `wrangler.toml`:
```toml
[[routes]]
pattern = "twynt.com/*"
zone_name = "twynt.com"
```

Nach dem nächsten `npm run workers:deploy` greift der Worker bei jedem Request auf `twynt.com` ein und übersetzt.

**Warmup manuell triggern (für initiales Befüllen des KV-Cache):**

```bash
curl -i -X GET https://twynt-warmup.<deinAccount>.workers.dev/warmup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Antwort: JSON mit `totalChecked`, `totalTranslated`, `totalErrors`, `durationMs`.

---

## Checkliste — Bist du fertig?

- [ ] 5 KV-Namespaces angelegt, IDs in `wrangler.toml`
- [ ] R2 oder IDrive E2 Bucket `twynt-memories` existiert
- [ ] Domain `twynt.com` läuft auf Cloudflare-Nameservern
- [ ] GitHub-Repo `twyntcom/twynt-app` mit erstem Push
- [ ] Cloudflare Pages-Projekt baut bei `git push` automatisch
- [ ] `twynt.com` zeigt auf Pages-Deployment (HTTPS aktiv)
- [ ] OAuth Client ID + Secret notiert
- [ ] GSC-Verifikations-Hash notiert (Verifikation klappt aber erst nach Deploy)
- [ ] GA4 Measurement-ID notiert
- [ ] DeepL Pro API-Key bezahlt + notiert
- [ ] Google Translate API-Key + Billing-Alert eingerichtet
- [ ] Alle Secrets via `wrangler secret put` gesetzt
- [ ] Translate-Worker und Warmup-Worker deployed

Wenn alle Häkchen gesetzt sind: Twynt läuft.

---

## Troubleshooting

**Pages-Build fehlschlägt** → Logs unter Pages → Project → Deployments → klick auf failed Build. Häufigster Grund: TypeScript-Fehler in `App.tsx`. Lokal testen: `npm run build`.

**Workers-Deploy fehlt KV-Binding** → IDs in `wrangler.toml` prüfen. `npx wrangler kv:namespace list` zeigt alle vorhandenen.

**OAuth-Login zeigt "redirect_uri_mismatch"** → Authorized Redirect URIs in GCP Console exakt mit dem `CANONICAL_HOST/auth/google/callback` abgleichen. Trailing-Slash zählt.

**Translation gibt nur Original zurück** → DeepL-Key prüfen, ob `:fx`-Suffix oder nicht (Free vs Pro). Logs: `npx wrangler tail`.

**KV-Cache wird nie populated** → ADMIN_TOKEN-Header fehlt im Warmup-Curl. Status 401 = Token falsch.

**Google Translate "Daily Limit Exceeded"** → 500.000 Zeichen Free Tier verbraucht. Billing aktivieren oder warten.
