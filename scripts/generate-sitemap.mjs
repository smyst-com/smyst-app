/**
 * Smyst Sitemap-Generator
 *
 * Erzeugt `public/sitemap.xml` mit den statischen Free-only-Landingpages.
 * Mehrsprachigkeit kommt aus Repository-Dateien, nicht aus externen Diensten.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = resolve(ROOT, 'public');
const HOST = process.env.VITE_CANONICAL_HOST || 'https://smyst.com';

const LANGS = ['de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko'];

const PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  ...LANGS.map((lang) => ({
    loc: `/${lang}/`,
    priority: lang === 'de' || lang === 'en' ? '0.9' : '0.8',
    changefreq: 'weekly',
  })),
  { loc: '/t/smyst-demo-twin', priority: '0.7', changefreq: 'weekly' },
];

function landingAlternates() {
  return [
    ...LANGS.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${HOST}/${lang}/" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${HOST}/" />`,
  ].join('\n');
}

function urlElement(entry, today) {
  const alternates = entry.loc === '/' ? `\n${landingAlternates()}` : '';
  return `  <url>
    <loc>${HOST}${entry.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${alternates}
  </url>`;
}

function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const urls = PAGES.map((page) => urlElement(page, today)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(resolve(PUBLIC_DIR, 'sitemap.xml'), buildSitemap(), 'utf-8');

console.log(`Generated sitemap.xml (${LANGS.length} languages, ${PAGES.length} URLs)`);
