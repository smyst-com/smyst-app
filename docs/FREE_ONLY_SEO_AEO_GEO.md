# Free-Only SEO, AEO, GEO und KI-Suche

> **Status: ueberholtes Zielbild.** Dieses Dokument beschreibt eine geplante
> Architektur aus der Free-only-Phase (Cloudflare Pages/Workers/KV, Salad), die
> so nie gebaut wurde. Es ist KEINE Beschreibung des Live-Systems.
> Verbindlich sind `docs/ARCHITECTURE.md`, `docs/INFRA_SETUP.md`,
> `docs/07-deployment-architecture.md` und `docs/FREE_ONLY_DATA_MAP.md`.
> Eingeordnet am 2026-08-20.

Status: Production-Grundlage ohne externe Pflichtdienste.

## Dateien

- `public/robots.txt`: erlaubt öffentliche Seiten, blockiert `/private/` und nicht öffentliche API-Pfade.
- `public/sitemap.xml`: statische Einstiegsseiten und bekannte öffentliche Profilbeispiele.
- `public/llms.txt`: maschinenlesbare Zusammenfassung fuer KI-Antwortsysteme.
- `public/ai.txt`: KI-Sichtbarkeits- und Public/Private-Grenzen fuer AI-Crawler und Antwortsysteme.
- `public/_headers`: GitHub Pages Header fuer `noindex`, Cache und Content-Type.
- `public/{de,en,tr,fr,es,pt,ar,zh,ja,ko}/index.html`: statische mehrsprachige Landingpages mit Meta, OpenGraph und JSON-LD.
- `public/locales/{de,en,tr,fr,es,pt,ar,zh,ja,ko}.json`: statische UI-Texte fuer die App ohne externen Uebersetzungsprovider.

## Dynamische Profile

Öffentliche Profile:

- URL: `/t/{slug}`
- API: `/api/public/twins/{slug}`
- KV: `public:twin:{slug}`
- Robots: `index,follow`
- Schema.org: `ProfilePage`

Private Profile:

- URL: `/private/twins/{twinId}`
- KV: `meta:twin:{userSub}:{twinId}`
- Robots: `noindex,nofollow`
- Keine Aufnahme in Sitemap oder `public:twin:{slug}`.

## Free-Only-Regel

Es gibt keine Production-Pflicht fuer externe Webmaster-Portale, bezahlte SEO APIs, externe Analytics oder externe Uebersetzungsdienste. Auffindbarkeit entsteht ueber offene Webstandards, Cloudflare Pages/Workers/KV (abgeschaltet) und IDrive-e2-Referenzen.

## Suchmaschinen Und KI-Systeme

Zielsysteme:

- Klassische Suche: Google, Bing, Yandex, DuckDuckGo und andere robots-kompatible Crawler.
- Antwortsysteme: ChatGPT, Gemini, Claude, Grok, DeepSeek, Kimi, Manus, Mistral und andere Systeme, die öffentliche Webstandards lesen.

Regeln:

- Oeffentliche Seiten und `api/public/twins` duerfen gefunden und zitiert werden.
- Private Routen, signierte Storage-URLs und nicht oeffentliche API-Pfade bleiben blockiert.
- `robots.txt`, `sitemap.xml`, `llms.txt` und `ai.txt` muessen konsistent bleiben.
- Statische Sprachseiten enthalten Canonical, hreflang, OpenGraph und JSON-LD.
- Die Hauptseite enthaelt Organization, WebSite, WebPage, SoftwareApplication und FAQPage Schema.

## Noch Offen Fuer Maximale Sichtbarkeit

- Dynamische öffentliche Twin-Profile brauchen spaeter serverlesbares HTML oder statische Profilseiten, nicht nur SPA-Rendering.
- Dynamische Profil-Sitemaps muessen aus `public:twin:{slug}`-Snapshots generiert werden.
- Video SEO braucht echte oeffentliche Video-Landingpages mit VideoObject Schema. Private IDrive-e2-Videos duerfen nicht indexiert werden.
- Externe Webmaster-Portale sind optional und duerfen nicht Production-Pflicht werden.
