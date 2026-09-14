/**
 * smyst.com Sitemap-Chunking (14.09.2026)
 *
 * Der Profil-Autopilot veroeffentlicht dauerhaft 5.000 Profile/Tag. Eine
 * einzelne sitemap.xml darf laut Sitemap-Protokoll max. 50.000 URLs und
 * 50 MB enthalten — ohne Chunking waere das Limit erstmals ca. fuenf Tage
 * nach dem 14.09.2026 erreicht und Google haette alle weiteren Profile
 * still verworfen.
 *
 * Diese Helfer schreiben die Pipeline-Profil-URLs in Chunks
 * `sitemap-pipeline-<n>.xml` (je max. 10.000 URLs) und ergaenzen in der
 * GEBAUTEN robots.txt (dist/, nicht die Repo-Vorlage) eine `Sitemap:`-Zeile
 * je Chunk. robots.txt akzeptiert mehrere Sitemap-Zeilen unabhaengig von
 * der Position. sitemap.xml selbst bleibt unveraendert (Kuratiert +
 * Landingpages) — performance-pwa-audit.mjs prueft z. B. Sokrates darin.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const SITEMAP_CHUNK_SIZE = 10000;

function chunkUrlset(urls, host, today) {
  const entries = urls
    .map(
      (loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * Schreibt Chunks + robots-Ergaenzung. Idempotent: bereits vorhandene
 * `sitemap-pipeline-`-Zeilen in der robots.txt werden nicht doppelt
 * ergaenzt (Rebuilds in dasselbe dist/ sind gefahrlos).
 *
 * @returns {string[]} Namen der geschriebenen Chunk-Dateien.
 */
export function writeSitemapChunks({ distDir, urls, host, today, chunkSize = SITEMAP_CHUNK_SIZE }) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < urls.length; i += chunkSize) {
    chunks.push(urls.slice(i, i + chunkSize));
  }

  const chunkNames = chunks.map((part, idx) => {
    const name = `sitemap-pipeline-${idx + 1}.xml`;
    writeFileSync(resolve(distDir, name), chunkUrlset(part, host, today), 'utf8');
    return name;
  });

  const robotsPath = resolve(distDir, 'robots.txt');
  if (existsSync(robotsPath)) {
    const robots = readFileSync(robotsPath, 'utf8');
    if (!robots.includes('sitemap-pipeline-')) {
      const lines = chunkNames.map((name) => `Sitemap: ${host}/${name}`);
      writeFileSync(robotsPath, `${robots.replace(/\n*$/, '\n')}${lines.join('\n')}\n`, 'utf8');
    }
  }

  return chunkNames;
}
