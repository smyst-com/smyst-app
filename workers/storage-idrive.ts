/**
 * Smyst Storage-Worker — IDrive E2 (S3-kompatibel) fuer alle Dateiobjekte
 *
 * Endpoints:
 *   POST /storage/upload-url    → erzeugt Presigned PUT URL für Direct-Upload
 *                                 (Audio/Bilder/Videos vom Browser direkt zu IDrive)
 *   POST /storage/upload-complete → markiert KV-Metadaten als hochgeladen
 *   GET  /storage/uploads       → kleine KV-Liste eigener Uploads
 *   GET  /storage/file/<key>    → signed GET redirect mit Auth-Check
 *   DELETE /storage/file/<key>  → Objektloeschung + KV-Status
 *   PUT  /storage/object        → schreibt kleine Profil-/Chat-/Memory-JSON-Objekte serverseitig nach IDrive e2
 *   GET  /storage/object/<key>  → liest eigene Profil-/Chat-/Memory-JSON-Objekte serverseitig
 *   DELETE /storage/object/<key> → loescht eigene Profil-/Chat-/Memory-JSON-Objekte serverseitig
 *
 * Sicherheit:
 *   - Alle Endpoints prüfen Session-Cookie (smyst_session) gegen SESSIONS KV
 *   - File-Keys haben User-Prefix und Kategorie-Pfade.
 *   - Presigned URLs sind 15 Minuten gültig — keine Long-Lived Tokens
 *   - Server-Side-Encryption AES-256 bei Bucket-Konfiguration (manuell in IDrive E2)
 *
 * Free-only-Regel:
 *   - Keine kostenpflichtige IDrive-e2-Nutzung erzeugen.
 *   - Uploads werden vor Erreichen der konfigurierten Free-/Trial-Quota blockiert.
 *   - IDrive e2 ist Objekt-Speicher, kein Compute-Server und keine Datenbank.
 */

import type { AuthEnv } from './auth-github';
import {
  clientKey,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
  requireDeleteConfirmation,
  requireSameOrigin,
  requireRateLimit,
  safeHandler,
  strictCorsPreflight,
  withSecurity,
} from './_shared';

export interface StorageEnv extends AuthEnv {
  /** IDrive E2 Endpoint, z. B. "https://b2x4.fra.idrivee2-31.com" */
  IDRIVE_E2_ENDPOINT: string;
  /** Bucket-Name, z. B. "smyst-memories" */
  IDRIVE_E2_BUCKET: string;
  /** Region — IDrive nutzt fixe Region-Codes wie "fra" oder "ams" */
  IDRIVE_E2_REGION: string;
  IDRIVE_E2_ACCESS_KEY: string;
  IDRIVE_E2_SECRET_KEY: string;
  /** Maximal erlaubtes Objekt in Bytes. Default: 10 MiB. */
  IDRIVE_E2_MAX_FILE_BYTES?: string;
  /** Maximal erlaubter monatlicher Upload pro User in Bytes. Default: 50 MiB. */
  IDRIVE_E2_USER_MONTHLY_BYTES?: string;
  /** Maximal erlaubter Gesamt-Upload fuer die Free-only-Phase in Bytes. Default: 1 GiB. */
  IDRIVE_E2_GLOBAL_BYTES?: string;
  /** Maximal aktiv gespeicherte Bytes pro User. Default: 100 MiB. */
  IDRIVE_E2_USER_STORAGE_BYTES?: string;
  /** Maximal aktiv gespeicherte Bytes global. Default: 1 GiB. */
  IDRIVE_E2_GLOBAL_STORAGE_BYTES?: string;
  IDRIVE_E2_MAX_IMAGE_BYTES?: string;
  IDRIVE_E2_MAX_VIDEO_BYTES?: string;
  IDRIVE_E2_MAX_AUDIO_BYTES?: string;
  IDRIVE_E2_MAX_DOCUMENT_BYTES?: string;
  IDRIVE_E2_MAX_PROFILE_IMAGE_BYTES?: string;
  IDRIVE_E2_MAX_BACKUP_BYTES?: string;
  IDRIVE_E2_MAX_TWIN_DATA_BYTES?: string;
  /** Optional getrennte KV fuer kleine Metadaten. Faellt auf SESSIONS mit Prefixes zurueck. */
  METADATA?: KVNamespace;
}

const PRESIGN_TTL_SECONDS = 60 * 15; // 15 Min
const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // harte Obergrenze pro Objekt
const DEFAULT_USER_MONTHLY_BYTES = 50 * 1024 * 1024; // 50 MiB pro User/Monat
const DEFAULT_GLOBAL_BYTES = 1024 * 1024 * 1024; // 1 GiB Gesamtbudget fuer Free-only-Phase
const DEFAULT_USER_STORAGE_BYTES = 100 * 1024 * 1024; // 100 MiB aktiv pro User
const DEFAULT_GLOBAL_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GiB aktiv global
const MAX_UPLOAD_INDEX_READS = 100;
const MAX_OBJECT_JSON_BYTES = 128 * 1024;

