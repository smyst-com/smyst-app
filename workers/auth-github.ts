/**
 * Smyst Auth Worker — GitHub OAuth for the free-only phase.
 *
 * Endpoints:
 *   GET  /auth/github/start
 *   GET  /auth/github/callback
 *   POST /auth/logout
 *   POST /auth/logout-all
 *   GET  /auth/me
 *
 * GitHub is explicitly allowed by the project infrastructure rule.
 */

import {
  clientKey,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
  requireSameOrigin,
  requireRateLimit,
  safeHandler,
  strictCorsPreflight,
  withSecurity,
} from './_shared';

export interface AuthEnv {
  /** OAuth Client ID from GitHub. */
  GITHUB_OAUTH_CLIENT_ID: string;
  /** OAuth Client Secret from GitHub. */
  GITHUB_OAUTH_CLIENT_SECRET: string;
  /** HMAC secret for state signatures. Min. 32 random bytes. */
  AUTH_HMAC_SECRET: string;
  /** Public-facing Origin, e.g. https://smyst.com. */
  CANONICAL_HOST: string;
  /** Optional comma-separated GitHub numeric IDs that receive owner role. */
  SMYST_OWNER_GITHUB_IDS?: string;
  /** Optional comma-separated emails that receive owner role. */
  SMYST_OWNER_EMAILS?: string;
  /** Optional comma-separated GitHub numeric IDs that receive admin role. */
  SMYST_ADMIN_GITHUB_IDS?: string;
  /** Optional comma-separated emails that receive admin role. */
  SMYST_ADMIN_EMAILS?: string;
  /** Optional per-admin TOTP secrets, e.g. "owner@example.com=BASE32,github:123=BASE32". */
  SMYST_ADMIN_TOTP_SECRETS?: string;
  /** Optional fallback TOTP secret for early single-admin production setup. Prefer per-admin secrets. */
  SMYST_ADMIN_TOTP_SECRET?: string;
  /** KV namespace for sessions. */
  SESSIONS: KVNamespace;
  /** KV namespace for short-lived OAuth state. */
  OAUTH_STATE: KVNamespace;
}

const SESSION_COOKIE = 'smyst_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const STATELESS_SESSION_TTL_SECONDS = 60 * 60 * 24;
const STATE_TTL_SECONDS = 60 * 10;
const ADMIN_MFA_TTL_SECONDS = 60 * 60 * 8;
const TOTP_STEP_SECONDS = 30;
const TOTP_DRIFT_STEPS = 1;

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

function allowedMethodsForAuthPath(pathname: string): string[] | null {
  if (pathname === '/auth/providers') return ['GET'];
  if (pathname === '/auth/admin-2fa/status') return ['GET'];
  if (pathname === '/auth/admin-2fa/verify') return ['POST'];
  if (pathname === '/auth/github/start') return ['GET'];
  if (pathname === '/auth/github/callback') return ['GET'];
  if (pathname === '/auth/google/start') return ['GET'];
  if (pathname === '/auth/apple/start') return ['GET'];
  if (pathname === '/auth/magic/start') return ['POST'];
  if (pathname === '/auth/me') return ['GET'];
  if (pathname === '/auth/logout') return ['POST'];
  if (pathname === '/auth/logout-all') return ['POST'];
  return null;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
}

interface SessionData {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  locale?: string;
  roles: AuthRole[];
  permissions: AuthPermission[];
  adminMfaVerifiedAt?: number;
  adminMfaExpiresAt?: number;
  adminMfaMethod?: 'totp';
  createdAt: number;
  expiresAt: number;
}

type AuthRole = 'owner' | 'admin' | 'member';

type AuthPermission =
  | 'auth:read'
  | 'profile:read'
  | 'profile:write'
  | 'storage:read'
  | 'storage:write'
  | 'storage:delete'
  | 'twin:read'
  | 'twin:write'
  | 'chat:read'
  | 'chat:write'
  | 'admin:read'
  | 'admin:write';

type AuthProviderStatus = 'active' | 'planned' | 'misconfigured';

interface AuthProviderContract {
  id: 'github' | 'google' | 'apple' | 'magic_link';
  label: string;
  status: AuthProviderStatus;
  startPath: string;
  productionUse: boolean;
  note: string;
}

