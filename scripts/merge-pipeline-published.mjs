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
const CORRECTIONS_FILE = resolve(__dirname, 'pipeline-profile-corrections.json');
const DIRECT_ANSWER_GUARDRAIL =
  'Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story.';
// Kuratierte Anzeige-Korrekturen (Audit 05.07.2026, Befund 5): korrigiert
// Rollen-Text und Kategorien einzelner Pipeline-Profile rein im Build.
// Fehlt die Datei oder ist sie unlesbar, aendert sich NICHTS am Verhalten.
let PROFILE_CORRECTIONS = {};
if (existsSync(CORRECTIONS_FILE)) {
  try {
    PROFILE_CORRECTIONS = JSON.parse(readFileSync(CORRECTIONS_FILE, 'utf8')).profiles || {};
  } catch (error) {
    console.warn(`merge-pipeline-published: Korrekturdatei unlesbar, wird ignoriert: ${error.message}`);
  }
}

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

function commonsFilePageUrl(record) {
  // CC-BY verlangt Namensnennung (Rechtsanalyse 2026-07-04, Abschnitt 2.4):
  // Der Link zur Commons-Dateiseite nennt Urheber, Titel und Lizenz konkret —
  // bis die Pipeline den Artist-Namen selbst mitliefert, ist die verlinkte
  // Quellseite die vollstaendige, nachpruefbare Attribution.
  const image = record.image || {};
  if (image.mode !== 'commons' || !image.commons_file) return null;
  const file = String(image.commons_file).replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}

async function fetchCommonsAttribution(files) {
  // CC-BY-Namensnennung mit KLARNAMEN (Rechtsanalyse 2026-07-04, 2.4):
  // Ein gebatchter Commons-API-Call (max. 50 Titel/Request) liefert
  // extmetadata.Artist + LicenseShortName. Fehlt die Antwort, bleibt der
  // Quellseiten-Link die Attribution — der Build scheitert dadurch NIE.
  const result = new Map();
  const list = [...new Set(files)].filter(Boolean);
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const titles = batch.map((f) => `File:${f}`).join('|');
    const url = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata&format=json&origin=*&titles=${encodeURIComponent(titles)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const page of Object.values(data?.query?.pages || {})) {
        const meta = (page?.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata) || {};
        let artist = String((meta.Artist && meta.Artist.value) || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // Commons-Platzhalter sind KEINE Urheber (z.B. 'missing name' bei
        // Hokusai-Selbstportraet) — dann bleibt der Quellseiten-Link die Attribution.
        if (/^(missing name|unknown([ -]?author)?|anonymous|anonymus|unbekannt|not provided|n\/a|none)$/i.test(artist)) {
          artist = '';
        }
        const license = String((meta.LicenseShortName && meta.LicenseShortName.value) || '').trim();
        const title = String(page?.title || '').replace(/^File:/, '').replace(/_/g, ' ');
        if (title) result.set(title, { artist, license });
      }
    } catch (error) {
      console.warn(`merge-pipeline-published: Commons-Attribution nicht ladbar (${error.message}) — Quellseiten-Link bleibt die Namensnennung.`);
    }
  }
  return result;
}

function imageCreditText(record, imageUrl, attribution) {
  if (!imageUrl) return undefined;
  const creditSource = commonsFilePageUrl(record);
  const image = record.image || {};
  const key = String(image.commons_file || '').replace(/_/g, ' ');
  const meta = attribution.get(key) || {};
  const artist = meta.artist ? truncate(meta.artist, 80) : '';
  const license = meta.license || 'lizenzgeprueft, PD/CC';
  const base = artist
    ? `Bild: ${artist} — Wikimedia Commons (${license})`
    : `Bild: Wikimedia Commons (${license})`;
  return creditSource ? `${base} — Quelle: ${creditSource}` : base;
}

