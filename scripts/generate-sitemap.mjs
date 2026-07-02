/**
 * Smyst Sitemap-Generator
 *
 * Erzeugt `public/sitemap.xml` mit den statischen Free-only-Landingpages.
 * Mehrsprachigkeit kommt aus Repository-Dateien, nicht aus externen Diensten.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

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
];

function landingAlternates() {
  return [
    ...LANGS.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${HOST}/${lang}/" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${HOST}/" />`,
  ].join('\n');
}

function imageSitemapBlock(entry) {
  if (entry.loc !== '/') return '';
  return `
    <!-- sitemap-image: primary app preview -->
    <image:image>
      <image:loc>${HOST}/og-image.png</image:loc>
      <image:title>smyst.com AI Twin Platform</image:title>
      <image:caption>smyst.com Create Your AI Twin app preview</image:caption>
    </image:image>`;
}

function urlElement(entry, today) {
  const alternates = entry.loc === '/' ? `\n${landingAlternates()}` : '';
  const image = imageSitemapBlock(entry);
  return `  <url>
    <loc>${HOST}${entry.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${image}${alternates}
  </url>`;
}

async function loadProfileSlugs() {
  const bundledData = resolve(tmpdir(), `smyst-curated-data-sitemap-${Date.now()}.mjs`);
  await build({
    entryPoints: [resolve(ROOT, 'src/data/curated-public-twin-data.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    outfile: bundledData,
    logLevel: 'silent',
  });
  const { CURATED_PUBLIC_TWIN_SPECS } = await import(pathToFileURL(bundledData).href);
  return CURATED_PUBLIC_TWIN_SPECS.map((spec) => spec.slug).filter(Boolean);
}

function profileUrlElement(slug, today) {
  return `  <url>
    <loc>${HOST}/t/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
}

async function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const profileSlugs = await loadProfileSlugs();
  const urls = [
    ...PAGES.map((page) => urlElement(page, today)),
    ...profileSlugs.map((slug) => profileUrlElement(slug, today)),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
}

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(resolve(PUBLIC_DIR, 'sitemap.xml'), await buildSitemap(), 'utf-8');

console.log(`Generated sitemap.xml (${LANGS.length} languages, ${PAGES.length} landing URLs + profile URLs)`);