interface AdminTotpVerifyRequest {
  code?: string;
}

interface CurrentSession {
  session: SessionData;
  sessionId?: string;
  tokenType: 'httpOnly-cookie' | 'signed-httpOnly-cookie';
}

interface UserRecord {
  sub: string;
  provider: 'github';
  providerId: number;
  login: string;
  email: string;
  name?: string;
  picture?: string;
  roles: AuthRole[];
  permissions: AuthPermission[];
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
}

const ROLE_PERMISSIONS: Record<AuthRole, AuthPermission[]> = {
  member: [
    'auth:read',
    'profile:read',
    'profile:write',
    'storage:read',
    'storage:write',
    'storage:delete',
    'twin:read',
    'twin:write',
    'chat:read',
    'chat:write',
  ],
  admin: [
    'auth:read',
    'profile:read',
    'profile:write',
    'storage:read',
    'storage:write',
    'storage:delete',
    'twin:read',
    'twin:write',
    'chat:read',
    'chat:write',
    'admin:read',
  ],
  owner: [
    'auth:read',
    'profile:read',
    'profile:write',
    'storage:read',
    'storage:write',
    'storage:delete',
    'twin:read',
    'twin:write',
    'chat:read',
    'chat:write',
    'admin:read',
    'admin:write',
  ],
};

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlEncodeText(value: string): string {
  return b64urlEncode(new TextEncoder().encode(value));
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

function randomB64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
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
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function readSessionCookie(request: Request): string | null {
  const sessionId = readCookie(request, SESSION_COOKIE);
  return sessionId && SESSION_ID_PATTERN.test(sessionId) ? sessionId : null;
}

function makeSessionCookie(sessionId: string, maxAge = SESSION_TTL_SECONDS): string {
  return [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Priority=High',
  ].join('; ');
}

function makeClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Priority=High`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sessionReadyResponse(env: AuthEnv, returnTo: string, sessionCookie: string): Response {
  const target = `${env.CANONICAL_HOST}${returnTo}`;
  const escapedTarget = escapeHtml(target);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${escapedTarget}"><title>smyst.com Session bereit</title></head><body><p>Session bereit. <a href="${escapedTarget}">Weiter zu smyst.com</a></p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Refresh': `0; url=${target}`,
      'Set-Cookie': sessionCookie,
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  });
}

function userSessionsKey(userSub: string): string {
  return `auth:sessions:${userSub}`;
}

async function readJsonKv<T>(kv: KVNamespace, key: string): Promise<T | null> {
  try {
    return (await kv.get(key, 'json')) as T | null;
  } catch (err) {
    console.warn('auth_kv_json_read_failed', JSON.stringify({ key, error: String(err) }));
    return null;
  }
}

function validSessionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && SESSION_ID_PATTERN.test(id));
}

function isKvPutLimit(err: unknown): boolean {
  return /KV put\(\) limit exceeded/i.test(String(err));
}

async function makeStatelessSessionToken(env: AuthEnv, session: SessionData): Promise<string> {
  const payload = b64urlEncodeText(JSON.stringify(session));
  const signature = await hmacSign(env.AUTH_HMAC_SECRET, `session.${payload}`);
  return `v1.${payload}.${signature}`;
}

async function readStatelessSessionToken(env: AuthEnv, token: string): Promise<SessionData | null> {
  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return null;
  const valid = await hmacVerify(env.AUTH_HMAC_SECRET, `session.${payload}`, signature);
  if (!valid) return null;
  const decoded = b64urlDecodeText(payload);
  if (!decoded) return null;
  try {
    const session = JSON.parse(decoded) as SessionData;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

async function readCurrentSession(request: Request, env: AuthEnv): Promise<CurrentSession | null> {
  const rawSessionId = readCookie(request, SESSION_COOKIE);
  const sessionId = readSessionCookie(request);
  if (rawSessionId && !sessionId) {
    const statelessSession = await readStatelessSessionToken(env, rawSessionId);
    return statelessSession
      ? { session: statelessSession, tokenType: 'signed-httpOnly-cookie' }
      : null;
  }
  if (!sessionId) return null;
  const data = await readJsonKv<SessionData>(env.SESSIONS, `s:${sessionId}`);
  if (!data || data.expiresAt < Date.now()) return null;
  return { session: data, sessionId, tokenType: 'httpOnly-cookie' };
}

async function rememberUserSession(env: AuthEnv, userSub: string, sessionId: string): Promise<void> {
  const key = userSessionsKey(userSub);
  const existing = validSessionIds(await readJsonKv<unknown>(env.SESSIONS, key));
  const next = [sessionId, ...existing.filter((id) => id !== sessionId)].slice(0, 20);
  await env.SESSIONS.put(key, JSON.stringify(next), { expirationTtl: SESSION_TTL_SECONDS });
}

function isAdminSession(session: SessionData): boolean {
  return session.permissions?.includes('admin:read') ||
    session.permissions?.includes('admin:write') ||
    session.roles?.includes('admin') ||
    session.roles?.includes('owner');
}

function isAdminMfaFresh(session: SessionData, now = Date.now()): boolean {
  return Boolean(session.adminMfaMethod === 'totp' && session.adminMfaExpiresAt && session.adminMfaExpiresAt > now);
}

function parseTotpSecretMap(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw ?? '').split(/[\n,;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const secret = trimmed.slice(eq + 1).trim();
    if (key && secret) map.set(key, secret);
  }
  return map;
}

function totpSecretForSession(session: SessionData, env: AuthEnv): string | null {
  const secrets = parseTotpSecretMap(env.SMYST_ADMIN_TOTP_SECRETS);
  return secrets.get(session.sub.toLowerCase()) ??
    secrets.get(session.email.toLowerCase()) ??
    (env.SMYST_ADMIN_TOTP_SECRET?.trim() || null);
}

function base32Decode(value: string): Uint8Array | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = value.toUpperCase().replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const out: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (const char of clean) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1Bytes(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg as BufferSource);
  return new Uint8Array(sig);
}

async function totpCode(secret: string, counter: number): Promise<string | null> {
  const key = base32Decode(secret);
  if (!key) return null;
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const hash = await hmacSha1Bytes(key, msg);
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function verifyTotp(secret: string, rawCode: string, now = Date.now()): Promise<boolean> {
  const code = rawCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / (TOTP_STEP_SECONDS * 1000));
  for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift += 1) {
    const expected = await totpCode(secret, counter + drift);
    if (expected && timingSafeEqual(expected, code)) return true;
  }
  return false;
}

function validateAuthConfig(env: AuthEnv): Response | null {
  const secretBytes = new TextEncoder().encode(env.AUTH_HMAC_SECRET ?? '').byteLength;
  if (secretBytes < 32) {
    return errorResponse('auth_config_invalid', 'Auth configuration is invalid.', 500);
  }
  try {
    const canonical = new URL(env.CANONICAL_HOST);
    if (canonical.protocol !== 'https:') {
      return errorResponse('auth_config_invalid', 'Auth configuration is invalid.', 500);
    }
  } catch {
    return errorResponse('auth_config_invalid', 'Auth configuration is invalid.', 500);
  }
  return null;
}

function providerContracts(env: AuthEnv): AuthProviderContract[] {
  const githubConfigured = Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
  return [
    {
      id: 'github',
      label: 'GitHub',
      status: githubConfigured ? 'active' : 'misconfigured',
      startPath: '/auth/github/start',
      productionUse: githubConfigured,
      note: githubConfigured
        ? 'Phase-1 production login with HttpOnly sessions, roles and admin permissions.'
        : 'Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET before enabling login.',
    },
    {
      id: 'google',
      label: 'Google',
      status: 'planned',
      startPath: '/auth/google/start',
      productionUse: false,
      note: 'Prepared in the product plan, not active in the Cloudflare Worker production auth path yet.',
    },
    {
      id: 'apple',
      label: 'Apple',
      status: 'planned',
      startPath: '/auth/apple/start',
      productionUse: false,
      note: 'Reserved for native app and web sign-in after Apple developer configuration.',
    },
    {
      id: 'magic_link',
      label: 'Magic Link',
      status: 'planned',
      startPath: '/auth/magic/start',
      productionUse: false,
      note: 'Reserved for passwordless email login after mail provider and abuse controls are approved.',
    },
  ];
}

function handleProviders(env: AuthEnv): Response {
  const adminTotpConfigured = Boolean(env.SMYST_ADMIN_TOTP_SECRETS || env.SMYST_ADMIN_TOTP_SECRET);
  return jsonResponse({
    ok: true,
    phase: 'phase-1-production-foundation',
    activeProvider: 'github',
    providers: providerContracts(env),
    adminSecurity: {
      roles: ['owner', 'admin', 'member'],
      sessionCookie: 'HttpOnly; Secure; SameSite=Strict',
      admin2fa: {
        requiredForAdminApi: true,
        method: 'totp',
        configured: adminTotpConfigured,
        ttlSeconds: ADMIN_MFA_TTL_SECONDS,
        status: adminTotpConfigured ? 'ready' : 'blocked',
      },
      requiredNextStep: adminTotpConfigured
        ? 'Admin 2FA is configured; verify with /auth/admin-2fa/status after login.'
        : 'Add dedicated admin 2FA before broad admin rollout.',
    },
  });
}

function providerNotActive(provider: string): Response {
  return errorResponse(
    'auth_provider_not_active',
    `${provider} login is planned but not active in the Phase 1 production auth worker yet.`,
    501,
    {
      activeProvider: 'github',
      providersPath: '/auth/providers',
    },
  );
}

function safeReturnTo(raw: string | null, canonicalHost: string): string {
  if (!raw) return '/';
  try {
    const candidate = new URL(raw, canonicalHost);
    if (candidate.origin === new URL(canonicalHost).origin) {
      return candidate.pathname + candidate.search;
    }
  } catch {
    return '/';
  }
  return '/';
}

function splitCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hasConfiguredValue(raw: string | undefined, value: string): boolean {
  return splitCsv(raw).includes(value.toLowerCase());
}

function deriveRoles(user: GitHubUser, email: string, env: AuthEnv): AuthRole[] {
  const id = String(user.id).toLowerCase();
  if (hasConfiguredValue(env.SMYST_OWNER_GITHUB_IDS, id) || hasConfiguredValue(env.SMYST_OWNER_EMAILS, email)) {
    return ['owner'];
  }
  if (hasConfiguredValue(env.SMYST_ADMIN_GITHUB_IDS, id) || hasConfiguredValue(env.SMYST_ADMIN_EMAILS, email)) {
    return ['admin'];
  }
  return ['member'];
}

function permissionsForRoles(roles: AuthRole[]): AuthPermission[] {
  return Array.from(new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role])));
}

async function upsertUserRecord(
  env: AuthEnv,
  user: GitHubUser,
  email: string,
  roles: AuthRole[],
  permissions: AuthPermission[],
): Promise<UserRecord> {
  const sub = `github:${user.id}`;
  const key = `auth:user:${sub}`;
  const now = Date.now();
  const existing = await readJsonKv<UserRecord>(env.SESSIONS, key);
  const record: UserRecord = {
    sub,
    provider: 'github',
    providerId: user.id,
    login: user.login,
    email,
    name: user.name ?? user.login,
    picture: user.avatar_url ?? undefined,
    roles,
    permissions,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastLoginAt: now,
  };
  await env.SESSIONS.put(key, JSON.stringify(record));
  return record;
}

function publicUser(data: SessionData) {
  return {
    sub: data.sub,
    email: data.email,
    name: data.name ?? null,
    picture: data.picture ?? null,
    locale: data.locale ?? null,
    roles: data.roles,
    permissions: data.permissions,
    adminMfa: {
      required: isAdminSession(data),
      verified: isAdminMfaFresh(data),
      method: data.adminMfaMethod ?? null,
      expiresAt: data.adminMfaExpiresAt ?? null,
    },
  };
}

async function startAuth(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get('return_to') ?? url.searchParams.get('returnTo'), env.CANONICAL_HOST);
  const stateNonce = randomB64Url(24);
  const stateTs = Date.now();
  let stateBody = `${stateNonce}.${stateTs}`;

  try {
    await env.OAUTH_STATE.put(
      `state:${stateNonce}`,
      JSON.stringify({ returnTo, createdAt: Date.now() }),
      { expirationTtl: STATE_TTL_SECONDS },
    );
  } catch (err) {
    console.warn('oauth_state_kv_unavailable', JSON.stringify({ error: String(err) }));
    stateBody = `${stateNonce}.${stateTs}.${b64urlEncodeText(returnTo)}`;
  }

  const stateSig = await hmacSign(env.AUTH_HMAC_SECRET, stateBody);
  const state = `${stateBody}.${stateSig}`;

  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: `${env.CANONICAL_HOST}/auth/github/callback`,
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  });

  return withSecurity(Response.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`, 302));
}

