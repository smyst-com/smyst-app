/**
 * smyst.com Analytics — Free-only local consent adapter.
 *
 * Production darf keine externen Analytics-Abhaengigkeiten laden.
 * Diese Datei speichert nur Consent lokal und
 * stellt No-op Tracking-Hooks bereit, damit UI-Code stabil bleibt.
 */

const CONSENT_STORAGE_KEY = 'smyst_consent_v1';

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
    window.dispatchEvent(new CustomEvent('smyst:consent-changed', { detail: state }));
  } catch {
    /* localStorage blockiert — egal, Defaults bleiben denied */
  }
}

/**
 * Initialisiert keine externen Analytics. Bleibt als stabiler App-Hook erhalten.
 */
export function initAnalytics(): void {
  console.debug('[analytics] external analytics disabled by free-only policy');
}

/**
 * User hat Cookie-Banner akzeptiert oder abgelehnt.
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
}

export function getConsentState(): ConsentState {
  return readStoredConsent() ?? DEFAULT_DENIED;
}

export function hasMarketingConsent(): boolean {
  const state = getConsentState();
  return (
    state.ad_storage === 'granted' &&
    state.ad_user_data === 'granted' &&
    state.ad_personalization === 'granted'
  );
}

/**
 * User möchte Consent zurückziehen.
 */
export function revokeConsent(): void {
  writeStoredConsent({ ...DEFAULT_DENIED, decidedAt: Date.now() });
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
 * No-op in der Free-only-Phase.
 */
export function trackEvent(_eventName: string, _params?: Record<string, unknown>): void {
  return;
}

/**
 * Page-View manuell triggern (für SPA-Routenwechsel).
 */
export function trackPageView(path: string, title?: string): void {
  void path;
  void title;
}
