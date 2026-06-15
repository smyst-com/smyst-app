import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const apiOutfile = '/private/tmp/smyst-api-conversation-quality.mjs';
await build({
  entryPoints: ['workers/api.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile: apiOutfile,
  logLevel: 'silent',
});

const { ruleBasedTwinReply } = await import(`${pathToFileURL(apiOutfile).href}?t=${Date.now()}`);

const dataOutfile = '/private/tmp/smyst-curated-conversation-data.mjs';
await build({
  entryPoints: ['workers/curated-public-twin-data.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  outfile: dataOutfile,
  logLevel: 'silent',
});

const { CURATED_PUBLIC_TWIN_LANGUAGES, CURATED_PUBLIC_TWIN_SPECS } = await import(
  `${pathToFileURL(dataOutfile).href}?t=${Date.now()}`
);

const prompts = [
  ['Identität', 'Wer bist du, und wobei kannst du mir helfen?'],
  ['Kernidee', 'Was ist deine wichtigste Idee fuer heutige Entscheidungen?'],
  ['Lebensrat', 'Was wuerdest du einem jungen Menschen heute raten?'],
  ['Technologie', 'Wie wuerdest du ueber KI und neue Technologie denken?'],
  ['Führung und Erfolg', 'Was ist dein Rat fuer Fuehrung und Erfolg?'],
  ['Geschäftsidee', 'Bewerte diese Geschaeftsidee: eine App, die lokale Experten als KI-Zwillinge verfuegbar macht.'],
  ['Geschäftsidee', 'Wenn du heute gelebt hast, welche Geschaeft hast du gemacht?'],
  ['Investition', 'Soll ich 20.000 Euro in dieses neue Produkt investieren?'],
  ['Marketingstrategie', 'Welche Marketingstrategie wuerdest du fuer den Start empfehlen?'],
];

const now = Date.now();
const profiles = CURATED_PUBLIC_TWIN_SPECS.map((spec, index) => ({
  id: `conversation-${spec.slug}`,
  userSub: 'conversation-test',
  name: spec.name,
  slug: spec.slug,
  description: spec.description,
  imageUrl: undefined,
  imageKey: undefined,
  categories: spec.categories,
  languages: CURATED_PUBLIC_TWIN_LANGUAGES,
  visibility: 'public',
  style: spec.style,
  answerStyle: spec.answerStyle,
  mainCategory: spec.mainCategory,
  knowledgeTexts: [
    {
      id: `knowledge-${index}`,
      title: `${spec.name} Profilgrundlage`,
      text: spec.knowledge,
      createdAt: now,
    },
  ],
  mediaRefs: [],
  contextSummary: spec.description,
  status: 'ready',
  createdAt: now - index * 86_400_000,
  updatedAt: now,
}));

const startedAt = performance.now();
const conversations = profiles.map((profile) => ({
  profile: profile.name,
  slug: profile.slug,
  style: profile.style,
  answers: prompts.map(([intentLabel, prompt]) => ({
    intentLabel,
    prompt,
    answer: ruleBasedTwinReply(prompt, profile),
  })),
}));
const generationMs = performance.now() - startedAt;

const issues = [];
const lengths = [];
const openingBuckets = new Map();
for (const conversation of conversations) {
  const seenWithinProfile = new Set();
  for (const item of conversation.answers) {
    lengths.push(item.answer.length);
    if (!item.answer.includes(conversation.profile)) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'profile_name_missing' });
    }
    if (!item.answer.includes(item.intentLabel)) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'intent_label_missing' });
    }
    if (item.answer.length > 760) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'answer_too_long', length: item.answer.length });
    }
    if (item.answer.length < 180) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'answer_too_short', length: item.answer.length });
    }
    const normalized = item.answer
      .split(conversation.profile)
      .join('{profile}')
      .replace(/\s+/g, ' ')
      .trim();
    if (seenWithinProfile.has(normalized)) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'duplicate_answer_within_profile' });
    }
    seenWithinProfile.add(normalized);
    const opening = normalized.split(':')[0] ?? '';
    const bucketKey = `${conversation.style}:${opening}`;
    openingBuckets.set(bucketKey, (openingBuckets.get(bucketKey) ?? 0) + 1);
  }
}

const repeatedOpenings = [...openingBuckets.entries()]
  .filter(([, count]) => count > Math.ceil(conversations.length * prompts.length * 0.08))
  .map(([opening, count]) => ({ opening, count }));
if (repeatedOpenings.length) {
  issues.push({ issue: 'opening_repetition_too_high', repeatedOpenings });
}

const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
const minLength = Math.min(...lengths);
const maxLength = Math.max(...lengths);

const report = {
  ok: issues.length === 0,
  profileCount: profiles.length,
  promptsPerProfile: prompts.length,
  answerCount: profiles.length * prompts.length,
  generationMs: Number(generationMs.toFixed(3)),
  avgGenerationMs: Number((generationMs / (profiles.length * prompts.length)).toFixed(3)),
  avgAnswerLength: Number(avgLength.toFixed(1)),
  minAnswerLength: minLength,
  maxAnswerLength: maxLength,
  issues,
  samples: conversations.slice(0, 5).map((conversation) => ({
    profile: conversation.profile,
    style: conversation.style,
    excerpts: conversation.answers.slice(0, 3).map((item) => ({
      intentLabel: item.intentLabel,
      excerpt: item.answer.slice(0, 240),
    })),
  })),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
