# Smyst — Free-only Language Routing

Edge-basiertes Sprachrouting für [smyst.com](https://smyst.com) auf Cloudflare Workers.

**Architektur:** In der Free-only-Phase werden keine externen Übersetzungs-APIs genutzt. Nicht-deutsche Sprachpfade liefern aktuell Identity-Inhalte aus; echte Mehrsprachigkeit muss statisch/manuell gepflegt und kostenlos deployt werden.

## Sprachen

DE (Quelle), EN, TR, FR, ES, PT, AR, ZH, JA, KO — 10 Sprachen.

| Sprache | Provider | Hinweis |
|---------|----------|---------|
| DE | identity | Quellsprache, keine Übersetzung |
| EN, TR, FR, ES, PT, ZH, JA | identity/static | keine externe API |
| KO, AR | identity/static | keine externe API |
| RTL-Sprachen | AR | `dir="rtl"` automatisch gesetzt |

Brand-Begriffe werden in der Free-only-Phase nicht automatisch übersetzt.

## Dateien

```
workers/
├── translator.ts            # Free-only identity translator, keine externen APIs
├── translate.ts             # Edge-Worker: Spracherkennung, KV-Cache, ctx.waitUntil
├── _shared.ts               # Security-Headers, JSON-Fehler, CORS, KV-Rate-Limits
├── api.ts                   # Free-only Chat/API ohne externe KI
├── auth-github.ts           # GitHub OAuth + KV-Sessions
├── storage-idrive.ts        # IDrive-e2-Signing + KV-Metadaten
└── warmup-translations.ts   # Cron-Worker: sparsam, keine externen APIs
wrangler.toml                # Konfiguration für beide Worker
src/lib/i18n.ts              # Frontend-Spracherkennung + useLanguage Hook
src/components/LangSwitcher.tsx  # Sprachumschalter (10 Sprachen, RTL-aware)
public/locales/*.json        # statische Repository-Uebersetzungen
```

## Setup

### 1. Dependencies installieren

```bash
npm install
```

Wichtige Dev-Dependencies (in `package.json` bereits enthalten):

* `wrangler` — Cloudflare CLI
* `@cloudflare/workers-types` — TypeScript-Typen für KV, HTMLRewriter, etc.
* Vite/React-Abhaengigkeiten aus `package.json`

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
npx wrangler secret put ADMIN_TOKEN

# Auch für den Warmup-Worker:
npx wrangler secret put ADMIN_TOKEN --env warmup
```

Keine externen Translation-API-Secrets setzen.

### 5. Account-ID eintragen

In `wrangler.toml` die `account_id`-Felder mit deiner Cloudflare-Account-ID befüllen
(`npx wrangler whoami` zeigt sie).

### 6. Origin-URL konfigurieren

In `wrangler.toml`:

```toml
[vars]
ORIGIN_URL = "https://smyst-pages.pages.dev"   # Vite-Build auf Pages
CANONICAL_HOST = "https://smyst.com"
```

### 7. Deploy

```bash
# Worker deploys im Free-Only-Pfad
npm run workers:deploy
```

## Verwendung

### Auth Worker

| Endpoint | Zweck | Speicher |
|---|---|---|
| `GET /auth/github/start` | OAuth Flow starten | `OAUTH_STATE` KV |
| `GET /auth/github/callback` | OAuth Callback, Session erzeugen | `SESSIONS` KV |
| `GET /auth/me` | aktuelle Session lesen | `SESSIONS` KV |
| `POST /auth/logout` | Session entfernen | `SESSIONS` KV |
| `POST /auth/logout-all` | bekannte User-Sessions entfernen | `SESSIONS` KV |

Auth verwendet ein zufaelliges opaque Session-Token als HttpOnly Secure Cookie. Rollen/Rechte werden pro User in KV gespeichert:

| Rolle | Rechte |
|---|---|
| `member` | Auth lesen, Profil lesen, Storage lesen/schreiben/loeschen, Chat lesen/schreiben |
| `admin` | Member-Rechte plus `admin:read` |
| `owner` | Admin-Rechte plus `admin:write` |

Owner/Admin-Zuordnung erfolgt ueber `SMYST_OWNER_GITHUB_IDS`, `SMYST_OWNER_EMAILS`, `SMYST_ADMIN_GITHUB_IDS`, `SMYST_ADMIN_EMAILS`.

### Storage Worker

| Endpoint | Zweck | Speicher |
|---|---|---|
| `POST /storage/upload-url` | Intent, Quota und signed PUT URL erzeugen | `METADATA`/`SESSIONS` KV + IDrive e2 URL |
| `POST /storage/upload-complete` | Upload als `uploaded` markieren | `METADATA` KV |
| `GET /storage/uploads` | kleine Upload-Liste fuer aktuellen User | `METADATA` KV |
| `GET /storage/file/:key` | signed GET Redirect erzeugen | IDrive e2 |
| `DELETE /storage/file/:key` | Objekt loeschen und KV-Status setzen | IDrive e2 + `METADATA` KV |
| `DELETE /storage/account` | bekannte User-Objekte und Upload-Metadaten loeschen | IDrive e2 + `METADATA` KV |

Der Worker speichert keine grossen Dateien in KV. Dateiinhalt liegt immer in IDrive e2.

Storage-Kategorien:

| Kategorie | IDrive-e2-Pfad |
|---|---|
| `audio` | `users/{userSub}/uploads/audio/{uuid}.{ext}` |
| `image` | `users/{userSub}/uploads/images/{uuid}.{ext}` |
| `video` | `users/{userSub}/uploads/videos/{uuid}.{ext}` |
| `document` | `users/{userSub}/uploads/documents/{uuid}.{ext}` |
| `profile_image` | `users/{userSub}/profile/images/{uuid}.{ext}` |
| `backup` | `users/{userSub}/backups/{YYYY-MM}/{uuid}.{ext}` |
| `twin_data` | `users/{userSub}/twins/{twinId}/data/{uuid}.{ext}` |

`Content-Type` wird beim Presign signiert und muss beim PUT exakt verwendet werden. Nach dem PUT prueft der Worker das Objekt per signed `HEAD`, bevor KV-Status und aktive Speicherzaehler aktualisiert werden.

Downloads ueber `GET /storage/file/:key` sind metadatengebunden: Der Key muss zum User gehoeren, ein KV-Upload-Record muss existieren und der Status muss `uploaded` sein. Dokumente, Backups und `twin_data` werden per `Content-Disposition: attachment` ausgeliefert; Bilder, Videos, Audio und Avatare duerfen inline streamen.

Phase 1 nutzt bewusst Direct-PUT statt Worker-Proxying. Chunk Upload und bytegenaue Wiederaufnahme sind noch nicht aktiv (`supportsChunkUpload: false`, `supportsResume: false`), damit Free-only-Komplexitaet und IDrive-e2-Kostenrisiko niedrig bleiben. Der Client kann laufende Uploads abbrechen und einen fehlgeschlagenen Direct-PUT einmal erneut versuchen.

### API/Chat Worker

| Endpoint | Zweck | Speicher |
|---|---|---|
| `GET /api/health` | API-Status | kein dauerhafter Speicher |
| `GET /api/account/export` | eigene KV-Metadaten exportieren | `SESSIONS`/`METADATA` KV |
| `DELETE /api/account` | eigene Chat-/Twin-/Account-Metadaten loeschen | `SESSIONS`/`METADATA` KV |
| `POST /api/support/report` | Feedback/Abuse/Privacy/Safety-Meldung speichern | `METADATA` KV |
| `POST /api/chat/start` | Chat-Session starten | `METADATA` KV |
| `POST /api/chat/messages` | Free-only regelbasierte Antwort erzeugen | `METADATA` KV |
| `GET /api/chat/list` | kleine Chat-Liste | `METADATA` KV |

Der Chat-Worker nutzt keine externen Modell-APIs. Antworten sind bewusst statisch/free-only, bis ein erlaubter KI-Pfad definiert ist.

### Security und Rate-Limits

Alle API-artigen Worker nutzen:

- strukturierte JSON-Fehler,
- Security-Headers,
- CORS-Preflight nur fuer erlaubte Methoden,
- `Origin`/`Referer` plus `X-Smyst-CSRF: 1` fuer mutierende Cookie-Requests,
- KV-basierte Rate-Limits mit `rate:*` Prefix,
- `405 method_not_allowed` mit `Allow`-Header fuer bekannte Routen mit falscher Methode,
- `429 rate_limited` mit `Retry-After` und `X-RateLimit-*`-Headern,
- `X-Smyst-Request-Id` und `Server-Timing` fuer Diagnose und Support,
- `no-store` fuer private JSON-Antworten.

### Cache-Headers

Jede Antwort vom Translate-Worker enthält:

| Header | Wert | Bedeutung |
|--------|------|-----------|
| `X-Translation-Cache` | `HIT` | Übersetzung kam aus KV (< 50 ms Edge) |
| `X-Translation-Cache` | `MISS` | Origin sofort, Übersetzung läuft im Hintergrund |
| `X-Translation-Cache` | `BYPASS` | Default-Sprache, kein Translation-Pfad |
| `X-Translation-Cache` | `WARMING` | Warmup-Worker arbeitet gerade an dieser Seite |
| `X-Content-Hash` | `<16-hex>` | SHA-256 des Origin-HTML, Cache-Key-Bestandteil |
| `X-Translation-Provider` | `identity` / `static` | welcher Free-only Provider verwendet wurde |

### URL-Struktur

* `https://smyst.com/` → DE (Default, kein Prefix)
* `https://smyst.com/en/` → EN
* `https://smyst.com/tr/preise` → TR
* `https://smyst.com/?lang=ar` → AR (Query-Parameter, einmaliger Override)

Sprache wird in Cookie + LocalStorage persistiert. Edge-Worker liest beide.

### Manuelles Warmup

```bash
# Mit Admin-Token (per `wrangler secret put ADMIN_TOKEN` gesetzt)
curl -X GET https://smyst-warmup.workers.dev/warmup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Antwort enthält `totalChecked`, `totalTranslated`, `totalCached`, `totalErrors`, `errors[]`, `durationMs`.

### Cron-Schedule

In `wrangler.toml` (`env.warmup.triggers.crons`):

* `0 */6 * * *` — alle 6 Stunden
* `0 3 * * *` — täglich 03:00 UTC (Vollständiger Sweep)

Anpassung beliebig. Beachte Cloudflare-KV- und Worker-Free-Limits.

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
curl -i https://smyst.com/?lang=tr | head -15
# → X-Translation-Cache: MISS

# 2. ~5 Sekunden warten, dann erneut
curl -i https://smyst.com/?lang=tr | head -15
# → X-Translation-Cache: HIT
```

### Brand-Term-Schutz prüfen

```bash
curl -s https://smyst.com/?lang=en | grep -o 'Smyst' | head -5
# → "Smyst" muss als "Smyst" erscheinen, nicht "Twin" oder übersetzt
```

### Performance-Ziel

Cache-Hit Edge-Antwort soll **unter 50 ms** liegen. Test:

```bash
time curl -s -H 'Cookie: smyst_lang=en' https://smyst.com/ -o /dev/null
# → real    0m0.04s — passt
```

### HTML-Struktur unverändert

```bash
diff <(curl -s https://smyst-pages.pages.dev/) <(curl -s -H 'Cookie: smyst_lang=de' https://smyst.com/)
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
* **Free-only identity translator** — keine externen Übersetzungs-APIs, keine Kostenrisiken.
* **Manuelle/statistische Mehrsprachigkeit** — hochwertige Landingpages werden als statische Inhalte gepflegt.
* **Sub-Path-Routing /de/, /en/** — bessere SEO als `?lang=` Query-Parameter, klarere URLs.
* **Lazy-Path bleibt nicht-blockierend** — Nutzer wartet nie auf externe Übersetzung, weil keine externe Übersetzung stattfindet.

## Limits & Kosten

| Resource | Free-Tier | Nicht nutzen |
|----------|-----------|--------|
| Workers Requests | Free-Plan-Limit beachten | Paid Workers |
| KV Reads | Free-Plan-Limit beachten | bezahlte KV-Mehrnutzung |
| KV Writes | Free-Plan-Limit beachten | bezahlte KV-Mehrnutzung |
| KV Storage | Free-Plan-Limit beachten | bezahlter KV-Speicher |
| Externe Übersetzung | nicht erlaubt | externe APIs |

Bei manuell gepflegten statischen Sprachseiten entstehen keine externen Übersetzungskosten. KV-Nutzung bleibt trotzdem zu begrenzen.

## Troubleshooting

### "Origin error" 502

→ `ORIGIN_URL` in `wrangler.toml` falsch. Pages-Deployment-URL prüfen.

### Nicht-deutsche Seiten sind noch Deutsch

→ Erwartet in der Free-only-Phase. Echte Übersetzungen müssen als statische Inhalte gepflegt werden.

### Cache-Hit < 50 ms wird nicht erreicht

→ KV-Latenz prüfen mit Logs. Edge-Region ist normalerweise < 30 ms. Wenn höher: KV-Namespace könnte cold sein. `wrangler tail` zeigt Latenzen.

### Warmup-Cron läuft nicht

→ `npx wrangler tail --env warmup` öffnen, dann manuell triggern via `/warmup`-Endpoint mit Admin-Token. Logs zeigen Cron-Trigger.

## Nächste Schritte

* Statische Sprachinhalte pro Zielmarkt pflegen.
* Human-Review-Queue für Landing Pages als Repo-basierter Prozess.
* A/B-Test verschiedener statischer Varianten (Cache-Key um `:variant:` erweitern).
* Sub-Path-Sitemaps generieren (`/sitemap-de.xml`, `/sitemap-en.xml`, …).
* Pseudo-Lokalisierung im Dev-Mode (Strings künstlich auf 130 % Länge), um Layout-Bugs zu finden.
