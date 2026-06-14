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
const CSRF_HEADER = 'X-Smyst-CSRF';
const CSRF_HEADER_VALUE = '1';
export const DELETE_CONFIRM_HEADER = 'X-Smyst-Delete-Confirm';

export function securityHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()',
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

export function methodNotAllowed(methods: string[]): Response {
  const allowMethods = Array.from(new Set([...methods, 'OPTIONS']));
  return jsonResponse(
    {
      error: {
        code: 'method_not_allowed',
        message: 'Method not allowed.',
        allow: allowMethods,
      },
    },
    405,
    { Allow: allowMethods.join(', ') },
  );
}

export function corsPreflight(canonicalHost: string, methods: string): Response {
  return withSecurity(new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': canonicalHost,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': `Content-Type, Authorization, X-Smyst-CSRF, ${DELETE_CONFIRM_HEADER}`,
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
      'Access-Control-Allow-Headers': `Content-Type, Authorization, X-Smyst-CSRF, ${DELETE_CONFIRM_HEADER}`,
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
  if (request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return errorResponse('csrf_header_required', 'CSRF header is required.', 403);
  }
  const fetchSite = request.headers.get('Sec-Fetch-Site')?.toLowerCase();
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return errorResponse('csrf_fetch_site_rejected', 'Cross-site request is not allowed.', 403);
  }
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

export function requireDeleteConfirmation(request: Request, expectedValue: string): Response | null {
  if (request.method !== 'DELETE') return null;
  if (request.headers.get(DELETE_CONFIRM_HEADER) === expectedValue) return null;
  return errorResponse(
    'delete_confirmation_header_required',
    `Destructive requests require ${DELETE_CONFIRM_HEADER}: ${expectedValue}.`,
    428,
  );
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
  let result: RateLimitResult;
  try {
    result = await rateLimit(kv, opts);
  } catch (err) {
    console.warn('rate_limit_unavailable', JSON.stringify({ key: opts.key, error: String(err) }));
    return null;
  }
  if (result.allowed) return null;
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return jsonResponse(
    {
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Please slow down.',
        limit: result.limit,
        resetAt: result.resetAt,
      },
    },
    429,
    {
      'Retry-After': String(retryAfterSeconds),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    },
  );
}

function requestIdFrom(request?: Request): string {
  const cfRay = request?.headers.get('cf-ray');
  if (cfRay) return cfRay.split('-')[0] || cfRay;
  return crypto.randomUUID();
}

function timingHeader(startedAt: number): string {
  return `total;dur=${Date.now() - startedAt}`;
}

export async function safeHandler(handler: () => Promise<Response>, request?: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  try {
    return withSecurity(await handler(), {
      'Server-Timing': timingHeader(startedAt),
      'X-Smyst-Request-Id': requestId,
    });
  } catch (err) {
    console.error('worker_unhandled_error', JSON.stringify({ requestId, error: String(err) }));
    return withSecurity(
      errorResponse('internal_error', 'Internal error', 500, { requestId }),
      {
        'Server-Timing': timingHeader(startedAt),
        'X-Smyst-Request-Id': requestId,
      },
    );
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
