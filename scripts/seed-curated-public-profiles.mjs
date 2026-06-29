import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const canonicalHost = (process.env.SMYST_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const assetRoot = join(process.cwd(), 'public', 'public', 'profile-images');
const bundledData = join(tmpdir(), 'smyst-curated-public-twin-data.mjs');
const outputPath = process.env.SMYST_CURATED_PROFILE_SEED_OUT || 'data/curated-public-profiles.seed.json';

await build({
  entryPoints: ['src/data/curated-public-twin-data.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  outfile: bundledData,
  logLevel: 'silent',
});

const {
  CURATED_PUBLIC_TWIN_BASE_TIME,
  CURATED_PUBLIC_TWIN_LANGUAGES,
  CURATED_PUBLIC_TWIN_SPECS,
  CURATED_PUBLIC_TWIN_USER,
} = await import(`${pathToFileURL(bundledData).href}?t=${Date.now()}`);

async function mediaSize(spec) {
  if (spec.generatedPortrait) return spec.size ?? 0;
  const info = await stat(join(assetRoot, spec.imageFile));
  return info.size;
}

async function toProfile(spec, index) {
  const createdAt = CURATED_PUBLIC_TWIN_BASE_TIME - (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000;
  const updatedAt = CURATED_PUBLIC_TWIN_BASE_TIME + (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000;
  const imageKey = spec.generatedPortrait
    ? `public/generated-profile-images/${spec.imageFile}`
    : `public/profile-images/${spec.imageFile}`;
  const imageUrl = spec.generatedPortrait
    ? `${canonicalHost}/api/public/twin-images/${spec.slug}.svg`
    : `${canonicalHost}/${imageKey}`;
  return {
    id: `curated-${spec.slug}`,
    userSub: CURATED_PUBLIC_TWIN_USER,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    imageUrl,
    categories: spec.categories,
    languages: CURATED_PUBLIC_TWIN_LANGUAGES,
    visibility: 'public',
    style: spec.style,
    answerStyle: spec.answerStyle,
    releaseStatus: 'live-profile',
    mainCategory: spec.mainCategory,
    birthDate: spec.birthDate,
    deathDate: spec.deathDate,
    birthYear: spec.birthYear,
    deathYear: spec.deathYear,
    birthLabel: spec.birthLabel,
    deathLabel: spec.deathLabel,
    knowledgeTexts: [
      {
        id: `knowledge-${spec.slug}-core`,
        title: 'Profilgrundlage',
        text: spec.knowledge,
        createdAt,
      },
      {
        id: `knowledge-${spec.slug}-style`,
        title: 'Antwortstil',
        text: `Antwortstil: ${spec.answerStyle}. Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story. Nur die konkrete Anfrage beantworten.`,
        createdAt,
      },
    ],
    mediaRefs: [
      {
        id: `media-${spec.slug}-portrait`,
        key: imageKey,
        category: 'profile-image',
        contentType: spec.contentType,
        filename: spec.imageFile,
        size: await mediaSize(spec),
        createdAt,
      },
    ],
    contextSummary:
      `Historische Rolle: ${spec.name}. Profil: ${spec.description} Kategorien: ${spec.categories.join(', ')}. Sprachen: ${CURATED_PUBLIC_TWIN_LANGUAGES.join(', ')}. Kommunikationsstil: ${spec.style}. Antwortstil: ${spec.answerStyle}.`,
    guardrail:
      'Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story. Nicht behaupten, die echte verstorbene Person zu sein.',
    rightsPosture: spec.rightsPosture,
    sources: spec.sources,
    exampleQuestions: spec.exampleQuestions,
    searchIndex: spec.searchIndex,
    status: 'ready',
    createdAt,
    updatedAt,
  };
}

const profiles = await Promise.all(CURATED_PUBLIC_TWIN_SPECS.map(toProfile));
await mkdir(dirname(join(process.cwd(), outputPath)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ profiles }, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputPath,
  profileCount: profiles.length,
}, null, 2));
