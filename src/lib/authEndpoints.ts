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

/**
 * Session-Token-Speicher (Fallback fuer Cross-Site-Cookies).
 *
 * Frontend (smyst.com) und Auth-Backend (salad.cloud) sind cross-site; Safari
 * blockt Third-Party-Cookies vollstaendig. Der OAuth-Callback liefert die
 * signierte Session daher zusaetzlich als Token im URL-Fragment
 * (#smyst_auth=...). Wir speichern es und senden es als Authorization-Header.
 */
const AUTH_TOKEN_STORAGE_KEY = 'smyst_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeAuthToken(token: string) {
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage nicht verfuegbar (z. B. Private Mode) — Cookie bleibt Fallback.
  }
}

export function clearStoredAuthToken() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignorieren
  }
}

/** Liest ein frisches Session-Token aus dem URL-Fragment und entfernt es sofort aus der URL. */
export function captureAuthTokenFromLocation(): string | null {
  const match = /[#&]smyst_auth=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  storeAuthToken(token);
  const cleanedHash = window.location.hash.replace(/[#&]smyst_auth=[^&]+/, '');
  const cleanedUrl =
    window.location.pathname + window.location.search + (cleanedHash === '#' ? '' : cleanedHash);
  window.history.replaceState(window.history.state, '', cleanedUrl);
  return token;
}

export async function fetchAuth(path: string, init: RequestInit = {}) {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  const token = getStoredAuthToken();
  if (token) {
    const headers = new Headers(init.headers);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    init = { ...init, headers };
  }

  for (const baseUrl of AUTH_FETCH_BASE_URLS) {
    try {
      const response = await fetch(buildAuthUrl(path, baseUrl), init);
      if (response.status >= 500 && baseUrl !== AUTH_FETCH_BASE_URLS[AUTH_FETCH_BASE_URLS.length - 1]) {
        lastError = new Error(`Auth endpoint failed with ${response.status}`);
        lastResponse = response;
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  // Hat ein Endpunkt geantwortet (z. B. ehrliche 503 mit JSON-Fehlertext),
  // geben wir diese Antwort zurueck statt einen Netzwerkfehler zu werfen.
  if (lastResponse) return lastResponse;

  throw lastError instanceof Error ? lastError : new Error('Auth request failed');
}
