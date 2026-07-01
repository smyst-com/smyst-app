const SALAD_AUTH_FALLBACK_BASE_URL = 'https://cherry-asparagus-a32jleuk8dgn22zu.salad.cloud/auth';

function cleanBaseUrl(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\/$/, '');
}

function unique(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

export const AUTH_BASE_URL = cleanBaseUrl(import.meta.env.VITE_AUTH_BASE_URL, '/auth');
export const AUTH_FALLBACK_BASE_URL = cleanBaseUrl(
  import.meta.env.VITE_AUTH_FALLBACK_BASE_URL,
  SALAD_AUTH_FALLBACK_BASE_URL,
);

export const AUTH_FETCH_BASE_URLS = unique([AUTH_BASE_URL, AUTH_FALLBACK_BASE_URL]);

export function buildAuthUrl(path: string, baseUrl = AUTH_BASE_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function fetchAuth(path: string, init: RequestInit = {}) {
  let lastError: unknown = null;

  for (const baseUrl of AUTH_FETCH_BASE_URLS) {
    try {
      const response = await fetch(buildAuthUrl(path, baseUrl), init);
      if (response.status >= 500 && baseUrl !== AUTH_FETCH_BASE_URLS[AUTH_FETCH_BASE_URLS.length - 1]) {
        lastError = new Error(`Auth endpoint failed with ${response.status}`);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Auth request failed');
}