function allowedMethodsForStoragePath(pathname: string): string[] | null {
  if (pathname === '/storage/upload-url') return ['POST'];
  if (pathname === '/storage/upload-complete') return ['POST'];
  if (pathname === '/storage/uploads') return ['GET'];
  if (pathname === '/storage/object') return ['PUT'];
  if (pathname.startsWith('/storage/object/')) return ['GET', 'DELETE'];
  if (pathname === '/storage/account') return ['DELETE'];
  if (pathname.startsWith('/storage/file/')) return ['GET', 'DELETE'];
  return null;
}

type StorageCategory = 'audio' | 'image' | 'video' | 'document' | 'profile_image' | 'backup' | 'twin_data';

const STORAGE_CATEGORIES: ReadonlySet<StorageCategory> = new Set([
  'audio',
  'image',
  'video',
  'document',
  'profile_image',
  'backup',
  'twin_data',
]);

const CONTENT_TYPE_EXTENSIONS: Record<string, string[]> = {
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a', '.mp4'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/flac': ['.flac'],
  'audio/opus': ['.opus'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/avif': ['.avif'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md', '.markdown'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/zip': ['.zip'],
  'application/gzip': ['.gz'],
  'application/x-tar': ['.tar'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};

const CONTENT_TYPE_BY_EXTENSION = Object.entries(CONTENT_TYPE_EXTENSIONS).reduce<Record<string, string>>(
  (acc, [contentType, extensions]) => {
    for (const ext of extensions) acc[ext] = contentType;
    return acc;
  },
  {},
);

const ALLOWED_CONTENT_TYPES_BY_CATEGORY: Record<StorageCategory, ReadonlySet<string>> = {
  audio: new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/opus']),
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']),
  video: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
  document: new Set([
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]),
  profile_image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  backup: new Set(['application/json', 'application/zip', 'application/gzip', 'application/x-tar', 'text/plain']),
  twin_data: new Set(['application/json', 'text/plain', 'text/markdown']),
};

// ---------- Hex/Base64 Helpers ----------

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(s: string | Uint8Array): Promise<string> {
  const data = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  return bytesToHex(await crypto.subtle.digest('SHA-256', data));
}

async function hmacSha256Bytes(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

// ---------- AWS SigV4 ----------

interface SigV4Options {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';
  url: URL;
  region: string;
  service: 's3';
  accessKey: string;
  secretKey: string;
  /** ISO-Timestamp YYYYMMDDTHHMMSSZ — Default: jetzt. */
  amzDate?: string;
  /** Body für Signatur. Bei Presigned URL = "UNSIGNED-PAYLOAD". */
  payloadHash?: string;
  /** Headers, die in canonical request einfließen. host wird automatisch hinzugefügt. */
  headers?: Record<string, string>;
}

function isoAmzDate(d = new Date()): { dateStamp: string; amzDate: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return {
    dateStamp: `${yyyy}${mm}${dd}`,
    amzDate: `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`,
  };
}

async function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmacSha256Bytes(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256Bytes(kDate, region);
  const kService = await hmacSha256Bytes(kRegion, service);
  return await hmacSha256Bytes(kService, 'aws4_request');
}

/**
 * Erzeugt eine Presigned URL für PUT/GET.
 * Dokumentation: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */
async function presignUrl(opts: SigV4Options & { expiresIn: number }): Promise<string> {
  const { method, url, region, service, accessKey, secretKey, expiresIn } = opts;
  const { dateStamp, amzDate } = isoAmzDate();
  const credential = `${accessKey}/${dateStamp}/${region}/${service}/aws4_request`;
  const headers = Object.entries({ ...(opts.headers ?? {}), host: url.host })
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const signedHeaders = headers.map(([key]) => key).join(';');

  // Query-Parameter (in alphabetischer Reihenfolge!)
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', credential);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(expiresIn));
  url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);

  // Canonical Request
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonicalHeaders = headers.map(([key, value]) => `${key}:${value}\n`).join('');
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await deriveSigningKey(secretKey, dateStamp, region, service);
  const signature = bytesToHex(await hmacSha256Bytes(signingKey, stringToSign));

  url.searchParams.set('X-Amz-Signature', signature);
  return url.toString();
}

// ---------- Session-Auth ----------

interface SessionData {
  sub: string;
  email: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
  expiresAt: number;
}

const SESSION_COOKIE = 'smyst_session';
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

function readLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function b64urlDecodeText(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(key: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload));
  return b64urlEncode(sig);
}

async function readSignedSession(token: string, secret: string): Promise<SessionData | null> {
  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return null;
  const expected = await hmacSign(secret, `session.${payload}`);
  if (expected !== signature) return null;
  const decoded = b64urlDecodeText(payload);
  if (!decoded) return null;
  try {
    const session = JSON.parse(decoded) as SessionData;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

async function authenticate(request: Request, env: StorageEnv): Promise<SessionData | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return readSignedSession(sessionId, env.AUTH_HMAC_SECRET);
  }
  const data = (await env.SESSIONS.get(`s:${sessionId}`, 'json')) as SessionData | null;
  if (!data || data.expiresAt < Date.now()) return null;
  return data;
}

function hasPermission(session: SessionData, permission: string): boolean {
  return session.permissions?.includes(permission) ?? false;
}

// ---------- Endpoints ----------

interface UploadUrlRequest {
  contentType: string;
  /** Original-Dateiname (für Extension), optional. */
  filename?: string;
  /** Erwartete Größe in Bytes, optional aber empfohlen für Quota-Check. */
  size?: number;
  /** Zentrale Speicher-Kategorie. */
  category: StorageCategory;
  /** Pflicht fuer KI-Zwilling-Daten. */
  twinId?: string;
}

interface UploadUrlResponse {
  /** Kurzlebige Upload-ID fuer KV-Status. */
  uploadId: string;
  /** Presigned PUT URL. */
  uploadUrl: string;
  /** S3-Key relativ zum Bucket — als Referenz speichern. */
  key: string;
  /** Permanenter GET-Pfad innerhalb von Smyst. */
  getUrl: string;
  /** UTC-Zeitstempel, wann die uploadUrl ungültig wird. */
  expiresAt: number;
  /** Normalisierter Content-Type, der beim PUT exakt gesetzt werden muss. */
  contentType: string;
  /** Maximal erlaubte Groesse fuer diese Kategorie. */
  maxBytes: number;
  /** Upload-Kategorie, die fuer Pfad, Quota und Berechtigungen gilt. */
  category: StorageCategory;
  /** Phase-1 Direct-PUT unterstuetzt noch kein Multipart/Chunking. */
  supportsChunkUpload: false;
  /** Phase-1 Direct-PUT kann abgebrochene Uploads nicht bytegenau fortsetzen. */
  supportsResume: false;
}

interface UploadRecord {
  id: string;
  userSub: string;
  key: string;
  category: StorageCategory;
  contentType: string;
  filename?: string;
  twinId?: string;
  size: number;
  status: 'url_issued' | 'uploaded' | 'deleted' | 'expired';
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

interface UploadCompleteRequest {
  uploadId: string;
  key: string;
  size: number;
}

interface UploadListResponse {
  uploads: Array<Pick<UploadRecord, 'id' | 'key' | 'category' | 'contentType' | 'filename' | 'size' | 'status' | 'createdAt' | 'updatedAt'>>;
}

interface ObjectWriteRequest {
  key: string;
  value: unknown;
  contentType?: 'application/json' | 'text/plain';
}

function safePathSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
}

function userRoot(userSub: string): string {
  return safePathSegment(userSub);
}

function ownsUserKey(key: string, userSub: string): boolean {
  return key.startsWith(`users/${userRoot(userSub)}/`) || key.startsWith(`users/${userSub}/`);
}

function isManagedObjectKey(key: string, userSub: string): boolean {
  if (!ownsUserKey(key, userSub)) return false;
  const root = `users/${userRoot(userSub)}/`;
  return (
    key.startsWith(`${root}profiles/default/profile.json`) ||
    key.startsWith(`${root}profiles/default/persona.json`) ||
    key.startsWith(`${root}profiles/default/memory/`) ||
    key.startsWith(`${root}profiles/default/chats/`) ||
    key.startsWith(`${root}profiles/default/chat-summaries/`) ||
    key.startsWith(`${root}twins/`) ||
    key.startsWith(`${root}exports/`) ||
    key.startsWith(`${root}backups/`)
  );
}

function generateKey(category: StorageCategory, userSub: string, contentType: string, filename?: string, twinId?: string): string {
  const ext = chooseExtension(contentType, filename);
  const uuid = crypto.randomUUID();
  const root = `users/${userRoot(userSub)}`;
  switch (category) {
    case 'audio':
      return `${root}/uploads/audio/${uuid}${ext}`;
    case 'image':
      return `${root}/uploads/images/${uuid}${ext}`;
    case 'video':
      return `${root}/uploads/videos/${uuid}${ext}`;
    case 'document':
      return `${root}/uploads/documents/${uuid}${ext}`;
    case 'profile_image':
      return `${root}/profile/images/${uuid}${ext}`;
    case 'backup':
      return `${root}/backups/${monthKey()}/${uuid}${ext}`;
    case 'twin_data':
      return `${root}/twins/${safePathSegment(twinId ?? 'unassigned')}/data/${uuid}${ext}`;
  }
}

function extractExtension(filename: string): string {
  const m = filename.match(/\.[a-zA-Z0-9]{1,8}$/);
  return m ? m[0].toLowerCase() : '';
}

function sanitizeFilename(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return clean || undefined;
}

function chooseExtension(contentType: string, filename?: string): string {
  const allowed = CONTENT_TYPE_EXTENSIONS[contentType] ?? ['.bin'];
  const ext = filename ? extractExtension(filename) : '';
  return ext && allowed.includes(ext) ? ext : allowed[0];
}

function normalizeContentType(raw: string, filename?: string): string {
  const trimmed = raw.split(';')[0].trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') return trimmed;
  const ext = filename ? extractExtension(filename) : '';
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? trimmed;
}

function isCategory(raw: string): raw is StorageCategory {
  return STORAGE_CATEGORIES.has(raw as StorageCategory);
}

function categoryLimit(env: StorageEnv, category: StorageCategory): number {
  const fallbackByCategory: Record<StorageCategory, number> = {
    audio: 25 * 1024 * 1024,
    image: 10 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    document: 20 * 1024 * 1024,
    profile_image: 2 * 1024 * 1024,
    backup: 25 * 1024 * 1024,
    twin_data: 10 * 1024 * 1024,
  };
  const envByCategory: Record<StorageCategory, string | undefined> = {
    audio: env.IDRIVE_E2_MAX_AUDIO_BYTES,
    image: env.IDRIVE_E2_MAX_IMAGE_BYTES,
    video: env.IDRIVE_E2_MAX_VIDEO_BYTES,
    document: env.IDRIVE_E2_MAX_DOCUMENT_BYTES,
    profile_image: env.IDRIVE_E2_MAX_PROFILE_IMAGE_BYTES,
    backup: env.IDRIVE_E2_MAX_BACKUP_BYTES,
    twin_data: env.IDRIVE_E2_MAX_TWIN_DATA_BYTES,
  };
  return Math.min(
    readLimit(env.IDRIVE_E2_MAX_FILE_BYTES, DEFAULT_MAX_FILE_SIZE_BYTES),
    readLimit(envByCategory[category], fallbackByCategory[category]),
  );
}

function metadataStore(env: StorageEnv): KVNamespace {
  return env.METADATA ?? env.SESSIONS;
}

function uploadRecordKey(userSub: string, uploadId: string): string {
  return `meta:upload:${userSub}:${uploadId}`;
}

function uploadIndexKey(userSub: string): string {
  return `meta:uploads:${userSub}`;
}

async function uploadByKeyIndexKey(userSub: string, objectKey: string): Promise<string> {
  return `meta:upload-by-key:${userSub}:${await sha256Hex(objectKey)}`;
}

function storageUserKey(userSub: string): string {
  return `storage:user:${userSub}:active`;
}

function storageGlobalKey(): string {
  return 'storage:global:active';
}

async function getNumber(kv: KVNamespace, key: string): Promise<number> {
  const value = Number((await kv.get(key)) ?? '0');
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function addNumber(kv: KVNamespace, key: string, delta: number): Promise<number> {
  const next = Math.max(0, (await getNumber(kv, key)) + delta);
  await kv.put(key, String(next), { expirationTtl: 60 * 60 * 24 * 370 });
  return next;
}

async function getJson<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  const value = (await kv.get(key, 'json')) as T | null;
  return value ?? fallback;
}

async function putUploadRecord(env: StorageEnv, record: UploadRecord): Promise<void> {
  const kv = metadataStore(env);
  await kv.put(uploadRecordKey(record.userSub, record.id), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 370,
  });
  await kv.put(await uploadByKeyIndexKey(record.userSub, record.key), record.id, {
    expirationTtl: 60 * 60 * 24 * 370,
  });
}

