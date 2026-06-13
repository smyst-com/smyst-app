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

const now = Date.now();
const prompts = [
  'Bewerte diese Geschäftsidee: eine App, die lokale Experten als KI-Zwillinge verfügbar macht.',
  'Soll ich 20.000 Euro in dieses neue Produkt investieren?',
  'Wie würdest du entscheiden, ob ich diesen Mitarbeiter einstellen soll?',
  'Welche Marketingstrategie würdest du für den Start empfehlen?',
  'Wie sieht deine Zukunftsprognose für diese Plattform aus?',
  'Was ist deine persönliche Meinung dazu?',
];

const profiles = [
  ['Strategie-Coach', 'Hilft Gründern, Ideen schnell am Markt zu prüfen.', ['Business', 'Strategie'], 'direct'],
  ['Finanz-Prüferin', 'Bewertet Chancen, Risiken, Liquidität und Downside.', ['Investition', 'Finanzen'], 'neutral'],
  ['Team-Mentorin', 'Achtet auf Menschen, Rollen, Vertrauen und Entwicklung.', ['HR', 'Psychologie'], 'warm'],
  ['Marken-Stratege', 'Denkt in Positionierung, Story, Zielgruppen und Kampagnen.', ['Marketing', 'Design'], 'humorous'],
  ['Zukunftsforscher', 'Arbeitet mit Szenarien, Signalen und langfristigen Mustern.', ['Zukunft', 'Technik'], 'wise'],
  ['Produkt-Analyst', 'Reduziert komplexe Ideen auf Tests, Daten und Nutzerfeedback.', ['Produkt', 'Daten'], 'neutral'],
  ['Kreativdirektorin', 'Sucht Originalität, Ausdruck und kulturelle Resonanz.', ['Kunst', 'Design'], 'humorous'],
  ['Operations-Experte', 'Optimiert Prozesse, Kosten, Qualität und Geschwindigkeit.', ['Operations', 'Business'], 'direct'],
  ['Ethik-Berater', 'Prüft Werte, Folgen, Fairness und Verantwortung.', ['Philosophie', 'Gesellschaft'], 'wise'],
  ['Sales-Trainerin', 'Fokussiert Kundengespräche, Einwände und Abschlussklarheit.', ['Sales', 'Kommunikation'], 'direct'],
  ['Lern-Coach', 'Erklärt ruhig, strukturiert und mit Blick auf Fortschritt.', ['Bildung', 'Coaching'], 'warm'],
  ['Technik-Architekt', 'Bewertet Systeme, Skalierung, Abhängigkeiten und Fehlerbilder.', ['Technik', 'Systeme'], 'neutral'],
  ['Community-Builder', 'Denkt in Vertrauen, Beteiligung, Ritualen und Netzwerkeffekten.', ['Community', 'Marketing'], 'warm'],
  ['Risiko-Managerin', 'Sucht blinde Flecken, Grenzfälle und robuste Gegenmaßnahmen.', ['Risiko', 'Investition'], 'direct'],
  ['Story-Berater', 'Übersetzt Ideen in klare Erzählungen und merkbare Botschaften.', ['Literatur', 'Marketing'], 'humorous'],
  ['Wissenschafts-Mentor', 'Fragt nach Hypothesen, Evidenz und sauberer Methodik.', ['Wissenschaft', 'Bildung'], 'neutral'],
  ['Verhandlungscoach', 'Achtet auf Interessen, Alternativen und klare Grenzen.', ['Verhandlung', 'Business'], 'direct'],
  ['Achtsamkeits-Coach', 'Gewichtet Energie, Beziehungen und nachhaltige Entscheidungen.', ['Gesundheit', 'Psychologie'], 'wise'],
  ['Kultur-Scout', 'Erkennt Trends, Symbole und gesellschaftliche Stimmungen.', ['Kultur', 'Zukunft'], 'humorous'],
  ['Kundenforscherin', 'Hört auf Verhalten, Jobs-to-be-done und echte Kaufgründe.', ['Research', 'Produkt'], 'warm'],
].map(([name, description, categories, style], index) => ({
  id: `quality-${index}`,
  userSub: 'quality-test',
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  description,
  imageUrl: undefined,
  imageKey: undefined,
  categories,
  languages: ['de'],
  visibility: 'public',
  style,
  knowledgeTexts: [
    {
      id: `knowledge-${index}`,
      title: `${name} Arbeitsprinzip`,
      text: `${description} Das Profil antwortet mit eigener Perspektive und legt Wert auf ${categories.join(', ')}.`,
      createdAt: now,
    },
  ],
  mediaRefs: [],
  contextSummary: description,
  status: 'ready',
  createdAt: now - index * 86_400_000,
  updatedAt: now,
}));

const startedAt = performance.now();
const samples = profiles.map((profile) => ({
  profile: profile.name,
  categories: profile.categories,
  style: profile.style,
  answers: prompts.map((prompt) => ruleBasedTwinReply(prompt, profile)),
}));
const generationMs = performance.now() - startedAt;

const duplicatePairs = [];
for (let promptIndex = 0; promptIndex < prompts.length; promptIndex += 1) {
  const seen = new Map();
  for (const sample of samples) {
    const normalized = sample.answers[promptIndex].replace(sample.profile, '{profile}').replace(/\s+/g, ' ').trim();
    const current = seen.get(normalized);
    if (current) duplicatePairs.push([prompts[promptIndex], current, sample.profile]);
    else seen.set(normalized, sample.profile);
  }
}

const avgLength = samples.reduce(
  (sum, sample) => sum + sample.answers.reduce((inner, answer) => inner + answer.length, 0) / sample.answers.length,
  0,
) / samples.length;

const examples = prompts.slice(0, 3).map((prompt, promptIndex) => ({
  prompt,
  answers: samples.slice(0, 4).map((sample) => ({
    profile: sample.profile,
    excerpt: sample.answers[promptIndex].slice(0, 260),
  })),
}));

console.log(JSON.stringify({
  ok: duplicatePairs.length === 0,
  profileCount: profiles.length,
  promptCount: prompts.length,
  answerCount: profiles.length * prompts.length,
  generationMs: Number(generationMs.toFixed(3)),
  avgGenerationMs: Number((generationMs / (profiles.length * prompts.length)).toFixed(3)),
  duplicatePairs,
  avgAnswerLength: Number(avgLength.toFixed(1)),
  examples,
}, null, 2));

if (duplicatePairs.length) process.exit(1);
