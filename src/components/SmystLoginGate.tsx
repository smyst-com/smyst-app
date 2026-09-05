import { useEffect, useState, Suspense, lazy } from 'react'
import type { StaticTranslations } from '@/lib/staticTranslations'

const EmailAuthForm = lazy(() => import('@/components/EmailAuthForm'))

// Login-Bereich 1:1 nach Inhaber-Foto (05.09.2026, „genau eins zu eins"):
// heller Vollbild-Screen — Titel, Untertitel, Google/Fingerabdruck/GitHub-
// Zeilen, E-Mail-Zeile mit schwarzem Pfeil-Knopf, Hinweistext, Rechts-Links.
// Zeigt sich NUR fuer nicht angemeldete Nutzer (Aufruf: „Einloggen" auf der
// Landing-Anmeldeseite). Nach Login laedt EmailAuthForm die Seite neu und der
// Nutzer landet auf der Start-Shell.
// Farb-/Radius-Klassen bewusst als Arbitrary-Werte (bg-[#FFFFFF], rounded-[14px],
// rounded-[999px]) — die globalen Dark-Theme-Flips greifen darauf nicht.
export function SmystLoginGate({
  lang,
  t,
  onClose,
  onGoogle,
}: {
  lang: string
  t: StaticTranslations
  onClose: () => void
  onGoogle: () => void
}) {
  const [emailOpen, setEmailOpen] = useState(false)
  const [fingerHint, setFingerHint] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const s = lang === 'en'
    ? {
        title: 'Sign in or create account',
        sub: 'You get your own storage and your history on all devices — free.',
        google: 'Continue with Google',
        finger: 'Continue with fingerprint',
        github: 'Continue with GitHub',
        email: 'Continue with e-mail',
        hint1: 'We can tell from your address whether you already have an account.',
        hint2: 'You don’t have to decide.',
        fingerHint: 'Fingerprint sign-in needs to be activated via e-mail or Google first.',
        back: 'Back',
        terms: 'Terms', privacy: 'Privacy', imprint: 'Imprint',
      }
    : {
        title: 'Anmelden oder registrieren',
        sub: 'Du bekommst deinen eigenen Speicher und den Verlauf auf allen Geräten — kostenlos.',
        google: 'Mit Google fortfahren',
        finger: 'Mit Fingerabdruck fortfahren',
        github: 'Mit GitHub fortfahren',
        email: 'Mit E-Mail fortfahren',
        hint1: 'Wir erkennen an deiner Adresse, ob du schon ein Konto hast.',
        hint2: 'Du musst dich nicht entscheiden.',
        fingerHint: 'Fingerabdruck-Login bitte zuerst über E-Mail oder Google aktivieren.',
        back: 'Zurück',
        terms: 'Nutzungsbedingungen', privacy: 'Datenschutz', imprint: 'Impressum',
      }

  const row =
    'flex w-full items-center gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#FFFFFF] px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:border-[#D0D5DD] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2FA79B]/50'
  const badge = 'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#F3F4F6]'
  const chevron = (
    <svg viewBox="0 0 24 24" className="ml-auto h-5 w-5 shrink-0 text-[#98A2B3]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )

  return (
    <div
      dir={t.dir}
      lang={lang}
      role="dialog"
      aria-modal="true"
      aria-label={s.title}
      className="smyst-login-gate fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#F5F7F9] text-[#1F2937]"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={s.back}
          className="grid h-11 w-11 place-items-center rounded-[12px] text-[#1F2937] transition hover:bg-[#EBEEF1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2FA79B]/50"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7" />
          </svg>
        </button>

        <h1 className="mt-5 text-[22px] font-bold leading-tight tracking-[-0.01em]">{s.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">{s.sub}</p>

        <div className="mt-6 grid gap-3">
          <button type="button" onClick={onGoogle} className={row}>
            <span className={badge}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z" />
                <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold text-[#1F2937]">{s.google}</span>
            {chevron}
          </button>

          <button type="button" onClick={() => setFingerHint(true)} className={row}>
            <span className={badge}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#2FA79B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M7.5 4.3a8.4 8.4 0 0 1 9 0" />
                <path d="M4.6 7.6a11.8 11.8 0 0 1 14.8 0" />
                <path d="M12 11.2a3.4 3.4 0 0 1 3.4 3.4c0 2.4-.5 4.4-1.6 6.2" />
                <path d="M12 14.6a.9.9 0 0 1 .9.9c0 2.4-.4 4.4-1.3 6" />
                <path d="M8.6 14.6a3.4 3.4 0 0 1 1.6-2.9" />
                <path d="M6.3 12.4a6.6 6.6 0 0 1 1.2-3.3" />
                <path d="M17.7 12.4a6.6 6.6 0 0 0-1-3.1" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold text-[#1F2937]">{s.finger}</span>
            {chevron}
          </button>

          <button type="button" onClick={onGoogle} className={row}>
            <span className={`${badge} bg-[#24292F]`}>
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="#FFFFFF" aria-hidden="true">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.66-.21-2.2.82a7.68 7.68 0 0 0-2-.27c-.68 0-1.36.09-2 .27-1.54-1.02-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.45.2-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45 1.28 1.03 2.4.46.02.6.01 1.16.01 1.32 0 .21-.15.46-.55.38A8.013 8.013 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold text-[#1F2937]">{s.github}</span>
            {chevron}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEmailOpen((open) => !open)}
          className={`${row} mt-3 ${emailOpen ? 'border-[#2FA79B]/60 ring-1 ring-[#2FA79B]/30' : ''}`}
          aria-expanded={emailOpen}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#2FA79B]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
          <span className="text-[15px] font-semibold text-[#1F2937]">{s.email}</span>
          <span
            className="ml-auto grid h-10 w-10 shrink-0 place-items-center bg-[#111827] text-white transition hover:bg-[#000000]"
            style={{ borderRadius: '999px' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5m-7 7 7-7 7 7" />
            </svg>
          </span>
        </button>

        {emailOpen && (
          <div className="mt-3 rounded-[14px] border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-[10px] bg-[#F3F4F6]" />}>
              <EmailAuthForm onClose={() => setEmailOpen(false)} labels={lang === 'de' ? undefined : t.auth} />
            </Suspense>
          </div>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-[#6B7280]">
          {s.hint1}
          <br />
          {s.hint2}
        </p>
        {fingerHint && (
          <p className="mt-2 text-[12px] font-semibold leading-relaxed text-[#2FA79B]">{s.fingerHint}</p>
        )}

        <div className="mt-auto pt-8 text-center text-[12px] leading-relaxed text-[#98A2B3]">
          <a href="/terms/" className="font-semibold text-[#2FA79B] hover:underline">{s.terms}</a>
          <span className="mx-1.5">·</span>
          <a href="/privacy/" className="font-semibold text-[#2FA79B] hover:underline">{s.privacy}</a>
          <span className="mx-1.5">·</span>
          <a href="/imprint/" className="font-semibold text-[#2FA79B] hover:underline">{s.imprint}</a>
        </div>
      </div>
    </div>
  )
}
