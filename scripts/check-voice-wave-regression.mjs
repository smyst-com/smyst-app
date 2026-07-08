import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const language = readFileSync(resolve(root, 'src/lib/voiceLanguage.ts'), 'utf8');
const profiles = readFileSync(resolve(root, 'src/lib/voiceProfiles.ts'), 'utf8');
const api = readFileSync(resolve(root, 'src/lib/useTwinMvp.ts'), 'utf8');

const requiredLanguages = [
  'en',
  'zh',
  'es',
  'ar',
  'fr',
  'de',
  'pt',
  'ru',
  'tr',
  'ja',
  'ko',
  'it',
  'hi',
  'id',
  'bn',
];

function fail(message) {
  console.error(`FAILED voice wave regression check: ${message}`);
  process.exit(1);
}

function requireIncludes(source, text, label) {
  if (!source.includes(text)) fail(`${label} missing`);
}

function requireAtLeast(source, pattern, expected, label) {
  const matches = source.match(pattern);
  const actual = matches ? matches.length : 0;
  if (actual < expected) fail(`${label} expected at least ${expected}, found ${actual}`);
}

for (const lang of requiredLanguages) {
  requireIncludes(language, `'${lang}'`, `required voice language ${lang}`);
}

for (const speechLang of [
  'en-US',
  'zh-CN',
  'es-ES',
  'ar-SA',
  'fr-FR',
  'de-DE',
  'pt-BR',
  'ru-RU',
  'tr-TR',
  'ja-JP',
  'ko-KR',
  'it-IT',
  'hi-IN',
  'id-ID',
  'bn-BD',
]) {
  requireIncludes(language, speechLang, `speech locale ${speechLang}`);
}

requireIncludes(language, 'detectVoiceLanguage', 'automatic language detection');
requireIncludes(language, 'voiceLanguageInstruction', 'turn-level answer language instruction');
requireIncludes(language, 'Answer only in', 'strict answer language directive');
requireIncludes(language, "tr: 'Turkish'", 'Turkish language metadata');
requireIncludes(language, "tr: 'tr-TR'", 'Turkish ASR/TTS locale');
requireIncludes(language, '/[çğıöşüİĞŞ]/', 'Turkish character detection');
requireIncludes(language, '/[\\u0980-\\u09ff]/', 'Bengali script detection');
requireIncludes(language, '/[\\u0900-\\u097f]/', 'Hindi script detection');

requireIncludes(profiles, "import { detectVoiceLanguage } from '@/lib/voiceLanguage'", 'TTS text language resolver uses shared detector');
requireIncludes(profiles, 'return detectVoiceLanguage(sample)', 'voiceProfiles 15-language text detection');

requireAtLeast(app, /const \[lastVoiceLang, setLastVoiceLang\]/g, 2, 'voice language state in both chat surfaces');
requireAtLeast(app, /detectVoiceLanguage\(/g, 4, 'voice language detection callsites');
requireAtLeast(app, /speechLangFor\(lastVoiceLang \|\| lang\)/g, 2, 'ASR locale binding');
requireAtLeast(app, /voiceLanguageInstruction\(/g, 2, 'LLM language instruction callsites');
requireAtLeast(app, /sendTwinMessageStream\(nextChatId, messageForModel/g, 2, 'streaming chat uses language-bound message');
requireAtLeast(app, /messageVoiceLang/g, 8, 'per-turn language is reused for chat, TTS and fallback');
requireIncludes(app, 'Kısaca:', 'Turkish static fallback must stay Turkish');
requireIncludes(app, 'সংক্ষেপে:', 'Bengali static fallback must stay Bengali');

requireIncludes(api, 'language?: string', 'optional chat message language parameter');
requireIncludes(api, 'JSON.stringify({ chatId, message, language })', 'chat API sends detected language');

console.log('voice wave regression validation passed');