async function addUploadToIndex(env: StorageEnv, userSub: string, uploadId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = uploadIndexKey(userSub);
  const current = await getJson<string[]>(kv, key, []);
  const next = [uploadId, ...current.filter((id) => id !== uploadId)].slice(0, 100);
  await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 370 });
}

async function findUploadRecordByKey(env: StorageEnv, userSub: string, key: string): Promise<UploadRecord | null> {
  const kv = metadataStore(env);
  const directId = await kv.get(await uploadByKeyIndexKey(userSub, key));
  if (directId) {
    const directRecord = (await kv.get(uploadRecordKey(userSub, directId), 'json')) as UploadRecord | null;
    if (directRecord?.key === key) return directRecord;
  }
  const ids = await getJson<string[]>(kv, uploadIndexKey(userSub), []);
  for (const id of ids.slice(0, MAX_UPLOAD_INDEX_READS)) {
    const record = (await kv.get(uploadRecordKey(userSub, id), 'json')) as UploadRecord | null;
    if (record?.key === key) return record;
  }
  return null;
}

function fallbackFilenameFromKey(key: string): string {
  return key.split('/').pop()?.slice(0, 120) || 'smyst-file';
}

function contentDisposition(record: UploadRecord): string {
  const attachmentCategories: ReadonlySet<StorageCategory> = new Set(['document', 'backup', 'twin_data']);
  const disposition = attachmentCategories.has(record.category) ? 'attachment' : 'inline';
  const filename = record.filename || fallbackFilenameFromKey(record.key);
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').slice(0, 120) || 'smyst-file';
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function cleanupExpiredUploadReservations(env: StorageEnv, userSub: string, limit = 100): Promise<number> {
  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, uploadIndexKey(userSub), []);
  const now = Date.now();
  let expired = 0;

  for (const id of ids.slice(0, limit)) {
    const record = (await kv.get(uploadRecordKey(userSub, id), 'json')) as UploadRecord | null;
    if (!record || record.status !== 'url_issued' || !record.expiresAt || record.expiresAt >= now) continue;

    await putUploadRecord(env, { ...record, status: 'expired', updatedAt: now });
    await addNumber(env.SESSIONS, `quota:user:${userSub}:${monthKey(new Date(record.createdAt))}`, -record.size);
    await addNumber(env.SESSIONS, `quota:global:${monthKey(new Date(record.createdAt))}`, -record.size);
    expired += 1;
  }

  return expired;
}

