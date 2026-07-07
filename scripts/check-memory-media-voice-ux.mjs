import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`FAILED memory media voice UX check: ${message}`);
  process.exit(1);
}

function requireIncludes(source, expected, label) {
  if (!source.includes(expected)) fail(`${label} missing: ${expected}`);
}

function requireAbsent(source, forbidden, label) {
  if (source.includes(forbidden)) fail(`${label} must stay absent: ${forbidden}`);
}

const app = readFileSync('src/App.tsx', 'utf8');
const voiceCard = readFileSync('src/components/UserVoiceCard.tsx', 'utf8');
const storageApi = readFileSync('backend/app/api/v1/routes/storage.py', 'utf8');

requireIncludes(storageApi, '@router.get("/uploads")', 'private upload library endpoint');
requireIncludes(storageApi, 'DOWNLOAD_URL_TTL_SECONDS', 'fresh signed download URL');
requireIncludes(storageApi, '"deleteLocked": True', 'upload delete lock signal');
requireIncludes(storageApi, '"visibility": "private"', 'private upload visibility');

requireIncludes(app, 'Meine Memory-Mediathek', 'memory library heading');
requireIncludes(app, '<MemoryMediaPreview file={file} />', 'media preview component use');
requireIncludes(app, '<video src={file.getUrl} controls preload="metadata"', 'video player preview');
requireIncludes(app, '<audio controls src={file.getUrl}', 'audio player preview');
requireIncludes(app, 'Für Twin bereit', 'twin-ready upload state');
requireIncludes(app, 'Aus Ansicht ausblenden', 'non-destructive hide action');
requireIncludes(app, 'Kein Direkt-Löschen', 'delete safety label');
requireIncludes(app, "fetchService('/storage/uploads?limit=100'", 'server-backed upload reload');
requireIncludes(app, 'MEMORY_LIBRARY_STORAGE_KEY', 'local upload library fallback');
requireIncludes(app, '<UserVoiceCard />', 'voice card on memory upload surface');
requireIncludes(app, 'private Stimmprobe aufnehmen', 'logged-out voice setup hint');
requireAbsent(app, 'Datei endgültig löschen', 'prominent destructive upload action');

requireIncludes(voiceCard, 'Stimmprobe', 'voice sample status');
requireIncludes(voiceCard, 'nur eigene Twins', 'voice scope clarity');
requireIncludes(voiceCard, 'wird nicht öffentlich', 'voice privacy copy');
requireIncludes(voiceCard, 'Zustimmung widerrufen', 'voice consent revoke');

console.log('memory media voice UX validation passed');
