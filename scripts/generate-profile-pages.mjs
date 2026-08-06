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
const DIRECT_ANSWER_GUARDRAIL =
  'Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story.';

// Bildnachweise der kuratierten Profile (Lizenz-Inventur 06.08.2026).
// Fehlt die Datei, laeuft der Build unveraendert weiter (imageCredit bleibt leer).
let CURATED_IMAGE_CREDITS = {};
try {
  CURATED_IMAGE_CREDITS = JSON.parse(
    readFileSync(resolve(__dirname, 'curated-image-credits.json'), 'utf8'),
  ).profiles || {};
} catch {
  CURATED_IMAGE_CREDITS = {};
}

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
const { CURATED_PUBLIC_TWIN_SPECS, CURATED_PUBLIC_TWIN_BASE_TIME, CURATED_PUBLIC_TWIN_LANGUAGES } = await import(pathToFileURL(bundledData).href);

if (!Array.isArray(CURATED_PUBLIC_TWIN_SPECS) || CURATED_PUBLIC_TWIN_SPECS.length !== EXPECTED_PROFILE_COUNT) {
  console.error(
    `generate-profile-pages: erwartet ${EXPECTED_PROFILE_COUNT} Profile, gefunden ${CURATED_PUBLIC_TWIN_SPECS?.length ?? 0}.`,
  );
  process.exit(1);
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sprach-SEO: pro Profil wird jede Sprache als eigene indexierbare Seite
 * erzeugt (/t/<slug> = Deutsch/kanonisch, /<lang>/t/<slug> = Uebersetzung)
 * und ueber hreflang verknuepft. Die deutschen Seiten bleiben unveraendert.
 */
const SEO_LANGS = ['de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'it', 'hi', 'id', 'bn'];
const RTL_LANGS = new Set(['ar']);

// Title-Zusatz und Beschreibungs-Vorlage pro Sprache ({name}, {cats}, {life}).
const SEO_META = {
  de: { title: 'KI-Profil & Chat', desc: null },
  en: { title: 'AI Profile & Chat', desc: '{name} ({cats}{life}) as an AI twin on smyst.com: chat directly, explore life milestones and verified sources.' },
  tr: { title: 'Yapay Zekâ Profili ve Sohbet', desc: "{name} ({cats}{life}) smyst.com'da yapay zekâ ikizi: doğrudan sohbet edin, hayat duraklarını ve doğrulanmış kaynakları keşfedin." },
  fr: { title: 'Profil IA & Chat', desc: '{name} ({cats}{life}) en jumeau IA sur smyst.com : discutez directement et découvrez les étapes de sa vie et des sources vérifiées.' },
  es: { title: 'Perfil de IA y Chat', desc: '{name} ({cats}{life}) como gemelo de IA en smyst.com: chatea directamente y descubre etapas de su vida y fuentes verificadas.' },
  pt: { title: 'Perfil de IA e Chat', desc: '{name} ({cats}{life}) como gêmeo de IA no smyst.com: converse diretamente e descubra etapas da vida e fontes verificadas.' },
  ar: { title: 'ملف ذكاء اصطناعي ودردشة', desc: '{name} ({cats}{life}) كتوأم ذكاء اصطناعي على smyst.com: تحدث مباشرة واستكشف محطات الحياة والمصادر الموثقة.' },
  zh: { title: 'AI档案与聊天', desc: '{name}({cats}{life})的AI分身。在smyst.com直接聊天,探索人生历程与已核实的来源。' },
  ja: { title: 'AIプロフィール&チャット', desc: '{name}({cats}{life})のAIツイン。smyst.comで直接チャットし、人生の歩みと確認済みの出典を探索。' },
  ko: { title: 'AI 프로필 & 채팅', desc: '{name}({cats}{life})의 AI 트윈. smyst.com에서 바로 채팅하고 인생 여정과 검증된 출처를 확인하세요.' },
  ru: { title: 'ИИ-профиль и чат', desc: '{name} ({cats}{life}) как ИИ-двойник на smyst.com: общайтесь напрямую, изучайте этапы жизни и проверенные источники.' },
  it: { title: 'Profilo IA e Chat', desc: '{name} ({cats}{life}) come gemello IA su smyst.com: chatta direttamente e scopri tappe della vita e fonti verificate.' },
  hi: { title: 'AI प्रोफ़ाइल और चैट', desc: '{name} ({cats}{life}) smyst.com पर AI ट्विन: सीधे चैट करें, जीवन के पड़ाव और सत्यापित स्रोत देखें।' },
  id: { title: 'Profil AI & Obrolan', desc: '{name} ({cats}{life}) sebagai kembaran AI di smyst.com: mengobrol langsung, jelajahi perjalanan hidup dan sumber terverifikasi.' },
  bn: { title: 'AI প্রোফাইল ও চ্যাট', desc: '{name} ({cats}{life}) smyst.com-এ AI টুইন: সরাসরি চ্যাট করুন, জীবনের ধাপ ও যাচাইকৃত উৎস দেখুন।' },
};

// Kategorie-Uebersetzungen aus den Runtime-Locales wiederverwenden.
const LOCALE_CATS = {};
for (const lang of SEO_LANGS) {
  try {
    const json = JSON.parse(readFileSync(resolve(ROOT, 'public', 'locales', `${lang}.json`), 'utf8'));
    LOCALE_CATS[lang] = json.cats ?? {};
  } catch {
    LOCALE_CATS[lang] = {};
  }
}

function profilePath(lang, slug) {
  return lang === 'de' ? `/t/${slug}` : `/${lang}/t/${slug}`;
}

function hreflangBlock(slug) {
  const links = SEO_LANGS.map(
    (lang) => `    <link rel="alternate" hreflang="${lang}" href="${HOST}${profilePath(lang, slug)}" />`,
  );
  links.push(`    <link rel="alternate" hreflang="x-default" href="${HOST}/t/${slug}" />`);
  return links.join('\n');
}

function lifeYears(spec) {
  const birth = spec.birthDate?.slice(0, 4) ?? spec.birthYear ?? '';
  const death = spec.deathDate?.slice(0, 4) ?? spec.deathYear ?? '';
  return birth && death ? `${birth}–${death}` : '';
}

function localizedCats(spec, lang) {
  const cats = LOCALE_CATS[lang] ?? {};
  return (spec.categories ?? [])
    .slice(0, 3)
    .map((category) => cats[category] ?? category)
    .join(', ');
}

function localizedDescription(spec, lang) {
  const meta = SEO_META[lang];
  const life = lifeYears(spec);
  return meta.desc
    .replace('{name}', spec.name)
    .replace('{cats}', localizedCats(spec, lang))
    .replace('{life}', life ? `, ${life}` : '');
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

function jsonLd(spec, pageUrl, imageUrl, lang = 'de') {
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
    inLanguage: lang,
    isPartOf: { '@type': 'WebSite', name: 'smyst.com', url: `${HOST}/` },
    about: person,
    mainEntity: person,
    disambiguatingDescription:
      `KI-Profil (digitaler KI-Zwilling) von ${spec.name} auf smyst.com. Historisches, verstorbenes Vorbild; keine echte Person und keine authentischen Aussagen der historischen Person.`,
  };
  return JSON.stringify(profilePage);
}

function renderPage(spec, lang = 'de') {
  const pageUrl = `${HOST}${profilePath(lang, spec.slug)}`;
  const imageUrl = spec.imageFile ? `${HOST}/public/profile-images/${spec.imageFile}` : `${HOST}/og-image.png`;
  const title = `${spec.name} – ${SEO_META[lang].title} | smyst.com`;
  const description =
    lang === 'de'
      ? truncate(
          `${spec.name} (${spec.mainCategory}${lifeLabel(spec) ? `, ${lifeLabel(spec)}` : ''}) als KI-Profil auf smyst.com: ${spec.description}`,
          158,
        )
      : truncate(localizedDescription(spec, lang), 158);

  let html = template;
  html = html.replace(
    /<html lang="[^"]*" dir="[^"]*">/,
    `<html lang="${lang}" dir="${RTL_LANGS.has(lang) ? 'rtl' : 'ltr'}">`,
  );
  // Homepage-hreflang aus dem Template durch das profil-spezifische Set ersetzen.
  html = html.replace(/[ \t]*<link rel="alternate" hreflang="[^"]+" href="[^"]*" \/>\n/g, '');
  html = html.replace(/(<link rel="canonical" href="[^"]*" \/>)/, `$1\n${hreflangBlock(spec.slug)}`);
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
    `<script type="application/ld+json" id="smyst-profile-schema">${jsonLd(spec, pageUrl, imageUrl, lang)}</script></head>`,
  );
  return html;
}

let written = 0;
for (const spec of CURATED_PUBLIC_TWIN_SPECS) {
  if (!spec.slug) continue;
  for (const lang of SEO_LANGS) {
    const dir = lang === 'de' ? resolve(DIST, 't', spec.slug) : resolve(DIST, lang, 't', spec.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'index.html'), renderPage(spec, lang), 'utf8');
    written += 1;
  }
}

const expectedPages = EXPECTED_PROFILE_COUNT * SEO_LANGS.length;
if (written !== expectedPages) {
  console.error(`generate-profile-pages: nur ${written}/${expectedPages} Seiten geschrieben.`);
  process.exit(1);
}
console.log(
  `generate-profile-pages: ${written} Profilseiten (${EXPECTED_PROFILE_COUNT} Profile × ${SEO_LANGS.length} Sprachen) unter dist/t/ und dist/<lang>/t/ erzeugt.`,
);

/**
 * Statisches Public-JSON-API (llms.txt-Vertrag: /api/public/twins/{slug}).
 * GitHub Pages liefert index.html pro Verzeichnis; der Body ist reines JSON.
 * Gleiche Datenform wie curatedPublicProfileToPublicTwinProfile in src/App.tsx.
 */
function toPublicTwinProfile(spec, index) {
  const total = CURATED_PUBLIC_TWIN_SPECS.length;
  const updatedAt = CURATED_PUBLIC_TWIN_BASE_TIME + (total - index) * 1000;
  const createdAt = CURATED_PUBLIC_TWIN_BASE_TIME - (total - index) * 1000;
  const imageUrl = spec.imageFile ? `/public/profile-images/${spec.imageFile}` : null;
  return {
    id: `curated-${spec.slug}`,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    imageUrl,
    imageCredit: CURATED_IMAGE_CREDITS[spec.slug]?.credit,
    categories: spec.categories,
    languages: CURATED_PUBLIC_TWIN_LANGUAGES,
    visibility: 'public',
    style: spec.style,
    status: 'ready',
    url: `${HOST}/t/${spec.slug}`,
    chatPath: `/twin-chat?twin=${encodeURIComponent(spec.slug)}`,
    uploadedContents: [
      { category: 'Profilbild', count: imageUrl ? 1 : 0 },
      { category: 'Wissensprofil', count: 1 },
    ],
    mediaCount: imageUrl ? 1 : 0,
    knowledgeCount: 1,
    contextSummary: `${spec.name}: ${spec.knowledge}`,
    guardrail:
      `${DIRECT_ANSWER_GUARDRAIL} Historisches, kuratiertes KI-Profil. Es simuliert nicht die echte Person, sondern nutzt öffentliches Wissen, Denkstil und Quellenhinweise.`,
    rightsPosture: spec.rightsPosture,
    mainCategory: spec.mainCategory,
    birthDate: spec.birthDate,
    deathDate: spec.deathDate,
    birthYear: spec.birthYear,
    deathYear: spec.deathYear,
    birthLabel: spec.birthLabel,
    deathLabel: spec.deathLabel,
    exampleQuestions: spec.exampleQuestions,
    searchIndex: spec.searchIndex,
    sources: spec.sources,
    milestones: spec.milestones,
    quality: { ok: Boolean(imageUrl), issues: imageUrl ? [] : ['missing_profile_image'] },
    createdAt,
    updatedAt,
    seo: {
      title: `${spec.name} KI-Profil | smyst.com`,
      description: spec.description,
      canonical: `${HOST}/t/${spec.slug}`,
      robots: 'index,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${spec.name} KI-Profil`,
        url: `${HOST}/t/${spec.slug}`,
        description: spec.description,
        inLanguage: CURATED_PUBLIC_TWIN_LANGUAGES,
        isPartOf: { '@type': 'WebSite', name: 'smyst.com', url: HOST },
      },
    },
  };
}

