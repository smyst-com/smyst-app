/**
 * Twynt Google-OAuth Worker
 *
 * Endpoints:
 *   GET  /auth/google/start     → Redirect zu Google mit PKCE + state
 *   GET  /auth/google/callback  → Code-Exchange, ID-Token-Verifikation, Session-Cookie setzen
 *   POST /auth/logout           → Session löschen
 *   GET  /auth/me               → Aktuelle Session prüfen (für Frontend useAuth Hook)
 *
 * Sicherheit:
 *  - PKCE (S256) gegen Authorization-Code-Interception
 *  - state-Parameter signiert mit HMAC, gegen CSRF
 *  - id_token wird gegen Google-JWKS verifiziert (signature, iss, aud, exp)
 *  - Sessions in KV mit 30-Tage-TTL, Cookie HttpOnly + Secure + SameSite=Lax
 *  - Kein Access-Token im Browser — bleibt server-seitig
 */

export interface AuthEnv {
  /** OAuth Client ID aus GCP Console. */
  GOOGLE_OAUTH_CLIENT_ID: string;
  /** OAuth Client Secret aus GCP Console (Secret!). */
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  /** Eigenes HMAC-Secret für state-Signaturen. Mind. 32 Bytes Random. */
  AUTH_HMAC_SECRET: string;
  /** Public-facing Origin, z. B. https://twynt.com. */
  CANONICAL_HOST: string;
  /** KV-Namespace für Sessions. */
  SESSIONS: KVNamespace;
  /** KV-Namespace für temporäre OAuth-Flow-State (kurzlebig). */
  OAUTH_STATE: KVNamespace;
}

const SESSION_COOKIE = 'twynt_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage
const STATE_TTL_SECONDS = 60 * 10;             // 10 Minuten für laufenden OAuth-Flow

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];

interface GoogleTokens {
  access_token: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

interface GoogleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
}

interface SessionData {
  sub: string;          // Google user ID (stable identifier)
  email: string;
  name?: string;
  picture?: string;
  locale?: string;
  createdAt: number;
  expiresAt: number;
}

// ---------- Helpers ----------

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomB64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

async function sha256(str: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}

async function pkceChallenge(verifier: string): Promise<string> {
  return b64urlEncode(await sha256(verifier));
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

async function hmacVerify(key: string, payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(key, payload);
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function makeSessionCookie(sessionId: string): string {
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  return parts.join('; ');
}

function makeClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ---------- ID-Token Verifikation ----------

interface JwksKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

let jwksCache: { fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

async function getGoogleKeys(): Promise<Map<string, CryptoKey>> {
  // Cache JWKS für 1 Stunde, da Rotation langsam und Public-Key-Endpoint cacheable
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as JwksResponse;

  const map = new Map<string, CryptoKey>();
  for (const k of data.keys) {
    if (k.kty !== 'RSA' || k.alg !== 'RS256') continue;
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: k.kty, alg: k.alg, use: k.use, kid: k.kid, n: k.n, e: k.e, ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    map.set(k.kid, cryptoKey);
  }
  jwksCache = { fetchedAt: now, keys: map };
  return map;
}

async function verifyIdToken(idToken: string, expectedAud: string): Promise<GoogleIdTokenPayload> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token: malformed (not 3 parts)');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as { alg: string; kid: string };
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as GoogleIdTokenPayload;

  if (header.alg !== 'RS256') throw new Error(`id_token: unexpected alg ${header.alg}`);
  const keys = await getGoogleKeys();
  const key = keys.get(header.kid);
  if (!key) throw new Error(`id_token: unknown kid ${header.kid}`);

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64urlDecode(signatureB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!valid) throw new Error('id_token: signature invalid');

  // Standard-Claims prüfen
  if (!GOOGLE_ISS.includes(payload.iss)) throw new Error(`id_token: bad iss ${payload.iss}`);
  if (payload.aud !== expectedAud) throw new Error(`id_token: bad aud ${payload.aud}`);
  if (payload.exp * 1000 < Date.now()) throw new Error('id_token: expired');
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('id_token: email missing or unverified');
  }
  return payload;
}

// ---------- Endpoints ----------

async function startAuth(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '/';

  // Validiere return_to: nur same-origin, keine Open-Redirect-Lücke
  let safeReturnTo = '/';
  try {
    const candidate = new URL(returnTo, env.CANONICAL_HOST);
    if (candidate.origin === new URL(env.CANONICAL_HOST).origin) {
      safeReturnTo = candidate.pathname + candidate.search;
    }
  } catch {
    /* fallback to / */
  }

  // PKCE-Verifier (random) + Challenge (SHA-256)
  const codeVerifier = randomB64Url(48);
  const codeChallenge = await pkceChallenge(codeVerifier);

  // State: Random + signiert mit HMAC, damit wir Replay & CSRF erkennen
  const stateNonce = randomB64Url(24);
  const stateBody = `${stateNonce}.${Date.now()}`;
  const stateSig = await hmacSign(env.AUTH_HMAC_SECRET, stateBody);
  const state = `${stateBody}.${stateSig}`;

  // Speichere Verifier + return_to in OAUTH_STATE KV unter dem Nonce
  await env.OAUTH_STATE.put(
    `state:${stateNonce}`,
    JSON.stringify({ verifier: codeVerifier, returnTo: safeReturnTo, createdAt: Date.now() }),
    { expirationTtl: STATE_TTL_SECONDS },
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${env.CANONICAL_HOST}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'online', // wir brauchen kein Refresh-Token (re-auth ist günstig & sicher)
    prompt: 'select_account', // erlaubt User, anderes Konto zu wählen
  });

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
}

