export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_JSON_BODY_BYTES = 128 * 1024;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function securityHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  });
}

export function withSecurity(response: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of securityHeaders(extra)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return withSecurity(new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': JSON_CONTENT_TYPE,
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  }));
}

export function errorResponse(code: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  return jsonResponse({ error: { code, message, ...extra } }, status);
}

export function corsPreflight(canonicalHost: string, methods: string): Response {
  return withSecurity(new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': canonicalHost,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
    },
  }));
}

export function allowedCorsOrigin(request: Request, canonicalHost: string, extraOrigins = ''): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = new Set([
    canonicalHost.replace(/\/$/, ''),
    ...extraOrigins
      .split(',')
      .map((item) => item.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ]);
  return allowed.has(origin.replace(/\/$/, '')) ? origin : null;
}

export function strictCorsPreflight(
  request: Request,
  canonicalHost: string,
  methods: string,
  extraOrigins = '',
): Response {
  const origin = allowedCorsOrigin(request, canonicalHost, extraOrigins) ?? canonicalHost;
  return withSecurity(new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Smyst-CSRF',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin',
    },
  }));
}

function sameSiteUrl(raw: string | null, canonicalHost: string): boolean {
  if (!raw) return false;
  try {
    return new URL(raw).origin === new URL(canonicalHost).origin;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request, canonicalHost: string): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get('Origin');
  if (origin) {
    return sameSiteUrl(origin, canonicalHost)
      ? null
      : errorResponse('csrf_origin_rejected', 'Request origin is not allowed.', 403);
  }
  const referer = request.headers.get('Referer');
  if (sameSiteUrl(referer, canonicalHost)) return null;
  return errorResponse('csrf_origin_required', 'Same-origin request header is required.', 403);
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return { ok: false, response: errorResponse('unsupported_media_type', 'Expected application/json.', 415) };
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: errorResponse('payload_too_large', 'JSON body is too large.', 413) };
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, response: errorResponse('payload_too_large', 'JSON body is too large.', 413) };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, response: errorResponse('invalid_json', 'Invalid JSON.', 400) };
  }
}

export function clientKey(request: Request, prefix: string): string {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  return `${prefix}:${ip}`;
}

export async function rateLimit(kv: KVNamespace, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = Math.floor(now / (opts.windowSeconds * 1000));
  const key = `rate:${opts.key}:${bucket}`;
  const current = Number((await kv.get(key)) ?? '0');
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: opts.windowSeconds + 5 });
  return {
    allowed: next <= opts.limit,
    count: next,
    limit: opts.limit,
    resetAt: (bucket + 1) * opts.windowSeconds * 1000,
  };
}

export async function requireRateLimit(kv: KVNamespace, opts: RateLimitOptions): Promise<Response | null> {
  const result = await rateLimit(kv, opts);
  if (result.allowed) return null;
  return errorResponse('rate_limited', 'Too many requests. Please slow down.', 429, {
    limit: result.limit,
    resetAt: result.resetAt,
  });
}

export async function safeHandler(handler: () => Promise<Response>): Promise<Response> {
  try {
    return withSecurity(await handler());
  } catch (err) {
    console.error('worker_unhandled_error', String(err));
    return errorResponse('internal_error', 'Internal error', 500);
  }
}

declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}
