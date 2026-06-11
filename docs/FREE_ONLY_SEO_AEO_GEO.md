# Free-Only SEO, AEO, GEO und KI-Suche

Status: Production-Grundlage ohne externe Pflichtdienste.

## Dateien

- `public/robots.txt`: erlaubt öffentliche Seiten, blockiert `/private/` und nicht öffentliche API-Pfade.
- `public/sitemap.xml`: statische Einstiegsseiten und bekannte öffentliche Profilbeispiele.
- `public/llms.txt`: maschinenlesbare Zusammenfassung fuer KI-Antwortsysteme.
- `public/_headers`: Cloudflare Pages Header fuer `noindex`, Cache und Content-Type.
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

Es gibt keine Production-Pflicht fuer externe Webmaster-Portale, bezahlte SEO APIs, externe Analytics oder externe Uebersetzungsdienste. Auffindbarkeit entsteht ueber offene Webstandards, Cloudflare Pages/Workers/KV und IDrive-e2-Referenzen.
