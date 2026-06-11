/**
 * CookieConsent — DSGVO-konformer Cookie-Banner für smyst.com.
 *
 * Compliance:
 *  - Alle nicht-essentiellen Cookies sind STANDARD denied (siehe analytics.ts)
 *  - User muss aktiv akzeptieren ("Akzeptieren" oder Settings → Speichern)
 *  - "Nur Notwendige" und "Alle akzeptieren" gleich prominent (DSGVO-konform)
 *  - Keine "Ablehnen versteckt"-Dark-Pattern
 *  - Granulare Auswahl: Notwendig / Statistik / Marketing
 *  - Decision-Timestamp gespeichert für Audit-Trail
 *
 * Verwendung in App.tsx:
 *   <CookieConsent />
 *
 * Reagiert automatisch auf hasDecidedConsent(), sodass der Banner nur erscheint
 * wenn der Nutzer noch keine Entscheidung getroffen hat.
 */

import { useEffect, useState } from 'react';
import { hasDecidedConsent, revokeConsent, setConsent } from '@/lib/analytics';

type View = 'banner' | 'settings';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<View>('banner');
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Erst nach Mount entscheiden — verhindert SSR-Mismatch & Flash
    setVisible(!hasDecidedConsent());
  }, []);

  // Listener für globalen "Cookie-Einstellungen öffnen"-Trigger,
  // z. B. aus Footer-Link "Cookie-Einstellungen"
  useEffect(() => {
    const onOpen = () => {
      setView('settings');
      setVisible(true);
    };
    window.addEventListener('smyst:open-cookie-settings', onOpen as EventListener);
    return () => window.removeEventListener('smyst:open-cookie-settings', onOpen as EventListener);
  }, []);

  const acceptAll = () => {
    setConsent({ analytics: true, marketing: true });
    setVisible(false);
  };

  const acceptOnlyNecessary = () => {
    setConsent({ analytics: false, marketing: false });
    setVisible(false);
  };

  const saveCustom = () => {
    setConsent({ analytics, marketing });
    setVisible(false);
  };

  const revoke = () => {
    revokeConsent();
    setAnalytics(false);
    setMarketing(false);
    // Banner bleibt sichtbar im "settings"-Mode
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-labelledby="privacy-consent-title"
      aria-describedby="privacy-consent-desc"
      className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:bottom-3 sm:px-4"
    >
      <div className="rounded-2xl border border-white/40 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl sm:p-5">
        {view === 'banner' ? (
          <>
            <h2 id="privacy-consent-title" className="text-base font-semibold text-[#0b1c44] sm:text-lg">
              App-Daten & Datenschutz
            </h2>
            <p
              id="privacy-consent-desc"
              className="mt-1 text-sm leading-relaxed text-[#555b64]"
            >
              smyst.com speichert notwendige App-Daten für die Funktion.
              Optional helfen uns anonyme Nutzungsdaten, smyst.com zu verbessern. Du kannst deine
              Einstellungen jederzeit ändern. Mehr in der{' '}
              <a href="/datenschutz" className="text-[#0b1c44] underline hover:no-underline">
                Datenschutzerklärung
              </a>
              .
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#0b1c44] px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Alle akzeptieren
              </button>
              <button
                type="button"
                onClick={acceptOnlyNecessary}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-[#16181b] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Nur Notwendige
              </button>
              <button
                type="button"
                onClick={() => setView('settings')}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-sm font-medium text-[#0b1c44] underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none"
              >
                Einstellungen
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <h2 id="privacy-consent-title" className="text-base font-semibold text-[#0b1c44] sm:text-lg">
                Datenschutz-Einstellungen
              </h2>
              <button
                type="button"
                onClick={() => setView('banner')}
                aria-label="Zurück"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              <li className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#16181b]">Notwendig</h3>
                    <p className="mt-0.5 text-xs text-[#555b64]">
                      Login, Spracheinstellung, Sicherheit. Lassen sich nicht abschalten.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-emerald-700">Aktiv</span>
                </div>
              </li>

              <li className="rounded-xl border border-gray-200 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#16181b]">Statistik</h3>
                    <p className="mt-0.5 text-xs text-[#555b64]">
                      Lokale Nutzungsentscheidung. Externe Analytics sind in Production deaktiviert.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 text-[#0b1c44] focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </li>

              <li className="rounded-xl border border-gray-200 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#16181b]">Marketing</h3>
                    <p className="mt-0.5 text-xs text-[#555b64]">
                      Werbe-Personalisierung. Aktuell nicht aktiv genutzt — nur als Vorsorge gelistet.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(e) => setMarketing(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 text-[#0b1c44] focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </li>
            </ul>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveCustom}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#0b1c44] px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Auswahl speichern
              </button>
              <button
                type="button"
                onClick={revoke}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-sm font-medium text-[#555b64] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Alle widerrufen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