async function verifyObjectHead(
  env: StorageEnv,
  key: string,
  expectedSize: number,
  expectedContentType: string,
): Promise<Response | null> {
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  const presignedHead = await presignUrl({
    method: 'HEAD',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: 60,
  });
  const res = await fetch(presignedHead, { method: 'HEAD' });
  if (!res.ok) {
    return errorResponse('object_not_found', 'Uploaded object could not be verified in IDrive e2', 409, { status: res.status });
  }
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length !== expectedSize) {
    return errorResponse('object_size_mismatch', 'Uploaded object size does not match the upload intent', 409, {
      expectedSize,
      actualSize: length,
    });
  }
  const actualContentType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (actualContentType && actualContentType !== expectedContentType) {
    return errorResponse('object_type_mismatch', 'Uploaded object content type does not match the upload intent', 409, {
      expectedContentType,
      actualContentType,
    });
  }
  return null;
}

async function handleUploadUrl(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:write')) return errorResponse('forbidden', 'Missing storage write permission', 403);

  const parsed = await readJsonBody<UploadUrlRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const filename = sanitizeFilename(body.filename);

  const contentType = normalizeContentType(body.contentType || '', filename);

  // Validierung
  if (!isCategory(body.category)) {
    return errorResponse('invalid_category', 'Invalid category', 400);
  }
  if (body.category === 'twin_data' && !body.twinId?.trim()) {
    return errorResponse('twin_id_required', 'twinId is required for twin_data uploads', 400);
  }
  const allowedTypes = ALLOWED_CONTENT_TYPES_BY_CATEGORY[body.category];
  if (!contentType || !allowedTypes.has(contentType)) {
    return errorResponse('unsupported_content_type', `Unsupported content type for ${body.category}: ${contentType || body.contentType}`, 400);
  }
  if (body.size === undefined || !Number.isFinite(body.size) || body.size <= 0) {
    return errorResponse('file_size_required', 'File size is required for free-only quota enforcement', 400);
  }

  const maxFileBytes = categoryLimit(env, body.category);
  const userMonthlyBytes = readLimit(env.IDRIVE_E2_USER_MONTHLY_BYTES, DEFAULT_USER_MONTHLY_BYTES);
  const globalBytes = readLimit(env.IDRIVE_E2_GLOBAL_BYTES, DEFAULT_GLOBAL_BYTES);
  const userStorageBytes = readLimit(env.IDRIVE_E2_USER_STORAGE_BYTES, DEFAULT_USER_STORAGE_BYTES);
  const globalStorageBytes = readLimit(env.IDRIVE_E2_GLOBAL_STORAGE_BYTES, DEFAULT_GLOBAL_STORAGE_BYTES);

  if (body.size > maxFileBytes) {
    return errorResponse('file_too_large', `File too large: ${body.size} > ${maxFileBytes}`, 413);
  }

  const kv = metadataStore(env);
  await cleanupExpiredUploadReservations(env, session.sub);
  const period = monthKey();
  const userQuotaKey = `quota:user:${session.sub}:${period}`;
  const globalQuotaKey = `quota:global:${period}`;
  const userCurrent = Number((await env.SESSIONS.get(userQuotaKey)) ?? '0');
  const globalCurrent = Number((await env.SESSIONS.get(globalQuotaKey)) ?? '0');
  const userStorageCurrent = await getNumber(kv, storageUserKey(session.sub));
  const globalStorageCurrent = await getNumber(kv, storageGlobalKey());

  if (userCurrent + body.size > userMonthlyBytes) {
    return errorResponse('user_quota_exceeded', 'Free-only user upload quota exceeded', 429);
  }
  if (globalCurrent + body.size > globalBytes) {
    return errorResponse('global_quota_exceeded', 'Free-only global upload quota exceeded', 429);
  }
  if (userStorageCurrent + body.size > userStorageBytes) {
    return errorResponse('user_storage_exceeded', 'Free-only user storage limit exceeded', 429);
  }
  if (globalStorageCurrent + body.size > globalStorageBytes) {
    return errorResponse('global_storage_exceeded', 'Free-only global storage limit exceeded', 429);
  }

  const uploadId = crypto.randomUUID();
  const key = generateKey(body.category, session.sub, contentType, filename, body.twinId);
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);

  const uploadUrl = await presignUrl({
    method: 'PUT',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    headers: { 'content-type': contentType },
    expiresIn: PRESIGN_TTL_SECONDS,
  });

  const response: UploadUrlResponse = {
    uploadId,
    uploadUrl,
    key,
    getUrl: `/storage/file/${encodeURIComponent(key)}`,
    expiresAt: Date.now() + PRESIGN_TTL_SECONDS * 1000,
    contentType,
    maxBytes: maxFileBytes,
    category: body.category,
    supportsChunkUpload: false,
    supportsResume: false,
  };

  const quotaTtl = 60 * 60 * 24 * 45;
  await env.SESSIONS.put(userQuotaKey, String(userCurrent + body.size), { expirationTtl: quotaTtl });
  await env.SESSIONS.put(globalQuotaKey, String(globalCurrent + body.size), { expirationTtl: quotaTtl });

  const now = Date.now();
  await putUploadRecord(env, {
    id: uploadId,
    userSub: session.sub,
    key,
    category: body.category,
    contentType,
    filename,
    twinId: body.twinId,
    size: body.size,
    status: 'url_issued',
    createdAt: now,
    updatedAt: now,
    expiresAt: response.expiresAt,
  });
  await addUploadToIndex(env, session.sub, uploadId);

  return jsonResponse(response);
}

