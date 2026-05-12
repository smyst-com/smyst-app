/**
 * Twynt Sitemap-Generator
 *
 * Erzeugt:
 *  - public/sitemap.xml      → Sitemap-Index, listet alle Sprach-Sitemaps
 *  - public/sitemap-<lang>.xml → eine Sitemap pro Sprache mit allen Pfaden
 *
 * Aufruf: `node scripts/generate-sitemap.mjs` (auch in npm run build verlinkt)
 *
 * Pfad-Liste muss synchron mit workers/warmup-translations.ts (SEED_PATHS)
 * gehalten werden — wenn du dort Pfade ergänzt, ergänze sie hier mit.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(ROOT, 'public');

const HOST = process.env.VITE_CANONICAL_HOST || 'https://twynt.com';

// 50 Sprachen + DE als Default — synchron mit src/lib/i18n.ts
const LANGS = [
  'de',
  'en', 'es', 'fr', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi',
  'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'lt', 'tr', 'ru',
  'uk', 'ar', 'zh', 'ja', 'ko', 'id',
  'hr', 'sr', 'he', 'fa', 'az', 'hi', 'bn', 'ur', 'pa', 'mr',
  'gu', 'te', 'ta', 'kn', 'ml', 'ne', 'si', 'th', 'vi', 'ms',
  'sw', 'ha', 'yo', 'am',
];

const DEFAULT_LANG = 'de';

/**
 * Wichtigste Seiten — synchron mit warmup-translations.ts.
 * Erweitern für Standortseiten + Blog.
 */
const PATHS = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/preise', priority: '0.9', changefreq: 'weekly' },
  { path: '/welcome', priority: '0.8', changefreq: 'monthly' },
  { path: '/login', priority: '0.5', changefreq: 'yearly' },
  { path: '/signup', priority: '0.7', changefreq: 'monthly' },
  { path: '/dashboard', priority: '0.6', changefreq: 'monthly' },
  { path: '/twin-builder', priority: '0.8', changefreq: 'monthly' },
  { path: '/memory', priority: '0.7', changefreq: 'monthly' },
  { path: '/chat', priority: '0.7', changefreq: 'monthly' },
  { path: '/legacy', priority: '0.7', changefreq: 'monthly' },
  { path: '/ethik-charta', priority: '0.6', changefreq: 'yearly' },
  { path: '/datenschutz', priority: '0.4', changefreq: 'yearly' },
  { path: '/agb', priority: '0.4', changefreq: 'yearly' },
  { path: '/impressum', priority: '0.3', changefreq: 'yearly' },
  { path: '/hilfe', priority: '0.6', changefreq: 'monthly' },
  { path: '/b2b', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog', priority: '0.7', changefreq: 'weekly' },
];

function langPath(lang, path) {
  // Default-Sprache ohne Prefix
  if (lang === DEFAULT_LANG) return path;
  // Andere Sprachen mit /<lang>/ Prefix
  return `/${lang}${path === '/' ? '' : path}`;
}

function urlElement(lang, entry, today) {
  const loc = `${HOST}${langPath(lang, entry.path)}`;
  // Hreflang-Alternates für jede Seite
  const alternates = LANGS.map(
    (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${HOST}${langPath(l, entry.path)}"/>`,
  ).join('\n');
  // x-default → Default-Sprache (DE)
  const xdefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${HOST}${entry.path}"/>`;
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${alternates}
${xdefault}
  </url>`;
}

function buildLangSitemap(lang) {
  const today = new Date().toISOString().split('T')[0];
  const urls = PATHS.map((p) => urlElement(lang, p, today)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function buildIndex() {
  const today = new Date().toISOString().split('T')[0];
  const entries = LANGS.map((lang) => `  <sitemap>
    <loc>${HOST}/sitemap-${lang}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
}

// ---------- Run ----------
mkdirSync(PUBLIC_DIR, { recursive: true });

let written = 0;
for (const lang of LANGS) {
  const xml = buildLangSitemap(lang);
  writeFileSync(resolve(PUBLIC_DIR, `sitemap-${lang}.xml`), xml, 'utf-8');
  written++;
}

writeFileSync(resolve(PUBLIC_DIR, 'sitemap.xml'), buildIndex(), 'utf-8');
written++;

console.log(`✓ Generated ${written} sitemap files (${LANGS.length} languages × ${PATHS.length} paths each)`);
console.log(`  Index: ${HOST}/sitemap.xml`);