const profiles = CURATED_PUBLIC_TWIN_SPECS.map((spec, index) => toPublicTwinProfile(spec, index));
const apiRoot = resolve(DIST, 'api', 'public', 'twins');
mkdirSync(apiRoot, { recursive: true });
writeFileSync(resolve(apiRoot, 'index.html'), JSON.stringify({ twins: profiles }), 'utf8');
let apiWritten = 0;
for (const twin of profiles) {
  const dir = resolve(apiRoot, twin.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), JSON.stringify({ twin }), 'utf8');
  apiWritten += 1;
}
if (apiWritten !== EXPECTED_PROFILE_COUNT) {
  console.error(`generate-profile-pages: nur ${apiWritten}/${EXPECTED_PROFILE_COUNT} API-Dateien geschrieben.`);
  process.exit(1);
}
console.log(`generate-profile-pages: Public-JSON-API mit ${apiWritten} Profilen unter dist/api/public/twins/ erzeugt.`);

let aliasWritten = 0;
for (const spec of CURATED_PUBLIC_TWIN_SPECS) {
  const html = renderPage(spec);
  for (const route of ['twins', 'chat']) {
    const dir = resolve(DIST, route, spec.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'index.html'), html, 'utf8');
    aliasWritten += 1;
  }
}
console.log(`generate-profile-pages: ${aliasWritten} Legacy-/Chat-Alias-Routen erzeugt.`);
