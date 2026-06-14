import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const accountId = '477794df69f0b6a0b9e4c59e36883c1f';
const metadataNamespaceId = '24a718c1c31248779add893b93fd4152';
const tokenFile = process.env.SMYST_CF_TOKEN_FILE || '/private/tmp/smyst_cf_token';
const canonicalHost = (process.env.SMYST_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const token = (await readFile(tokenFile, 'utf8')).trim();
const ttlSeconds = 60 * 60 * 24 * 370;
const assetRoot = join(process.cwd(), 'public', 'public', 'profile-images');
const bundledData = '/private/tmp/smyst-curated-public-twin-data.mjs';

await build({
  entryPoints: ['workers/curated-public-twin-data.ts'],
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
        text: `Antwortstil: ${spec.answerStyle}. Nutzer sollen sofort merken, dass dieses Profil als ${spec.name} mit eigener Perspektive antwortet und nicht als generische KI.`,
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
      `${spec.name} ist ein oeffentliches digitales Twin-Profil auf smyst.com. Profil: ${spec.description} Kategorien: ${spec.categories.join(', ')}. Sprachen: ${CURATED_PUBLIC_TWIN_LANGUAGES.join(', ')}. Kommunikationsstil: ${spec.style}. Antwortstil: ${spec.answerStyle}.`,
    guardrail:
      'Antwortet als historisch inspiriertes KI-Profil. Es behauptet nicht, die echte verstorbene Person zu sein, gibt keine medizinische, rechtliche oder finanzielle Garantie und soll moderne Fakten nicht erfinden.',
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

async function cf(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { success: response.ok, raw: text };
  }
  if (!response.ok || payload.success === false) {
    throw new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result ?? payload;
}

async function kvGet(key, fallback = null) {
  const encodedKey = encodeURIComponent(key);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${metadataNamespaceId}/values/${encodedKey}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 404) return fallback;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET KV ${key} failed ${response.status}: ${text}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function kvPut(key, value) {
  const encodedKey = encodeURIComponent(key);
  await cf(
    `/accounts/${accountId}/storage/kv/namespaces/${metadataNamespaceId}/values/${encodedKey}?expiration_ttl=${ttlSeconds}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    },
  );
}

const indexKey = `meta:twins:${CURATED_PUBLIC_TWIN_USER}`;
const currentIndex = await kvGet(indexKey, []);
const curatedIds = new Set(profiles.map((profile) => profile.id));
const retainedIndex = (Array.isArray(currentIndex) ? currentIndex : []).filter((id) => !curatedIds.has(id));

for (const profile of profiles) {
  await kvPut(`meta:twin:${profile.userSub}:${profile.id}`, profile);
  await kvPut(`public:twin:${profile.slug}`, { ...profile, userSub: 'public' });
}

await kvPut(indexKey, [...profiles.map((profile) => profile.id), ...retainedIndex].slice(0, profiles.length + retainedIndex.length));

const publicList = await fetch(`${canonicalHost}/api/public/twins`, {
  headers: { accept: 'application/json' },
});
const publicBody = await publicList.json();

console.log(
  JSON.stringify(
    {
      ok: true,
      seededCount: profiles.length,
      generatedPortraitCount: CURATED_PUBLIC_TWIN_SPECS.filter((spec) => spec.generatedPortrait).length,
      visibleProfileCount: Array.isArray(publicBody.twins) ? publicBody.twins.length : 0,
      seeded: profiles.map((profile) => ({
        name: profile.name,
        slug: profile.slug,
        visibility: profile.visibility,
        status: profile.status,
        style: profile.style,
        answerStyle: profile.answerStyle,
        imageUrl: profile.imageUrl,
      })),
      visibleProfiles: Array.isArray(publicBody.twins) ? publicBody.twins.map((profile) => profile.slug) : [],
    },
    null,
    2,
  ),
);
