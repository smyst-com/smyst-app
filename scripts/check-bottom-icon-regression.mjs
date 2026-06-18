import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appPath = resolve('src/App.tsx');
const source = readFileSync(appPath, 'utf8');

function fail(message) {
  console.error(`FAILED bottom icon regression check: ${message}`);
  process.exit(1);
}

function count(pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function requireAtLeast(pattern, expected, label) {
  const actual = count(pattern);
  if (actual < expected) fail(`${label} expected at least ${expected}, found ${actual}`);
}

function requireAbsent(pattern, label) {
  if (pattern.test(source)) fail(`${label} must stay absent`);
}

function requireIncludes(text, label) {
  if (!source.includes(text)) fail(`${label} missing`);
}

requireAtLeast(/const handleSendButtonClick = \(\) => \{/g, 2, 'send button click guards for start and twin-chat');
requireAtLeast(/data-ready=\{canSend \? 'true' : 'false'\}/g, 2, 'send button data-ready state');
requireAtLeast(/data-ready=\{canSpeak \? 'true' : 'false'\}/g, 2, 'speaker button data-ready state');
requireAtLeast(/onClick=\{handleSendButtonClick\}/g, 2, 'send button handler');
requireAtLeast(/onClick=\{handleSpeakInput\}/g, 2, 'speaker button handler');
requireAtLeast(/onClick=\{\(\) => startDictation\(\)\}/g, 2, 'voice input handler');
requireAtLeast(/onClick=\{handleToggleLiveVoice\}/g, 2, 'live voice handler');
requireAtLeast(/speakable\?: boolean/g, 2, 'speakable message contract');
requireAtLeast(/message\.speakable !== false/g, 2, 'speaker ignores non-speakable assistant messages');

requireAbsent(/disabled=\{!canSend\}/, 'send button disabled guard');
requireAbsent(/disabled=\{!canSpeak\}/, 'speaker button disabled guard');
requireAbsent(/aria-disabled=\{!canSend\}/, 'send aria-disabled guard');
requireAbsent(/aria-disabled=\{!canSpeak\}/, 'speaker aria-disabled guard');

requireIncludes('Schreibe zuerst eine Nachricht oder füge eine Datei hinzu.', 'empty send user feedback');
requireIncludes('Noch keine Antwort zum Vorlesen vorhanden. Sende zuerst eine Nachricht.', 'empty speaker user feedback');
requireIncludes('Mikrofon ist nicht erlaubt. Bitte Browser-Berechtigung prüfen oder Nachricht eintippen.', 'microphone permission feedback');
requireIncludes('Spracheingabe konnte nicht gestartet werden. Du kannst deine Nachricht normal eintippen.', 'voice start fallback feedback');
requireIncludes('Spracheingabe wird von diesem Browser nicht unterstützt. Du kannst deine Nachricht normal eintippen.', 'voice unsupported fallback feedback');
requireAtLeast(/speakable: false/g, 2, 'twin-chat ready messages are not treated as speakable answers');
requireIncludes('Wähle zuerst ein KI-Profil aus.', 'twin-chat missing profile feedback');
requireIncludes('Antwort läuft gerade. Bitte kurz warten.', 'twin-chat pending reply feedback');

requireAtLeast(/Dateien/g, 2, 'file menu item');
requireAtLeast(/Kontakte/g, 2, 'contacts menu item');
requireAtLeast(/Standort/g, 2, 'location menu item');

console.log('bottom icon regression validation passed');
