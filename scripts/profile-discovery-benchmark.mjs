import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const outfile = '/private/tmp/smyst-profile-discovery-benchmark.mjs';
await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/profileDiscovery.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile,
  logLevel: 'silent',
});

const {
  categoryFacets,
  newProfiles,
  popularProfiles,
  rankProfiles,
  recentlyUsedProfiles,
  recommendedProfiles,
  similarProfiles,
} = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

const categories = [
  'Wissenschaft',
  'Kunst',
  'Business',
  'Gesundheit',
  'Bildung',
  'Technik',
  'Geschichte',
  'Musik',
  'Strategie',
  'Psychologie',
];
const styles = ['warm', 'direct', 'humorous', 'wise', 'neutral'];
const languages = ['de', 'en', 'tr', 'fr', 'es'];
const now = Date.now();

function makeProfiles(count) {
  return Array.from({ length: count }, (_, index) => {
    const category = categories[index % categories.length];
    const secondCategory = categories[(index * 7 + 3) % categories.length];
    const createdAt = now - (index % 90) * 86_400_000;
    const updatedAt = now - (index % 45) * 86_400_000;
    const chatCount = index % 13 === 0 ? 9 : index % 7 === 0 ? 4 : index % 5;
    return {
      id: `profile-${index}`,
      name: `KI Profil ${index} ${category}`,
      description: `Kurzes Profil fuer ${category}, ${secondCategory}, Beratung und persoenliche Antworten.`,
      role: index % 3 === 0 ? 'Öffentlich' : 'Privat',
      tone: styles[index % styles.length],
      categories: [category, secondCategory],
      languages: [languages[index % languages.length]],
      createdAt,
      updatedAt,
      manualRank: index + 1,
      knowledgeCount: index % 11,
      mediaCount: index % 6,
      chatCount,
      lastChatAt: chatCount ? now - (index % 21) * 86_400_000 : 0,
      publicProfile: index % 3 === 0,
    };
  });
}

function measure(label, fn) {
  const start = performance.now();
  const value = fn();
  return {
    label,
    ms: Number((performance.now() - start).toFixed(3)),
    resultCount: Array.isArray(value) ? value.length : 1,
  };
}

const results = [];
for (const count of [100, 1_000, 10_000]) {
  const profiles = makeProfiles(count);
  const active = profiles[Math.min(42, profiles.length - 1)] ?? null;
  results.push({
    profiles: count,
    checks: [
      measure('rank empty query', () => rankProfiles(profiles, '', 'famous')),
      measure('search exact category', () => rankProfiles(profiles, 'Wissenschaft', 'famous')),
      measure('search typo tolerant', () => rankProfiles(profiles, 'Wissenshaft', 'famous')),
      measure('category facets', () => categoryFacets(profiles, 10)),
      measure('recommended', () => recommendedProfiles(profiles, 8)),
      measure('popular', () => popularProfiles(profiles, 8)),
      measure('new', () => newProfiles(profiles, 8, now)),
      measure('recent', () => recentlyUsedProfiles(profiles, 8)),
      measure('similar', () => similarProfiles(active, profiles, 8)),
    ],
  });
}

console.log(JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), results }, null, 2));
