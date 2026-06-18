import { execFile } from 'node:child_process';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const accountId = '477794df69f0b6a0b9e4c59e36883c1f';
const metadataNamespaceId = '24a718c1c31248779add893b93fd4152';
const tokenFile = process.env.SMYST_CF_TOKEN_FILE || '/private/tmp/smyst_cf_token';
const canonicalHost = (process.env.SMYST_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const tokenFromFile = await readFile(tokenFile, 'utf8').catch(() => '');
const token = (process.env.CLOUDFLARE_API_TOKEN || tokenFromFile).trim();
const useCloudflareApi = Boolean(token);
const ttlSeconds = 60 * 60 * 24 * 370;
const assetRoot = join(process.cwd(), 'public', 'public', 'profile-images');
const bundledData = join(tmpdir(), 'smyst-curated-public-twin-data.mjs');
const execFileAsync = promisify(execFile);

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
const kvStats = {
  written: 0,
  unchanged: 0,
  deferred: 0,
};
let kvWriteLimitReached = false;

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isCloudflareFreeLimit(status, payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return status === 429 && errors.some((error) => error?.code === 10048);
}

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
    const error = new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(payload.errors || payload)}`);
    error.cloudflareStatus = response.status;
    error.cloudflarePayload = payload;
    error.cloudflareFreeLimit = isCloudflareFreeLimit(response.status, payload);
    throw error;
  }
  return payload.result ?? payload;
}

async function wranglerKvGet(key, fallback = null) {
  const { stdout } = await execFileAsync(
    'npx',
    ['wrangler', 'kv', 'key', 'get', key, '--namespace-id', metadataNamespaceId, '--text', '--remote'],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const text = stdout.trim();
  if (text === 'Value not found') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function wranglerKvPut(key, value) {
  const valueFile = join(tmpdir(), `smyst-kv-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(valueFile, JSON.stringify(value), 'utf8');
  try {
    await execFileAsync(
      'npx',
      [
        'wrangler',
        'kv',
        'key',
        'put',
        key,
        '--namespace-id',
        metadataNamespaceId,
        '--path',
        valueFile,
        '--ttl',
        String(ttlSeconds),
        '--remote',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
  } finally {
    await rm(valueFile, { force: true });
  }
}

async function wranglerKvBulkPut(entries) {
  const valueFile = join(tmpdir(), `smyst-kv-bulk-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(valueFile, JSON.stringify(entries), 'utf8');
  try {
    await execFileAsync(
      'npx',
      ['wrangler', 'kv', 'bulk', 'put', valueFile, '--namespace-id', metadataNamespaceId, '--remote'],
      { maxBuffer: 10 * 1024 * 1024 },
    );
  } finally {
    await rm(valueFile, { force: true });
  }
}

async function kvGet(key, fallback = null) {
  if (!useCloudflareApi) return wranglerKvGet(key, fallback);

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
  if (!useCloudflareApi) {
    await wranglerKvPut(key, value);
    return;
  }

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

async function kvPutIfChanged(key, value) {
  if (kvWriteLimitReached) {
    kvStats.deferred += 1;
    return false;
  }

  const current = await kvGet(key, null);
  if (sameJson(current, value)) {
    kvStats.unchanged += 1;
    return true;
  }

  try {
    await kvPut(key, value);
    kvStats.written += 1;
    return true;
  } catch (error) {
    if (error?.cloudflareFreeLimit) {
      kvWriteLimitReached = true;
      kvStats.deferred += 1;
      return false;
    }
    throw error;
  }
}

const indexKey = `meta:twins:${CURATED_PUBLIC_TWIN_USER}`;
const currentIndex = await kvGet(indexKey, []);
const curatedIds = new Set(profiles.map((profile) => profile.id));
const retainedIndex = (Array.isArray(currentIndex) ? currentIndex : []).filter((id) => !curatedIds.has(id));
const nextIndex = [...profiles.map((profile) => profile.id), ...retainedIndex].slice(0, profiles.length + retainedIndex.length);

if (useCloudflareApi) {
  for (const profile of profiles) {
    await kvPutIfChanged(`meta:twin:${profile.userSub}:${profile.id}`, profile);
    await kvPutIfChanged(`public:twin:${profile.slug}`, { ...profile, userSub: 'public' });
  }

  await kvPutIfChanged(indexKey, nextIndex);
} else {
  const bulkEntries = [];
  for (const profile of profiles) {
    bulkEntries.push({
      key: `meta:twin:${profile.userSub}:${profile.id}`,
      value: JSON.stringify(profile),
      expiration_ttl: ttlSeconds,
    });
    bulkEntries.push({
      key: `public:twin:${profile.slug}`,
      value: JSON.stringify({ ...profile, userSub: 'public' }),
      expiration_ttl: ttlSeconds,
    });
  }
  bulkEntries.push({
    key: indexKey,
    value: JSON.stringify(nextIndex),
    expiration_ttl: ttlSeconds,
  });
  await wranglerKvBulkPut(bulkEntries);
  kvStats.written = bulkEntries.length;
}

const publicList = await fetch(`${canonicalHost}/api/public/twins`, {
  headers: { accept: 'application/json' },
});
const publicBody = await publicList.json();
const visibleTwins = Array.isArray(publicBody.twins) ? publicBody.twins : [];
const oldRule = /Ich-Perspektive|direkt aus der historischen Rolle|Ich antworte als|Rollen-DNA|Sachlich betrachtet: Ich bin/i;
const newRule = /Kurz, direkt und sachlich antworten\. Kein Rollenspiel, keine Selbstbeschreibung, keine Story/i;
const liveRuleIssues = visibleTwins
  .filter((profile) => oldRule.test(String(profile.guardrail || profile.contextSummary || '')) || !newRule.test(String(profile.guardrail || '')))
  .map((profile) => ({ slug: profile.slug, name: profile.name, guardrail: String(profile.guardrail || '').slice(0, 160) }));
const ok = visibleTwins.length === profiles.length && liveRuleIssues.length === 0;

console.log(
  JSON.stringify(
    {
      ok,
      seededCount: profiles.length,
      kvSeed: {
        status: kvWriteLimitReached ? 'deferred_cloudflare_free_limit' : 'completed',
        ...kvStats,
      },
      generatedPortraitCount: CURATED_PUBLIC_TWIN_SPECS.filter((spec) => spec.generatedPortrait).length,
      visibleProfileCount: visibleTwins.length,
      liveRuleIssueCount: liveRuleIssues.length,
      liveRuleIssues,
      seeded: profiles.map((profile) => ({
        name: profile.name,
        slug: profile.slug,
        visibility: profile.visibility,
        status: profile.status,
        style: profile.style,
        answerStyle: profile.answerStyle,
        imageUrl: profile.imageUrl,
      })),
      visibleProfiles: visibleTwins.map((profile) => profile.slug),
    },
    null,
    2,
  ),
);

if (!ok) process.exit(1);
