const baseUrl = process.env.WEB_BASE_URL || 'https://smyst.com';
const host = baseUrl.replace(/\/$/, '');
const requestTimeoutMs = Number(process.env.PUBLIC_PROFILE_AUDIT_TIMEOUT_MS || 15000);

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

const response = await fetchWithTimeout(`${host}/api/public/twins`, {
  headers: { accept: 'application/json' },
});

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, error: 'public_profiles_unreachable' }, null, 2));
  process.exit(1);
}

const body = await response.json();
const twins = Array.isArray(body.twins) ? body.twins : [];
const issues = [];
const expectedVisibleProfileCount = 100;
const forbiddenVisibleProfilePattern = /\b(demo|fake|test|placeholder|beispiel|sample)\b/i;

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
  if (!twin.chatPath || !String(twin.chatPath).startsWith('/twin-chat?twin=')) profileIssues.push('chat_path_required');
  if (!String(twin.chatPath || '').includes(encodeURIComponent(twin.slug))) profileIssues.push('chat_path_slug_mismatch');
  if (twin.status !== 'ready') profileIssues.push('status_not_ready');
  if (profileIssues.length) {
    const blockingIssues = profileIssues.filter((issue) => issue !== 'generated_profile_image');
    if (blockingIssues.length) issues.push({ slug: twin.slug, name: twin.name, issues: blockingIssues });
  }
}

const liveEndpointIssues = [];
for (const twin of twins) {
  try {
    const endpoint = await profileEndpointOk(twin.slug);
    if (!endpoint.ok) {
      liveEndpointIssues.push({ slug: twin.slug, issue: 'profile_endpoint_failed', status: endpoint.status });
    }
  } catch (err) {
    liveEndpointIssues.push({ slug: twin.slug, issue: 'profile_endpoint_error', error: String(err) });
  }

  try {
    const image = await imageEndpointOk(twin.imageUrl);
    if (!image.ok) {
      liveEndpointIssues.push({
        slug: twin.slug,
        issue: 'profile_image_endpoint_failed',
        status: image.status,
        contentType: image.contentType,
        imageUrl: twin.imageUrl,
      });
    }
  } catch (err) {
    liveEndpointIssues.push({ slug: twin.slug, issue: 'profile_image_endpoint_error', error: String(err), imageUrl: twin.imageUrl });
  }
}

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
