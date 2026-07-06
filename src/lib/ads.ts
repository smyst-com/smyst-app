import { hasMarketingConsent } from '@/lib/analytics';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_CLIENT = String(import.meta.env.VITE_ADSENSE_CLIENT ?? '').trim();
const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === 'true';
const ADSENSE_SCRIPT_ID = 'smyst-adsense-script';
const ADSENSE_CLIENT_PATTERN = /^ca-pub-\d{10,}$/;

let scriptPromise: Promise<void> | null = null;

export function adsenseClient(): string {
  return ADSENSE_CLIENT;
}

export function isAdsenseConfigured(): boolean {
  return ADSENSE_ENABLED && ADSENSE_CLIENT_PATTERN.test(ADSENSE_CLIENT);
}

export function canRequestAds(): boolean {
  return isAdsenseConfigured() && hasMarketingConsent();
}

export function ensureAdsenseScript(): Promise<void> {
  if (!canRequestAds()) return Promise.resolve();
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('adsense_script_failed'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function requestAdRender(): void {
  if (!canRequestAds()) return;
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.push({});
}
