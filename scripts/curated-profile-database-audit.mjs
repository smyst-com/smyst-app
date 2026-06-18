import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const accountId = '477794df69f0b6a0b9e4c59e36883c1f';
const metadataNamespaceId = '24a718c1c31248779add893b93fd4152';
const tokenFile = process.env.SMYST_CF_TOKEN_FILE || '/private/tmp/smyst_cf_token';
const canonicalHost = (process.env.SMYST_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const bundledData = '/private/tmp/smyst-curated-public-twin-data-audit.mjs';
const expectedVisibleProfileCount = 100;

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
  CURATED_PUBLIC_TWIN_SPECS,
  CURATED_PUBLIC_TWIN_USER,
} = await import(`${pathToFileURL(bundledData).href}?t=${Date.now()}`);

const expectedSlugs = new Set(CURATED_PUBLIC_TWIN_SPECS.map((spec) => spec.slug));
const issues = [];

if (CURATED_PUBLIC_TWIN_SPECS.length !== expectedVisibleProfileCount) {
  issues.push({
    scope: 'curated_source',
    issue: 'unexpected_curated_source_count',
    expected: expectedVisibleProfileCount,
    actual: CURATED_PUBLIC_TWIN_SPECS.length,
  });
}

for (const spec of CURATED_PUBLIC_TWIN_SPECS) {
  const specIssues = [];
  if (!spec.name?.trim()) specIssues.push('name_required');
  if (/\b(demo|fake|test|placeholder|sample)\b/i.test(spec.name || '')) specIssues.push('forbidden_profile_name');
  if (!spec.mainCategory?.trim()) specIssues.push('main_category_required');
  if (!spec.description?.trim() || spec.description.trim().length < 40) specIssues.push('description_too_short');
  if (!spec.imageFile?.trim()) specIssues.push('image_file_required');
  if (!spec.contentType?.startsWith('image/')) specIssues.push('image_content_type_required');
  if (spec.generatedPortrait) {
    if (spec.contentType !== 'image/svg+xml') specIssues.push('generated_profile_image_must_be_svg');
    if (!spec.imageFile.endsWith('.svg')) specIssues.push('generated_profile_image_file_must_be_svg');
  } else if (spec.imageFile && !existsSync(`public/public/profile-images/${spec.imageFile}`)) {
    specIssues.push('profile_image_file_missing');
  }
  const hasDateLife = Boolean(spec.birthDate && spec.deathDate);
  const hasYearLife = Number.isFinite(spec.birthYear) && Number.isFinite(spec.deathYear) && Boolean(spec.birthLabel && spec.deathLabel);
  if (!hasDateLife && !hasYearLife) specIssues.push('life_dates_required');
  if (!Array.isArray(spec.categories) || !spec.categories.length) specIssues.push('categories_required');
  if (!spec.answerStyle?.trim()) specIssues.push('answer_style_required');
  if (!spec.knowledge?.includes('kurz, direkt und sachlich')) specIssues.push('direct_answer_rule_missing');
  if (!Array.isArray(spec.sources) || !spec.sources.length) specIssues.push('sources_required');
  if (specIssues.length) issues.push({ scope: 'curated_source', slug: spec.slug, name: spec.name, issues: specIssues });
}

const liveResponse = await fetch(`${canonicalHost}/api/public/twins`, {
  headers: { accept: 'application/json' },
});
const liveBody = await liveResponse.json().catch(() => null);
const liveTwins = Array.isArray(liveBody?.twins) ? liveBody.twins : [];
const liveSlugs = new Set(liveTwins.map((twin) => twin.slug));

if (!liveResponse.ok) {
  issues.push({ scope: 'live_api', issue: 'public_twins_unreachable', status: liveResponse.status });
}
if (liveTwins.length !== expectedVisibleProfileCount) {
  issues.push({
    scope: 'live_api',
    issue: 'unexpected_visible_profile_count',
    expected: expectedVisibleProfileCount,
    actual: liveTwins.length,
  });
}
for (const slug of expectedSlugs) {
  if (!liveSlugs.has(slug)) issues.push({ scope: 'live_api', slug, issue: 'expected_profile_missing_from_live_api' });
}

let kvAudit = { checked: false, reason: 'token_file_missing' };

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({ success: false, errors: [{ message: 'invalid_json' }] }));
  if (!response.ok || payload.success === false) {
    throw new Error(`${path} failed ${response.status}: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result;
}

async function listKvKeys(prefix) {
  const result = await cf(
    `/accounts/${accountId}/storage/kv/namespaces/${metadataNamespaceId}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`,
  );
  return Array.isArray(result) ? result : [];
}

let token = '';
if (existsSync(tokenFile)) {
  token = (await readFile(tokenFile, 'utf8')).trim();
}

if (token) {
  const [publicKeys, curatedMetaKeys] = await Promise.all([
    listKvKeys('public:twin:'),
    listKvKeys(`meta:twin:${CURATED_PUBLIC_TWIN_USER}:curated-`),
  ]);
  const publicKvSlugs = new Set(publicKeys.map((key) => key.name.replace(/^public:twin:/, '')));
  const missingPublicKvSlugs = [...expectedSlugs].filter((slug) => !publicKvSlugs.has(slug));
  const unexpectedPublicKvSlugs = [...publicKvSlugs].filter((slug) => !expectedSlugs.has(slug));
  if (missingPublicKvSlugs.length) {
    issues.push({ scope: 'cloudflare_kv', issue: 'missing_public_twin_keys', slugs: missingPublicKvSlugs });
  }
  if (unexpectedPublicKvSlugs.some((slug) => /\b(demo|fake|test|placeholder|sample)\b/i.test(slug))) {
    issues.push({ scope: 'cloudflare_kv', issue: 'forbidden_public_twin_keys', slugs: unexpectedPublicKvSlugs });
  }
  kvAudit = {
    checked: true,
    publicTwinKeyCount: publicKeys.length,
    curatedMetaKeyCount: curatedMetaKeys.length,
    expectedPublicTwinKeyCount: expectedVisibleProfileCount,
    missingPublicKvSlugs,
    unexpectedPublicKvSlugs,
  };
}

console.log(JSON.stringify({
  ok: issues.length === 0,
  sourceProfileCount: CURATED_PUBLIC_TWIN_SPECS.length,
  liveVisibleProfileCount: liveTwins.length,
  kvAudit,
  issues,
}, null, 2));

if (issues.length) process.exit(1);