async function handleUploadComplete(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:write')) return errorResponse('forbidden', 'Missing storage write permission', 403);

  const parsed = await readJsonBody<UploadCompleteRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  if (!body.uploadId || !body.key || !Number.isFinite(body.size) || body.size <= 0) {
    return errorResponse('invalid_upload_completion', 'Invalid upload completion payload', 400);
  }

  if (!ownsUserKey(body.key, session.sub)) {
    return errorResponse('forbidden', 'Forbidden', 403);
  }

  const kv = metadataStore(env);
  const record = (await kv.get(uploadRecordKey(session.sub, body.uploadId), 'json')) as UploadRecord | null;
  if (!record || record.key !== body.key || record.size !== body.size) {
    return errorResponse('upload_intent_mismatch', 'Upload intent not found or mismatched', 404);
  }
  if (record.expiresAt && record.expiresAt < Date.now()) {
    return errorResponse('upload_intent_expired', 'Upload intent has expired. Please request a new upload URL.', 409);
  }

  const verificationError = await verifyObjectHead(env, body.key, body.size, record.contentType);
  if (verificationError) return verificationError;

  const next: UploadRecord = {
    ...record,
    status: 'uploaded',
    updatedAt: Date.now(),
  };
  await putUploadRecord(env, next);
  await addUploadToIndex(env, session.sub, next.id);
  if (record.status !== 'uploaded') {
    await addNumber(kv, storageUserKey(session.sub), next.size);
    await addNumber(kv, storageGlobalKey(), next.size);
  }

  return jsonResponse({
    ok: true,
    upload: {
      id: next.id,
      key: next.key,
      category: next.category,
      contentType: next.contentType,
      filename: next.filename,
      size: next.size,
      status: next.status,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    },
  });
}

