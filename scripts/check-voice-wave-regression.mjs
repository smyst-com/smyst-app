import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const language = readFileSync(resolve(root, 'src/lib/voiceLanguage.ts'), 'utf8');
const profiles = readFileSync(resolve(root, 'src/lib/voiceProfiles.ts'), 'utf8');
const serverAsr = readFileSync(resolve(root, 'src/lib/serverAsrClient.ts'), 'utf8');
const ttsClient = readFileSync(resolve(root, 'src/lib/ttsClient.ts'), 'utf8');
const api = readFileSync(resolve(root, 'src/lib/useTwinMvp.ts'), 'utf8');
const backendAsr = readFileSync(resolve(root, 'backend/app/api/v1/routes/asr.py'), 'utf8');
const backendTts = readFileSync(resolve(root, 'backend/app/api/v1/routes/tts.py'), 'utf8');
const voiceWorker = readFileSync(resolve(root, 'voice-worker/app.py'), 'utf8');
const voiceWorkerDockerfile = readFileSync(resolve(root, 'voice-worker/Dockerfile'), 'utf8');
const voiceWorkerDeploy = readFileSync(resolve(root, '.github/workflows/voice-worker-deploy.yml'), 'utf8');
const voiceWorkerDeployScript = readFileSync(resolve(root, 'scripts/deploy-salad-voice-worker.mjs'), 'utf8');
const voiceQa = readFileSync(resolve(root, 'qa/voice_qa_daily.py'), 'utf8');

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
requireIncludes(language, '/[ğışİĞŞ]/', 'Turkish character detection');
requireIncludes(language, '/[\\u0980-\\u09ff]/', 'Bengali script detection');
requireIncludes(language, '/[\\u0900-\\u097f]/', 'Hindi script detection');

requireIncludes(profiles, "import { detectVoiceLanguage } from '@/lib/voiceLanguage'", 'TTS text language resolver uses shared detector');
requireIncludes(profiles, 'return detectVoiceLanguage(sample)', 'voiceProfiles 15-language text detection');