async function exchangeCode(code: string, env: AuthEnv): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'SmystAuthWorker/1.0',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${env.CANONICAL_HOST}/auth/github/callback`,
      }),
    });
  } catch (err) {
    console.error('github token exchange exception', JSON.stringify({ error: String(err) }));
    return null;
  }

  if (!res.ok) return null;
  const data = (await res.json()) as GitHubTokenResponse;
  if (data.error) {
    console.error('github token exchange failed', data.error, data.error_description ?? '');
    return null;
  }
  if (data.token_type && data.token_type.toLowerCase() !== 'bearer') return null;
  return data.access_token ?? null;
}

async function fetchGitHubJson<T>(url: string, token: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'SmystAuthWorker/1.0',
      },
    });
  } catch (err) {
    console.error('github json fetch exception', JSON.stringify({ url, error: String(err) }));
    return null;
  }
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function chooseEmail(user: GitHubUser, emails: GitHubEmail[] | null): string | null {
  if (user.email) return user.email;
  if (!emails) return null;
  const primary = emails.find((item) => item.primary && item.verified);
  if (primary) return primary.email;
  return emails.find((item) => item.verified)?.email ?? null;
}

async function handleCallback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) return errorResponse('oauth_error', `OAuth error: ${oauthError}`, 400);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return errorResponse('oauth_missing_params', 'Missing code or state', 400);

  const stateParts = state.split('.');
  if (stateParts.length !== 3 && stateParts.length !== 4) return errorResponse('oauth_bad_state', 'Bad state format', 400);
  const stateSig = stateParts[stateParts.length - 1];
  const stateBody = stateParts.slice(0, -1).join('.');
  const [stateNonce, stateTs, returnToEncoded] = stateParts;
  const validSig = await hmacVerify(env.AUTH_HMAC_SECRET, stateBody, stateSig);
  if (!validSig) return errorResponse('oauth_invalid_state', 'Invalid state signature', 400);
  const issuedAt = Number(stateTs);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_SECONDS * 1000) {
    return errorResponse('oauth_state_expired', 'State expired', 400);
  }

  let returnTo = '/';
  if (stateParts.length === 4) {
    returnTo = safeReturnTo(b64urlDecodeText(returnToEncoded) ?? '/', env.CANONICAL_HOST);
  } else {
    const stored = await readJsonKv<
      | { returnTo: string; createdAt: number }
      | null
    >(env.OAUTH_STATE, `state:${stateNonce}`);
    if (!stored) return errorResponse('oauth_state_expired', 'State expired or unknown', 400);
    returnTo = safeReturnTo(stored.returnTo, env.CANONICAL_HOST);
    try {
      await env.OAUTH_STATE.delete(`state:${stateNonce}`);
    } catch (err) {
      console.warn('oauth_state_delete_failed', JSON.stringify({ error: String(err) }));
    }
  }

  const token = await exchangeCode(code, env);
  if (!token) return errorResponse('oauth_token_failed', 'Token exchange failed', 502);

  const user = await fetchGitHubJson<GitHubUser>(GITHUB_USER_URL, token);
  const emails = await fetchGitHubJson<GitHubEmail[]>(GITHUB_EMAILS_URL, token);
  if (!user) return errorResponse('oauth_user_failed', 'GitHub user fetch failed', 502);

  const email = chooseEmail(user, emails);
  if (!email) return errorResponse('oauth_email_missing', 'Verified email missing', 401);
  const roles = deriveRoles(user, email, env);
  const permissions = permissionsForRoles(roles);
  let userRecord: Pick<UserRecord, 'sub' | 'email' | 'name' | 'picture'>;
  try {
    userRecord = await upsertUserRecord(env, user, email, roles, permissions);
  } catch (err) {
    if (isKvPutLimit(err)) {
      userRecord = {
        sub: `github:${user.id}`,
        email,
        name: user.name ?? user.login,
        picture: user.avatar_url ?? undefined,
      };
    } else {
      console.error('oauth_user_store_failed', JSON.stringify({ providerId: user.id, error: String(err) }));
      return errorResponse('oauth_user_store_failed', 'User record could not be stored.', 500);
    }
  }

  const sessionId = randomB64Url(32);
  const session: SessionData = {
    sub: userRecord.sub,
    email,
    name: userRecord.name,
    picture: userRecord.picture,
    roles,
    permissions,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  try {
    await env.SESSIONS.put(`s:${sessionId}`, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
    await rememberUserSession(env, session.sub, sessionId);
  } catch (err) {
    if (isKvPutLimit(err)) {
      const statelessSession: SessionData = {
        ...session,
        expiresAt: Date.now() + STATELESS_SESSION_TTL_SECONDS * 1000,
      };
      const token = await makeStatelessSessionToken(env, statelessSession);
      return sessionReadyResponse(env, returnTo, makeSessionCookie(token, STATELESS_SESSION_TTL_SECONDS));
    }
    console.error('oauth_session_store_failed', JSON.stringify({ sub: session.sub, error: String(err) }));
    return errorResponse('oauth_session_store_failed', 'Session could not be stored.', 500);
  }

  return sessionReadyResponse(env, returnTo, makeSessionCookie(sessionId));
}

async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const rawSessionId = readCookie(request, SESSION_COOKIE);
  const sessionId = readSessionCookie(request);
  if (rawSessionId && !sessionId) {
    const statelessSession = await readStatelessSessionToken(env, rawSessionId);
    if (statelessSession) {
      return jsonResponse({
        authenticated: true,
        user: publicUser({
          ...statelessSession,
          roles: statelessSession.roles ?? ['member'],
          permissions: statelessSession.permissions ?? ROLE_PERMISSIONS.member,
        }),
        session: {
          tokenType: 'signed-httpOnly-cookie',
          expiresAt: statelessSession.expiresAt,
        },
      });
    }
  }
  if (rawSessionId && !sessionId) {
    return jsonResponse({ authenticated: false }, 200, { 'Set-Cookie': makeClearCookie() });
  }
  if (!sessionId) return jsonResponse({ authenticated: false });

  const data = await readJsonKv<SessionData>(env.SESSIONS, `s:${sessionId}`);
  if (!data || data.expiresAt < Date.now()) {
    return jsonResponse({ authenticated: false }, 200, { 'Set-Cookie': makeClearCookie() });
  }

  return jsonResponse({
    authenticated: true,
    user: publicUser({
      ...data,
      roles: data.roles ?? ['member'],
      permissions: data.permissions ?? ROLE_PERMISSIONS.member,
    }),
    session: {
      tokenType: 'httpOnly-cookie',
      expiresAt: data.expiresAt,
    },
  });
}

async function handleAdminMfaStatus(request: Request, env: AuthEnv): Promise<Response> {
  const current = await readCurrentSession(request, env);
  if (!current) return errorResponse('unauthorized', 'Unauthorized', 401);
  const required = isAdminSession(current.session);
  const configured = required ? Boolean(totpSecretForSession(current.session, env)) : false;
  const verified = required ? isAdminMfaFresh(current.session) : false;
  return jsonResponse({
    ok: true,
    required,
    configured,
    verified,
    method: required ? 'totp' : null,
    expiresAt: current.session.adminMfaExpiresAt ?? null,
    tokenType: current.tokenType,
    canVerify: Boolean(required && configured && current.sessionId),
    note: required && !configured
      ? 'Admin TOTP secret is not configured for this account.'
      : required && current.tokenType === 'signed-httpOnly-cookie'
        ? 'Admin 2FA verification requires a KV-backed session.'
        : null,
  });
}

async function handleAdminMfaVerify(request: Request, env: AuthEnv): Promise<Response> {
  const current = await readCurrentSession(request, env);
  if (!current) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!isAdminSession(current.session)) return errorResponse('admin_2fa_not_required', 'Admin 2FA is not required for this session.', 400);
  if (!current.sessionId) return errorResponse('admin_2fa_requires_kv_session', 'Admin 2FA verification requires a KV-backed session.', 409);
  const secret = totpSecretForSession(current.session, env);
  if (!secret) return errorResponse('admin_2fa_not_configured', 'Admin TOTP secret is not configured for this account.', 428);

  const parsed = await readJsonBody<AdminTotpVerifyRequest>(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;
  const code = typeof parsed.value.code === 'string' ? parsed.value.code : '';
  const valid = await verifyTotp(secret, code);
  if (!valid) return errorResponse('admin_2fa_invalid', 'Invalid admin 2FA code.', 401);

  const now = Date.now();
  const next: SessionData = {
    ...current.session,
    adminMfaVerifiedAt: now,
    adminMfaExpiresAt: now + ADMIN_MFA_TTL_SECONDS * 1000,
    adminMfaMethod: 'totp',
  };
  await env.SESSIONS.put(`s:${current.sessionId}`, JSON.stringify(next), {
    expirationTtl: Math.max(60, Math.ceil((next.expiresAt - now) / 1000)),
  });

  return jsonResponse({
    ok: true,
    verified: true,
    method: 'totp',
    expiresAt: next.adminMfaExpiresAt,
  });
}

async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (sessionId) await env.SESSIONS.delete(`s:${sessionId}`);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': makeClearCookie() });
}

async function handleLogoutAll(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return jsonResponse({ ok: true, deleted: 0 }, 200, { 'Set-Cookie': makeClearCookie() });

  const current = await readJsonKv<SessionData>(env.SESSIONS, `s:${sessionId}`);
  if (!current) return jsonResponse({ ok: true, deleted: 0 }, 200, { 'Set-Cookie': makeClearCookie() });

  const key = userSessionsKey(current.sub);
  const ids = validSessionIds(await readJsonKv<unknown>(env.SESSIONS, key));
  const uniqueIds = Array.from(new Set([sessionId, ...ids]));
  await Promise.all(uniqueIds.map((id) => env.SESSIONS.delete(`s:${id}`)));
  await env.SESSIONS.delete(key);

  return jsonResponse({ ok: true, deleted: uniqueIds.length }, 200, { 'Set-Cookie': makeClearCookie() });
}

export default {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return strictCorsPreflight(request, env.CANONICAL_HOST, 'GET, POST');
      }

      const configError = validateAuthConfig(env);
      if (configError) return configError;

      const csrf = requireSameOrigin(request, env.CANONICAL_HOST);
      if (csrf) {
        return csrf;
      }

      if (url.pathname === '/auth/providers' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:providers'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleProviders(env);
      }

      if (url.pathname === '/auth/admin-2fa/status' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:admin-2fa-status'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminMfaStatus(request, env);
      }

      if (url.pathname === '/auth/admin-2fa/verify' && request.method === 'POST') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:admin-2fa-verify'),
          limit: 10,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminMfaVerify(request, env);
      }

      if (url.pathname === '/auth/github/start' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:start'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return startAuth(request, env);
      }
      if (url.pathname === '/auth/google/start' && request.method === 'GET') {
        return providerNotActive('Google');
      }
      if (url.pathname === '/auth/apple/start' && request.method === 'GET') {
        return providerNotActive('Apple');
      }
      if (url.pathname === '/auth/magic/start' && request.method === 'POST') {
        return providerNotActive('Magic Link');
      }
      if (url.pathname === '/auth/github/callback' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:callback'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleCallback(request, env);
      }
      if (url.pathname === '/auth/me' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:me'),
          limit: 180,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleMe(request, env);
      }
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:logout'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleLogout(request, env);
      }
      if (url.pathname === '/auth/logout-all' && request.method === 'POST') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:logout-all'),
          limit: 10,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleLogoutAll(request, env);
      }

      const allowed = allowedMethodsForAuthPath(url.pathname);
      if (allowed) return methodNotAllowed(allowed);
      return errorResponse('not_found', 'Not found', 404);
    }, request);
  },
};

declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}
