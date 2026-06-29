# SEO, AIO, GEO, AEO And AI Visibility Review - 2026-06-11

## Scope

Geprueft wurden SEO, Technical SEO, Video SEO, AI SEO, GEO, AEO,
LLM-Optimierung, Suchmaschinenoptimierung, KI-Sichtbarkeit, strukturierte Daten,
Schema.org, OpenGraph, Twitter Cards, Sitemaps, Robots, `llms.txt` und `ai.txt`.
Production bleibt auf GitHub.com, Legacy edge provider.com und IDrivee2.com beschraenkt.

## Gepruefte Zielsysteme

Klassische Suche:

- Google
- Bing
- Yandex
- DuckDuckGo

KI- und Antwortsysteme:

- ChatGPT
- Gemini
- Claude
- Grok
- DeepSeek
- Kimi
- Manus
- Mistral

## Bestehender Stand

- `index.html` hatte bereits Canonical, hreflang, OpenGraph, Twitter Cards,
  robots meta, JSON-LD und App-Manifest.
- `public/sitemap.xml` listet Root, Sprachseiten und ein Demo-Profil.
- `public/robots.txt` erlaubt oeffentliche Seiten und blockiert private/API-Pfade.
- `public/llms.txt` beschreibt Plattform, Architektur und Public-/Private-Muster.
- Mehrsprachige statische Landingpages existieren fuer DE, EN, TR, FR, ES, PT, AR,
  ZH, JA und KO.
- Public Twin API liefert `ProfilePage`-Schema und cachebare oeffentliche JSON-Daten.

## Gefundene Optimierungsmoeglichkeiten

- `ai.txt` fehlte als explizite KI-Sichtbarkeits- und Public/Private-Policy.
- `robots.txt` nannte keine spezifischen AI-Crawler-Hinweise.
- `sitemap.xml` hatte noch keinen Image-Sitemap-Namespace fuer das OG-Bild.
- `index.html` konnte fuer Answer Engines reicher strukturiert werden
  (`WebPage`, `FAQPage`, `featureList`, `speakable`).
- `llms.txt` enthielt noch keine klare Citation-Policy.
- `public/_headers`, Service Worker und Live-Test prueften `ai.txt` noch nicht.
- Dynamische Profile sind als API/SPA vorhanden, aber fuer maximale SEO brauchen sie
  spaeter serverlesbares HTML oder statische Profilseiten.
- Video SEO ist erst vorbereitet; echte VideoObject-Landingpages fehlen.

## Umgesetzt

- `public/ai.txt` angelegt mit KI-Sichtbarkeit, Public-/Private-Grenzen,
  Zielsystemen, Entry Points, Infrastruktur und bevorzugter Citation.
- `index.html` erweitert:
  - Link auf `ai.txt`
  - Link auf `llms.txt`
  - richer JSON-LD fuer `WebPage`
  - `FAQPage`
  - `featureList` fuer `SoftwareApplication`
  - `speakable`-Hinweis fuer Antwortsysteme
- `public/robots.txt` erweitert:
  - explizite `Allow`-Hinweise fuer `llms.txt` und `ai.txt`
  - AI-Crawler-Sektionen fuer GPTBot, ChatGPT-User, Google-Extended, ClaudeBot,
    anthropic-ai und PerplexityBot
  - `AI-Policy: https://smyst.com/ai.txt`
- `public/sitemap.xml` erweitert:
  - Image-Sitemap-Namespace
  - `og-image.png` als ImageObject fuer die Hauptseite
- `public/_headers` erweitert:
  - Content-Type und Cache fuer `/ai.txt`
- `public/sw.js` erweitert:
  - `/ai.txt` ist Teil der oeffentlichen App-Shell.
- `scripts/live-test.sh` erweitert:
  - `/ai.txt` wird als `text/plain` geprueft.
- `public/llms.txt` erweitert:
  - AI policy link
  - Citation-Regeln
  - klare Public-/Private-Grenzen.
- `docs/FREE_ONLY_SEO_AEO_GEO.md` und `scripts/validate-foundation.py`
  aktualisiert.

## Bewertung Nach Bereichen

SEO / Technical SEO:

- Canonical, hreflang, robots, sitemap, static landing pages, OG/Twitter und JSON-LD
  sind vorhanden.
- Private und API-Pfade sind noindex/no-store.

AEO / Answer Engine Optimization:

- FAQPage, concise summaries, `llms.txt` und `ai.txt` verbessern maschinenlesbare
  Antworten.
- Public Profile haben `ProfilePage`-Schema im API-Payload.

GEO / Generative Engine Optimization:

- `llms.txt` und `ai.txt` geben klare, zitierbare Plattformzusammenfassungen.
- Public-/Private-Grenzen sind fuer KI-Systeme dokumentiert.

Video SEO:

- Noch kein echtes VideoObject, weil keine oeffentlichen Video-Landingpages existieren.
- Private IDrive-e2-Videos duerfen nicht indexiert werden.

LLM / AI Visibility:

- KI-Systeme finden Root, Sprachseiten, Sitemap, Robots, LLM-Zusammenfassung und
  AI-Policy ohne externe Dienste.
- Keine bezahlten SEO-/AIO-/Analytics-Dienste wurden eingefuehrt.

## Offene Punkte

- Dynamische `/t/{slug}` Profile brauchen fuer maximale Crawler-Sichtbarkeit
  serverlesbares HTML oder statisch generierte Profilseiten.
- Dynamische Profil-Sitemaps muessen aus `public:twin:{slug}` erzeugt werden.
- VideoObject- und ImageObject-Daten brauchen echte oeffentliche Medienseiten.
- Externe Webmaster-Portale koennen optional manuell genutzt werden, duerfen aber
  keine Production-Pflicht werden.
- Ranking und KI-Citation koennen nicht garantiert werden; wir koennen nur saubere
  Signale liefern.

## Empfehlung

Naechster grosser SEO-Schritt ist kein weiterer Meta-Tag, sondern serverlesbares
HTML fuer oeffentliche Twin-Profile plus dynamische Sitemaps. Das bringt fuer Google,
Bing, DuckDuckGo, Yandex und KI-Systeme mehr als zusaetzliche Keyword-Felder.