async function handleCallback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);

  // Google sendet bei Fehler ?error=...
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return errorResponse(`OAuth error: ${oauthError}`, 400);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return errorResponse('Missing code or state', 400);

  // State verifizieren
  const stateParts = state.split('.');
  if (stateParts.length !== 3) return errorResponse('Bad state format', 400);
  const [stateNonce, stateTs, stateSig] = stateParts;
  const validSig = await hmacVerify(env.AUTH_HMAC_SECRET, `${stateNonce}.${stateTs}`, stateSig);
  if (!validSig) return errorResponse('Invalid state signature', 400);

  // Hole gespeicherten Verifier
  const stored = await env.OAUTH_STATE.get(`state:${stateNonce}`, 'json') as
    | { verifier: string; returnTo: string; createdAt: number }
    | null;
  if (!stored) return errorResponse('State expired or unknown', 400);
  // Ein-Mal-Verwendung: löschen
  await env.OAUTH_STATE.delete(`state:${stateNonce}`);

  // Code gegen Tokens tauschen
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.CANONICAL_HOST}/auth/google/callback`,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      code_verifier: stored.verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    console.error('token exchange failed', tokenRes.status, body);
    return errorResponse('Token exchange failed', 502);
  }

  const tokens = (await tokenRes.json()) as GoogleTokens;
  if (!tokens.id_token) return errorResponse('No id_token returned', 502);

  // ID-Token verifizieren
  let claims: GoogleIdTokenPayload;
  try {
    claims = await verifyIdToken(tokens.id_token, env.GOOGLE_OAUTH_CLIENT_ID);
  } catch (err) {
    console.error('id_token verification failed', err);
    return errorResponse('Invalid id_token', 401);
  }

  // Session erstellen
  const sessionId = randomB64Url(32);
  const session: SessionData = {
    sub: claims.sub,
    email: claims.email!,
    name: claims.name,
    picture: claims.picture,
    locale: claims.locale,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await env.SESSIONS.put(`s:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  // Redirect zurück zur App mit Session-Cookie
  const headers = new Headers({
    Location: `${env.CANONICAL_HOST}${stored.returnTo}`,
    'Set-Cookie': makeSessionCookie(sessionId),
  });
  return new Response(null, { status: 302, headers });
}

async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return jsonResponse({ authenticated: false }, 200);

  const data = await env.SESSIONS.get(`s:${sessionId}`, 'json') as SessionData | null;
  if (!data || data.expiresAt < Date.now()) {
    return jsonResponse({ authenticated: false }, 200, { 'Set-Cookie': makeClearCookie() });
  }

  return jsonResponse({
    authenticated: true,
    user: {
      sub: data.sub,
      email: data.email,
      name: data.name ?? null,
      picture: data.picture ?? null,
      locale: data.locale ?? null,
    },
  });
}

async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await env.SESSIONS.delete(`s:${sessionId}`);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': makeClearCookie() });
}

// ---------- Helpers ----------

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ---------- Worker entry ----------

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const url = new URL(request.url);

    // CORS für /auth/me und /auth/logout — gleicher Origin wird normalerweise
    // verwendet, aber falls Frontend separat deployed: erlauben wir CORS streng
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.CANONICAL_HOST,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/auth/google/start' && request.method === 'GET') {
      return startAuth(request, env);
    }
    if (url.pathname === '/auth/google/callback' && request.method === 'GET') {
      return handleCallback(request, env);
    }
    if (url.pathname === '/auth/me' && request.method === 'GET') {
      return handleMe(request, env);
    }
    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      return handleLogout(request, env);
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