async function handleListUploads(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:read')) return errorResponse('forbidden', 'Missing storage read permission', 403);

  await cleanupExpiredUploadReservations(env, session.sub);
  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, uploadIndexKey(session.sub), []);
  const records = await Promise.all(
    ids.slice(0, 50).map((id) => kv.get(uploadRecordKey(session.sub, id), 'json') as Promise<UploadRecord | null>),
  );

  const response: UploadListResponse = {
    uploads: records
      .filter((record): record is UploadRecord => Boolean(record))
      .map((record) => ({
        id: record.id,
        key: record.key,
        category: record.category,
        contentType: record.contentType,
        filename: record.filename,
        size: record.size,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
  };

  return jsonResponse(response);
}

async function handleGetFile(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:read')) return errorResponse('forbidden', 'Missing storage read permission', 403);

  // Authorisierung: Nutzer darf nur eigene Files (Pfad-Prefix muss "users/<sub>/" sein)
  if (!ownsUserKey(key, session.sub)) {
    return errorResponse('forbidden', 'File does not belong to user', 403);
  }

  const record = await findUploadRecordByKey(env, session.sub, key);
  if (!record) {
    return errorResponse('file_metadata_not_found', 'File metadata not found', 404);
  }
  if (record.status !== 'uploaded') {
    return errorResponse('file_not_available', 'File is not available for download', 409, { status: record.status });
  }

  // Presigned GET → 302 Redirect — Browser lädt direkt vom IDrive E2 Edge
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  url.searchParams.set('response-content-disposition', contentDisposition(record));
  url.searchParams.set('response-content-type', record.contentType);
  const presignedGet = await presignUrl({
    method: 'GET',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: 60 * 5, // 5 Minuten reichen für Browser-Stream
  });

  return withSecurity(new Response(null, {
    status: 302,
    headers: {
      Location: presignedGet,
      'Cache-Control': 'private, max-age=60',
    },
  }));
}

async function deleteObjectFromIdrive(env: StorageEnv, key: string): Promise<number> {
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  const presignedDelete = await presignUrl({
    method: 'DELETE',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: 60,
  });

  const res = await fetch(presignedDelete, { method: 'DELETE' });
  return res.status;
}

async function putObjectToIdrive(env: StorageEnv, key: string, body: Uint8Array, contentType: string): Promise<number> {
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  const presignedPut = await presignUrl({
    method: 'PUT',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    headers: { 'content-type': contentType },
    expiresIn: 60,
  });
  const res = await fetch(presignedPut, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body,
  });
  return res.status;
}

async function getObjectFromIdrive(env: StorageEnv, key: string): Promise<Response> {
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  const presignedGet = await presignUrl({
    method: 'GET',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: 60,
  });
  return fetch(presignedGet, { method: 'GET' });
}

async function handlePutManagedObject(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:write')) return errorResponse('forbidden', 'Missing storage write permission', 403);

  const parsed = await readJsonBody<ObjectWriteRequest>(request, MAX_OBJECT_JSON_BYTES);
  if (!parsed.ok) return parsed.response;
  const key = typeof parsed.value.key === 'string' ? parsed.value.key.trim() : '';
  if (!key || !isManagedObjectKey(key, session.sub)) {
    return errorResponse('invalid_object_key', 'Managed object key must belong to the authenticated user profile, twin, export or backup namespace.', 403);
  }

  const contentType = parsed.value.contentType === 'text/plain' ? 'text/plain' : 'application/json';
  const raw = contentType === 'application/json'
    ? JSON.stringify(parsed.value.value)
    : String(parsed.value.value ?? '');
  const bytes = new TextEncoder().encode(raw);
  if (bytes.byteLength > MAX_OBJECT_JSON_BYTES) {
    return errorResponse('object_too_large', 'Managed object is too large for the free-only JSON object path.', 413, {
      limit: MAX_OBJECT_JSON_BYTES,
    });
  }

  const status = await putObjectToIdrive(env, key, bytes, contentType);
  if (status < 200 || status >= 300) {
    return errorResponse('object_write_failed', 'IDrive e2 object write failed.', 502, { status });
  }

  return jsonResponse({
    ok: true,
    key,
    bytes: bytes.byteLength,
    contentType,
    storage: 'idrive-e2',
  });
}

async function handleGetManagedObject(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:read')) return errorResponse('forbidden', 'Missing storage read permission', 403);
  if (!isManagedObjectKey(key, session.sub)) return errorResponse('forbidden', 'Object does not belong to user', 403);

  const res = await getObjectFromIdrive(env, key);
  if (!res.ok) {
    return errorResponse('object_not_found', 'Managed object not found in IDrive e2.', res.status === 404 ? 404 : 502, {
      status: res.status,
    });
  }
  const contentType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? 'application/json';
  const text = await res.text();
  if (contentType === 'application/json') {
    try {
      return jsonResponse({ ok: true, key, value: JSON.parse(text) });
    } catch {
      return errorResponse('object_json_invalid', 'Managed object is not valid JSON.', 502);
    }
  }
  return jsonResponse({ ok: true, key, value: text });
}

async function handleDeleteManagedObject(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:delete')) return errorResponse('forbidden', 'Missing storage delete permission', 403);
  const deleteConfirmation = requireDeleteConfirmation(request, 'delete-object');
  if (deleteConfirmation) return deleteConfirmation;
  if (!isManagedObjectKey(key, session.sub)) return errorResponse('forbidden', 'Object does not belong to user', 403);

  const status = await deleteObjectFromIdrive(env, key);
  if ((status < 200 || status >= 300) && status !== 404) {
    return errorResponse('object_delete_failed', 'IDrive e2 object delete failed.', 502, { status });
  }
  return jsonResponse({ ok: true, key, deleted: status !== 404 });
}

async function handleDeleteFile(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:delete')) return errorResponse('forbidden', 'Missing storage delete permission', 403);
  const deleteConfirmation = requireDeleteConfirmation(request, 'delete-file');
  if (deleteConfirmation) return deleteConfirmation;

  if (!ownsUserKey(key, session.sub)) {
    return errorResponse('forbidden', 'Forbidden', 403);
  }

  // Worker führt das Delete server-seitig aus (User-Browser bekommt nur OK/FAIL)
  const deleteStatus = await deleteObjectFromIdrive(env, key);
  if ((deleteStatus < 200 || deleteStatus >= 300) && deleteStatus !== 404) {
    return errorResponse('delete_failed', 'Delete failed', 502, { status: deleteStatus });
  }

  const kv = metadataStore(env);
  const record = await findUploadRecordByKey(env, session.sub, key);
  if (record) {
    await putUploadRecord(env, { ...record, status: 'deleted', updatedAt: Date.now() });
    if (record.status === 'uploaded') {
      await addNumber(kv, storageUserKey(session.sub), -record.size);
      await addNumber(kv, storageGlobalKey(), -record.size);
    }
  }

  return jsonResponse({ ok: true });
}

async function handleDeleteAccountStorage(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'storage:delete')) return errorResponse('forbidden', 'Missing storage delete permission', 403);
  const deleteConfirmation = requireDeleteConfirmation(request, 'delete-account-storage');
  if (deleteConfirmation) return deleteConfirmation;

  await cleanupExpiredUploadReservations(env, session.sub);

  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, uploadIndexKey(session.sub), []);
  const records = (
    await Promise.all(
      ids.slice(0, MAX_UPLOAD_INDEX_READS).map((id) => kv.get(uploadRecordKey(session.sub, id), 'json') as Promise<UploadRecord | null>),
    )
  ).filter((record): record is UploadRecord => Boolean(record));

  let deletedObjects = 0;
  let failedObjects = 0;
  let releasedBytes = 0;
  const now = Date.now();

  for (const record of records) {
    if (!ownsUserKey(record.key, session.sub)) continue;

    if (record.status === 'uploaded') {
      const status = await deleteObjectFromIdrive(env, record.key);
      if ((status >= 200 && status < 300) || status === 404) {
        deletedObjects += 1;
        releasedBytes += record.size;
        await addNumber(kv, storageUserKey(session.sub), -record.size);
        await addNumber(kv, storageGlobalKey(), -record.size);
      } else {
        failedObjects += 1;
        continue;
      }
    }

    await putUploadRecord(env, { ...record, status: 'deleted', updatedAt: now });
  }

  if (failedObjects === 0) {
    await kv.delete(uploadIndexKey(session.sub));
  }

  return jsonResponse({
    ok: failedObjects === 0,
    deletedObjects,
    failedObjects,
    releasedBytes,
    remainingMetadata: failedObjects > 0,
  }, failedObjects === 0 ? 200 : 207);
}

