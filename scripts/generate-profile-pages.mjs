/**
 * smyst.com Profilseiten-Prerender
 *
 * Erzeugt nach dem Vite-Build fuer jedes kuratierte oeffentliche KI-Profil
 * eine statische Seite `dist/t/<slug>/index.html` auf Basis von
 * `dist/index.html`, mit profil-spezifischem Title, Meta-Description,
 * Canonical, OpenGraph/Twitter-Tags und schema.org ProfilePage JSON-LD.
 *
 * Ergebnis: /t/<slug> liefert HTTP 200 und ist sauber indexierbar.
 * Die App bootet unveraendert und rendert die Profilansicht client-seitig.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const HOST = (process.env.VITE_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const EXPECTED_PROFILE_COUNT = 100;

const templatePath = resolve(DIST, 'index.html');
if (!existsSync(templatePath)) {
  console.error('generate-profile-pages: dist/index.html fehlt. Erst `npm run build` ausfuehren.');
  process.exit(1);
}
const template = readFileSync(templatePath, 'utf8');

const bundledData = resolve(tmpdir(), `smyst-curated-data-prerender-${Date.now()}.mjs`);
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

if (!Array.isArray(CURATED_PUBLIC_TWIN_SPECS) || CURATED_PUBLIC_TWIN_SPECS.length !== EXPECTED_PROFILE_COUNT) {
  console.error(
    `generate-profile-pages: erwartet ${EXPECTED_PROFILE_COUNT} Profile, gefunden ${CURATED_PUBLIC_TWIN_SPECS?.length ?? 0}.`,
  );
  process.exit(1);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function lifeLabel(spec) {
  if (spec.birthDate && spec.deathDate) return `${spec.birthDate} – ${spec.deathDate}`;
  if (spec.birthLabel && spec.deathLabel) return `${spec.birthLabel} – ${spec.deathLabel}`;
  return '';
}

function jsonLd(spec, pageUrl, imageUrl) {
  const person = {
    '@type': 'Person',
    name: spec.name,
    description: spec.description,
    ...(spec.birthDate ? { birthDate: spec.birthDate } : {}),
    ...(spec.deathDate ? { deathDate: spec.deathDate } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
  };
  const profilePage = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${spec.name} – KI-Profil auf smyst.com`,
    url: pageUrl,
    inLanguage: 'de',
    isPartOf: { '@type': 'WebSite', name: 'smyst.com', url: `${HOST}/` },
    about: person,
    mainEntity: person,
    disambiguatingDescription:
      `KI-Profil (digitaler KI-Zwilling) von ${spec.name} auf smyst.com. Historisches, verstorbenes Vorbild; keine echte Person und keine authentischen Aussagen der historischen Person.`,
  };
  return JSON.stringify(profilePage);
}

function renderPage(spec) {
  const pageUrl = `${HOST}/t/${spec.slug}`;
  const imageUrl = spec.imageFile ? `${HOST}/public/profile-images/${spec.imageFile}` : `${HOST}/og-image.png`;
  const title = `${spec.name} – KI-Profil & Chat | smyst.com`;
  const description = truncate(
    `${spec.name} (${spec.mainCategory}${lifeLabel(spec) ? `, ${lifeLabel(spec)}` : ''}) als KI-Profil auf smyst.com: ${spec.description}`,
    158,
  );

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${pageUrl}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${pageUrl}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${imageUrl}$2`);
  html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${escapeAttr(`${spec.name} – KI-Profil auf smyst.com`)}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${imageUrl}$2`);
  html = html.replace(
    '</head>',
    `<script type="application/ld+json" id="smyst-profile-schema">${jsonLd(spec, pageUrl, imageUrl)}</script></head>`,
  );
  return html;
}

let written = 0;
for (const spec of CURATED_PUBLIC_TWIN_SPECS) {
  if (!spec.slug) continue;
  const dir = resolve(DIST, 't', spec.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), renderPage(spec), 'utf8');
  written += 1;
}

if (written !== EXPECTED_PROFILE_COUNT) {
  console.error(`generate-profile-pages: nur ${written}/${EXPECTED_PROFILE_COUNT} Seiten geschrieben.`);
  process.exit(1);
}
console.log(`generate-profile-pages: ${written} Profilseiten unter dist/t/ erzeugt.`);
