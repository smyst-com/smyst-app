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
  ['Druck und Ruhe', 'Was soll ich tun, wenn ich zu viel Druck im Leben habe?'],
  ['Technologie', 'Wie wuerdest du ueber KI und neue Technologie denken?'],
  ['Führung und Erfolg', 'Was ist dein Rat fuer Fuehrung und Erfolg?'],
  ['Konfliktstrategie', 'Wenn du gerade General in einem Ukraine Russland Krieg waerst, wie wuerdest du fuehren?'],
  ['Geschäftsidee', 'Bewerte diese Geschaeftsidee: eine App, die lokale Experten als KI-Zwillinge verfuegbar macht.'],
  ['Geschäftsidee', 'Wenn du heute gelebt hast, welche Geschaeft hast du gemacht?'],
  ['Wetter und Klima', 'Was denkst du ueber Wetter in Laender ob die Regionen manipulieren unsere Wetter?'],
  ['Investition', 'Soll ich 20.000 Euro in dieses neue Produkt investieren?'],
  ['Einstellung', 'Wie wuerdest du entscheiden, ob ich diesen Mitarbeiter einstellen soll?'],
  ['Marketingstrategie', 'Welche Marketingstrategie wuerdest du fuer den Start empfehlen?'],
  ['Zukunftsprognose', 'Wie sieht deine Zukunftsprognose fuer diese Plattform aus?'],
  ['Persönliche Meinung', 'Was ist deine persoenliche Meinung dazu?'],
  ['Werte', 'Welche Werte sind bei dieser Entscheidung am wichtigsten?'],
  ['Risiko', 'Welches groesste Risiko uebersehe ich?'],
  ['Lernen', 'Wie sollte ich dieses Thema schneller lernen?'],
  ['Kritik', 'Was ist die haerteste Kritik an meinem Plan?'],
  ['Menschliche Wirkung', 'Welche Folgen hat das fuer Menschen, Vertrauen und Alltag?'],
];
const turkishPrompts = [
  'Çok baskı altındayım, ne yapmalıyım?',
  'Sen kimsin ve bana nasıl yardım edersin?',
  'Türkçe yazıyorum, lütfen Türkçe cevap ver.',
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
const repeatedPromptChecks = [];
for (const conversation of conversations) {
  const seenWithinProfile = new Set();
  for (const item of conversation.answers) {
    lengths.push(item.answer.length);
    const escapedProfile = conversation.profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameHits = (item.answer.match(new RegExp(escapedProfile, 'g')) ?? []).length;
    if (item.intentLabel !== 'Identität' && nameHits > 1) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'profile_name_repeated_unnecessarily', nameHits });
    }
    const profileOpening = new RegExp(`^(?:[A-Za-zÄÖÜäöüß ]{2,32}:\\s*)?${escapedProfile}(?:\\b|,)`, 'i');
    if (profileOpening.test(item.answer)) {
      issues.push({
        profile: conversation.profile,
        prompt: item.prompt,
        issue: 'profile_name_or_role_at_answer_start',
        excerpt: item.answer.slice(0, 220),
      });
    }
    if (!item.answer.includes(item.intentLabel)) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'intent_label_missing' });
    }
    if (item.intentLabel === 'Konfliktstrategie' && item.answer.includes('Technologie')) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'war_prompt_misclassified_as_technology' });
    }
    const banned = new RegExp(`(?:Ich bin ${escapedProfile}|Ich antworte als ${escapedProfile}|Als ${escapedProfile}(?:\\b|,)|${escapedProfile} wie cevap verirsem|${escapedProfile}[-\\s]Perspektive|${escapedProfile}[-\\s]Linse|Für ${escapedProfile} ist|${escapedProfile} würde sagen|${escapedProfile} wuerde sagen|${escapedProfile} meint|Aus Sicht von ${escapedProfile}|Profilperspektive|dieses Profil (?:antwortet|meint|ist|würde|wuerde)|Sachlich betrachtet|Aus der Analyse heraus)`, 'i');
    if (banned.test(item.answer)) {
      issues.push({
        profile: conversation.profile,
        prompt: item.prompt,
        issue: 'banned_role_distance_phrase',
        excerpt: item.answer.slice(0, 220),
      });
    }
    if (item.answer.length > 620) {
      issues.push({ profile: conversation.profile, prompt: item.prompt, issue: 'answer_too_long', length: item.answer.length });
    }
    if (item.answer.length < 80) {
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

  const pressurePrompt = 'Was soll ich tun, wenn ich zu viel Druck im Leben habe?';
  const profile = profiles.find((item) => item.slug === conversation.slug);
  const firstPressure = ruleBasedTwinReply(pressurePrompt, profile);
  const repeatedPressure = ruleBasedTwinReply(pressurePrompt, profile, [
    { id: 'u1', role: 'user', content: pressurePrompt, createdAt: 1 },
    { id: 'a1', role: 'assistant', content: firstPressure, createdAt: 2 },
  ]);
  repeatedPromptChecks.push({ profile: conversation.profile, firstPressure, repeatedPressure });
  if (firstPressure === repeatedPressure || repeatedPressure.includes('Ziel, Kontext, Optionen')) {
    issues.push({ profile: conversation.profile, issue: 'repeated_pressure_prompt_not_varied' });
  }
  const seededPressureA = ruleBasedTwinReply(pressurePrompt, profile, [], 'seed-a');
  const seededPressureB = ruleBasedTwinReply(pressurePrompt, profile, [], 'seed-b');
  if (seededPressureA === seededPressureB) {
    issues.push({ profile: conversation.profile, issue: 'seeded_pressure_prompt_not_varied' });
  }

  for (const turkishPrompt of turkishPrompts) {
    const answer = ruleBasedTwinReply(turkishPrompt, profile, [], 'turkish-language-check');
    const germanLeak = /\b(Ich|nicht|und|oder|Wenn|Meine|Druck und Ruhe|Ziel, Kontext|Profilperspektive|Antwortstil)\b/.test(answer);
    const turkishSignal = /(Türkçe|cevap|baskı|yardım|değil|önce|adım|yapay zeka|sakinlik)/i.test(answer);
    if (germanLeak || !turkishSignal) {
      issues.push({
        profile: conversation.profile,
        prompt: turkishPrompt,
        issue: 'turkish_prompt_not_answered_in_turkish',
        excerpt: answer.slice(0, 180),
      });
    }
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