// ---------- Worker Entry ----------

export default {
  async fetch(request: Request, env: StorageEnv): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);
      const kv = metadataStore(env);

      if (request.method === 'OPTIONS') {
        return strictCorsPreflight(request, env.CANONICAL_HOST, 'GET, POST, PUT, DELETE');
      }

      const csrf = requireSameOrigin(request, env.CANONICAL_HOST);
      if (csrf) {
        return csrf;
      }

      // POST /storage/upload-url
      if (url.pathname === '/storage/upload-url' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:upload-url'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleUploadUrl(request, env);
      }

      // POST /storage/upload-complete
      if (url.pathname === '/storage/upload-complete' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:upload-complete'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleUploadComplete(request, env);
      }

      // GET /storage/uploads
      if (url.pathname === '/storage/uploads' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:list'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleListUploads(request, env);
      }

      // PUT /storage/object
      if (url.pathname === '/storage/object' && request.method === 'PUT') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:put-object'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handlePutManagedObject(request, env);
      }

      // GET /storage/object/:key
      if (url.pathname.startsWith('/storage/object/') && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:get-object'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const key = decodeURIComponent(url.pathname.slice('/storage/object/'.length));
        return handleGetManagedObject(request, env, key);
      }

      // DELETE /storage/object/:key
      if (url.pathname.startsWith('/storage/object/') && request.method === 'DELETE') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:delete-object'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const key = decodeURIComponent(url.pathname.slice('/storage/object/'.length));
        return handleDeleteManagedObject(request, env, key);
      }

      // DELETE /storage/account
      if (url.pathname === '/storage/account' && request.method === 'DELETE') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:delete-account'),
          limit: 5,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleDeleteAccountStorage(request, env);
      }

      // GET /storage/file/:key
      if (url.pathname.startsWith('/storage/file/') && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:get-file'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const key = decodeURIComponent(url.pathname.slice('/storage/file/'.length));
        return handleGetFile(request, env, key);
      }

      // DELETE /storage/file/:key
      if (url.pathname.startsWith('/storage/file/') && request.method === 'DELETE') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'storage:delete-file'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const key = decodeURIComponent(url.pathname.slice('/storage/file/'.length));
        return handleDeleteFile(request, env, key);
      }

      const allowed = allowedMethodsForStoragePath(url.pathname);
      if (allowed) return methodNotAllowed(allowed);
      return errorResponse('not_found', 'Not found', 404);
    }, request);
  },
};

// ---------- Type-Stubs ----------
declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}
