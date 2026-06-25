const AUTH_BASE_URL = 'https://parmesan-onion-pw08cg2t1ge4jnk6.salad.cloud/auth';
const CANONICAL_RETURN_TO = 'https://smyst.com/';

function securityHeaders(contentType?: string): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

function redirectToGoogle(requestUrl: URL): Response {
  const target = new URL(`${AUTH_BASE_URL}/google/start`);
  target.searchParams.set('return_to', requestUrl.searchParams.get('return_to') || CANONICAL_RETURN_TO);
  return Response.redirect(target.toString(), 302);
}

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);

    if (url.pathname === '/auth/me') {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: securityHeaders('application/json; charset=utf-8'),
      });
    }

    if (url.pathname === '/auth/google/start' || url.pathname === '/auth/github/start') {
      return redirectToGoogle(url);
    }

    return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
      status: 404,
      headers: securityHeaders('application/json; charset=utf-8'),
    });
  },
};
