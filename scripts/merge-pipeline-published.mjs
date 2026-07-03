/**
 * smyst.com — Merge veroeffentlichter Pipeline-Profile in die statische Site.
 *
 * Laeuft im Pages-Build NACH scripts/generate-profile-pages.mjs. Liest den
 * Publish-Index der Autopilot-Pipeline (pipeline-published-index.json im
 * Repo-Root, vom Workflow aus IDrive e2 geladen: pipeline/published/index.json)
 * und ergaenzt:
 *   1. dist/api/public/twins/index.html   (twins-Array, statische JSON-API)
 *   2. dist/api/public/twins/<slug>/      (Einzelprofil-JSON)
 *   3. dist/t/<slug>/index.html           (prerenderte Profilseite, SEO)
 *   4. dist/sitemap.xml                   (zusaetzliche /t/<slug>-URLs)
 *
 * DEFENSIV: Fehlt die Datei oder ist der Index leer, passiert nichts (exit 0).
 * Kuratierte Profile haben Vorrang: Slug-Kollisionen werden uebersprungen.
 * Nur Eintraege mit visible=true und qa_passed=true werden uebernommen
 * (Master Prompt: keine Veroeffentlichung ohne Pruefung und Freigabe).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const HOST = (process.env.VITE_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const INDEX_FILE = process.env.PIPELINE_PUBLISHED_INDEX || resolve(ROOT, 'pipeline-published-index.json');

if (!existsSync(INDEX_FILE)) {
  console.log('merge-pipeline-published: kein Publish-Index gefunden — nichts zu tun (ok).');
  process.exit(0);
}

let published;
try {
  published = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
} catch (error) {
  console.error(`merge-pipeline-published: Publish-Index unlesbar: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(published)) {
  console.error('merge-pipeline-published: Publish-Index ist kein Array.');
  process.exit(1);
}

const eligible = published.filter(
  (entry) => entry && entry.visible !== false && entry.qa_passed === true && entry.slug && entry.name,
);
if (eligible.length === 0) {
  console.log('merge-pipeline-published: 0 sichtbare, QA-bestandene Profile — nichts zu tun (ok).');
  process.exit(0);
}

const apiIndexPath = resolve(DIST, 'api', 'public', 'twins', 'index.html');
const templatePath = resolve(DIST, 'index.html');
if (!existsSync(apiIndexPath) || !existsSync(templatePath)) {
  console.error('merge-pipeline-published: dist/-Artefakte fehlen. Erst Build + Prerender ausfuehren.');
  process.exit(1);
}

const api = JSON.parse(readFileSync(apiIndexPath, 'utf8'));
const twins = Array.isArray(api.twins) ? api.twins : [];
const takenSlugs = new Set(twins.map((twin) => twin.slug));
const template = readFileSync(templatePath, 'utf8');

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function commonsImageUrl(record) {
  // Lizenz wurde vom risk-Worker geprueft (PD/CC0/CC-BY*); Commons-Thumbnails
  // via Special:FilePath sind der offizielle, stabile Auslieferungsweg.
  const image = record.image || {};
  if (image.mode !== 'commons' || !image.commons_file) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.commons_file)}?width=512`;
}

async function mirrorCommonsImage(record, slug) {
  // Selbst-Hosting (Freigabe Adam King 2026-07-03): Commons-Bild wird beim
  // Build nach dist/public/profile-images/<slug>.<ext> gespiegelt und lokal
  // ausgeliefert (schneller, kein Hotlink). Bei Fehlern bleibt die gepruefte
  // Commons-URL der Fallback — der Build scheitert dadurch NIE.
  const remote = commonsImageUrl(record);
  if (!remote) return { imageUrl: null };
  try {
    const res = await fetch(remote, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = String(res.headers.get('content-type') || '');
    if (!type.startsWith('image/')) throw new Error(`kein Bild: ${type}`);
    const ext = type.includes('png') ? '.png' : type.includes('svg') ? '.svg' : '.jpg';
    const dir = resolve(DIST, 'public', 'profile-images');
    mkdirSync(dir, { recursive: true });
    const file = `${slug}${ext}`;
    writeFileSync(resolve(dir, file), Buffer.from(await res.arrayBuffer()));
    return { imageUrl: `/public/profile-images/${file}` };
  } catch (error) {
    console.warn(`merge-pipeline-published: Bild-Mirror fuer '${slug}' fehlgeschlagen (${error.message}) — nutze Commons-URL.`);
    return { imageUrl: remote };
  }
}

function absoluteUrl(url) {
  return url && url.startsWith('/') ? `${HOST}${url}` : url;
}

function cardDescription(record) {
  // Die Start-Liste der App filtert Profile mit description < 40 Zeichen
  // (isCompletePublicProfile in App.tsx). Wikidata-Kurzbeschreibungen wie
  // 'deutscher Mathematiker' (22 Zeichen) fielen dadurch aus der Liste
  // (Befund 2026-07-03: 4 von 8 Pipeline-Profilen unsichtbar).
  // Deterministisch anreichern, kuratierte Profile bleiben unberuehrt.
  const base = String(record.description || record.category || '').replace(/\s+/g, ' ').trim();
  if (base.length >= 40) return base;
  const years = record.birth_date && record.death_date
    ? `${String(record.birth_date).slice(0, 4)}–${String(record.death_date).slice(0, 4)}`
    : '';
  const withYears = base && years && !base.includes(years) ? `${base} (${years})` : base;
  const suffix = 'Historisches KI-Profil mit dokumentierten Quellen.';
  return withYears ? `${withYears} — ${suffix}` : suffix;
}

function toPublicTwinProfile(record, imageUrl) {
  const publishedAt = Date.parse(record.published_at || '') || Date.now();
  const description = cardDescription(record);
  const seo = record.seo || {};
  return {
    id: `pipeline-${record.slug}`,
    name: record.name,
    slug: record.slug,
    description,
    imageUrl,
    imageCredit: imageUrl ? 'Bild: Wikimedia Commons (lizenzgeprueft, PD/CC)' : undefined,
    categories: [record.category].filter(Boolean),
    languages: [record.language_default || 'de'],
    visibility: 'public',
    style: 'neutral',
    status: 'ready',
    url: `${HOST}/t/${record.slug}`,
    chatPath: `/twin-chat?twin=${encodeURIComponent(record.slug)}`,
    uploadedContents: [
      { category: 'Profilbild', count: imageUrl ? 1 : 0 },
      { category: 'Wissensprofil', count: 1 },
    ],
    mediaCount: imageUrl ? 1 : 0,
    knowledgeCount: 1,
    contextSummary: `${record.name}: ${description}`,
    guardrail:
      record.ai_disclosure ||
      'Historisches, kuratiertes KI-Profil. Es simuliert nicht die echte Person, sondern nutzt öffentliches Wissen, Denkstil und Quellenhinweise.',
    rightsPosture:
      'Autopilot-Pipeline: Quellen dokumentiert, Vier-Stufen-Risiko-Check und QA bestanden, menschlich freigegeben.',
    mainCategory: record.category || '',
    birthDate: record.birth_date || undefined,
    deathDate: record.death_date || undefined,
    birthYear: record.birth_date ? Number(String(record.birth_date).slice(0, 4)) : undefined,
    deathYear: record.death_date ? Number(String(record.death_date).slice(0, 4)) : undefined,
    birthLabel: record.birth_date || '',
    deathLabel: record.death_date || '',
    exampleQuestions: [],
    searchIndex: [record.name, record.slug, record.category, description].filter(Boolean).join(' '),
    sources: record.sources || [],
    quality: imageUrl
      ? { ok: true, issues: [] }
      : { ok: false, issues: ['missing_profile_image'] },
    createdAt: publishedAt,
    updatedAt: publishedAt,
    seo: {
      title: seo.title || `${record.name} KI-Profil | smyst.com`,
      description: seo.description || description,
      canonical: seo.canonical || `${HOST}/t/${record.slug}`,
      robots: 'index,follow',
      schema: seo.json_ld || {},
    },
  };
}

function renderPage(profile) {
  const pageUrl = `${HOST}/t/${profile.slug}`;
  const title = `${profile.name} – KI-Profil & Chat | smyst.com`;
  const description = truncate(
    `${profile.name} (${profile.mainCategory}) als KI-Profil auf smyst.com: ${profile.description}`,
    158,
  );
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${profile.name} – KI-Profil auf smyst.com`,
    url: pageUrl,
    inLanguage: 'de',
    isPartOf: { '@type': 'WebSite', name: 'smyst.com', url: `${HOST}/` },
    mainEntity: {
      '@type': 'Person',
      name: profile.name,
      description: profile.description,
      ...(profile.birthDate ? { birthDate: profile.birthDate } : {}),
      ...(profile.deathDate ? { deathDate: profile.deathDate } : {}),
      ...(profile.imageUrl ? { image: absoluteUrl(profile.imageUrl) } : {}),
    },
    disambiguatingDescription:
      `KI-Profil (digitaler KI-Zwilling) von ${profile.name} auf smyst.com. Historisches, verstorbenes Vorbild; keine echte Person und keine authentischen Aussagen der historischen Person.`,
  });

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${pageUrl}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${pageUrl}$2`);
  if (profile.imageUrl) {
    html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapeAttr(absoluteUrl(profile.imageUrl))}$2`);
    html = html.replace(
      /(<meta property="og:image:alt" content=")[^"]*(")/,
      `$1${escapeAttr(`${profile.name} – KI-Profil auf smyst.com`)}$2`,
    );
  }
  html = html.replace(
    '</head>',
    `<script type="application/ld+json" id="smyst-profile-schema">${jsonLd}</script></head>`,
  );
  return html;
}

let merged = 0;
const newUrls = [];
for (const record of eligible) {
  if (takenSlugs.has(record.slug)) {
    console.log(`merge-pipeline-published: Slug '${record.slug}' existiert bereits (kuratiert) — uebersprungen.`);
    continue;
  }
  const image = await mirrorCommonsImage(record, record.slug);
  const profile = toPublicTwinProfile(record, image.imageUrl);
  twins.push(profile);
  takenSlugs.add(record.slug);

  const apiDir = resolve(DIST, 'api', 'public', 'twins', profile.slug);
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(resolve(apiDir, 'index.html'), JSON.stringify({ twin: profile }), 'utf8');

  const pageDir = resolve(DIST, 't', profile.slug);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(resolve(pageDir, 'index.html'), renderPage(profile), 'utf8');

  newUrls.push(`${HOST}/t/${profile.slug}`);
  merged += 1;
}

writeFileSync(apiIndexPath, JSON.stringify({ twins }), 'utf8');

const sitemapPath = resolve(DIST, 'sitemap.xml');
if (merged > 0 && existsSync(sitemapPath)) {
  const today = new Date().toISOString().split('T')[0];
  const blocks = newUrls
    .map(
      (loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`,
    )
    .join('');
  const sitemap = readFileSync(sitemapPath, 'utf8').replace('</urlset>', `${blocks}</urlset>`);
  writeFileSync(sitemapPath, sitemap, 'utf8');
}

console.log(
  `merge-pipeline-published: ${merged} Pipeline-Profil(e) gemergt (API gesamt: ${twins.length}); Sitemap ergaenzt: ${merged > 0}.`,
);
