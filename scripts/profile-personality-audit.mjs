import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const apiOutfile = '/private/tmp/smyst-api-personality-audit.mjs';
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

const dataOutfile = '/private/tmp/smyst-curated-personality-audit.mjs';
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

const auditQuestions = [
  ['Erfolg', 'Was ist Erfolg?'],
  ['Macht', 'Was ist Macht?'],
  ['Wissen', 'Was ist Wissen?'],
  ['Liebe', 'Was ist Liebe?'],
  ['Führung und Erfolg', 'Was ist Führung?'],
  ['Risiko', 'Was ist Risiko?'],
  ['Technologie', 'Was ist Technologie?'],
  ['Lebensrat', 'Was würdest du jungen Menschen raten?'],
  ['Technologie', 'Was hältst du von KI?'],
  ['Weltverbesserung', 'Wie würdest du heute die Welt verbessern?'],
];

const minimumTotalScore = 78;
const minimumDimensionScore = 70;
const now = Date.now();

const profiles = CURATED_PUBLIC_TWIN_SPECS.map((spec, index) => ({
  id: `personality-audit-${spec.slug}`,
  userSub: 'personality-audit',
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
      title: `${spec.name} Profil-DNA`,
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

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !stopWords.has(token));
}

const stopWords = new Set([
  'diese',
  'dieser',
  'dieses',
  'nicht',
  'sondern',
  'durch',
  'profil',
  'frage',
  'antwort',
  'menschen',
  'werden',
  'wirklich',
  'zuerst',
  'perspektive',
  'konkret',
  'wichtig',
  'heute',
  'heisst',
  'heißt',
  'daraus',
  'folgt',
  'blick',
]);

function uniqueCount(items) {
  return new Set(items).size;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function profileTerms(profile) {
  return new Set(tokenize([
    profile.name,
    profile.description,
    profile.mainCategory,
    profile.categories.join(' '),
    profile.answerStyle,
    profile.knowledgeTexts.map((item) => item.text).join(' '),
  ].join(' ')));
}

function styleSignals(style) {
  if (style === 'direct') return ['Priorität:', 'Kurz:', 'Ohne Umweg:', 'Entscheidend ist:', 'Zugespitzt:'];
  if (style === 'wise') return ['Ruhig betrachtet:', 'Ein Schritt zurück:', 'Bedacht gesagt:', 'Langfristig gesehen:', 'Wenn man tiefer schaut:'];
  if (style === 'neutral') return ['Sachlich betrachtet:', 'Strukturiert gesagt:', 'Aus der Analyse heraus:', 'Nüchtern geprüft:', 'In klarer Ordnung:'];
  if (style === 'humorous') return ['Seitenblick', 'Lächeln', 'spitz', 'feierlich', 'Posaune'];
  return ['Menschlich gesagt:', 'Nah am Alltag:', 'Persönlich gesprochen:', 'Mit etwas Wärme:', 'Praktisch und zugewandt:'];
}

function categoryRequiredTerms(profile) {
  const categories = `${profile.mainCategory} ${profile.categories.join(' ')}`.toLowerCase();
  const required = [];
  if (/(strategie|fuehrung|politik|geschichte|feldherr|staatsmann)/.test(categories)) {
    required.push('macht', 'strategie', 'verantwortung', 'folgen', 'ordnung');
  }
  if (/(wissenschaft|physik|mathematik|forschung)/.test(categories)) {
    required.push('wissen', 'belege', 'modell', 'evidenz', 'prüfen', 'pruefen');
  }
  if (/(technologie|ingenieur|erfinder)/.test(categories)) {
    required.push('system', 'technik', 'werkzeug', 'folgen', 'verantwortung');
  }
  if (/(literatur|kunst|musik|dichter|komponist)/.test(categories)) {
    required.push('form', 'sprache', 'wirkung', 'motiv', 'ausdruck');
  }
  if (/(philosophie|ethik|religion)/.test(categories)) {
    required.push('werte', 'tugend', 'wahrheit', 'verantwortung', 'gutes');
  }
  if (/(wirtschaft|business|marketing)/.test(categories)) {
    required.push('nutzen', 'markt', 'vertrauen', 'risiko', 'test');
  }
  return required;
}

function scoreProfile(profile, answersByQuestion, allProfilesNormalizedByQuestion) {
  const answers = answersByQuestion.map((item) => item.answer);
  const joined = answers.join(' ');
  const lowerJoined = joined.toLowerCase();
  const terms = profileTerms(profile);
  const answerTokens = tokenize(joined);
  const answerTermHits = answerTokens.filter((token) => terms.has(token)).length;
  const requiredTerms = categoryRequiredTerms(profile);
  const requiredHits = requiredTerms.filter((term) => lowerJoined.includes(term)).length;
  const styleHits = answers.filter((answer) => styleSignals(profile.style).some((signal) => answer.includes(signal))).length;
  const intentHits = answersByQuestion.filter((item) => item.answer.includes(item.intentLabel)).length;
  const nameHits = answers.filter((answer) => answer.includes(profile.name)).length;
  const uniqueOpenings = uniqueCount(answers.map((answer) => answer.split(':')[0]));
  const uniqueVocabulary = uniqueCount(answerTokens);
  const escapedProfile = profile.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bannedPattern = new RegExp(`(?:Ich antworte als ${escapedProfile}|Als ${escapedProfile}(?:\\b|,))`, 'i');
  const thirdPersonPattern = new RegExp(
    `(?:${escapedProfile}[-\\s]Perspektive|${escapedProfile}[-\\s]Linse|Für ${escapedProfile} ist|${escapedProfile} würde sagen|${escapedProfile} wuerde sagen|${escapedProfile} meint|Aus Sicht von ${escapedProfile}|Profilperspektive|dieses Profil (?:antwortet|meint|ist|würde|wuerde))`,
    'i',
  );
  const bannedHits = answers.filter((answer) => bannedPattern.test(answer) || thirdPersonPattern.test(answer)).length;
  const firstPersonHits = answers.filter((answer) => /\b(Ich|ich|mein|meine|meiner|mir|mich)\b/.test(answer)).length;
  const genericHits = answers.filter((answer) => /Ziel, Kontext, Optionen|Sobald Beschreibung|allgemein antworten/i.test(answer)).length;
  const duplicateWithinProfile = answers.length - uniqueCount(answers.map((answer) => answer.replace(profile.name, '{profile}')));

  let nearDuplicateAcrossProfiles = 0;
  for (let questionIndex = 0; questionIndex < answers.length; questionIndex += 1) {
    const normalized = normalizeAnswer(answers[questionIndex], profile.name);
    const bucket = allProfilesNormalizedByQuestion[questionIndex] ?? [];
    nearDuplicateAcrossProfiles += bucket.filter((item) => item.profile !== profile.name && jaccard(normalized.tokens, item.tokens) > 0.78).length;
  }

  const fachwissen = clampScore(55 + Math.min(30, answerTermHits * 1.8) + Math.min(15, requiredHits * 4));
  const persoenlichkeit = clampScore(52 + Math.min(24, firstPersonHits * 3) + Math.min(14, uniqueOpenings * 2) + Math.min(10, uniqueVocabulary / 10));
  const glaubwuerdigkeit = clampScore(98 - bannedHits * 22 - genericHits * 14 - duplicateWithinProfile * 8);
  const konsistenz = clampScore(62 + Math.min(30, intentHits * 3) + Math.min(8, firstPersonHits) - genericHits * 10);
  const sprachstil = clampScore(56 + Math.min(34, styleHits * 4.5) + Math.min(10, uniqueOpenings));
  const einzigartigkeit = clampScore(95 - nearDuplicateAcrossProfiles * 2.5 + Math.min(5, uniqueVocabulary / 40));
  const total = clampScore((fachwissen + persoenlichkeit + glaubwuerdigkeit + konsistenz + sprachstil + einzigartigkeit) / 6);
  const dimensions = { fachwissen, persoenlichkeit, glaubwuerdigkeit, konsistenz, sprachstil, einzigartigkeit };
  const failedDimensions = Object.entries(dimensions)
    .filter(([, score]) => score < minimumDimensionScore)
    .map(([dimension, score]) => `${dimension}:${score}`);

  return {
    profile: profile.name,
    slug: profile.slug,
    style: profile.style,
    categories: profile.categories,
    total,
    ...dimensions,
    marked: total < minimumTotalScore || failedDimensions.length > 0,
    failedDimensions,
    evidence: {
      nameHits,
      firstPersonHits,
      intentHits,
      styleHits,
      uniqueOpenings,
      uniqueVocabulary,
      bannedHits,
      genericHits,
      duplicateWithinProfile,
      nearDuplicateAcrossProfiles,
    },
    sample: answersByQuestion.slice(0, 3).map((item) => ({
      question: item.question,
      excerpt: item.answer.slice(0, 220),
    })),
  };
}

function normalizeAnswer(answer, profileName) {
  const text = answer
    .replaceAll(profileName, '{profile}')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  return { text, tokens: new Set(tokenize(text)) };
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

const startedAt = performance.now();
const answersByProfile = profiles.map((profile) => ({
  profile,
  answersByQuestion: auditQuestions.map(([intentLabel, question]) => ({
    intentLabel,
    question,
    answer: ruleBasedTwinReply(question, profile),
  })),
}));

const normalizedByQuestion = auditQuestions.map(([, question], questionIndex) =>
  answersByProfile.map(({ profile, answersByQuestion }) => ({
    profile: profile.name,
    question,
    ...normalizeAnswer(answersByQuestion[questionIndex].answer, profile.name),
  })),
);

const ranking = answersByProfile
  .map(({ profile, answersByQuestion }) => scoreProfile(profile, answersByQuestion, normalizedByQuestion))
  .sort((a, b) => b.total - a.total || a.profile.localeCompare(b.profile, 'de'));

const markedProfiles = ranking.filter((item) => item.marked);
const weakest20 = [...ranking].sort((a, b) => a.total - b.total || a.profile.localeCompare(b.profile, 'de')).slice(0, 20);
const generationMs = performance.now() - startedAt;

const improvementSuggestions = weakest20.map((item) => ({
  profile: item.profile,
  slug: item.slug,
  priority: item.failedDimensions.length ? item.failedDimensions : ['untere Rankinggruppe'],
  suggestion: [
    item.fachwissen < 82 ? 'Fachwissen mit mehr biografischen Begriffen und profiltypischen Kernwerken/-entscheidungen verdichten.' : null,
    item.persoenlichkeit < 82 ? 'Antworten stärker an persönlicher Linse, Wertkonflikt und typischen Entscheidungen ausrichten.' : null,
    item.sprachstil < 82 ? 'Mehr Stilmarker aus answerStyle nutzen, ohne länger zu werden.' : null,
    item.einzigartigkeit < 82 ? 'Austauschbare Formulierungen durch spezifische Bilder, Fachbegriffe oder Argumentationsmuster ersetzen.' : null,
  ].filter(Boolean).join(' '),
}));

const report = {
  ok: markedProfiles.length === 0,
  profileCount: profiles.length,
  questionsPerProfile: auditQuestions.length,
  answerCount: profiles.length * auditQuestions.length,
  minimumTotalScore,
  minimumDimensionScore,
  generationMs: Number(generationMs.toFixed(3)),
  avgGenerationMs: Number((generationMs / (profiles.length * auditQuestions.length)).toFixed(3)),
  markedProfileCount: markedProfiles.length,
  markedProfiles: markedProfiles.map((item) => ({
    profile: item.profile,
    slug: item.slug,
    total: item.total,
    failedDimensions: item.failedDimensions,
  })),
  ranking: ranking.map((item, index) => ({
    rank: index + 1,
    profile: item.profile,
    slug: item.slug,
    total: item.total,
    fachwissen: item.fachwissen,
    persoenlichkeit: item.persoenlichkeit,
    glaubwuerdigkeit: item.glaubwuerdigkeit,
    konsistenz: item.konsistenz,
    sprachstil: item.sprachstil,
    einzigartigkeit: item.einzigartigkeit,
  })),
  weakest20: weakest20.map((item) => ({
    profile: item.profile,
    slug: item.slug,
    total: item.total,
    fachwissen: item.fachwissen,
    persoenlichkeit: item.persoenlichkeit,
    glaubwuerdigkeit: item.glaubwuerdigkeit,
    konsistenz: item.konsistenz,
    sprachstil: item.sprachstil,
    einzigartigkeit: item.einzigartigkeit,
    failedDimensions: item.failedDimensions,
  })),
  improvementSuggestions,
  samples: ranking.slice(0, 5).map((item) => ({
    profile: item.profile,
    total: item.total,
    sample: item.sample,
  })),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
