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
  /** KV namespace for sessions. */
  SESSIONS: KVNamespace;
  /** KV namespace for short-lived OAuth state. */
  OAUTH_STATE: KVNamespace;
}

const SESSION_COOKIE = 'smyst_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const STATE_TTL_SECONDS = 60 * 10;

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

function allowedMethodsForAuthPath(pathname: string): string[] | null {
  if (pathname === '/auth/github/start') return ['GET'];
  if (pathname === '/auth/github/callback') return ['GET'];
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
  createdAt: number;
  expiresAt: number;
}

type AuthRole = 'owner' | 'admin' | 'member';

type AuthPermission =
  | 'auth:read'
  | 'profile:read'
  | 'storage:read'
  | 'storage:write'
  | 'storage:delete'
  | 'twin:read'
  | 'twin:write'
  | 'chat:read'
  | 'chat:write'
  | 'admin:read'
  | 'admin:write';

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

function makeSessionCookie(sessionId: string): string {
  return [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Priority=High',
  ].join('; ');
}

function makeClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Priority=High`;
}

function userSessionsKey(userSub: string): string {
  return `auth:sessions:${userSub}`;
}

async function rememberUserSession(env: AuthEnv, userSub: string, sessionId: string): Promise<void> {
  const key = userSessionsKey(userSub);
  const existing = (await env.SESSIONS.get(key, 'json')) as string[] | null;
  const next = [sessionId, ...(existing ?? []).filter((id) => id !== sessionId)].slice(0, 20);
  await env.SESSIONS.put(key, JSON.stringify(next), { expirationTtl: SESSION_TTL_SECONDS });
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
  const existing = (await env.SESSIONS.get(key, 'json')) as UserRecord | null;
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
  await env.SESSIONS.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 370 });
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
  const res = await fetch(GITHUB_TOKEN_URL, {
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
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SmystAuthWorker/1.0',
    },
  });
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
    const stored = await env.OAUTH_STATE.get(`state:${stateNonce}`, 'json') as
      | { returnTo: string; createdAt: number }
      | null;
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
  const userRecord = await upsertUserRecord(env, user, email, roles, permissions);

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

  await env.SESSIONS.put(`s:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  await rememberUserSession(env, session.sub, sessionId);

  return withSecurity(new Response(null, {
    status: 302,
    headers: {
      Location: `${env.CANONICAL_HOST}${returnTo}`,
      'Set-Cookie': makeSessionCookie(sessionId),
    },
  }));
}

async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const rawSessionId = readCookie(request, SESSION_COOKIE);
  const sessionId = readSessionCookie(request);
  if (rawSessionId && !sessionId) {
    return jsonResponse({ authenticated: false }, 200, { 'Set-Cookie': makeClearCookie() });
  }
  if (!sessionId) return jsonResponse({ authenticated: false });

  const data = await env.SESSIONS.get(`s:${sessionId}`, 'json') as SessionData | null;
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

async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (sessionId) await env.SESSIONS.delete(`s:${sessionId}`);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': makeClearCookie() });
}

async function handleLogoutAll(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return jsonResponse({ ok: true, deleted: 0 }, 200, { 'Set-Cookie': makeClearCookie() });

  const current = (await env.SESSIONS.get(`s:${sessionId}`, 'json')) as SessionData | null;
  if (!current) return jsonResponse({ ok: true, deleted: 0 }, 200, { 'Set-Cookie': makeClearCookie() });

  const key = userSessionsKey(current.sub);
  const ids = (await env.SESSIONS.get(key, 'json')) as string[] | null;
  const uniqueIds = Array.from(new Set([sessionId, ...(ids ?? [])]));
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

      if (url.pathname === '/auth/github/start' && request.method === 'GET') {
        const limited = await requireRateLimit(env.SESSIONS, {
          key: clientKey(request, 'auth:start'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return startAuth(request, env);
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
