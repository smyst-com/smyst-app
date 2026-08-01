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
import { DEFAULT_LANG, useLanguage } from '@/lib/i18n';
import { useStaticTranslations } from '@/lib/staticTranslations';

type View = 'banner' | 'settings';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<View>('banner');
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { lang } = useLanguage();
  const t = useStaticTranslations(lang);
  const c = t.consent;

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
      className="fixed inset-x-0 top-0 z-[55] mx-auto w-full max-w-3xl px-3 pt-[max(env(safe-area-inset-top),12px)] sm:top-3 sm:px-4 sm:pt-0"
    >
      <div className="rounded-2xl border border-white/10 bg-[#171d29]/95 p-4 text-[#f4f7fb] shadow-2xl ring-1 ring-black/20 backdrop-blur-xl sm:p-5">
        {view === 'banner' ? (
          <>
            <h2 id="privacy-consent-title" className="text-base font-semibold text-white sm:text-lg">
              {lang === DEFAULT_LANG ? 'App-Daten & Datenschutz' : c.title}
            </h2>
            <p
              id="privacy-consent-desc"
              className="mt-1 text-sm leading-relaxed text-[#aeb6c4]"
            >
              {lang === DEFAULT_LANG ? 'smyst.com speichert notwendige App-Daten für die Funktion. Optional helfen uns anonyme Nutzungsdaten, smyst.com zu verbessern. Du kannst deine Einstellungen jederzeit ändern. Mehr in der' : c.intro}{' '}
              <a href="/datenschutz" className="text-white underline hover:no-underline">
                {lang === DEFAULT_LANG ? 'Datenschutzerklärung' : c.privacy}
              </a>
              .
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#111722] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {lang === DEFAULT_LANG ? 'Alle akzeptieren' : c.acceptAll}
              </button>
              <button
                type="button"
                onClick={acceptOnlyNecessary}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {lang === DEFAULT_LANG ? 'Nur Notwendige' : c.onlyNecessary}
              </button>
              <button
                type="button"
                onClick={() => setView('settings')}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-sm font-medium text-white underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:flex-none"
              >
                {lang === DEFAULT_LANG ? 'Einstellungen' : c.settings}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <h2 id="privacy-consent-title" className="text-base font-semibold text-white sm:text-lg">
                {lang === DEFAULT_LANG ? 'Datenschutz-Einstellungen' : c.settingsTitle}
              </h2>
              <button
                type="button"
                onClick={() => setView('banner')}
                aria-label={lang === DEFAULT_LANG ? 'Zurück' : c.back}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#aeb6c4] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{lang === DEFAULT_LANG ? 'Notwendig' : c.necessaryTitle}</h3>
                    <p className="mt-0.5 text-xs text-[#aeb6c4]">
                      {lang === DEFAULT_LANG ? 'Login, Spracheinstellung, Sicherheit. Lassen sich nicht abschalten.' : c.necessaryDesc}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-emerald-300">{lang === DEFAULT_LANG ? 'Aktiv' : c.active}</span>
                </div>
              </li>

              <li className="rounded-xl border border-white/10 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{lang === DEFAULT_LANG ? 'Statistik' : c.statsTitle}</h3>
                    <p className="mt-0.5 text-xs text-[#aeb6c4]">
                      {lang === DEFAULT_LANG ? 'Lokale Nutzungsentscheidung. Externe Analytics sind in Production deaktiviert.' : c.statsDesc}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-white/20 bg-transparent text-[#111722] focus:ring-2 focus:ring-white/60"
                  />
                </label>
              </li>

              <li className="rounded-xl border border-white/10 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{lang === DEFAULT_LANG ? 'Marketing' : c.marketingTitle}</h3>
                    <p className="mt-0.5 text-xs text-[#aeb6c4]">
                      {lang === DEFAULT_LANG ? 'Werbung und Werbe-Personalisierung. Wird nur nach aktiver Einwilligung und technischer Freigabe geladen.' : c.marketingDesc}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(e) => setMarketing(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-white/20 bg-transparent text-[#111722] focus:ring-2 focus:ring-white/60"
                  />
                </label>
              </li>
            </ul>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveCustom}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#111722] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {lang === DEFAULT_LANG ? 'Auswahl speichern' : c.save}
              </button>
              <button
                type="button"
                onClick={revoke}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {lang === DEFAULT_LANG ? 'Alle widerrufen' : c.revoke}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
