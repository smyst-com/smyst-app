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

function shouldTryNext(response: Response) {
  if (response.status === 502 || response.status === 503 || response.status === 504) return true;
  return response.status >= 520 && response.status <= 530;
}

export function buildAuthUrl(path: string, baseUrl = AUTH_BASE_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function fetchAuth(path: string, init: RequestInit = {}) {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const baseUrl of AUTH_FETCH_BASE_URLS) {
    try {
      const response = await fetch(buildAuthUrl(path, baseUrl), init);
      if (shouldTryNext(response)) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('Auth request failed');
}