async function mirrorCommonsImage(record, slug) {
  // Selbst-Hosting (Freigabe Adam King 2026-07-03): Commons-Bild wird beim
  // Build nach dist/public/profile-images/<slug>.<ext> gespiegelt und lokal
  // ausgeliefert (schneller, kein Hotlink). Bei Fehlern bleibt die gepruefte
  // Commons-URL der Fallback — der Build scheitert dadurch NIE.
  const remote = commonsImageUrl(record);
  if (!remote) return { imageUrl: null };
  try {
    let res = await fetch(remote, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status >= 500) {
      // Commons drosselt Burst-Downloads (429) — einmal geduldig wiederholen.
      await new Promise((wait) => setTimeout(wait, 5000));
      res = await fetch(remote, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    }
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

function initialsOf(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function accentColorFor(slug) {
  // Deterministische Farbwahl pro Slug — reproduzierbare Builds (Master Prompt).
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#e11d48'];
  let hash = 0;
  for (const ch of String(slug)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generatedPortrait(record, slug) {
  // Profile OHNE freies Commons-Bild bekommen ein selbst generiertes,
  // stilisiertes Portrait-Bild (Initialen + Lebensdaten) — BEWUSST kein
  // kuenstliches Gesicht (Anweisung Adam King 2026-07-04: 'keine Risiko',
  // Rechtsanalyse 2.6: keine Taeuschung). Deterministisch, kostenlos, offline.
  const accent = accentColorFor(slug);
  const initials = xmlEscape(initialsOf(record.name));
  const name = xmlEscape(truncate(record.name, 26));
  const years = record.birth_date && record.death_date
    ? `${String(record.birth_date).slice(0, 4)}–${String(record.death_date).slice(0, 4)}`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${name} – KI-Profil auf smyst.com">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="216" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3"/>
  <text x="256" y="252" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="96" fill="#ffffff" opacity="0.95">${initials}</text>
  <text x="256" y="396" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#ffffff" opacity="0.9">${name}</text>
  ${years ? `<text x="256" y="430" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#ffffff" opacity="0.65">${years}</text>` : ''}
  <text x="256" y="484" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#ffffff" opacity="0.55">KI-Profil · smyst.com · keine Fotografie</text>
</svg>
`;
  const dir = resolve(DIST, 'public', 'profile-images');
  mkdirSync(dir, { recursive: true });
  const file = `${slug}-ki-profil.svg`;
  writeFileSync(resolve(dir, file), svg, 'utf8');
  return `/public/profile-images/${file}`;
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

function toPublicTwinProfile(record, imageUrl, attribution = new Map(), generatedImage = false) {
  const publishedAt = Date.parse(record.published_at || '') || Date.now();
  const description = cardDescription(record);
  const seo = record.seo || {};
  const corr = PROFILE_CORRECTIONS[record.slug] || {};
  const baseGuardrail =
    record.ai_disclosure ||
    'Historisches, kuratiertes KI-Profil. Es simuliert nicht die echte Person, sondern nutzt öffentliches Wissen, Denkstil und Quellenhinweise.';
  return {
    id: `pipeline-${record.slug}`,
    name: record.name,
    slug: record.slug,
    description,
    imageUrl,
    imageCredit: generatedImage
      ? 'KI-generierte, stilisierte Darstellung (keine Fotografie der Person)'
      : imageCreditText(record, imageUrl, attribution),
    categories: (Array.isArray(corr.categories) && corr.categories.length ? corr.categories : [record.category]).filter(Boolean),
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
    guardrail: `${DIRECT_ANSWER_GUARDRAIL} ${baseGuardrail}`,
    rightsPosture:
      'Autopilot-Pipeline: Quellen dokumentiert, Vier-Stufen-Risiko-Check und QA bestanden, menschlich freigegeben.',
    mainCategory: corr.roles || record.category || '',
    birthDate: record.birth_date || undefined,
    deathDate: record.death_date || undefined,
    birthYear: record.birth_date ? Number(String(record.birth_date).slice(0, 4)) : undefined,
    deathYear: record.death_date ? Number(String(record.death_date).slice(0, 4)) : undefined,
    birthLabel: record.birth_label || record.birth_date || '',
    deathLabel: record.death_label || record.death_date || '',
    exampleQuestions: [],
    searchIndex: [record.name, record.slug, record.category, ...(Array.isArray(corr.categories) ? corr.categories : []), corr.roles, description].filter(Boolean).join(' '),
    sources: record.sources || [],
    quality: imageUrl
      ? { ok: true, issues: [] }
      : { ok: false, issues: ['missing_profile_image'] },
    createdAt: publishedAt,
    updatedAt: publishedAt,
    seo: {
      title: seo.title || `${record.name} KI-Profil | smyst.com`,
      description: seo.description || description,
      canonical: `${HOST}/t/${record.slug}`,
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
const attribution = await fetchCommonsAttribution(
  eligible.map((record) => ((record.image || {}).mode === 'commons' ? (record.image || {}).commons_file : null)),
);
for (const record of eligible) {
  if (takenSlugs.has(record.slug)) {
    console.log(`merge-pipeline-published: Slug '${record.slug}' existiert bereits (kuratiert) — uebersprungen.`);
    continue;
  }
  const image = await mirrorCommonsImage(record, record.slug);
  let imageUrl = image.imageUrl;
  let generatedImage = false;
  if (!imageUrl) {
    imageUrl = generatedPortrait(record, record.slug);
    generatedImage = true;
  }
  const profile = toPublicTwinProfile(record, imageUrl, attribution, generatedImage);
  twins.push(profile);
  takenSlugs.add(record.slug);

  const apiDir = resolve(DIST, 'api', 'public', 'twins', profile.slug);
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(resolve(apiDir, 'index.html'), JSON.stringify({ twin: profile }), 'utf8');

  const pageDir = resolve(DIST, 't', profile.slug);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(resolve(pageDir, 'index.html'), renderPage(profile), 'utf8');

  for (const aliasRoute of ['twins', 'chat']) {
    const aliasDir = resolve(DIST, aliasRoute, profile.slug);
    mkdirSync(aliasDir, { recursive: true });
    writeFileSync(resolve(aliasDir, 'index.html'), renderPage(profile), 'utf8');
  }

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
