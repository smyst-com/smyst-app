/**
 * Google Identity Services (GIS) — Popup-Login ohne Server-Redirect.
 *
 * Warum: Der klassische Redirect-Flow (/auth/google/start) braucht serverseitig
 * ein Google-Client-Secret. Der GIS-Popup-Flow holt client-seitig ein
 * Access-Token (Google-eigenes Popup mit Konto-Auswahl); das Backend prueft es
 * ueber Googles tokeninfo-Endpoint (aud == unsere Client-ID) und stellt dann
 * die normale smyst-Session aus. Es wird kein Client-Secret benoetigt.
 *
 * Die Client-ID ist oeffentlich (steht in jeder OAuth-URL) und darf im
 * Frontend-Bundle liegen.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '449969912847-ngp703eu4et2pt6ucmjb39v7lblvp2un.apps.googleusercontent.com';

interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GisOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GisTokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOauth2 } };
  }
}

let gisLoadPromise: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing && window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = existing ?? document.createElement('script');
    const timeout = window.setTimeout(() => {
      gisLoadPromise = null;
      reject(new Error('Google Identity Services timed out'));
    }, 10_000);
    script.addEventListener('load', () => {
      window.clearTimeout(timeout);
      resolve();
    });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      gisLoadPromise = null;
      reject(new Error('Google Identity Services failed to load'));
    });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return gisLoadPromise;
}

/**
 * Oeffnet das Google-Konto-Popup und liefert ein Access-Token fuer
 * `openid email profile`. Muss aus einer User-Geste (Click) heraus
 * aufgerufen werden, sonst blocken Browser das Popup.
 */
export async function requestGoogleAccessToken(): Promise<string> {
  await loadGoogleIdentity();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services unavailable');
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (response) => {
        if (response?.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error(response?.error_description || response?.error || 'Kein Access-Token erhalten'));
        }
      },
      error_callback: (error) => {
        reject(new Error(error?.message || error?.type || 'Google-Login abgebrochen'));
      },
    });
    client.requestAccessToken();
  });
}
