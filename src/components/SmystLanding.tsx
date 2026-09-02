import { useEffect } from 'react'
import type { StaticTranslations } from '@/lib/staticTranslations'

// Startseiten-Landing nach dem „Vollständigen Prototyp" (app-mockup.html, 20.08.2026)
// — helle Glas-Optik, Hero, Vision, Produkt, CTA, Footer.
// Inhaltlich bewusst ehrlich: Web/PWA/iPhone/Android statt App-Store-Behauptungen
// (Projektziele: smyst.com läuft auf Web, PWA, iPhone, Android).
// Freigabe Inhaber: Chat 30.08.2026 („Ich gebe dir alle Rechte … hundert Prozent fertig").
export function SmystLanding({
  lang,
  t,
  onEnter,
  onStartTwin,
  onLogin,
}: {
  lang: string
  t: StaticTranslations
  onEnter: () => void
  onStartTwin: () => void
  onLogin: () => void
}) {
  const l = t.landing

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEnter])

  const glassCard =
    'rounded-[22px] border border-white/40 bg-white/[0.18] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_18px_36px_rgba(94,99,109,0.1)]'

  return (
    <div
      dir={t.dir}
      lang={lang}
      className="smyst-landing fixed inset-0 z-30 overflow-y-auto overscroll-contain text-[#16181b]"
      style={{
        backgroundImage:
          'radial-gradient(circle at top left, rgba(255,255,255,0.88), transparent 28%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.58), transparent 22%), radial-gradient(circle at 50% 100%, rgba(191,195,203,0.42), transparent 34%), linear-gradient(160deg, #f5f6f8 0%, #dde0e5 34%, #cfd3d9 100%)',
      }}
    >
      <div className="mx-auto w-[min(1200px,calc(100%-40px))] pb-14">
        {/* Kopfzeile */}
        <header className="sticky top-4 z-40 mt-4 flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/40 bg-white/25 px-5 py-3 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_14px_34px_rgba(98,104,114,0.12)] max-md:justify-center max-md:rounded-3xl">
          <button
            type="button"
            onClick={onEnter}
            className="text-[1.05rem] font-bold tracking-[-0.03em] transition-opacity hover:opacity-80"
          >
            smyst.com
          </button>
          <nav aria-label="smyst.com" className="flex items-center gap-5 max-lg:hidden">
            <a href="#vision" className="text-[0.95rem] text-[#555b64] transition-colors hover:text-[#16181b]">
              {t.mnav.vision}
            </a>
            <a href="#product" className="text-[0.95rem] text-[#555b64] transition-colors hover:text-[#16181b]">
              {t.mnav.product}
            </a>
          </nav>
          <div className="flex flex-wrap items-center justify-center gap-3 max-md:w-full">
            <button
              type="button"
              onClick={onLogin}
              className="text-[0.95rem] text-[#555b64] transition-colors hover:text-[#16181b]"
            >
              {t.mnav.login}
            </button>
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex min-h-[44px] items-center rounded-full border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(235,238,242,0.62))] px-5 font-bold text-[#101114] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(90,96,106,0.14)] transition-transform hover:-translate-y-px"
            >
              {l.colProfiles}
            </button>
          </div>
        </header>

        <main>
          {/* Hero */}
          <section className="grid grid-cols-1 items-center gap-10 pb-12 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:pt-[72px]">
            <div>
              <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">smyst.com</p>
              <p className="mb-5 inline-flex items-center rounded-full border border-white/55 bg-white/[0.18] px-3 py-2 text-[0.92rem] text-[#555b64] backdrop-blur-md">
                {l.badge}
              </p>
              <h1
                className="max-w-[11ch] text-[clamp(2.8rem,7vw,6.4rem)] font-bold leading-[0.98] tracking-[-0.05em]"
                style={{ fontFamily: "'Space Grotesk', ui-serif, Georgia, 'Times New Roman', serif" }}
              >
                {l.h1}
              </h1>
              <p className="mt-6 max-w-[60ch] text-[1.02rem] leading-[1.7] text-[#555b64]">{l.sub}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3.5 max-sm:flex-col max-sm:items-stretch">
                <button
                  type="button"
                  onClick={onStartTwin}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(235,238,242,0.62))] px-6 text-[0.95rem] font-bold text-[#101114] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(90,96,106,0.14)] transition-transform hover:-translate-y-px"
                >
                  {l.ctaStart}
                </button>
                <button
                  type="button"
                  onClick={onEnter}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/55 bg-white/[0.18] px-6 text-[0.95rem] font-bold text-[#16181b] backdrop-blur-lg transition-colors hover:border-white/75 hover:bg-white/[0.26]"
                >
                  {l.ctaHow}
                </button>
              </div>
              <ul className="mt-8 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-3">
                {[l.metric1, l.metric2, l.metric3].map((metric, index) => (
                  <li key={metric} className={`${glassCard} p-[18px]`}>
                    <strong className="mb-2.5 block text-[1.2rem] text-[#16181b]">{`0${index + 1}`}</strong>
                    <span className="text-[0.9rem] text-[#555b64]">{metric}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[0.88rem] font-medium text-[#767d87]">{l.trustNote}</p>
            </div>

            {/* Interface-Karte */}
            <div className="relative overflow-hidden rounded-[30px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.26),rgba(255,255,255,0.14))] p-5 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_24px_80px_rgba(82,88,98,0.16)]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]" />
                </div>
                <span className="rounded-full border border-white/55 bg-white/30 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#5a616a]">
                  {l.previewLabel}
                </span>
              </div>
              <div className="mt-3.5 grid grid-cols-1 gap-3.5 rounded-2xl border border-white/25 bg-white/[0.12] p-[18px] backdrop-blur-xl sm:grid-cols-[1.4fr_0.8fr]">
                <div>
                  <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.panelProfile}</p>
                  <p className="mb-2 text-[1.8rem] tracking-[-0.04em]">Anna M.</p>
                  <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">
                    {lang === 'de'
                      ? 'Empathisch, reflektiert, ruhig entscheidend. Schwerpunkt auf Familie, Verantwortung und langfristigem Denken.'
                      : 'Empathetic, reflective, calmly decisive. Focused on family, responsibility and long-term thinking.'}
                  </p>
                </div>
                <div className="flex flex-col justify-between">
                  <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.panelHealth}</p>
                  <strong className="mb-2 text-[1.8rem] tracking-[-0.04em]">86%</strong>
                  <span className="text-[0.85rem] text-[#555b64]">
                    {lang === 'de'
                      ? 'Strukturierte Erinnerungen und Werte modelliert'
                      : 'Structured memories and values modelled'}
                  </span>
                </div>
              </div>
              <div className="mt-3.5 grid grid-cols-1 items-center gap-4 rounded-2xl border border-white/25 bg-white/[0.12] p-[18px] backdrop-blur-xl sm:grid-cols-[1fr_120px]">
                <div>
                  <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.panelMemory}</p>
                  <ul className="list-disc pl-[18px] text-[0.9rem] text-[#555b64]">
                    <li>{l.memory1}</li>
                    <li>{l.memory2}</li>
                    <li>{l.memory3}</li>
                  </ul>
                </div>
                <div className="mx-auto flex aspect-square w-[110px] items-center justify-center rounded-full border border-white/60 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.85),rgba(214,222,233,0.55))] shadow-[0_18px_36px_rgba(94,99,109,0.14)]">
                  <strong className="text-[1.3rem] text-[#2b6d9e]">86%</strong>
                </div>
              </div>
              <div className="mt-3.5 grid gap-3 rounded-2xl border border-white/25 bg-white/[0.12] p-[18px] backdrop-blur-xl">
                <p className="text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.panelChat}</p>
                <p className="ml-[12%] rounded-2xl bg-white/[0.18] px-4 py-3.5 text-[0.9rem] text-[#555b64]">{l.chatUser}</p>
                <p className="mr-[12%] rounded-2xl bg-white/[0.28] px-4 py-3.5 text-[0.9rem] text-[#555b64]">{l.chatAi}</p>
              </div>
            </div>
          </section>

          {/* Vision */}
          <section id="vision" className="pt-[80px]">
            <div className="mb-7 max-w-[760px]">
              <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.visionEyebrow}</p>
              <h2
                className="text-[clamp(2rem,5vw,4rem)] font-bold leading-[0.98] tracking-[-0.05em]"
                style={{ fontFamily: "'Space Grotesk', ui-serif, Georgia, 'Times New Roman', serif" }}
              >
                {l.visionH2}
              </h2>
              <p className="mt-4 text-[1.02rem] leading-[1.7] text-[#555b64]">{l.visionText}</p>
            </div>
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Identity</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.idTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.idText}</p>
              </article>
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Memory</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.memTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.memText}</p>
              </article>
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Legacy</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.legacyTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.legacyText}</p>
              </article>
            </div>
          </section>

          {/* Produkt */}
          <section id="product" className="pt-[80px]">
            <div className="mb-7 max-w-[760px]">
              <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{l.productEyebrow}</p>
              <h2
                className="text-[clamp(2rem,5vw,4rem)] font-bold leading-[0.98] tracking-[-0.05em]"
                style={{ fontFamily: "'Space Grotesk', ui-serif, Georgia, 'Times New Roman', serif" }}
              >
                {l.productH2}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Twin Builder</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.builderTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.builderText}</p>
              </article>
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Memory Upload</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.uploadTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.uploadText}</p>
              </article>
              <article className={`${glassCard} p-[26px]`}>
                <p className="mb-3.5 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Twin Chat</p>
                <h3 className="mb-3 text-[1.35rem] leading-[1.2] tracking-[-0.03em]">{l.chatTitle}</h3>
                <p className="text-[0.95rem] leading-[1.7] text-[#555b64]">{l.chatText}</p>
              </article>
            </div>
          </section>

          {/* Abschluss-CTA */}
          <section className="pb-10 pt-[80px]">
            <div className={`${glassCard} p-[34px]`}>
              <p className="mb-3 text-[0.76rem] font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Next Step</p>
              <h2
                className="mb-4 text-[clamp(2rem,5vw,4rem)] font-bold leading-[0.98] tracking-[-0.05em]"
                style={{ fontFamily: "'Space Grotesk', ui-serif, Georgia, 'Times New Roman', serif" }}
              >
                {l.ctaH2}
              </h2>
              <p className="max-w-[60ch] text-[1.02rem] leading-[1.7] text-[#555b64]">{l.ctaText}</p>
              <div className="mt-6 flex flex-wrap gap-3.5 max-sm:flex-col max-sm:items-stretch">
                <button
                  type="button"
                  onClick={onStartTwin}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(235,238,242,0.62))] px-6 text-[0.95rem] font-bold text-[#101114] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(90,96,106,0.14)] transition-transform hover:-translate-y-px"
                >
                  {l.ctaButton}
                </button>
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/55 bg-white/[0.18] px-6 text-[0.95rem] font-bold text-[#16181b] backdrop-blur-lg transition-colors hover:border-white/75 hover:bg-white/[0.26]"
                >
                  {l.ctaTop}
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* Fußzeile */}
        <footer className="mt-16 border-t border-white/40 pt-10">
          <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_2.8fr]">
            <div className="flex flex-col gap-3">
              <span className="text-[1.3rem] font-bold tracking-[-0.03em]">smyst.com</span>
              <p className="text-[0.88rem] text-[#767d87]">{l.badge}</p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              <div>
                <h4 className="mb-2 text-[0.92rem] font-bold uppercase tracking-[0.08em]">{t.footer.columnProduct}</h4>
                <button type="button" onClick={onEnter} className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">
                  {l.colProfiles}
                </button>
                <button type="button" onClick={onStartTwin} className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">
                  {l.colChat}
                </button>
                <button type="button" onClick={onStartTwin} className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">
                  {l.colUpload}
                </button>
              </div>
              <div>
                <h4 className="mb-2 text-[0.92rem] font-bold uppercase tracking-[0.08em]">{t.footer.columnLegal}</h4>
                <a href="/imprint/" className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">{t.footer.imprint}</a>
                <a href="/privacy/" className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">{t.footer.privacy}</a>
                <a href="/terms/" className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">{t.footer.terms}</a>
              </div>
              <div>
                <h4 className="mb-2 text-[0.92rem] font-bold uppercase tracking-[0.08em]">{t.footer.columnCompany}</h4>
                <a href="mailto:s@smyst.com" className="mb-2.5 block text-[0.9rem] text-[#555b64] transition-colors hover:text-[#16181b]">{t.footer.contact}</a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/40 pt-6 max-sm:flex-col max-sm:text-center">
            <p className="text-[0.85rem] text-[#767d87]">{t.footer.rights}</p>
            <p className="text-[0.85rem] font-medium text-[#767d87]">{l.trustNote}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
