/**
 * Twynt Storage-Worker — IDrive E2 (S3-kompatibel) für Memory-Files
 *
 * Endpoints:
 *   POST /storage/upload-url    → erzeugt Presigned PUT URL für Direct-Upload
 *                                 (Audio/Bilder/Videos vom Browser direkt zu IDrive)
 *   GET  /storage/file/<key>    → proxied GET mit Auth-Check (User darf nur eigene Files)
 *   POST /storage/multipart/start    → tus.io-kompatibler resumable Upload Stage 1
 *   PATCH /storage/multipart/<id>    → Upload-Chunk
 *   POST /storage/multipart/<id>/complete → Multipart finalisieren
 *
 * Sicherheit:
 *   - Alle Endpoints prüfen Session-Cookie (twynt_session) gegen SESSIONS KV
 *   - File-Keys haben Pattern: users/<userSub>/<contentType>/<uuid>.<ext>
 *   - Presigned URLs sind 15 Minuten gültig — keine Long-Lived Tokens
 *   - Server-Side-Encryption AES-256 bei Bucket-Konfiguration (manuell in IDrive E2)
 *
 * Kostenmodell:
 *   - IDrive E2 Storage: $0.004/GB/Monat (Frankfurt EU-Region)
 *   - Egress: kostenlos
 *   - PUT/GET: $0.01 / 10.000 ops
 *   - Twynt Estimat: 100k User × 100 MB ≈ 10 TB → ~40 USD/Monat
 */

import type { AuthEnv } from './auth-google';

export interface StorageEnv extends AuthEnv {
  /** IDrive E2 Endpoint, z. B. "https://b2x4.fra.idrivee2-31.com" */
  IDRIVE_E2_ENDPOINT: string;
  /** Bucket-Name, z. B. "twynt-memories" */
  IDRIVE_E2_BUCKET: string;
  /** Region — IDrive nutzt fixe Region-Codes wie "fra" oder "ams" */
  IDRIVE_E2_REGION: string;
  IDRIVE_E2_ACCESS_KEY: string;
  IDRIVE_E2_SECRET_KEY: string;
}

const PRESIGN_TTL_SECONDS = 60 * 15; // 15 Min
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB pro Datei
const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  // Audio
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm',
  'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/opus',
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  // Videos
  'video/mp4', 'video/quicktime', 'video/webm',
  // Documents (Memory-PDFs, Tagebücher)
  'application/pdf', 'text/plain', 'text/markdown',
]);

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
  const signedHeaders = 'host';

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
  const canonicalHeaders = `host:${url.host}\n`;
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
  expiresAt: number;
}

const SESSION_COOKIE = 'twynt_session';

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function authenticate(request: Request, env: StorageEnv): Promise<SessionData | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const data = (await env.SESSIONS.get(`s:${sessionId}`, 'json')) as SessionData | null;
  if (!data || data.expiresAt < Date.now()) return null;
  return data;
}

// ---------- Endpoints ----------

interface UploadUrlRequest {
  contentType: string;
  /** Original-Dateiname (für Extension), optional. */
  filename?: string;
  /** Erwartete Größe in Bytes, optional aber empfohlen für Quota-Check. */
  size?: number;
  /** Memory-Kategorie: 'audio' | 'image' | 'video' | 'document'. */
  category: 'audio' | 'image' | 'video' | 'document';
}

interface UploadUrlResponse {
  /** Presigned PUT URL. */
  uploadUrl: string;
  /** S3-Key relativ zum Bucket — als Referenz speichern. */
  key: string;
  /** Permanenter GET-Pfad innerhalb von Twynt. */
  getUrl: string;
  /** UTC-Zeitstempel, wann die uploadUrl ungültig wird. */
  expiresAt: number;
}

function generateKey(category: string, userSub: string, filename?: string): string {
  const ext = filename ? extractExtension(filename) : '';
  const uuid = crypto.randomUUID();
  return `users/${userSub}/${category}/${uuid}${ext}`;
}

function extractExtension(filename: string): string {
  const m = filename.match(/\.[a-zA-Z0-9]{1,8}$/);
  return m ? m[0].toLowerCase() : '';
}

async function handleUploadUrl(request: Request, env: StorageEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: UploadUrlRequest;
  try {
    body = (await request.json()) as UploadUrlRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  // Validierung
  if (!body.contentType || !ALLOWED_CONTENT_TYPES.has(body.contentType)) {
    return jsonResponse({ error: `Unsupported content type: ${body.contentType}` }, 400);
  }
  if (!['audio', 'image', 'video', 'document'].includes(body.category)) {
    return jsonResponse({ error: 'Invalid category' }, 400);
  }
  if (body.size !== undefined && body.size > MAX_FILE_SIZE_BYTES) {
    return jsonResponse({ error: `File too large: ${body.size} > ${MAX_FILE_SIZE_BYTES}` }, 413);
  }

  const key = generateKey(body.category, session.sub, body.filename);
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);

  const uploadUrl = await presignUrl({
    method: 'PUT',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: PRESIGN_TTL_SECONDS,
  });

  const response: UploadUrlResponse = {
    uploadUrl,
    key,
    getUrl: `/storage/file/${encodeURIComponent(key)}`,
    expiresAt: Date.now() + PRESIGN_TTL_SECONDS * 1000,
  };

  return jsonResponse(response);
}

async function handleGetFile(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Authorisierung: Nutzer darf nur eigene Files (Pfad-Prefix muss "users/<sub>/" sein)
  const expectedPrefix = `users/${session.sub}/`;
  if (!key.startsWith(expectedPrefix)) {
    return jsonResponse({ error: 'Forbidden — file does not belong to user' }, 403);
  }

  // Presigned GET → 302 Redirect — Browser lädt direkt vom IDrive E2 Edge
  const url = new URL(`${env.IDRIVE_E2_ENDPOINT}/${env.IDRIVE_E2_BUCKET}/${key}`);
  const presignedGet = await presignUrl({
    method: 'GET',
    url,
    region: env.IDRIVE_E2_REGION,
    service: 's3',
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    expiresIn: 60 * 5, // 5 Minuten reichen für Browser-Stream
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: presignedGet,
      'Cache-Control': 'private, max-age=60',
    },
  });
}

async function handleDeleteFile(request: Request, env: StorageEnv, key: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const expectedPrefix = `users/${session.sub}/`;
  if (!key.startsWith(expectedPrefix)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

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

  // Worker führt das Delete server-seitig aus (User-Browser bekommt nur OK/FAIL)
  const res = await fetch(presignedDelete, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    return jsonResponse({ error: 'Delete failed', status: res.status }, 502);
  }
  return jsonResponse({ ok: true });
}

// ---------- Helpers ----------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

// ---------- Worker Entry ----------

export default {
  async fetch(request: Request, env: StorageEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.CANONICAL_HOST,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // POST /storage/upload-url
    if (url.pathname === '/storage/upload-url' && request.method === 'POST') {
      return handleUploadUrl(request, env);
    }

    // GET /storage/file/:key
    if (url.pathname.startsWith('/storage/file/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.slice('/storage/file/'.length));
      return handleGetFile(request, env, key);
    }

    // DELETE /storage/file/:key
    if (url.pathname.startsWith('/storage/file/') && request.method === 'DELETE') {
      const key = decodeURIComponent(url.pathname.slice('/storage/file/'.length));
      return handleDeleteFile(request, env, key);
    }

    return new Response('Not found', { status: 404 });
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
