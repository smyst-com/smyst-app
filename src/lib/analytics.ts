/**
 * twynt.com Analytics — GA4 mit Google Consent Mode v2
 *
 * DSGVO-konform:
 *  - Default: ALLE Storage-Permissions auf "denied"
 *  - Cookie-Banner setzt nach Klick "granted" oder bleibt auf "denied"
 *  - Bevor Consent erteilt wurde, sendet GA4 nur "Cookieless Pings" (anonymized,
 *    keine personenbezogenen Daten, kein Cookie gesetzt)
 *  - Mit IP-Anonymisierung (default in GA4)
 *
 * Der Measurement-ID wird zur Build-Zeit injiziert via
 *   VITE_GA_MEASUREMENT_ID  (z. B. "G-XXXXXXX")
 *
 * Wenn ENV nicht gesetzt → Analytics komplett deaktiviert (Dev-Mode).
 */

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

const MEASUREMENT_ID = (import.meta as any).env?.VITE_GA_MEASUREMENT_ID as string | undefined;

const CONSENT_STORAGE_KEY = 'twynt_consent_v1';

export type ConsentChoice = 'granted' | 'denied';

export interface ConsentState {
  ad_storage: ConsentChoice;
  analytics_storage: ConsentChoice;
  ad_user_data: ConsentChoice;
  ad_personalization: ConsentChoice;
  functionality_storage: ConsentChoice;
  personalization_storage: ConsentChoice;
  security_storage: ConsentChoice; // immer 'granted' (essential cookies)
  /** Zeitstempel der Entscheidung, für Audit-Trail. */
  decidedAt: number | null;
  /** Version der Consent-Logik — falls wir später UI/Defaults ändern, neu fragen. */
  version: number;
}

const CONSENT_VERSION = 1;

const DEFAULT_DENIED: ConsentState = {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted', // essential, immer
  decidedAt: null,
  version: CONSENT_VERSION,
};

function readStoredConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredConsent(state: ConsentState): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage blockiert — egal, Defaults bleiben denied */
  }
}

/**
 * Initialisiert GA4 + Consent Mode.
 * Sollte SO FRÜH wie möglich aufgerufen werden — idealerweise in main.tsx.
 */
export function initAnalytics(): void {
  if (!MEASUREMENT_ID) {
    console.debug('[analytics] VITE_GA_MEASUREMENT_ID not set, analytics disabled');
    return;
  }

  // Consent Mode v2: Default DENIED, BEVOR gtag-Script geladen wird
  const stored = readStoredConsent();
  const consent = stored ?? DEFAULT_DENIED;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };

  // Default-Consent (vor Tag-Init!)
  window.gtag('consent', 'default', {
    ad_storage: consent.ad_storage,
    analytics_storage: consent.analytics_storage,
    ad_user_data: consent.ad_user_data,
    ad_personalization: consent.ad_personalization,
    functionality_storage: consent.functionality_storage,
    personalization_storage: consent.personalization_storage,
    security_storage: consent.security_storage,
    wait_for_update: 500, // 500ms warten, damit Banner-Klick durchkommt vor erstem Hit
  });

  // GA4-Script async laden
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
    // Cookieless Pings sind aktiviert, da Default-Consent denied
    // (siehe https://support.google.com/analytics/answer/9976101)
  });
}

/**
 * User hat Cookie-Banner akzeptiert oder abgelehnt — Update an gtag senden.
 */
export function setConsent(opts: {
  analytics: boolean;
  marketing: boolean;
}): void {
  const next: ConsentState = {
    ...DEFAULT_DENIED,
    analytics_storage: opts.analytics ? 'granted' : 'denied',
    ad_storage: opts.marketing ? 'granted' : 'denied',
    ad_user_data: opts.marketing ? 'granted' : 'denied',
    ad_personalization: opts.marketing ? 'granted' : 'denied',
    // Functionality + Personalization an Analytics gekoppelt (UI-Settings)
    functionality_storage: opts.analytics ? 'granted' : 'denied',
    personalization_storage: opts.analytics ? 'granted' : 'denied',
    decidedAt: Date.now(),
    version: CONSENT_VERSION,
  };
  writeStoredConsent(next);

  if (window.gtag) {
    window.gtag('consent', 'update', {
      ad_storage: next.ad_storage,
      analytics_storage: next.analytics_storage,
      ad_user_data: next.ad_user_data,
      ad_personalization: next.ad_personalization,
      functionality_storage: next.functionality_storage,
      personalization_storage: next.personalization_storage,
    });
  }
}

/**
 * User möchte Consent zurückziehen — alle GA-Cookies löschen.
 */
export function revokeConsent(): void {
  writeStoredConsent({ ...DEFAULT_DENIED, decidedAt: Date.now() });
  if (window.gtag) {
    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
    });
  }
  // _ga / _gid Cookies aktiv löschen (Domain '.twynt.com')
  for (const name of ['_ga', '_gid', '_gat']) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.${location.hostname.split('.').slice(-2).join('.')}`;
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

/**
 * Ob der User schon eine Entscheidung getroffen hat (für Banner-Anzeige).
 */
export function hasDecidedConsent(): boolean {
  const stored = readStoredConsent();
  return stored !== null && stored.decidedAt !== null;
}

/**
 * Custom Event tracken — z. B. Twin-Erstellung, Memory-Upload.
 * Wird nur gesendet wenn analytics_storage = granted.
 */
export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (!MEASUREMENT_ID || !window.gtag) return;
  window.gtag('event', eventName, params || {});
}

/**
 * Page-View manuell triggern (für SPA-Routenwechsel).
 */
export function trackPageView(path: string, title?: string): void {
  if (!MEASUREMENT_ID || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: location.origin + path,
  });
}