requireAtLeast(app, /const \[lastVoiceLang, setLastVoiceLangState\]/g, 2, 'voice language state in both chat surfaces');
requireAtLeast(app, /detectVoiceLanguage\(/g, 4, 'voice language detection callsites');
requireAtLeast(app, /speechLangFor\(lastVoiceLangRef\.current \|\| lang\)/g, 2, 'ASR locale binding');
requireAtLeast(app, /voiceLanguageInstruction\(/g, 2, 'LLM language instruction callsites');
requireAtLeast(app, /sendTwinMessageStream\(nextChatId, messageForModel/g, 2, 'streaming chat uses language-bound message');
requireAtLeast(app, /messageVoiceLang/g, 8, 'per-turn language is reused for chat, TTS and fallback');
requireAtLeast(app, /startServerAsrDictation\(options\)/g, 2, 'server ASR fallback in both chat surfaces');
requireAtLeast(app, /recordAndTranscribeOnce\(speechLangFor\(lastVoiceLangRef\.current \|\| lang\)/g, 2, 'server ASR uses current voice language');
requireAtLeast(app, /staticPublicTwinReply\(/g, 3, 'static fallback reply used in both chat surfaces');
requireIncludes(app, 'responseLang: VoiceLang', 'static fallback reply is language-bound');

requireAtLeast(app, /startSentenceSpeech\(/g, 2, 'sentence-streaming TTS in both chat surfaces');
requireAtLeast(app, /liveSpeech\?\.feed\(partial\)/g, 2, 'chat stream feeds sentence TTS queue');
requireAtLeast(app, /liveSpeech\?\.cancel\(\)/g, 2, 'chat error path cancels sentence TTS queue');
requireIncludes(ttsClient, 'export function startSentenceSpeech', 'ttsClient exposes sentence-level streaming TTS');
requireIncludes(ttsClient, 'activeSentenceQueue', 'stopRemoteSpeech cancels the sentence queue');
requireIncludes(ttsClient, 'function nextSentenceEnd', 'ttsClient sentence boundary detection');
requireIncludes(api, 'language?: string', 'optional chat message language parameter');
requireIncludes(api, 'JSON.stringify({ chatId, message, language })', 'chat API sends detected language');

requireIncludes(serverAsr, "fetchService('/api/asr/transcribe'", 'frontend server ASR endpoint');
requireIncludes(serverAsr, 'MediaRecorder', 'browser audio recording fallback');
requireIncludes(serverAsr, 'echoCancellation: true', 'echo cancellation for live voice fallback');
requireIncludes(serverAsr, 'SILENCE_STOP_MS', 'server ASR stops after natural pause');
requireIncludes(serverAsr, 'getFloatTimeDomainData', 'server ASR uses microphone level for pause detection');

for (const lang of requiredLanguages) {
  requireIncludes(backendAsr, `"${lang}"`, `backend ASR language ${lang}`);
  requireIncludes(voiceQa, `"${lang}"`, `voice QA language ${lang}`);
}
requireAtLeast(voiceQa, /expect_voice_prefixes/g, 15, 'voice QA active TTS smoke tests for all 15 languages');
requireIncludes(backendAsr, 'VOICE_WORKER_URL', 'ASR stays on worker layer');
requireIncludes(backendAsr, 'storage": "transient"', 'ASR status declares transient storage');
requireIncludes(backendAsr, 'audioBase64', 'ASR accepts transient encoded audio');
requireIncludes(backendTts, '_try_worker_tts', 'TTS worker fallback');
requireIncludes(backendTts, 'workerConfigured', 'TTS status exposes worker readiness');
requireIncludes(voiceWorker, '@app.post("/transcribe")', 'voice worker ASR endpoint');
requireIncludes(voiceWorker, '@app.post("/synthesize")', 'voice worker neural TTS endpoint');
requireIncludes(voiceWorker, 'faster_whisper', 'voice worker uses faster-whisper for ASR');
requireIncludes(voiceWorker, 'VOICE_WORKER_PRELOAD_ASR', 'voice worker has guarded ASR preload switch');
requireIncludes(voiceWorker, '"false"', 'voice worker ASR preload defaults to safe opt-in');
requireIncludes(voiceWorker, 'asrPreload', 'voice worker reports ASR preload status');
requireIncludes(voiceWorker, 'ESPEAK_FALLBACK_VOICES', 'voice worker Bengali fallback map');
requireIncludes(voiceWorker, '"bn": os.environ.get("ESPEAK_BENGALI_VOICE", "bn")', 'Bengali TTS fallback voice');
requireIncludes(voiceWorker, '"id": os.environ.get("ESPEAK_INDONESIAN_VOICE", "id")', 'Indonesian TTS fallback voice');
requireIncludes(voiceWorker, 'CHATTERBOX_LANGUAGE_ALIASES', 'voice worker neural language aliases');
requireIncludes(voiceWorker, '"id": "ms"', 'Indonesian uses Malay Chatterbox alias before fallback');
requireIncludes(voiceWorker, '_fallback_tts(text, lang)', 'Bengali TTS fallback callsite');
requireIncludes(voiceWorkerDockerfile, 'espeak-ng', 'voice worker image includes Bengali fallback TTS engine');
requireIncludes(voiceWorkerDeploy, 'VOICE_DEPLOY_EXPECT_BENGALI_TTS: "true"', 'voice worker deploy expects Bengali TTS feature check');
requireIncludes(voiceWorkerDeployScript, 'restarted = true', 'voice worker deploy restarts running containers');
requireIncludes(voiceWorkerDeployScript, "engine.includes('espeak-ng') || engine.includes('mms-tts')", 'voice worker deploy verifies Bengali TTS live');
requireIncludes(voiceWorkerDeployScript, "VOICE_WORKER_PRELOAD_ASR: 'true'", 'voice worker deploy preloads whisper (asr cold start fix)');
requireIncludes(voiceWorkerDeployScript, 'VOICE_DEPLOY_EXPECT_ASR_PRELOAD', 'voice worker deploy readiness verifies asr preload');
requireIncludes(voiceWorkerDeploy, 'VOICE_DEPLOY_EXPECT_ASR_PRELOAD: "true"', 'voice worker deploy workflow enables asr preload check');

console.log('voice wave regression validation passed');
