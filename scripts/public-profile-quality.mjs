const baseUrl = process.env.WEB_BASE_URL || 'https://smyst.com';
const host = baseUrl.replace(/\/$/, '');
const requestTimeoutMs = Number(process.env.PUBLIC_PROFILE_AUDIT_TIMEOUT_MS || 15000);
const retryCount = Number(process.env.PUBLIC_PROFILE_AUDIT_RETRIES || 6);
const retryDelayMs = Number(process.env.PUBLIC_PROFILE_AUDIT_RETRY_DELAY_MS || 3000);
const endpointConcurrency = Number(process.env.PUBLIC_PROFILE_AUDIT_CONCURRENCY || 12);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function retryResult(check) {
  let last = { ok: false, status: 0, error: 'not_run' };
  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    try {
      last = await check();
      if (last.ok) return last;
    } catch (err) {
      last = { ok: false, status: 0, error: String(err) };
    }
    if (attempt < retryCount - 1) await delay(retryDelayMs);
  }
  return last;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function profileEndpointOk(slug) {
  const response = await fetchWithTimeout(`${host}/api/public/twins/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body = await response.json().catch(() => null);
  const twin = body?.twin;
  return { ok: Boolean(twin?.slug === slug && twin?.chatPath), status: response.status };
}

async function imageEndpointOk(imageUrl) {
  const response = await fetchWithTimeout(imageUrl, { method: 'HEAD' });
  const contentType = response.headers.get('content-type') || '';
  const ok = response.ok && contentType.toLowerCase().startsWith('image/');
  return { ok, status: response.status, contentType };
}

const response = await retryResult(async () => {
  const res = await fetchWithTimeout(`${host}/api/public/twins`, {
    headers: { accept: 'application/json' },
  });
  return { ok: res.ok, status: res.status, response: res };
});

if (!response.ok || !response.response) {
  console.error(JSON.stringify({ ok: false, status: response.status, error: 'public_profiles_unreachable' }, null, 2));
  process.exit(1);
}

const body = await response.response.json();
const twins = Array.isArray(body.twins) ? body.twins : [];
const issues = [];
const expectedVisibleProfileCount = 100;
const forbiddenVisibleProfilePattern = /\b(demo|fake|test|placeholder|beispiel|sample)\b/i;
const forbiddenGuardrailPattern = /Ich-Perspektive|direkt aus der historischen Rolle|Ich antworte als|Rollen-DNA|Sachlich betrachtet: Ich bin/i;
const requiredGuardrailPattern = /Kurz, direkt und sachlich antworten\. Kein Rollenspiel, keine Selbstbeschreibung, keine Story/i;

if (twins.length !== expectedVisibleProfileCount) {
  issues.push({
    scope: 'public_profiles',
    issues: [`expected_${expectedVisibleProfileCount}_visible_profiles`],
    actual: twins.length,
  });
}

for (const twin of twins) {
  const profileIssues = [];
  if (!String(twin.name || '').trim()) profileIssues.push('name_required');
  if (forbiddenVisibleProfilePattern.test(String(twin.name || ''))) profileIssues.push('demo_fake_or_test_name_forbidden');
  if (!String(twin.mainCategory || '').trim()) profileIssues.push('main_category_required');
  if (String(twin.description || '').trim().length < 40) profileIssues.push('description_too_short');
  if (!String(twin.imageUrl || '').trim()) profileIssues.push('profile_image_required');
  if (!String(twin.imageUrl || '').startsWith('https://smyst.com/')) profileIssues.push('profile_image_must_use_smyst_origin');
  if (String(twin.imageUrl || '').includes('/api/public/twin-images/')) profileIssues.push('generated_profile_image');
  const hasDateLife = Boolean(String(twin.birthDate || '').trim() && String(twin.deathDate || '').trim());
  const hasYearLife = Number.isFinite(twin.birthYear) && Number.isFinite(twin.deathYear) &&
    Boolean(String(twin.birthLabel || '').trim() && String(twin.deathLabel || '').trim());
  if (!hasDateLife && !hasYearLife) profileIssues.push('life_dates_required');
  if (!Array.isArray(twin.categories) || !twin.categories.some((item) => String(item).trim().length >= 2)) {
    profileIssues.push('category_required');
  }
  if (!Array.isArray(twin.languages) || !twin.languages.some((item) => String(item).trim().length >= 2)) {
    profileIssues.push('language_required');
  }
  if (!Array.isArray(twin.sources) || !twin.sources.length) profileIssues.push('sources_required');
  if (forbiddenGuardrailPattern.test(String(twin.guardrail || twin.contextSummary || ''))) {
    profileIssues.push('legacy_profile_answer_rule_forbidden');
  }
  if (!requiredGuardrailPattern.test(String(twin.guardrail || ''))) {
    profileIssues.push('direct_answer_guardrail_required');
  }
  if (!twin.chatPath || !String(twin.chatPath).startsWith('/twin-chat?twin=')) profileIssues.push('chat_path_required');
  if (!String(twin.chatPath || '').includes(encodeURIComponent(twin.slug))) profileIssues.push('chat_path_slug_mismatch');
  if (twin.status !== 'ready') profileIssues.push('status_not_ready');
  if (profileIssues.length) {
    const blockingIssues = profileIssues.filter((issue) => issue !== 'generated_profile_image');
    if (blockingIssues.length) issues.push({ slug: twin.slug, name: twin.name, issues: blockingIssues });
  }
}

const liveEndpointIssues = [];
const liveResults = await mapLimit(twins, endpointConcurrency, async (twin) => {
  const resultIssues = [];
  const endpoint = await retryResult(() => profileEndpointOk(twin.slug));
  if (!endpoint.ok) {
    resultIssues.push({ slug: twin.slug, issue: 'profile_endpoint_failed', status: endpoint.status, error: endpoint.error });
  }

  const image = await retryResult(() => imageEndpointOk(twin.imageUrl));
  if (!image.ok) {
    resultIssues.push({
      slug: twin.slug,
      issue: 'profile_image_endpoint_failed',
      status: image.status,
      contentType: image.contentType,
      error: image.error,
      imageUrl: twin.imageUrl,
    });
  }
  return resultIssues;
});
liveEndpointIssues.push(...liveResults.flat());

issues.push(...liveEndpointIssues);

const top20 = twins.slice(0, 20).map((twin) => ({
  slug: twin.slug,
  name: twin.name,
  style: twin.style,
  mainCategory: twin.mainCategory,
  categories: twin.categories,
  hasImage: Boolean(twin.imageUrl),
  hasLifeDates: Boolean((twin.birthDate && twin.deathDate) || (twin.birthLabel && twin.deathLabel)),
  chatPath: twin.chatPath,
}));
const generatedProfileImageCount = twins.filter((twin) => String(twin.imageUrl || '').includes('/api/public/twin-images/')).length;
const staticProfileImageCount = twins.length - generatedProfileImageCount;

console.log(JSON.stringify({
  ok: issues.length === 0,
  visibleProfileCount: twins.length,
  expectedVisibleProfileCount,
  staticProfileImageCount,
  generatedProfileImageCount,
  testableTop20Count: top20.length,
  blockedReason: twins.length === 0 ? 'no_visible_approved_public_profiles' : null,
  top20,
  issues,
}, null, 2));

if (issues.length) process.exit(1);
