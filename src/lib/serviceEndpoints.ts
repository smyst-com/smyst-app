const SALAD_SERVICE_FALLBACK_BASE_URL = 'https://cherry-asparagus-a32jleuk8dgn22zu.salad.cloud';

function cleanBaseUrl(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\/$/, '');
}

function unique(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function shouldTryNext(response: Response, baseUrl: string) {
  if (baseUrl === '' && response.status === 404) return true;
  if (response.status === 502 || response.status === 503 || response.status === 504) return true;
  return response.status >= 520 && response.status <= 530;
}

export const SERVICE_BASE_URL = cleanBaseUrl(import.meta.env.VITE_API_BASE_URL, '');
export const SERVICE_FALLBACK_BASE_URL = cleanBaseUrl(
  import.meta.env.VITE_API_FALLBACK_BASE_URL,
  SALAD_SERVICE_FALLBACK_BASE_URL,
);

export const SERVICE_FETCH_BASE_URLS = unique([SERVICE_BASE_URL, SERVICE_FALLBACK_BASE_URL]);

export function buildServiceUrl(path: string, baseUrl = SERVICE_BASE_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function fetchService(path: string, init: RequestInit = {}) {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const baseUrl of SERVICE_FETCH_BASE_URLS) {
    try {
      const response = await fetch(buildServiceUrl(path, baseUrl), init);
      if (shouldTryNext(response, baseUrl)) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('Service request failed');
}
