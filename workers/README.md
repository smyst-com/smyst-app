# Twynt — Hybrid Translation System

Edge-basiertes Übersetzungssystem für [twynt.com](https://twynt.com) auf Cloudflare Workers.

**Architektur:** Pre-Translation (Cron) als Hauptweg + Lazy-Translation (HTML-Stream) als Sicherheitsnetz. Nutzer warten nie auf Übersetzungen — Cache-Hit liefert in unter 50 ms vom Edge.

## Sprachen

DE (Quelle), EN, TR, FR, ES, ZH, PT, JA, KO, AR, IT, RU — 12 Sprachen.

| Sprache | Provider | Hinweis |
|---------|----------|---------|
| DE | identity | Quellsprache, keine Übersetzung |
| EN, TR, FR, ES, ZH, PT, JA, IT, RU | DeepL | beste Qualität |
| KO, AR | Google Translate v2 | DeepL unterstützt diese nicht |
| RTL-Sprachen | AR | `dir="rtl"` automatisch gesetzt |

Brand-Begriffe (`Twynt`, `Twin`, `Memory Engine`, `Legacy Access`, `Founder-Legacy`, …) werden via Platzhalter-Schutz NIE übersetzt.

## Dateien

```
workers/
├── translator.ts            # DeepL + Google Hybrid Client mit Retry & Glossary
├── translate.ts             # Edge-Worker: Spracherkennung, KV-Cache, ctx.waitUntil
└── warmup-translations.ts   # Cron-Worker: Pre-Translation für SEO-Seiten
wrangler.toml                # Konfiguration für beide Worker
src/lib/i18n.ts              # Frontend-Spracherkennung + useLanguage Hook
src/components/LangSwitcher.tsx  # Sprachumschalter (12 Sprachen, RTL-aware)
```

## Setup

### 1. Dependencies installieren

```bash
npm install
```

Wichtige Dev-Dependencies (in `package.json` bereits enthalten):

* `wrangler` — Cloudflare CLI
* `@cloudflare/workers-types` — TypeScript-Typen für KV, HTMLRewriter, etc.
* `vite-plugin-pwa` — PWA-Build (Service Worker, Manifest, Workbox)

### 2. Cloudflare-Login

```bash
npx wrangler login
```

### 3. KV-Namespaces anlegen

```bash
npx wrangler kv:namespace create "TRANSLATIONS"
npx wrangler kv:namespace create "TRANSLATIONS" --preview
npx wrangler kv:namespace create "WARMUP_CONFIG"
```

Die ausgegebenen IDs in `wrangler.toml` an den Stellen `REPLACE_WITH_*` einsetzen.

### 4. Secrets setzen

```bash
npx wrangler secret put DEEPL_API_KEY
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY
npx wrangler secret put ADMIN_TOKEN

# Auch für den Warmup-Worker:
npx wrangler secret put DEEPL_API_KEY --env warmup
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY --env warmup
npx wrangler secret put ADMIN_TOKEN --env warmup
```

DeepL-Key holen: <https://www.deepl.com/pro-api>
Google-Key holen: GCP Console → APIs → Cloud Translation API → API-Key erstellen.

### 5. Account-ID eintragen

In `wrangler.toml` die `account_id`-Felder mit deiner Cloudflare-Account-ID befüllen
(`npx wrangler whoami` zeigt sie).

### 6. Origin-URL konfigurieren

In `wrangler.toml`:

```toml
[vars]
ORIGIN_URL = "https://twynt-pages.pages.dev"   # Vite-Build auf Pages
CANONICAL_HOST = "https://twynt.com"
```

### 7. Deploy

```bash
# Translate-Worker (Edge-Service)
npm run workers:deploy

# Warmup-Worker (Cron + Admin-Endpoint)
npm run workers:warmup:deploy
```

## Verwendung

### Cache-Headers

Jede Antwort vom Translate-Worker enthält:

| Header | Wert | Bedeutung |
|--------|------|-----------|
| `X-Translation-Cache` | `HIT` | Übersetzung kam aus KV (< 50 ms Edge) |
| `X-Translation-Cache` | `MISS` | Origin sofort, Übersetzung läuft im Hintergrund |
| `X-Translation-Cache` | `BYPASS` | Default-Sprache, kein Translation-Pfad |
| `X-Translation-Cache` | `WARMING` | Warmup-Worker arbeitet gerade an dieser Seite |
| `X-Content-Hash` | `<16-hex>` | SHA-256 des Origin-HTML, Cache-Key-Bestandteil |
| `X-Translation-Provider` | `deepl` / `google` / `identity` | welcher Provider verwendet wurde |

### URL-Struktur

* `https://twynt.com/` → DE (Default, kein Prefix)
* `https://twynt.com/en/` → EN
* `https://twynt.com/tr/preise` → TR
* `https://twynt.com/?lang=ar` → AR (Query-Parameter, einmaliger Override)

Sprache wird in Cookie + LocalStorage persistiert. Edge-Worker liest beide.

### Manuelles Warmup

```bash
# Mit Admin-Token (per `wrangler secret put ADMIN_TOKEN` gesetzt)
curl -X GET https://twynt-warmup.workers.dev/warmup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Antwort enthält `totalChecked`, `totalTranslated`, `totalCached`, `totalErrors`, `errors[]`, `durationMs`.

### Cron-Schedule

In `wrangler.toml` (`env.warmup.triggers.crons`):

* `0 */6 * * *` — alle 6 Stunden
* `0 3 * * *` — täglich 03:00 UTC (Vollständiger Sweep)

Anpassung beliebig. Beachte DeepL-API-Limits (500.000 Zeichen/Monat im Pro-Plan).

## Tests

### Lokal

```bash
# Translate-Worker
npm run workers:dev
# → http://localhost:8787
# Test mit:
curl -i http://localhost:8787/?lang=en
```

### Cache-Hit / Miss Verhalten prüfen

```bash
# 1. Erster Request → MISS, Origin sofort, Background-Translation
curl -i https://twynt.com/?lang=tr | head -15
# → X-Translation-Cache: MISS

# 2. ~5 Sekunden warten, dann erneut
curl -i https://twynt.com/?lang=tr | head -15
# → X-Translation-Cache: HIT
```

### Brand-Term-Schutz prüfen

```bash
curl -s https://twynt.com/?lang=en | grep -o 'Twynt' | head -5
# → "Twynt" muss als "Twynt" erscheinen, nicht "Twin" oder übersetzt
```

### Performance-Ziel

Cache-Hit Edge-Antwort soll **unter 50 ms** liegen. Test:

```bash
time curl -s -H 'Cookie: twynt_lang=en' https://twynt.com/ -o /dev/null
# → real    0m0.04s — passt
```

### HTML-Struktur unverändert

```bash
diff <(curl -s https://twynt-pages.pages.dev/) <(curl -s -H 'Cookie: twynt_lang=de' https://twynt.com/)
# → identische HTML-Struktur (außer `<head>` mit hreflang/canonical)
```

## Performance-Architektur

```
┌────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                       │
│                                                            │
│  Request /tr/preise                                        │
│      │                                                     │
│      ▼                                                     │
│  ┌─────────────────────┐  ┌────────────────────────────┐   │
│  │ translate.ts        │  │ TRANSLATIONS KV            │   │
│  │  - Spracherkennung  │──│ Key: t:/preise:tr:abc123   │   │
│  │  - content_hash     │  │ Value: { html, provider }  │   │
│  │  - KV-Lookup        │  └────────────────────────────┘   │
│  │  - Cache-HIT? ──────┼─→ Antwort < 50ms                  │
│  │  - MISS:                                                │
│  │      Origin sofort                                      │
│  │      ctx.waitUntil( translate )                         │
│  └─────────────────────┘                                   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                      Cron (alle 6h)                        │
│                                                            │
│  warmup-translations.ts                                    │
│      │                                                     │
│      ▼                                                     │
│  Loop über SEED_PATHS × 11 Sprachen                        │
│      │                                                     │
│      ├─→ Origin-HTML fetch + content_hash                  │
│      ├─→ Existiert KV-Eintrag? → skip                      │
│      └─→ Fehlt? → translatePage() → KV.put()               │
└────────────────────────────────────────────────────────────┘
```

## Architektur-Entscheidungen

* **HTMLRewriter statt DOM-Parser** — streamt, skaliert linear, kein OOM auf großen Seiten.
* **content_hash statt TTL** — Cache-Invalidation passiert automatisch bei Content-Änderung. TTL ist nur Sicherheitsnetz (90 Tage).
* **DeepL primary, Google fallback** — DeepL hat bessere Qualität für 10 von 12 Sprachen. KO + AR brauchen Google.
* **Brand-Glossary via Platzhalter** — robuster als DeepL-Glossary-API (die nur in einigen Sprachpaaren funktioniert).
* **Sub-Path-Routing /de/, /en/** — bessere SEO als `?lang=` Query-Parameter, klarere URLs.
* **Lazy-Translation NUR via `ctx.waitUntil`** — Nutzer wartet nie. Selbst bei DeepL-Outage liefert das System Origin aus.

## Limits & Kosten

| Resource | Free-Tier | Bezahl |
|----------|-----------|--------|
| Workers Requests | 100k/Tag | 5 USD / 10M Requests |
| KV Reads | 100k/Tag | 0.50 USD / Mio |
| KV Writes | 1k/Tag | 5 USD / Mio |
| KV Storage | 1 GB | 0.50 USD / GB / Monat |
| DeepL Pro | — | 5 €/Monat + 20 €/Mio Zeichen |
| Google Translate v2 | — | 20 USD / Mio Zeichen |

Bei 25 Seiten × 12 Sprachen × 5 KB pro Übersetzung ≈ 1.5 MB KV-Storage — vernachlässigbar.

## Troubleshooting

### "Origin error" 502

→ `ORIGIN_URL` in `wrangler.toml` falsch. Pages-Deployment-URL prüfen.

### "DEEPL_API_KEY missing"

→ Secret nicht gesetzt. `wrangler secret put DEEPL_API_KEY` ausführen.

### Brand-Begriffe werden trotzdem übersetzt

→ Liste in `workers/translator.ts` (`BRAND_TERMS`) erweitern, redeploy.

### Cache-Hit < 50 ms wird nicht erreicht

→ KV-Latenz prüfen mit Logs. Edge-Region ist normalerweise < 30 ms. Wenn höher: KV-Namespace könnte cold sein. `wrangler tail` zeigt Latenzen.

### Warmup-Cron läuft nicht

→ `npx wrangler tail --env warmup` öffnen, dann manuell triggern via `/warmup`-Endpoint mit Admin-Token. Logs zeigen Cron-Trigger.

## Nächste Schritte

* Translation Memory einrichten (Hash → Übersetzung Cache vor DeepL-Call), spart 30–60 % API-Kosten.
* Quality Estimation pro Übersetzung speichern (COMET-Score), Human-Review-Queue für Landing Pages.
* A/B-Test verschiedener Übersetzungs-Varianten (Cache-Key um `:variant:` erweitern).
* Sub-Path-Sitemaps generieren (`/sitemap-de.xml`, `/sitemap-en.xml`, …).
* Pseudo-Lokalisierung im Dev-Mode (Strings künstlich auf 130 % Länge), um Layout-Bugs zu finden.
