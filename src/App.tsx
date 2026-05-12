import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import LangSwitcher from '@/components/LangSwitcher'
import MobileNav, { type NavItem } from '@/components/MobileNav'
import CookieConsent from '@/components/CookieConsent'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/useAuth'

type AppView = 'landing' | 'twin-builder' | 'memory-upload' | 'twin-chat' | 'dashboard'

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const auth = useAuth()

  const navigateTo = (view: AppView) => {
    setCurrentView(view)
    window.scrollTo(0, 0)
  }

  // Items für Mobile-Drawer (gleicher Inhalt wie Desktop-Nav)
  const mobileItems: NavItem[] =
    currentView === 'landing'
      ? [
          { label: 'Vision', onClick: () => document.getElementById('vision')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Anwendungen', onClick: () => document.getElementById('use-cases')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Produkt', onClick: () => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Sicherheit', onClick: () => document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' }) },
        ]
      : [
          { label: 'Dashboard', onClick: () => navigateTo('dashboard'), active: currentView === 'dashboard' },
          { label: 'Twin Builder', onClick: () => navigateTo('twin-builder'), active: currentView === 'twin-builder' },
          { label: 'Memory', onClick: () => navigateTo('memory-upload'), active: currentView === 'memory-upload' },
          { label: 'Chat', onClick: () => navigateTo('twin-chat'), active: currentView === 'twin-chat' },
        ]

  return (
    <div className="min-h-screen gradient-mesh">
      {/* Header */}
      <header className="sticky top-[18px] z-50 mx-auto mt-[18px] w-[calc(100%-40px)] max-w-[1200px] rounded-full border border-white/42 bg-white/24 px-5 py-4 backdrop-blur-[28px] saturate-[145%] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_14px_34px_rgba(98,104,114,0.12)]">
        <div className="flex items-center justify-between gap-5">
          <button onClick={() => navigateTo('landing')} className="inline-flex items-center gap-3 font-space-grotesk text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
            <span>twynt.com</span>
          </button>

          <nav className="hidden items-center gap-5 md:flex" aria-label="Hauptnavigation">
            {currentView === 'landing' ? (
              <>
                <button onClick={() => document.getElementById('vision')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Vision</button>
                <button onClick={() => document.getElementById('use-cases')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Anwendungen</button>
                <button onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Produkt</button>
                <button onClick={() => document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Sicherheit</button>
              </>
            ) : (
              <>
                <button onClick={() => navigateTo('dashboard')} className={`text-sm ${currentView === 'dashboard' ? 'text-[#16181b] font-semibold' : 'text-[#555b64]'} hover:text-[#16181b] transition-colors`}>Dashboard</button>
                <button onClick={() => navigateTo('twin-builder')} className={`text-sm ${currentView === 'twin-builder' ? 'text-[#16181b] font-semibold' : 'text-[#555b64]'} hover:text-[#16181b] transition-colors`}>Twin Builder</button>
                <button onClick={() => navigateTo('memory-upload')} className={`text-sm ${currentView === 'memory-upload' ? 'text-[#16181b] font-semibold' : 'text-[#555b64]'} hover:text-[#16181b] transition-colors`}>Memory</button>
                <button onClick={() => navigateTo('twin-chat')} className={`text-sm ${currentView === 'twin-chat' ? 'text-[#16181b] font-semibold' : 'text-[#555b64]'} hover:text-[#16181b] transition-colors`}>Chat</button>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3.5">
            {/* LangSwitcher: Desktop sichtbar */}
            <div className="hidden md:block">
              <LangSwitcher variant="compact" />
            </div>
            <a href="mailto:i@twynt.com" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors hidden lg:block">i@twynt.com</a>
            {/* Auth-Action: Avatar wenn eingeloggt, sonst Sign-In/Early-Access */}
            {auth.status === 'authenticated' ? (
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                aria-label={`Eingeloggt als ${auth.user?.email}, zum Dashboard`}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/40 bg-white/40 text-xs font-semibold text-[#0b1c44] backdrop-blur-md hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {auth.user?.picture ? (
                  <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  (auth.user?.name?.[0] ?? auth.user?.email[0] ?? '?').toUpperCase()
                )}
              </button>
            ) : (
              <Button size="sm" onClick={() => navigateTo(currentView === 'landing' ? 'twin-builder' : 'landing')}>
                {currentView === 'landing' ? 'Early Access' : 'Zurück zum Start'}
              </Button>
            )}
            {/* Hamburger: Mobile */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={mobileNavOpen}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/30 backdrop-blur-md hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        items={mobileItems}
        primaryAction={
          auth.status === 'authenticated'
            ? { label: 'Zum Dashboard', onClick: () => navigateTo('dashboard') }
            : { label: 'Early Access starten', onClick: () => navigateTo('twin-builder') }
        }
      />

      {/* Main Content */}
      <main className="mx-auto w-[calc(100%-40px)] max-w-[1200px] pb-14">
        {currentView === 'landing' && <LandingPage onNavigate={navigateTo} />}
        {currentView === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
        {currentView === 'twin-builder' && <TwinBuilderView onNavigate={navigateTo} />}
        {currentView === 'memory-upload' && <MemoryUploadView />}
        {currentView === 'twin-chat' && <TwinChatView />}
      </main>

      {/* Footer */}
      <footer className="mx-auto mt-20 w-[calc(100%-40px)] max-w-[1200px] border-t border-white/42 pt-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.2fr_2.8fr] mb-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="font-space-grotesk text-xl font-bold tracking-tight">twynt.com</span>
            </div>
            <p className="text-sm text-[#767d87]">Human Memory, Reimagined</p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Produkt</h4>
              <button onClick={() => navigateTo('twin-builder')} className="text-left text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Twin Builder</button>
              <button onClick={() => navigateTo('memory-upload')} className="text-left text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Memory Upload</button>
              <button onClick={() => navigateTo('twin-chat')} className="text-left text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Twin Chat</button>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Unternehmen</h4>
              <a href="mailto:i@twynt.com?subject=%C3%9Cber%20twynt.com" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Über uns</a>
              <a href="mailto:i@twynt.com?subject=Karriere%20bei%20twynt.com" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Karriere</a>
              <a href="mailto:b2b@twynt.com" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">B2B-Anfragen</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Rechtliches</h4>
              <a href="mailto:i@twynt.com?subject=Impressum" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Impressum</a>
              <a href="mailto:i@twynt.com?subject=Datenschutz" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">Datenschutz</a>
              <a href="mailto:i@twynt.com?subject=AGB" className="text-sm text-[#555b64] hover:text-[#16181b] transition-colors">AGB</a>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/26 pt-6 md:flex-row">
          <p className="text-sm text-[#767d87]">© 2026 twynt.com. Alle Rechte vorbehalten.</p>
          <div className="flex flex-wrap gap-5">
            <a href="mailto:i@twynt.com" className="text-sm font-semibold text-[#555b64] hover:text-[#16181b] transition-colors">Kontakt</a>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('twynt:open-cookie-settings'))}
              className="text-sm font-semibold text-[#555b64] hover:text-[#16181b] transition-colors"
            >
              App-Daten
            </button>
          </div>
        </div>
      </footer>

      {/* DSGVO consent banner (nur sichtbar wenn noch keine Entscheidung) */}
      <CookieConsent />
    </div>
  )
}

// Start view
function LandingPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  return (
    <>
      {/* Hero Section */}
      <section className="grid grid-cols-1 items-center gap-10 pt-[72px] lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Mobile App Only</p>
          <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-white/56 bg-white/18 px-3.5 py-2.5 text-sm text-[#555b64] backdrop-blur-[26px] saturate-[150%] shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
            <span>Human Memory, Reimagined</span>
          </div>
          <h1 className="max-w-[11ch] text-[clamp(3.4rem,7vw,6.4rem)] font-bold leading-[0.98] tracking-tight">Dein Leben. Deine Stimme. Für immer.</h1>
          <p className="mt-[22px] max-w-[60ch] text-base leading-relaxed text-[#555b64]">
            twynt.com ist eine reine Mobile-App für deinen digitalen Zwilling. Nur App für iOS, Android und ausgewählte Hersteller-Stores.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Button size="lg" onClick={() => onNavigate('twin-builder')}>Starte deinen Twin</Button>
            <Button variant="secondary" size="lg" onClick={() => document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' })}>So funktioniert's</Button>
          </div>

          <ul className="mt-[34px] grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {[
              { num: '01', text: 'Apple App Store und Google Play' },
              { num: '02', text: 'Huawei AppGallery und Samsung Galaxy Store' },
              { num: '03', text: 'Xiaomi Global geplant' },
            ].map((item) => (
              <li key={item.num} className="glass-card rounded-[22px] p-[18px]">
                <strong className="mb-2.5 block text-lg text-[#16181b]">{item.num}</strong>
                <span className="text-sm text-[#555b64]">{item.text}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs font-medium text-[#767d87]">App-only • Datenschutz-first • DSGVO-konform</p>
        </div>

        <div className="relative">
          <Card className="relative overflow-hidden rounded-[30px] border border-white/52 bg-gradient-to-b from-white/26 to-white/14 p-5 backdrop-blur-[32px] saturate-[155%] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_24px_80px_rgba(82,88,98,0.16)]">
            <div className="mb-4 flex gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(108,114,122,0.34)]"></span>
            </div>

            <div className="grid grid-cols-[1.4fr_0.8fr] gap-3.5">
              <div className="rounded-[16px] border border-white/26 bg-white/12 p-[18px] backdrop-blur-[22px] saturate-[145%]">
                <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Twin Profile</p>
                <h2 className="mb-2 text-3xl font-bold tracking-tight">Anna M.</h2>
                <p className="text-sm text-[#555b64]">Empathisch, reflektiert, ruhig entscheidend. Schwerpunkt auf Familie, Verantwortung und langfristigem Denken.</p>
              </div>
              <div className="flex flex-col justify-between rounded-[16px] border border-white/26 bg-white/12 p-[18px] backdrop-blur-[22px] saturate-[145%]">
                <div>
                  <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Knowledge Health</p>
                  <strong className="text-3xl font-bold tracking-tight">86%</strong>
                </div>
                <span className="text-xs text-[#555b64]">Strukturierte Erinnerungen und Werte modelliert</span>
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-[1fr_180px] items-center gap-[18px] rounded-[16px] border border-white/26 bg-white/12 p-[18px] backdrop-blur-[22px] saturate-[145%]">
              <div>
                <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Memory Layers</p>
                <ul className="list-inside list-disc space-y-1 pl-[18px] text-sm text-[#555b64]">
                  <li>Kindheit und prägende Erfahrungen</li>
                  <li>Werte, Überzeugungen, Lebensprinzipien</li>
                  <li>Beruf, Beziehungen, Wendepunkte</li>
                </ul>
              </div>
              <div className="mx-auto flex aspect-square w-[62%] items-center justify-center rounded-full border border-white/30 bg-white/18 text-sm font-bold text-[#0b1c44]">
                86%
              </div>
            </div>

            <div className="mt-3.5 grid gap-3 rounded-[16px] border border-white/26 bg-white/12 p-[18px] backdrop-blur-[22px] saturate-[145%]">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Twin Chat</p>
              <div className="ml-[12%] rounded-2xl bg-white/18 p-3.5 text-sm text-[#555b64]">Was ist wichtig, wenn man eine große Entscheidung trifft?</div>
              <div className="mr-[12%] rounded-2xl bg-white/28 p-3.5 text-sm text-[#555b64]">Prüfe erst, ob die Entscheidung zu deinen Werten passt. Tempo ist selten wichtiger als innere Klarheit.</div>
            </div>
          </Card>
        </div>
      </section>

      {/* Vision Section */}
      <section id="vision" className="pt-[104px]">
        <div className="mb-7 max-w-[760px]">
          <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Warum nur App</p>
          <h2 className="mb-4 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight">Mehr als ein Archiv. Eine digitale Kontinuität.</h2>
          <p className="mt-[18px] text-base leading-relaxed text-[#555b64]">
            twynt.com bewahrt nicht nur Informationen, sondern Denkweise, Persönlichkeit und Erfahrung direkt in einer kontrollierten App-Umgebung. So bleibt die Nutzung klar, fokussiert und nah am persönlichen Gerät.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {[
            { kicker: 'Identity', title: 'Der Twin lernt, wer du bist.', desc: 'Profile, Antworten, Biografie und persönlicher Stil werden in einer klaren Identitätsstruktur zusammengeführt.' },
            { kicker: 'Memory', title: 'Erinnerungen werden semantisch organisiert.', desc: 'Texte, PDFs, Audio, Tagebücher und Interviews werden automatisch sortiert und später im richtigen Kontext wiedergefunden.' },
            { kicker: 'Legacy', title: 'Du entscheidest, wer wann Zugriff erhält.', desc: 'Privat, Familie, Kinder oder Team. twynt.com macht Nachlass und digitale Weitergabe von Wissen in der App kontrollierbar.' },
          ].map((card, idx) => (
            <Card key={idx}>
              <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{card.kicker}</p>
              <h3 className="mb-3 text-xl font-semibold leading-snug tracking-tight">{card.title}</h3>
              <p className="text-sm leading-relaxed text-[#555b64]">{card.desc}</p>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-[#767d87]">Auch für Unternehmenswissen und Founder-Legacy geeignet →</p>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="pt-[104px]">
        <div className="mb-7 max-w-[760px]">
          <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Anwendungsfälle</p>
          <h2 className="mb-4 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight">Wem hinterlässt du deine Weisheit?</h2>
          <p className="mt-[18px] text-base leading-relaxed text-[#555b64]">
            Ob Familienwissen, Mentor-Legacy oder Unternehmens-DNA – twynt.com bewahrt, was zählt, als App auf dem Gerät deiner Nutzer.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {[
            { icon: '🏠', title: 'Großeltern → Enkel', desc: 'Omas Geschichten mit ihrer Stimme. Kochrezepte, Lebensweisheiten und Anekdoten bleiben für kommende Generationen erhalten.', tag: 'Familie', type: 'b2c' },
            { icon: '👨‍👩‍👧', title: 'Eltern → Kinder', desc: 'Werte und Ratschläge für wichtige Lebensmomente. Dein Kind kann dich auch in 30 Jahren noch um Rat fragen.', tag: 'Familie', type: 'b2c' },
            { icon: '🎓', title: 'Mentoren → Schüler', desc: 'Lebenslanges Wissen weitergeben. Professoren, Lehrer und Coaches hinterlassen ihre Methodik und Philosophie.', tag: 'Bildung', type: 'hybrid' },
            { icon: '🏢', title: 'Gründer → Nachfolger', desc: 'Founder-DNA für kommende Generationen. "Was würde unser Gründer heute entscheiden?" wird zur echten Frage.', tag: 'Business', type: 'b2b' },
            { icon: '💼', title: 'Experten → Team', desc: '30 Jahre Erfahrung sichern vor Renteneintritt. Ingenieur-Wissen, Vertriebs-Know-how und Best Practices bleiben im Unternehmen.', tag: 'Business', type: 'b2b' },
            { icon: '🧠', title: 'Berater → Klienten', desc: 'Methodik und Ansätze skalierbar machen. Therapeuten, Coaches und Berater hinterlassen ihre einzigartige Herangehensweise.', tag: 'Professional', type: 'b2b' },
          ].map((uc, idx) => (
            <Card key={idx} className="cursor-pointer transition-all duration-180 hover:-translate-y-1 hover:shadow-lg">
              <div className="mb-4 text-4xl">{uc.icon}</div>
              <h3 className="mb-3 text-lg font-semibold leading-snug tracking-tight">{uc.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-[#555b64]">{uc.desc}</p>
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                uc.type === 'b2c' ? 'bg-[rgba(89,199,255,0.18)] text-[#0a6e9e]' :
                uc.type === 'b2b' ? 'bg-[rgba(139,124,255,0.18)] text-[#5a3fb8]' :
                'bg-gradient-to-br from-[rgba(89,199,255,0.18)] to-[rgba(139,124,255,0.18)] text-[#4a5a9e]'
              }`}>{uc.tag}</span>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Button variant="secondary">Welcher Typ bist du? Quiz starten</Button>
        </div>
      </section>

      {/* Product Section */}
      <section id="product" className="pt-[104px]">
        <div className="mb-7 max-w-[760px]">
          <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Produktbereiche</p>
          <h2 className="mb-4 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight">Eine App für Profil, Gedächtnis und persönlichen Dialog.</h2>
        </div>

        <div className="grid gap-3.5">
          {[
            { kicker: 'Twin Builder', title: 'Fragen, Geschichten und Werte formen den Kern.', desc: 'Ein geführter Builder sammelt Identität, Entscheidungen, Prägungen und Perspektiven und übersetzt sie in ein klares Persona-Modell. In 15 Minuten zum ersten Twin.' },
            { kicker: 'Memory Upload', title: 'Dokumente, Audio und Momente werden lebendiges Wissen.', desc: 'Uploads werden nicht einfach gespeichert, sondern strukturiert, kategorisiert und mit semantischer Suche für spätere Antworten verknüpft. Texte, PDFs, Audio, Videos – alles wird verwertbar.' },
            { kicker: 'Persona Engine', title: 'Die AI antwortet im Stil der Person.', desc: 'twynt.com verbindet Wissen, Sprachstil, Prioritäten und Werte in der App, damit die Antworten glaubwürdig, ruhig und persönlich wirken. Kein generischer Bot – dein echter digitaler Zwilling.' },
            { kicker: 'Twin Chat', title: 'Gespräche mit Kontext, Haltung und Erinnerung.', desc: 'Jede Frage wird gegen relevante Lebensbereiche, Aussagen und Muster gespiegelt, bevor eine Antwort generiert wird. "Wie hättest du diese Situation gelöst?" – und du bekommst eine Antwort, die wirklich nach dir klingt.' },
          ].map((feature, idx) => (
            <Card key={idx} className="grid grid-cols-1 gap-5 md:grid-cols-[0.92fr_1.08fr]">
              <div>
                <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">{feature.kicker}</p>
                <h3 className="mb-3 text-xl font-semibold leading-snug tracking-tight">{feature.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#555b64]">{feature.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="pt-[104px]">
        <div className="mb-7 max-w-[760px]">
          <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Vertrauen & Kontrolle</p>
          <h2 className="mb-4 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight">Eine sensible Idee braucht eine vertrauenswürdige App.</h2>
          <p className="mt-[18px] text-base leading-relaxed text-[#555b64]">
            Bei twynt.com hast du volle Kontrolle über deine Daten in der App. Wir setzen auf Transparenz, Sicherheit und europäische Datenschutzstandards.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {[
            { title: 'Datensouveränität', desc: 'Du besitzt deine Daten. Nutzer entscheiden selbst, welche Inhalte gespeichert werden, wer Zugriff bekommt und wann Inhalte gelöscht werden. Server in Deutschland.' },
            { title: 'Transparente AI', desc: 'Antworten werden klar als Modell-Ausgabe gekennzeichnet und lassen sich an Profil, Quellen und Erinnerungen zurückbinden. Keine Blackbox – volle Nachvollziehbarkeit.' },
            { title: 'Legacy Access', desc: 'Zugriffsrechte können privat bleiben oder später kontrolliert an Familie, Kinder oder Teams weitergegeben werden. Du bestimmst die Regeln.' },
          ].map((sec, idx) => (
            <Card key={idx}>
              <h3 className="mb-3 text-xl font-semibold leading-snug tracking-tight">{sec.title}</h3>
              <p className="text-sm leading-relaxed text-[#555b64]">{sec.desc}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {[
            { icon: '🔒', text: 'Ende-zu-Ende-verschlüsselt' },
            { icon: '🇩🇪', text: 'Server in Deutschland' },
            { icon: '✓', text: 'DSGVO-konform' },
            { icon: '🛡️', text: 'ISO 27001 zertifiziert' },
          ].map((badge, idx) => (
            <div key={idx} className="inline-flex items-center gap-2 rounded-full border border-white/42 bg-white/18 px-[18px] py-3 text-sm font-semibold text-[#555b64] backdrop-blur-[18px]">
              <span className="text-base">{badge.icon}</span>
              <span>{badge.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-10 pt-[104px]">
        <Card className="grid grid-cols-1 items-center gap-5 md:grid-cols-[1.1fr_auto] bg-gradient-to-br from-white/28 to-white/18 p-[34px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_24px_80px_rgba(82,88,98,0.16)]">
          <div>
            <p className="mb-3.5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#5a616a]">Next Step</p>
            <h2 className="mb-4 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight">Bewahre, was zählt.</h2>
            <p className="text-base leading-relaxed text-[#555b64]">
              Sichere dir Early Access für den App-Launch in Apple App Store, Google Play, Huawei AppGallery, Samsung Galaxy Store und Xiaomi Global.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => onNavigate('twin-builder')}>Jetzt Early Access sichern</Button>
            <Button variant="secondary" size="lg" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Zurück nach oben</Button>
          </div>
        </Card>

        <p className="mt-[18px] text-center text-sm text-[#767d87]">
          Für Unternehmen und Institutionen:{' '}
          <a href="mailto:b2b@twynt.com" className="font-semibold text-[#555b64] hover:text-[#16181b] transition-colors">b2b@twynt.com</a>
        </p>
      </section>
    </>
  )
}

// Dashboard View
function DashboardView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Willkommen zurück, Anna</h1>
        <p className="text-base text-[#555b64]">Dein digitaler Zwilling ist aktiv und bereit für Gespräche.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('twin-chat')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">💬</div>
          <h3 className="mb-2 text-xl font-semibold">Twin Chat</h3>
          <p className="text-sm text-[#555b64]">Sprich mit deinem digitalen Zwilling. Stelle Fragen und erhalte Antworten in deinem Stil.</p>
        </Card>

        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('memory-upload')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(139,124,255,0.18)] text-2xl">📁</div>
          <h3 className="mb-2 text-xl font-semibold">Memory Upload</h3>
          <p className="text-sm text-[#555b64]">Füge neue Erinnerungen hinzu. Texte, Audio, Fotos und Dokumente werden automatisch verarbeitet.</p>
        </Card>

        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('twin-builder')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">⚙️</div>
          <h3 className="mb-2 text-xl font-semibold">Twin Einstellungen</h3>
          <p className="text-sm text-[#555b64]">Passe die Persönlichkeit deines Twins an. Werte, Sprachstil und Zugriffsrechte verwalten.</p>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-semibold">Aktivitätsübersicht</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-white/12 p-3">
              <div>
                <p className="text-sm font-medium">Letzte Konversation</p>
                <p className="text-xs text-[#767d87]">Vor 2 Stunden</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('twin-chat')}>Fortsetzen</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/12 p-3">
              <div>
                <p className="text-sm font-medium">Neue Memories hochgeladen</p>
                <p className="text-xs text-[#767d87]">12 Dateien今天</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('memory-upload')}>Ansehen</Button>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-semibold">Twin Status</h3>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Profil Vollständigkeit</span>
                <span className="text-sm font-bold">86%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/20">
                <div className="h-2 w-[86%] rounded-full bg-[#59C7FF]"></div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Memory Health</span>
                <span className="text-sm font-bold">92%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/20">
                <div className="h-2 w-[92%] rounded-full bg-[#8B7CFF]"></div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Gesprächsqualität</span>
                <span className="text-sm font-bold">88%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/20">
                <div className="h-2 w-[88%] rounded-full bg-[#112041]"></div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// Twin Builder View
function TwinBuilderView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [step, setStep] = useState(1)
  const totalSteps = 4
  const auth = useAuth()

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Twin Builder</h1>
        <p className="text-base text-[#555b64]">Erstelle deinen digitalen Zwilling in wenigen Schritten.</p>
      </div>

      {/* Sign-In Prompt: nur wenn nicht eingeloggt */}
      {auth.status === 'anonymous' && (
        <Card className="glass-card mb-8 p-6 sm:p-8">
          <CardContent className="flex flex-col items-start gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <h2 className="mb-1 text-xl font-bold tracking-tight">Anmelden, um deinen Twin zu speichern</h2>
              <p className="text-sm text-[#555b64]">
                Per Google fortfahren — Server in Deutschland, Ende-zu-Ende-verschlüsselt, DSGVO-konform.
              </p>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[260px]">
              <GoogleSignInButton variant="official" returnTo="/twin-builder" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Schritt {step} von {totalSteps}</span>
          <span className="text-[#767d87]">{Math.round((step / totalSteps) * 100)}% abgeschlossen</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/20">
          <div
            className="h-2 rounded-full bg-[#59C7FF] transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          ></div>
        </div>
      </div>

      <Card className="p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Grundlegende Informationen</h2>
              <p className="text-sm text-[#555b64]">Erzähl uns etwas über dich.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Name</label>
                <input
                  type="text"
                  placeholder="Dein vollständiger Name"
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Alter</label>
                <input
                  type="number"
                  placeholder="Dein Alter"
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Beruf / Tätigkeit</label>
                <input
                  type="text"
                  placeholder="Was machst du beruflich?"
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Werte & Überzeugungen</h2>
              <p className="text-sm text-[#555b64]">Was ist dir im Leben wichtig?</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Was sind deine wichtigsten Werte?</label>
                <textarea
                  rows={4}
                  placeholder="z.B. Familie, Ehrlichkeit, Verantwortung..."
                  className="w-full resize-none rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Welche Lebensweisheit möchtest du weitergeben?</label>
                <textarea
                  rows={4}
                  placeholder="Dein wichtigster Rat für kommende Generationen..."
                  className="w-full resize-none rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Persönlichkeit & Stil</h2>
              <p className="text-sm text-[#555b64]">Wie kommunizierst du?</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Beschreibe deinen Kommunikationsstil</label>
                <select className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20">
                  <option value="">Bitte wählen...</option>
                  <option value="warm">Warm und empathisch</option>
                  <option value="direct">Direkt und sachlich</option>
                  <option value="humorous">Humorvoll und locker</option>
                  <option value="wise">Weise und bedacht</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Wie triffst du wichtige Entscheidungen?</label>
                <textarea
                  rows={4}
                  placeholder="Beschreibe deinen Entscheidungsprozess..."
                  className="w-full resize-none rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-semibold">Zugriff & Legacy</h2>
              <p className="text-sm text-[#555b64]">Wer soll Zugriff auf deinen Twin haben?</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-white/26 bg-white/12 p-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">Familienmitglieder</p>
                    <p className="text-xs text-[#767d87]">Partner, Kinder, Enkelkinder</p>
                  </div>
                </label>
              </div>

              <div className="rounded-lg border border-white/26 bg-white/12 p-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">Geschäftspartner</p>
                    <p className="text-xs text-[#767d87]">Kollegen, Nachfolger im Unternehmen</p>
                  </div>
                </label>
              </div>

              <div className="rounded-lg border border-white/26 bg-white/12 p-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">Öffentlich</p>
                    <p className="text-xs text-[#767d87]">Für jeden zugänglich (nur ausgewählte Inhalte)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <Button
            variant="secondary"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            Zurück
          </Button>
          <Button
            onClick={() => {
              if (step < totalSteps) {
                setStep(step + 1)
              } else {
                onNavigate('dashboard')
              }
            }}
          >
            {step === totalSteps ? 'Twin erstellen' : 'Weiter'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

// Memory Upload View
function MemoryUploadView() {
  const [uploading, setUploading] = useState(false)

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Memory Upload</h1>
        <p className="text-base text-[#555b64]">Lade deine Erinnerungen hoch und mache sie lebendig.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-8">
            <div
              className="rounded-lg border-2 border-dashed border-white/42 bg-white/12 p-12 text-center transition-colors hover:border-[#59C7FF]/50 hover:bg-white/18"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                setUploading(true)
                setTimeout(() => setUploading(false), 2000)
              }}
            >
              <div className="mb-4 text-6xl">📤</div>
              <h3 className="mb-2 text-xl font-semibold">Dateien hierher ziehen</h3>
              <p className="mb-4 text-sm text-[#767d87]">oder klicke zum Auswählen</p>
              <Button onClick={() => setUploading(true)}>Dateien auswählen</Button>
              <p className="mt-4 text-xs text-[#767d87]">
                Unterstützt: PDF, DOC, TXT, MP3, WAV, JPG, PNG, MP4 (max. 100MB pro Datei)
              </p>
            </div>

            {uploading && (
              <div className="mt-6 rounded-lg bg-white/12 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Upload läuft...</span>
                  <span>65%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/20">
                  <div className="h-2 w-[65%] animate-pulse rounded-full bg-[#59C7FF]"></div>
                </div>
              </div>
            )}
          </Card>

          <Card className="mt-6">
            <h3 className="mb-4 text-lg font-semibold">Kürzlich hochgeladen</h3>
            <div className="space-y-3">
              {[
                { name: 'Familienfoto_1985.jpg', type: 'image', date: 'Heute, 14:23', status: 'processed' },
                { name: 'Oma_Rezeptbuch.pdf', type: 'document', date: 'Heute, 13:45', status: 'processing' },
                { name: 'Geburtstag_Audio.mp3', type: 'audio', date: 'Gestern', status: 'processed' },
                { name: 'Lebenslauf.docx', type: 'document', date: 'Gestern', status: 'processed' },
              ].map((file, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-white/12 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/18 text-xl">
                      {file.type === 'image' ? '🖼️' : file.type === 'audio' ? '🎵' : '📄'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-[#767d87]">{file.date}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    file.status === 'processed' ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'
                  }`}>
                    {file.status === 'processed' ? '✓ Verarbeitet' : '⏳ Wird verarbeitet'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Memory Kategorien</h3>
            <div className="space-y-2">
              {[
                { name: 'Kindheit', count: 24, color: 'bg-[rgba(89,199,255,0.18)]' },
                { name: 'Beruf', count: 18, color: 'bg-[rgba(139,124,255,0.18)]' },
                { name: 'Familie', count: 32, color: 'bg-[rgba(89,199,255,0.18)]' },
                { name: 'Reisen', count: 15, color: 'bg-[rgba(139,124,255,0.18)]' },
                { name: 'Werte', count: 12, color: 'bg-[rgba(89,199,255,0.18)]' },
              ].map((cat, idx) => (
                <div key={idx} className={`flex cursor-pointer items-center justify-between rounded-lg ${cat.color} p-3 transition-colors hover:bg-white/24`}>
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className="text-xs font-semibold">{cat.count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-6">
            <h3 className="mb-4 text-lg font-semibold">Statistiken</h3>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-[#767d87]">Gesamte Memories</p>
                <p className="text-2xl font-bold">101</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-[#767d87]">Verarbeitete Dateien</p>
                <p className="text-2xl font-bold">89</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-[#767d87]">Speicher verwendet</p>
                <p className="text-2xl font-bold">2.4 GB</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Twin Chat View
function TwinChatView() {
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hallo! Ich bin dein digitaler Zwilling. Wie kann ich dir heute helfen?' },
  ])
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return

    setMessages([...messages, { role: 'user', content: input }])

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        'Das ist eine interessante Frage. Basierend auf meinen Erinnerungen würde ich sagen, dass Familie immer an erster Stelle kommen sollte.',
        'In solchen Situationen habe ich immer versucht, ruhig zu bleiben und die langfristigen Konsequenzen zu bedenken.',
        'Meine Erfahrung zeigt, dass Ehrlichkeit und Offenheit die besten Grundlagen für jede Beziehung sind.',
        'Ich erinnere mich an eine ähnliche Situation. Damals habe ich gelernt, dass es wichtig ist, auf sein Bauchgefühl zu hören.',
      ]
      const randomResponse = responses[Math.floor(Math.random() * responses.length)]
      setMessages(prev => [...prev, { role: 'ai', content: randomResponse }])
    }, 1000)

    setInput('')
  }

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Twin Chat</h1>
        <p className="text-base text-[#555b64]">Sprich mit deinem digitalen Zwilling.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="flex h-[600px] flex-col p-0">
          <div className="border-b border-white/26 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#59C7FF]/20">
                <span className="text-xs font-bold text-[#0b1c44]">AM</span>
              </div>
              <div>
                <p className="font-semibold">Anna M.</p>
                <p className="text-xs text-[#767d87]">Online • Persönlicher Twin</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl p-4 ${
                      msg.role === 'user'
                        ? 'bg-[#59C7FF]/20'
                        : 'bg-white/18'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/26 p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Schreibe eine Nachricht..."
                className="flex-1 rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
              />
              <Button onClick={handleSend}>Senden</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Vorschläge</h3>
            <div className="space-y-2">
              {[
                'Was ist dein wichtigster Lebensrat?',
                'Wie hast du wichtige Entscheidungen getroffen?',
                'Was bedeutet Familie für dich?',
                'Welche Erinnerungen sind dir am wichtigsten?',
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(suggestion)
                  }}
                  className="w-full rounded-lg bg-white/12 p-3 text-left text-sm transition-colors hover:bg-white/24"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-semibold">Chat-Einstellungen</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Antwort-Stil</span>
                <select className="rounded-lg border border-white/42 bg-white/18 px-2 py-1 text-xs backdrop-blur-[18px]">
                  <option>Persönlich</option>
                  <option>Sachlich</option>
                  <option>Warm</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Kontext nutzen</span>
                <input type="checkbox" defaultChecked className="h-4 w-4" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Quellen anzeigen</span>
                <input type="checkbox" defaultChecked className="h-4 w-4" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
