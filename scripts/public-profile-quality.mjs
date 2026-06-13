const baseUrl = process.env.WEB_BASE_URL || 'https://smyst.com';
const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/public/twins`, {
  headers: { accept: 'application/json' },
});

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, error: 'public_profiles_unreachable' }, null, 2));
  process.exit(1);
}

const body = await response.json();
const twins = Array.isArray(body.twins) ? body.twins : [];
const issues = [];

for (const twin of twins) {
  const profileIssues = [];
  if (!String(twin.name || '').trim()) profileIssues.push('name_required');
  if (String(twin.description || '').trim().length < 40) profileIssues.push('description_too_short');
  if (!String(twin.imageUrl || '').trim()) profileIssues.push('profile_image_required');
  if (!Array.isArray(twin.categories) || !twin.categories.some((item) => String(item).trim().length >= 2)) {
    profileIssues.push('category_required');
  }
  if (!Array.isArray(twin.languages) || !twin.languages.some((item) => String(item).trim().length >= 2)) {
    profileIssues.push('language_required');
  }
  if (!twin.chatPath || !String(twin.chatPath).startsWith('/twin-chat?twin=')) profileIssues.push('chat_path_required');
  if (twin.status !== 'ready') profileIssues.push('status_not_ready');
  if (profileIssues.length) {
    issues.push({ slug: twin.slug, name: twin.name, issues: profileIssues });
  }
}

const top20 = twins.slice(0, 20).map((twin) => ({
  slug: twin.slug,
  name: twin.name,
  style: twin.style,
  categories: twin.categories,
  hasImage: Boolean(twin.imageUrl),
  chatPath: twin.chatPath,
}));

console.log(JSON.stringify({
  ok: issues.length === 0,
  visibleProfileCount: twins.length,
  testableTop20Count: top20.length,
  blockedReason: twins.length === 0 ? 'no_visible_approved_public_profiles' : null,
  top20,
  issues,
}, null, 2));

if (issues.length) process.exit(1);
