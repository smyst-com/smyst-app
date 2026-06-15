import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const outfile = '/private/tmp/smyst-api-answer-quality.mjs';
await build({
  entryPoints: ['workers/api.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile,
  logLevel: 'silent',
});

const { ruleBasedTwinReply } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

const dataOutfile = '/private/tmp/smyst-curated-answer-quality.mjs';
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

const now = Date.now();
const prompts = [
  ['Identität', 'Wer bist du?'],
  ['Kernidee', 'Was ist deine wichtigste Idee?'],
  ['Lebensrat', 'Was würdest du einem jungen Menschen heute raten?'],
  ['Technologie', 'Wie würdest du über Technologie denken?'],
  ['Führung und Erfolg', 'Was ist dein Rat für Führung und Erfolg?'],
  ['Geschäftsidee', 'Bewerte diese Geschäftsidee: eine App, die lokale Experten als KI-Zwillinge verfügbar macht.'],
  ['Investition', 'Soll ich 20.000 Euro in dieses neue Produkt investieren?'],
  ['Einstellung', 'Wie würdest du entscheiden, ob ich diesen Mitarbeiter einstellen soll?'],
  ['Marketingstrategie', 'Welche Marketingstrategie würdest du für den Start empfehlen?'],
  ['Zukunftsprognose', 'Wie sieht deine Zukunftsprognose für diese Plattform aus?'],
  ['Persönliche Meinung', 'Was ist deine persönliche Meinung dazu?'],
];

const profiles = CURATED_PUBLIC_TWIN_SPECS.map((spec, index) => ({
  id: `quality-${spec.slug}`,
  userSub: 'quality-test',
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
const samples = profiles.map((profile) => ({
  profile: profile.name,
  categories: profile.categories,
  style: profile.style,
  answers: prompts.map(([, prompt]) => ruleBasedTwinReply(prompt, profile)),
}));
const generationMs = performance.now() - startedAt;

const duplicatePairs = [];
const duplicateOpeningPairs = [];
const missingProfileOrIntent = [];
const tooLongAnswers = [];
const tooShortAnswers = [];
for (let promptIndex = 0; promptIndex < prompts.length; promptIndex += 1) {
  const [intentLabel, prompt] = prompts[promptIndex];
  const seen = new Map();
  const seenOpenings = new Map();
  for (const sample of samples) {
    const answer = sample.answers[promptIndex];
    if (!answer.includes(sample.profile) || !answer.includes(intentLabel)) {
      missingProfileOrIntent.push([prompt, sample.profile, intentLabel]);
    }
    if (answer.length > 950) tooLongAnswers.push([prompt, sample.profile, answer.length]);
    if (answer.length < 260) tooShortAnswers.push([prompt, sample.profile, answer.length]);
    const normalized = answer.split(sample.profile).join('{profile}').replace(/\s+/g, ' ').trim();
    const opening = normalized.slice(0, 340);
    const current = seen.get(normalized);
    const currentOpening = seenOpenings.get(opening);
    if (current) duplicatePairs.push([prompt, current, sample.profile]);
    else seen.set(normalized, sample.profile);
    if (currentOpening) duplicateOpeningPairs.push([prompt, currentOpening, sample.profile]);
    else seenOpenings.set(opening, sample.profile);
  }
}

const avgLength = samples.reduce(
  (sum, sample) => sum + sample.answers.reduce((inner, answer) => inner + answer.length, 0) / sample.answers.length,
  0,
) / samples.length;

const examples = prompts.slice(0, 3).map(([intentLabel, prompt], promptIndex) => ({
  intentLabel,
  prompt,
  answers: samples.slice(0, 4).map((sample) => ({
    profile: sample.profile,
    excerpt: sample.answers[promptIndex].slice(0, 260),
  })),
}));

console.log(JSON.stringify({
  ok:
    duplicatePairs.length === 0 &&
    duplicateOpeningPairs.length === 0 &&
    missingProfileOrIntent.length === 0 &&
    tooLongAnswers.length === 0 &&
    tooShortAnswers.length === 0 &&
    avgLength <= 760,
  profileCount: profiles.length,
  promptCount: prompts.length,
  answerCount: profiles.length * prompts.length,
  generationMs: Number(generationMs.toFixed(3)),
  avgGenerationMs: Number((generationMs / (profiles.length * prompts.length)).toFixed(3)),
  duplicatePairs,
  duplicateOpeningPairs,
  missingProfileOrIntent,
  tooLongAnswers,
  tooShortAnswers,
  avgAnswerLength: Number(avgLength.toFixed(1)),
  examples,
}, null, 2));

if (
  duplicatePairs.length ||
  duplicateOpeningPairs.length ||
  missingProfileOrIntent.length ||
  tooLongAnswers.length ||
  tooShortAnswers.length ||
  avgLength > 760
) {
  process.exit(1);
}
