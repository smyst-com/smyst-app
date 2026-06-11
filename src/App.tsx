import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SVGProps } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import LangSwitcher from '@/components/LangSwitcher'
import type { NavItem } from '@/components/MobileNav'
import { useLanguage } from '@/lib/i18n'
import { useStaticTranslations } from '@/lib/staticTranslations'
import { useAuth } from '@/lib/useAuth'
import { useMemoryUpload, type MemoryCategory, type UploadResult } from '@/lib/useMemoryUpload'
import { useTwinMvp, type PublicTwinProfile, type TwinRecord, type TwinStyle } from '@/lib/useTwinMvp'

const CookieConsent = lazy(() => import('@/components/CookieConsent'))
const GitHubSignInButton = lazy(() => import('@/components/GitHubSignInButton'))
const MobileNav = lazy(() => import('@/components/MobileNav'))

type IconProps = SVGProps<SVGSVGElement>

const iconBase = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
} as const

function ArrowUp(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  )
}

function Mic(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  )
}

function Waveform(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M4 14v-4" />
      <path d="M8 18V6" />
      <path d="M12 21V3" />
      <path d="M16 18V6" />
      <path d="M20 14v-4" />
    </svg>
  )
}

function Plus(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function Search(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function User(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M19 21a7 7 0 0 0-14 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  )
}

function MenuGlyph(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M5 8h14" />
      <path d="M5 15h10" />
    </svg>
  )
}

type AppView =
  | 'landing'
  | 'account-profile'
  | 'my-twins'
  | 'twin-builder'
  | 'memory-upload'
  | 'twin-chat'
  | 'settings'
  | 'dashboard'
  | 'twin-profile'

type AppTheme = 'dark' | 'light'

const viewPaths: Record<Exclude<AppView, 'twin-profile'>, string> = {
  landing: '/',
  'account-profile': '/profile',
  'my-twins': '/twins',
  'twin-builder': '/twin-builder',
  'memory-upload': '/memory-upload',
  'twin-chat': '/twin-chat',
  settings: '/settings',
  dashboard: '/dashboard',
}

function initialRoute(): { view: AppView; profileSlug: string | null; privateTwinId: string | null } {
  const path = window.location.pathname
  if (path.startsWith('/t/')) {
    return { view: 'twin-profile', profileSlug: decodeURIComponent(path.slice(3)), privateTwinId: null }
  }
  if (path.startsWith('/private/twins/')) {
    return { view: 'twin-profile', profileSlug: null, privateTwinId: decodeURIComponent(path.slice('/private/twins/'.length)) }
  }
  if (path === '/profile') return { view: 'account-profile', profileSlug: null, privateTwinId: null }
  if (path === '/twins') return { view: 'my-twins', profileSlug: null, privateTwinId: null }
  if (path === '/twin-builder') return { view: 'twin-builder', profileSlug: null, privateTwinId: null }
  if (path === '/memory-upload') return { view: 'memory-upload', profileSlug: null, privateTwinId: null }
  if (path === '/twin-chat') return { view: 'twin-chat', profileSlug: null, privateTwinId: null }
  if (path === '/settings') return { view: 'settings', profileSlug: null, privateTwinId: null }
  if (path === '/dashboard') return { view: 'dashboard', profileSlug: null, privateTwinId: null }
  return { view: 'landing', profileSlug: null, privateTwinId: null }
}

export default function App() {
  const route = useMemo(() => initialRoute(), [])
  const [currentView, setCurrentView] = useState<AppView>(route.view)
  const [profileSlug, setProfileSlug] = useState<string | null>(route.profileSlug)
  const [privateTwinId, setPrivateTwinId] = useState<string | null>(route.privateTwinId)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const stored = window.localStorage.getItem('smyst-theme')
    return stored === 'light' ? 'light' : 'dark'
  })
  const auth = useAuth({ enabled: currentView !== 'landing' })

  useEffect(() => {
    window.localStorage.setItem('smyst-theme', appTheme)
    document.documentElement.dataset.smystTheme = appTheme
  }, [appTheme])

  useEffect(() => {
    const syncRoute = () => {
      const next = initialRoute()
      setCurrentView(next.view)
      setProfileSlug(next.profileSlug)
      setPrivateTwinId(next.privateTwinId)
      setMobileNavOpen(false)
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const navigateTo = (view: AppView) => {
    setProfileSlug(null)
    setPrivateTwinId(null)
    setCurrentView(view)
    if (view !== 'twin-profile') window.history.pushState({}, '', viewPaths[view])
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
          { label: 'Mein Profil', onClick: () => navigateTo('account-profile'), active: currentView === 'account-profile' },
          { label: 'Meine Twins', onClick: () => navigateTo('my-twins'), active: currentView === 'my-twins' },
          { label: 'Twin Builder', onClick: () => navigateTo('twin-builder'), active: currentView === 'twin-builder' },
          { label: 'Daten hochladen', onClick: () => navigateTo('memory-upload'), active: currentView === 'memory-upload' },
          { label: 'Chats', onClick: () => navigateTo('twin-chat'), active: currentView === 'twin-chat' },
          { label: 'Einstellungen', onClick: () => navigateTo('settings'), active: currentView === 'settings' },
        ]

  if (currentView === 'landing') {
    return (
      <div className={appTheme === 'dark' ? 'smyst-app-dark min-h-screen bg-[#111722] text-[#f4f7fb]' : 'smyst-app-light min-h-screen bg-[#d9dee7] text-[#111722]'}>
        <SmystStartPage onNavigate={navigateTo} appTheme={appTheme} onThemeChange={setAppTheme} />
        <Suspense fallback={null}>
          <CookieConsent />
        </Suspense>
      </div>
    )
  }

  return (
    <div className={appTheme === 'dark' ? 'smyst-app-dark min-h-screen bg-[#090d14] text-[#f4f7fb]' : 'smyst-app-light min-h-screen bg-[#d9dee7] text-[#111722]'}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[rgba(11,16,24,0.9)] px-4 py-3 backdrop-blur-2xl sm:px-6">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-5">
          <button onClick={() => navigateTo('landing')} className="font-smyst-logo inline-flex items-center gap-3 text-2xl text-white transition-opacity hover:opacity-80">
            <span>smyst<span className="text-[0.78em]">.com</span></span>
          </button>

          <nav className="hidden items-center gap-5 md:flex" aria-label="Hauptnavigation">
            <button onClick={() => navigateTo('dashboard')} className={`text-sm ${currentView === 'dashboard' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Dashboard</button>
            <button onClick={() => navigateTo('account-profile')} className={`text-sm ${currentView === 'account-profile' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Profil</button>
            <button onClick={() => navigateTo('my-twins')} className={`text-sm ${currentView === 'my-twins' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Twins</button>
            <button onClick={() => navigateTo('twin-builder')} className={`text-sm ${currentView === 'twin-builder' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Erstellen</button>
            <button onClick={() => navigateTo('memory-upload')} className={`text-sm ${currentView === 'memory-upload' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Upload</button>
            <button onClick={() => navigateTo('twin-chat')} className={`text-sm ${currentView === 'twin-chat' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Chats</button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3.5">
            {/* LangSwitcher: Desktop sichtbar */}
            <div className="hidden md:block">
              <LangSwitcher variant="compact" />
            </div>
            <button
              type="button"
              onClick={() => setAppTheme((theme) => (theme === 'dark' ? 'light' : 'dark'))}
              className="hidden min-h-9 border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.08] sm:inline-flex sm:items-center"
            >
              {appTheme === 'dark' ? 'Heller' : 'Dunkler'}
            </button>
            <a href="mailto:i@smyst.com" className="hidden text-sm text-[#9aa6b7] transition-colors hover:text-white lg:block">i@smyst.com</a>
            {/* Auth-Action: Avatar wenn eingeloggt, sonst Sign-In/Early-Access */}
            {auth.status === 'authenticated' ? (
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                aria-label={`Eingeloggt als ${auth.user?.email}, zum Dashboard`}
                className="hidden h-9 w-9 items-center justify-center overflow-hidden border border-white/[0.1] bg-white/[0.06] text-xs font-semibold text-white backdrop-blur-md hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:inline-flex"
              >
                {auth.user?.picture ? (
                  <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  (auth.user?.name?.[0] ?? auth.user?.email[0] ?? '?').toUpperCase()
                )}
              </button>
            ) : (
              <Button size="sm" onClick={() => navigateTo('landing')}>
                Zurück zum Start
              </Button>
            )}
            {/* Hamburger: Mobile */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={mobileNavOpen}
              className="inline-flex h-11 w-11 items-center justify-center border border-white/[0.1] bg-white/[0.04] text-white backdrop-blur-md hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 md:hidden"
            >
              <MenuGlyph className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <Suspense fallback={null}>
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
      </Suspense>

      {/* Main Content */}
      <main className="mx-auto min-h-[calc(100dvh-145px)] w-full max-w-[1200px] px-4 pb-10 sm:px-6">
        {currentView === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
        {currentView === 'account-profile' && <AccountProfileView onNavigate={navigateTo} />}
        {currentView === 'my-twins' && <MyTwinsView onNavigate={navigateTo} />}
        {currentView === 'twin-builder' && <TwinBuilderView onNavigate={navigateTo} />}
        {currentView === 'memory-upload' && <MemoryUploadView />}
        {currentView === 'twin-chat' && <TwinChatView />}
        {currentView === 'settings' && <SettingsView onNavigate={navigateTo} />}
        {currentView === 'twin-profile' && <TwinProfileView slug={profileSlug} privateTwinId={privateTwinId} onNavigate={navigateTo} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#090d14] px-4 py-8 text-[#9aa6b7] sm:px-6">
        <div className="mx-auto mb-8 grid max-w-[1200px] grid-cols-1 gap-10 md:grid-cols-[1.2fr_2.8fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="font-smyst-logo text-xl">smyst<span className="text-[0.78em]">.com</span></span>
            </div>
            <p className="text-sm text-[#9aa6b7]">Create Your AI Twin</p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Produkt</h4>
              <button onClick={() => navigateTo('twin-builder')} className="text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Twin Builder</button>
              <button onClick={() => navigateTo('memory-upload')} className="text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Memory Upload</button>
              <button onClick={() => navigateTo('twin-chat')} className="text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Twin Chat</button>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Unternehmen</h4>
              <a href="mailto:i@smyst.com?subject=%C3%9Cber%20smyst.com" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">Über uns</a>
              <a href="mailto:i@smyst.com?subject=Karriere%20bei%20smyst.com" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">Karriere</a>
              <a href="mailto:b2b@smyst.com" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">B2B-Anfragen</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">Rechtliches</h4>
              <a href="mailto:i@smyst.com?subject=Impressum" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">Impressum</a>
              <a href="mailto:i@smyst.com?subject=Datenschutz" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">Datenschutz</a>
              <a href="mailto:i@smyst.com?subject=AGB" className="text-sm text-[#9aa6b7] transition-colors hover:text-white">AGB</a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-6 md:flex-row">
          <p className="text-sm text-[#9aa6b7]">© 2026 smyst.com. Alle Rechte vorbehalten.</p>
          <div className="flex flex-wrap gap-5">
            <a href="mailto:i@smyst.com" className="text-sm font-semibold text-[#9aa6b7] transition-colors hover:text-white">Kontakt</a>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('smyst:open-cookie-settings'))}
              className="text-sm font-semibold text-[#9aa6b7] transition-colors hover:text-white"
            >
              App-Daten
            </button>
          </div>
        </div>
      </footer>

      {/* DSGVO consent banner (nur sichtbar wenn noch keine Entscheidung) */}
      <Suspense fallback={null}>
        <CookieConsent />
      </Suspense>
    </div>
  )
}

const startPageTwins = [
  {
    id: 'max-mueller',
    name: 'Max Müller',
    description: 'Family Memory Twin',
    role: 'Family',
    signal: 'online',
    accent: '#71E8FF',
    initials: 'MM',
    tone: 'persönlich, ruhig, nahbar',
  },
  {
    id: 'max-meier',
    name: 'Max Meier',
    description: 'Wissens- und Werte-Twin',
    role: 'Coach',
    signal: 'ready',
    accent: '#A8FFCB',
    initials: 'MM',
    tone: 'reflektiert, direkt, empathisch',
  },
  {
    id: 'maximilian-schmidt',
    name: 'Maximilian Schmidt',
    description: 'Entrepreneur Twin',
    role: 'Builder',
    signal: 'sync',
    accent: '#9DBBFF',
    initials: 'MS',
    tone: 'klar, warm, fokussiert',
  },
  {
    id: 'max-weber',
    name: 'Max Weber',
    description: 'Free-only MVP',
    role: 'MVP',
    signal: 'fast',
    accent: '#FFFFFF',
    initials: 'MW',
    tone: 'schnell, einfach, regelbasiert',
  },
]

type StartTwin = (typeof startPageTwins)[number]

type ChatMessage = {
  id: string
  role: 'ai' | 'user'
  content: string
  streaming?: boolean
}

function SmystStartPage({
  onNavigate,
  appTheme,
  onThemeChange,
}: {
  onNavigate: (view: AppView) => void
  appTheme: AppTheme
  onThemeChange: (theme: AppTheme) => void
}) {
  const { lang } = useLanguage({ reloadOnChange: false })
  const t = useStaticTranslations(lang)
  const auth = useAuth()
  const [query, setQuery] = useState('')
  const [selectedTwin, setSelectedTwin] = useState<StartTwin | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const filteredTwins = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return startPageTwins
    return startPageTwins.filter((twin) =>
      `${twin.name} ${twin.description} ${twin.role} ${twin.signal} ${twin.tone}`.toLowerCase().includes(normalized),
    )
  }, [query])

  const activeTwin = selectedTwin ?? startPageTwins[0]
  const canSend = input.trim().length > 0

  useEffect(() => {
    const title = t.seo.title
    const description = t.seo.description
    document.title = title
    setMeta('description', description)
    setMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
    setPropertyMeta('og:type', 'website')
    setPropertyMeta('og:title', title)
    setPropertyMeta('og:description', description)
    setPropertyMeta('og:url', 'https://smyst.com/')
    setPropertyMeta('og:site_name', 'smyst.com')
    setCanonical('https://smyst.com/')
    setJsonLd('smyst-page-schema', {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: 'https://smyst.com/',
      description,
      inLanguage: lang,
      isPartOf: { '@id': 'https://smyst.com/#website' },
    })
    return () => {
      document.getElementById('smyst-page-schema')?.remove()
    }
  }, [lang, t])

  useEffect(() => {
    if (messages.length === 0) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const fitInputHeight = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '0px'
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const headerHeight = document.querySelector('main.fixed > header')?.getBoundingClientRect().height ?? 0
    const iconBarHeight = textarea.parentElement?.nextElementSibling?.getBoundingClientRect().height ?? 56
    const textWrapStyle = window.getComputedStyle(textarea.parentElement ?? textarea)
    const textWrapPadding =
      Number.parseFloat(textWrapStyle.paddingTop || '0') + Number.parseFloat(textWrapStyle.paddingBottom || '0')
    const topGap = selectedTwin ? 10 : Math.max(viewportHeight * 0.12, 96)
    const availableHeight = viewportHeight - headerHeight - iconBarHeight - textWrapPadding - topGap
    const selectedMaxHeight = Math.max(120, availableHeight)
    const startMaxHeight = Math.min(Math.max(viewportHeight * 0.38, 132), 280)
    const maxHeight = selectedTwin ? selectedMaxHeight : startMaxHeight
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 46), maxHeight)}px`
  }

  const resizeInput = (value: string) => {
    setInput(value)
    window.requestAnimationFrame(fitInputHeight)
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitInputHeight)
    const onResize = () => window.requestAnimationFrame(fitInputHeight)

    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [input, selectedTwin])

  const selectTwin = (twin: StartTwin) => {
    setSelectedTwin(twin)
    setQuery('')
    window.requestAnimationFrame(() => {
      fitInputHeight()
      textareaRef.current?.focus()
    })
  }

  const streamText = async (messageId: string, content: string) => {
    const chars = Array.from(content)
    let index = 0
    while (index < chars.length) {
      index = Math.min(chars.length, index + 8)
      const partial = chars.slice(0, index).join('')
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: partial, streaming: index < chars.length }
            : message,
        ),
      )
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    const twin = selectedTwin ?? filteredTwins[0] ?? activeTwin
    if (!selectedTwin) selectTwin(twin)

    const assistantId = crypto.randomUUID()
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: text },
      { id: assistantId, role: 'ai', content: '', streaming: true },
    ])
    resizeInput('')

    const reply = [
      t.chat.replyIntro.replace('{{name}}', twin.name),
      t.chat.replyMvp,
      t.chat.replyQuestion.replace('{{question}}', text.length > 180 ? `${text.slice(0, 180)}...` : text),
      t.chat.replyNextStep,
    ].join(' ')
    await streamText(assistantId, reply)
  }

  const menuItems: Array<{ label: string; view: AppView; detail: string }> = [
    { label: 'Mein Profil', view: 'account-profile', detail: 'Account, Avatar, Rolle und Session' },
    { label: 'Twin erstellen', view: 'twin-builder', detail: 'Persoenlichkeit, Wissen und Sichtbarkeit' },
    { label: 'Daten hochladen', view: 'memory-upload', detail: 'Dateien direkt nach IDrive e2' },
    { label: 'Meine Twins', view: 'my-twins', detail: 'Private und oeffentliche Twin-Profile' },
    { label: 'Chats', view: 'twin-chat', detail: 'Schneller Free-only Twin-Chat' },
    { label: 'Einstellungen', view: 'settings', detail: 'Datenschutz, Sprache und Logout' },
  ]

  const goFromMenu = (view: AppView) => {
    setMenuOpen(false)
    onNavigate(view)
  }

  return (
    <main className="fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#090d14] text-[#f4f7fb]">
      <div
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Startmenue"
        aria-hidden={!menuOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[360px] flex-col border-r border-white/10 bg-[#141a27]/95 shadow-2xl backdrop-blur-xl transition-transform ${
          menuOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
        }`}
      >
        <div className="border-b border-white/10 px-5 pb-4 pt-[max(env(safe-area-inset-top),18px)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="font-smyst-logo text-2xl leading-none">
                smyst<span className="text-[0.78em]">.com</span>
              </p>
              <p className="mt-1 text-xs font-medium text-[#9aa3b2]">Create Your AI Twin</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Menü schließen"
              className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {auth.status === 'authenticated' ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#242b37] text-sm font-bold text-white">
                  {auth.user?.picture ? (
                    <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (auth.user?.name?.[0] ?? auth.user?.email?.[0] ?? 'S').toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{auth.user?.name ?? 'Angemeldet'}</p>
                  <p className="truncate text-xs text-[#9aa3b2]">{auth.user?.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-sm font-semibold">Anmelden oder registrieren</p>
              <Suspense fallback={null}>
                <GitHubSignInButton variant="official" returnTo="/" label="Mit GitHub starten" />
              </Suspense>
              <p className="mt-3 text-xs leading-relaxed text-[#9aa3b2]">
                Registrierung laeuft ueber GitHub OAuth und Cloudflare Worker, ohne bezahlten Auth-Dienst.
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Startmenü Navigation">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => goFromMenu(item.view)}
                  className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{item.label}</span>
                    <span className="block truncate text-xs text-[#9aa3b2]">{item.detail}</span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9aa3b2]" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="px-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">Design</p>
            <div className="mt-3 grid grid-cols-2 gap-2 px-2">
              {(['dark', 'light'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => onThemeChange(theme)}
                  className={`min-h-[48px] border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                    appTheme === theme
                      ? 'border-white/35 bg-[#f4f7fb] text-[#111722]'
                      : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {theme === 'dark' ? 'Dunkler' : 'Heller'}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-white/10 px-5 py-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {auth.status === 'authenticated' ? (
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Logout
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goFromMenu('twin-builder')}
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-[#111722] hover:opacity-90"
            >
              Twin vorbereiten
            </button>
          )}
        </div>
      </aside>

      {selectedTwin ? (
        <header className="z-20 shrink-0 border-b border-white/[0.08] bg-[rgba(9,13,20,0.9)] pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
          <div className="relative flex min-h-[72px] items-center justify-center px-4 sm:min-h-[82px]">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={menuOpen}
              className="absolute left-0 top-0 grid h-12 w-14 shrink-0 place-items-center text-white transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:h-14 sm:w-16"
            >
              <MenuGlyph className="h-7 w-7" />
            </button>

            <div className="flex h-14 max-w-[min(310px,calc(100vw-100px))] items-stretch border border-white/[0.08] bg-[#111722] text-left sm:h-16 sm:max-w-[460px]">
              <span className="grid aspect-square h-full shrink-0 place-items-center border-r border-white/[0.08] bg-[#171f2c] text-white/[0.72]">
                <User className="h-8 w-8 sm:h-9 sm:w-9" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center px-3">
                <span className="truncate text-base font-bold leading-tight text-white sm:text-lg">{selectedTwin.name}</span>
                <span className="truncate text-xs font-medium leading-tight text-[#8e97a8] sm:text-sm">{selectedTwin.role}</span>
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="z-20 shrink-0 border-b border-white/10 bg-[rgba(11,16,24,0.88)] pt-[max(env(safe-area-inset-top),18px)] shadow-[0_18px_45px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
          <div className="relative flex min-h-[96px] flex-col items-center justify-center px-4 pb-3 sm:min-h-[112px]">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={menuOpen}
              className="absolute left-4 top-4 grid h-11 w-11 shrink-0 place-items-center text-white/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:left-8 sm:h-14 sm:w-14"
            >
              <MenuGlyph className="h-7 w-7" />
            </button>

            <div className="inline-block text-left">
              <h1 className="font-smyst-logo text-[38px] font-medium leading-none tracking-normal text-white sm:text-6xl md:text-7xl">
                smyst<span className="text-[0.78em]">.com</span>
              </h1>
              <p className="mt-1.5 text-base font-medium leading-tight text-[#9aa6b7] sm:text-2xl">
                Create Your AI Twin
              </p>
            </div>
          </div>

          <div className="flex min-h-[70px] items-stretch border-y border-white/[0.08] bg-[#090d14] sm:min-h-[82px]">
            <button
              type="button"
              onClick={() => {
                const twin = filteredTwins[0] ?? activeTwin
                selectTwin(twin)
              }}
              className="inline-flex w-[150px] shrink-0 items-center justify-center gap-2 border-r border-white/[0.08] bg-[#141a25] px-2 text-[15px] font-bold text-white transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:w-[180px] sm:gap-3 sm:text-lg"
              aria-label={t.start.chooseTwin}
            >
              <User className="h-7 w-7 shrink-0 text-white sm:h-9 sm:w-9" />
              <span className="whitespace-nowrap">Name wählen</span>
            </button>
            <label className="relative flex min-w-0 flex-1 items-stretch">
              <Search
                className={`pointer-events-none absolute right-5 top-1/2 h-7 w-7 -translate-y-1/2 text-[#8e97a8] transition-opacity sm:right-7 sm:h-8 sm:w-8 ${
                  query ? 'opacity-0' : 'opacity-100'
                }`}
                aria-hidden="true"
              />
              <span className="sr-only">{t.start.searchLabel}</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedTwin(null)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  const twin = filteredTwins[0]
                  if (!twin) return
                  event.preventDefault()
                  selectTwin(twin)
                }}
                placeholder="Name suchen"
                className="min-w-0 flex-1 rounded-none border-0 bg-[#101722] px-5 pr-14 text-2xl font-bold text-white outline-none placeholder:text-[#8e97a8] focus:bg-[#141a25] sm:px-7 sm:pr-16 sm:text-4xl"
              />
            </label>
          </div>
        </header>
      )}

      <section ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto bg-[#090d14]">
        <div className="min-h-full">
          {!selectedTwin && (
            <div className="divide-y divide-white/[0.08] border-b border-white/[0.08]">
              {filteredTwins.slice(0, 3).map((twin) => (
                <button
                  key={twin.id}
                  type="button"
                  onClick={() => selectTwin(twin)}
                  className="flex min-h-[82px] w-full items-stretch text-left transition hover:bg-white/[0.04] sm:min-h-[92px]"
                >
                  <span className="grid w-[82px] shrink-0 place-items-center border-r border-white/[0.08] bg-[#141a25] text-white/[0.72] sm:w-[92px]">
                    <User className="h-10 w-10 sm:h-12 sm:w-12" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center truncate px-5 text-2xl font-bold text-[#d5dbe5] sm:px-7 sm:text-4xl">
                    {twin.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {messages.length > 0 && (
            <div className="relative z-10 flex flex-col gap-4 px-4 py-6 sm:px-8">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[86%] rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:max-w-[72%] ${
                      message.role === 'user'
                        ? 'rounded-br-md border-white/12 bg-white text-[#111722]'
                        : 'rounded-bl-md border-white/[0.09] bg-white/[0.065] text-[#f4f7fb] backdrop-blur-2xl'
                    }`}
                  >
                    {message.streaming && !message.content ? (
                      <span className="inline-flex h-6 items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#aeb6c4]"></span>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#aeb6c4] [animation-delay:120ms]"></span>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#aeb6c4] [animation-delay:240ms]"></span>
                      </span>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="shrink-0 border-t border-white/[0.08] bg-[rgba(17,23,33,0.88)] shadow-[0_-22px_50px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
        <div className="border-b border-white/[0.08] px-4 py-2.5 sm:px-8">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(event) => resizeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder="Nachricht schreiben"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="block min-h-[46px] w-full resize-none overflow-y-auto bg-transparent text-2xl font-light leading-tight text-white outline-none placeholder:text-[#aeb6c4]/[0.66] sm:text-3xl"
            aria-label={t.start.messagePlaceholder.replace('{{name}}', activeTwin.name)}
          />
        </div>
        <div className="flex h-[56px] items-center justify-between border-t border-white/[0.04] px-5 text-white sm:px-8">
          <div className="flex h-full items-center">
            <button
              type="button"
              className="grid h-[52px] w-[52px] place-items-center rounded-lg text-white transition-colors hover:bg-white/[0.08]"
              aria-label={t.start.addFile}
              title={t.start.addFile}
            >
              <Plus className="h-8 w-8" />
            </button>
          </div>
          <div className="flex h-full items-center gap-6 sm:gap-8">
            <button
              type="button"
              className="grid h-[52px] w-[52px] place-items-center rounded-lg text-white transition-colors hover:bg-white/[0.08]"
              aria-label={t.start.voiceInput}
              title={t.start.voiceInput}
            >
              <Mic className="h-8 w-8" />
            </button>
            <button
              type="button"
              className="grid h-[52px] w-[52px] place-items-center rounded-lg text-white transition-colors hover:bg-white/[0.08]"
              aria-label="Audio-Modus"
              title="Audio-Modus"
            >
              <Waveform className="h-8 w-8" />
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void handleSend()}
              className="grid h-[52px] w-[52px] place-items-center rounded-lg text-white transition-colors hover:bg-white/[0.08] disabled:text-white disabled:opacity-100"
              aria-label={t.start.send}
              title={t.start.send}
            >
              <ArrowUp className="h-9 w-9" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  )
}

function fallbackProfile(slug: string | null): PublicTwinProfile | null {
  const twin = startPageTwins.find((item) => item.id === slug || item.name.toLowerCase().replace(/\s+/g, '-') === slug)
  if (!twin) return null
  const cleanSlug = twin.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const url = `https://smyst.com/t/${cleanSlug}`
  return {
    id: twin.id,
    name: twin.name,
    slug: cleanSlug,
    description: `${twin.description}. ${twin.tone}.`,
    imageUrl: null,
    categories: ['KI-Zwilling', 'Wissen', 'Erinnerungen'],
    languages: ['de', 'en'],
    visibility: 'public',
    style: 'warm',
    status: 'ready',
    url,
    chatPath: `/twin-chat?twin=${encodeURIComponent(twin.id)}`,
    uploadedContents: [
      { category: 'document', count: 3 },
      { category: 'image', count: 5 },
      { category: 'audio', count: 1 },
    ],
    mediaCount: 9,
    knowledgeCount: 4,
    contextSummary: 'Öffentliches Demo-Profil fuer den Free-only MVP. Echte Profilinhalte werden aus Cloudflare KV geladen und Medien bleiben in IDrive e2.',
    updatedAt: Date.now(),
    seo: {
      title: `${twin.name} | smyst.com KI-Zwilling`,
      description: `${twin.name} ist ein öffentliches KI-Zwilling-Profil auf smyst.com.`,
      canonical: url,
      robots: 'index,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${twin.name} | smyst.com`,
        description: `${twin.description}. ${twin.tone}.`,
        url,
      },
    },
  }
}

function setMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setPropertyMeta(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setCanonical(href: string | null) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!href) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = 'canonical'
    document.head.appendChild(tag)
  }
  tag.href = href
}

function setJsonLd(id: string, value: unknown) {
  let script = document.getElementById(id) as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.id = id
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(value)
}

function TwinProfileView({
  slug,
  privateTwinId,
  onNavigate,
}: {
  slug: string | null
  privateTwinId: string | null
  onNavigate: (view: AppView) => void
}) {
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const [publicProfile, setPublicProfile] = useState<PublicTwinProfile | null>(slug ? fallbackProfile(slug) : null)
  const [privateTwin, setPrivateTwin] = useState<TwinRecord | null>(null)
  const [loaded, setLoaded] = useState(!slug && !privateTwinId)
  const isPrivate = Boolean(privateTwinId)

  useEffect(() => {
    let alive = true
    if (slug) {
      void twinMvp.getPublicTwin(slug).then((profile) => {
        if (alive && profile) setPublicProfile(profile)
        if (alive) setLoaded(true)
      })
    }
    if (privateTwinId && auth.status === 'authenticated') {
      void twinMvp.getTwin(privateTwinId).then((twin) => {
        if (alive && twin) setPrivateTwin(twin)
        if (alive) setLoaded(true)
      })
    }
    if (privateTwinId && auth.status === 'anonymous') setLoaded(true)
    return () => {
      alive = false
    }
  }, [slug, privateTwinId, auth.status])

  const profile = privateTwin
    ? {
        id: privateTwin.id,
        name: privateTwin.name,
        slug: privateTwin.slug,
        description: privateTwin.description,
        imageUrl: privateTwin.imageUrl ?? null,
        categories: privateTwin.categories ?? [],
        languages: privateTwin.languages ?? [],
        visibility: privateTwin.visibility,
        style: privateTwin.style,
        status: privateTwin.status,
        url: `${window.location.origin}/private/twins/${privateTwin.id}`,
        chatPath: `/twin-chat?twin=${encodeURIComponent(privateTwin.id)}`,
        uploadedContents: Array.from(
          (privateTwin.mediaRefs ?? []).reduce((map, item) => map.set(item.category, (map.get(item.category) ?? 0) + 1), new Map<string, number>()),
        ).map(([category, count]) => ({ category, count })),
        mediaCount: (privateTwin.mediaRefs ?? []).length,
        knowledgeCount: (privateTwin.knowledgeTexts ?? []).length,
        contextSummary: privateTwin.contextSummary,
        updatedAt: privateTwin.updatedAt,
        seo: {
          title: `${privateTwin.name} | Privates smyst.com Profil`,
          description: privateTwin.description,
          canonical: '',
          robots: 'noindex,nofollow',
          schema: {},
        },
      }
    : publicProfile

  useEffect(() => {
    const noindex = isPrivate || profile?.visibility !== 'public'
    document.title = profile?.seo.title ?? 'smyst.com Twin Profil'
    setMeta('description', profile?.seo.description ?? 'smyst.com KI-Zwilling Profil')
    setMeta('robots', noindex ? 'noindex,nofollow' : 'index,follow')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', profile?.seo.title ?? 'smyst.com Twin Profil')
    setMeta('twitter:description', profile?.seo.description ?? 'smyst.com KI-Zwilling Profil')
    setPropertyMeta('og:type', 'profile')
    setPropertyMeta('og:title', profile?.seo.title ?? 'smyst.com Twin Profil')
    setPropertyMeta('og:description', profile?.seo.description ?? 'smyst.com KI-Zwilling Profil')
    setPropertyMeta('og:url', profile?.seo.canonical || window.location.href)
    setPropertyMeta('og:site_name', 'smyst.com')
    if (profile?.imageUrl) {
      setPropertyMeta('og:image', profile.imageUrl)
      setMeta('twitter:image', profile.imageUrl)
    }
    setCanonical(noindex ? null : profile?.seo.canonical ?? null)

    if (profile && !noindex) {
      setJsonLd('smyst-profile-schema', profile.seo.schema)
    }
    return () => {
      document.getElementById('smyst-profile-schema')?.remove()
      setMeta('robots', 'index,follow')
      setCanonical(null)
    }
  }, [profile, isPrivate])

  if (isPrivate && auth.status === 'anonymous') {
    return (
      <div className="pt-[72px]">
        <Card className="mx-auto max-w-[720px] p-8">
          <h1 className="mb-2 text-2xl font-bold">Privates Twin-Profil</h1>
          <p className="mb-5 text-sm text-[#555b64]">Dieses Profil ist privat, nicht indexierbar und nur nach Anmeldung sichtbar.</p>
          <Suspense fallback={null}>
            <GitHubSignInButton variant="official" returnTo={window.location.pathname} />
          </Suspense>
        </Card>
      </div>
    )
  }

  if (!profile && !loaded) {
    return (
      <div className="pt-[72px]">
        <Card className="mx-auto max-w-[720px] p-8">
          <h1 className="mb-2 text-2xl font-bold">Profil wird geladen</h1>
          <p className="text-sm text-[#555b64]">Cloudflare KV wird abgefragt. Dateien bleiben in IDrive e2.</p>
        </Card>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="pt-[72px]">
        <Card className="mx-auto max-w-[720px] p-8">
          <h1 className="mb-2 text-2xl font-bold">Twin-Profil nicht gefunden</h1>
          <p className="text-sm text-[#555b64]">Dieses Profil ist nicht öffentlich indexierbar oder existiert nicht.</p>
        </Card>
      </div>
    )
  }

  const profileInitials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <div className="pt-[72px]">
      <section className="mx-auto max-w-[980px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => onNavigate('landing')} className="font-smyst-logo text-2xl">
            smyst<span className="text-[0.78em]">.com</span>
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profile.visibility === 'public' ? 'bg-emerald-500/14 text-emerald-800' : 'bg-slate-500/14 text-slate-700'}`}>
            {profile.visibility === 'public' ? 'Öffentlich indexierbar' : 'Privat · noindex'}
          </span>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
            <div className="border-b border-white/30 bg-white/18 p-6 lg:border-b-0 lg:border-r">
              <div className="aspect-square overflow-hidden rounded-[18px] border border-white/40 bg-white/28">
                {profile.imageUrl ? (
                  <img src={profile.imageUrl} alt={profile.name} className="h-full w-full object-cover" loading="eager" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[#eef6ff] text-5xl font-bold text-[#0b1c44]">
                    {profileInitials}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('twin-chat')}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#17191d] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                Mit Twin chatten
              </button>
            </div>

            <div className="p-6 sm:p-8">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#667085]">KI-Zwilling Profil</p>
              <h1 className="mb-3 text-4xl font-bold tracking-tight">{profile.name}</h1>
              <p className="max-w-[720px] text-base leading-relaxed text-[#555b64]">{profile.description || 'Dieses Twin-Profil hat noch keine öffentliche Beschreibung.'}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/18 p-4">
                  <p className="text-xs text-[#667085]">Inhalte</p>
                  <p className="mt-1 text-2xl font-bold">{profile.mediaCount}</p>
                </div>
                <div className="rounded-lg bg-white/18 p-4">
                  <p className="text-xs text-[#667085]">Wissen</p>
                  <p className="mt-1 text-2xl font-bold">{profile.knowledgeCount}</p>
                </div>
                <div className="rounded-lg bg-white/18 p-4">
                  <p className="text-xs text-[#667085]">Stil</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{profile.style}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Kategorien</h2>
                  <div className="flex flex-wrap gap-2">
                    {(profile.categories.length ? profile.categories : ['KI-Zwilling']).map((item) => (
                      <span key={item} className="rounded-full border border-white/42 bg-white/18 px-3 py-1 text-sm">{item}</span>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-lg font-semibold">Sprachen</h2>
                  <div className="flex flex-wrap gap-2">
                    {(profile.languages.length ? profile.languages : ['de']).map((item) => (
                      <span key={item} className="rounded-full border border-white/42 bg-white/18 px-3 py-1 text-sm uppercase">{item}</span>
                    ))}
                  </div>
                </section>
              </div>

              <section className="mt-6">
                <h2 className="mb-3 text-lg font-semibold">Hochgeladene Inhalte</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(profile.uploadedContents.length ? profile.uploadedContents : [{ category: 'Noch keine öffentlichen Inhalte', count: 0 }]).map((item) => (
                    <div key={item.category} className="flex items-center justify-between rounded-lg bg-white/16 px-4 py-3">
                      <span className="text-sm font-medium">{item.category}</span>
                      <span className="text-sm text-[#667085]">{item.count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-6 rounded-lg border border-white/30 bg-white/14 p-4">
                <h2 className="mb-2 text-lg font-semibold">Twin-Kontext</h2>
                <p className="text-sm leading-relaxed text-[#555b64]">{profile.contextSummary}</p>
              </section>
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}

function SignInRequiredCard({ title, text, returnTo }: { title: string; text: string; returnTo: string }) {
  return (
    <Card className="p-6 sm:p-8">
      <CardContent className="flex flex-col items-start gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-[#555b64]">{text}</p>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[260px]">
          <Suspense fallback={null}>
            <GitHubSignInButton variant="official" returnTo={returnTo} />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  )
}

function AccountProfileView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const auth = useAuth()

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Mein Profil</h1>
        <p className="text-base text-[#555b64]">Account, Session und Datenschutzstatus fuer deinen smyst-Zugang.</p>
      </div>

      {auth.status !== 'authenticated' ? (
        <SignInRequiredCard
          title="Anmelden oder registrieren"
          text="Dein Profil wird nach GitHub OAuth ueber Cloudflare KV gelesen. Ohne Login bleiben private Daten unsichtbar."
          returnTo="/profile"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e7f6ff] text-2xl font-bold text-[#0b1c44] ring-1 ring-white/50">
                {auth.user?.picture ? (
                  <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  (auth.user?.name?.[0] ?? auth.user?.email?.[0] ?? 'S').toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold">{auth.user?.name ?? 'smyst Nutzer'}</h2>
                <p className="mt-1 truncate text-sm text-[#555b64]">{auth.user?.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(auth.user?.roles ?? ['member']).map((role) => (
                    <span key={role} className="rounded-full bg-white/24 px-3 py-1 text-xs font-semibold text-[#0b1c44]">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white/16 p-4">
                <p className="text-xs text-[#667085]">User Sub</p>
                <p className="mt-1 break-all text-sm font-semibold">{auth.user?.sub}</p>
              </div>
              <div className="rounded-lg bg-white/16 p-4">
                <p className="text-xs text-[#667085]">Session</p>
                <p className="mt-1 text-sm font-semibold">HttpOnly Cookie</p>
              </div>
              <div className="rounded-lg bg-white/16 p-4">
                <p className="text-xs text-[#667085]">Datenschutz</p>
                <p className="mt-1 text-sm font-semibold">Private Inhalte standardmaessig noindex</p>
              </div>
              <div className="rounded-lg bg-white/16 p-4">
                <p className="text-xs text-[#667085]">Speicher</p>
                <p className="mt-1 text-sm font-semibold">IDrive e2 fuer Dateien und Medien</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold">Naechste Schritte</h3>
            <div className="space-y-3">
              <Button className="w-full justify-center" onClick={() => onNavigate('twin-builder')}>Twin erstellen</Button>
              <Button className="w-full justify-center" variant="secondary" onClick={() => onNavigate('memory-upload')}>Daten hochladen</Button>
              <Button className="w-full justify-center" variant="secondary" onClick={() => onNavigate('settings')}>Einstellungen</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function MyTwinsView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const [twins, setTwins] = useState<TwinRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    if (auth.status !== 'authenticated') {
      setLoaded(auth.status === 'anonymous')
      return
    }
    void twinMvp.listTwins().then((items) => {
      if (!alive) return
      setTwins(items ?? [])
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [auth.status])

  return (
    <div className="pt-[72px]">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight">Meine Twins</h1>
          <p className="text-base text-[#555b64]">Alle privaten und oeffentlichen Twin-Profile deines Accounts.</p>
        </div>
        <Button onClick={() => onNavigate('twin-builder')}>Twin erstellen</Button>
      </div>

      {auth.status !== 'authenticated' ? (
        <SignInRequiredCard
          title="Anmelden, um deine Twins zu sehen"
          text="Twin-Metadaten liegen in Cloudflare KV und sind an deine GitHub-Session gebunden."
          returnTo="/twins"
        />
      ) : !loaded ? (
        <Card className="p-8 text-sm text-[#555b64]">Twins werden geladen...</Card>
      ) : twins.length === 0 ? (
        <Card className="p-8">
          <h2 className="mb-2 text-xl font-bold">Noch kein Twin gespeichert</h2>
          <p className="mb-5 text-sm text-[#555b64]">Erstelle zuerst einen Twin und lade danach Erinnerungen oder Wissen hoch.</p>
          <Button onClick={() => onNavigate('twin-builder')}>Ersten Twin erstellen</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {twins.map((twin) => (
            <Card key={twin.id} className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{twin.name}</h2>
                  <p className="mt-1 text-sm text-[#555b64]">{twin.description || 'Noch keine Beschreibung'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${twin.visibility === 'public' ? 'bg-emerald-500/14 text-emerald-800' : 'bg-slate-500/14 text-slate-700'}`}>
                  {twin.visibility === 'public' ? 'Public' : 'Private'}
                </span>
              </div>
              <div className="mb-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-lg font-bold">{twin.knowledgeTexts.length}</p>
                  <p className="text-xs text-[#667085]">Wissen</p>
                </div>
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-lg font-bold">{twin.mediaRefs.length}</p>
                  <p className="text-xs text-[#667085]">Medien</p>
                </div>
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-sm font-bold capitalize">{twin.style}</p>
                  <p className="text-xs text-[#667085]">Stil</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onNavigate('twin-chat')}>Chat</Button>
                <Button size="sm" variant="secondary" onClick={() => onNavigate('memory-upload')}>Daten hochladen</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {twinMvp.error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700">{twinMvp.error}</p>}
    </div>
  )
}

function SettingsView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const auth = useAuth()

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-base text-[#555b64]">Free-only Betrieb, Datenschutz und Account-Aktionen.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold">Account</h2>
          {auth.status === 'authenticated' ? (
            <div className="space-y-4">
              <p className="text-sm text-[#555b64]">Angemeldet als <span className="font-semibold text-[#17191d]">{auth.user?.email}</span></p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onNavigate('account-profile')}>Profil oeffnen</Button>
                <Button variant="secondary" onClick={() => void auth.signOut()}>Logout</Button>
              </div>
            </div>
          ) : (
            <Suspense fallback={null}>
              <GitHubSignInButton variant="official" returnTo="/settings" />
            </Suspense>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold">Infrastruktur-Regeln</h2>
          <div className="space-y-3 text-sm text-[#555b64]">
            <p>App und Worker laufen ueber Cloudflare Free und GitHub Actions Free.</p>
            <p>Dateien, Medien und grosse Twin-Daten gehoeren in IDrive e2.</p>
            <p>Keine Google Fonts, keine bezahlten Auth-, Datenbank-, KI- oder Monitoring-Pflichtdienste.</p>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-xl font-bold">Datenschutz</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Private Defaults', 'Uploads und Twins starten privat.'],
              ['Noindex', 'Private Profilseiten werden nicht indexiert.'],
              ['Owner Scope', 'Dateipfade bleiben an den User gebunden.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg bg-white/16 p-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-[#667085]">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [valuesText, setValuesText] = useState('')
  const [wisdomText, setWisdomText] = useState('')
  const [decisionText, setDecisionText] = useState('')
  const [style, setStyle] = useState<TwinStyle>('warm')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [savedTwin, setSavedTwin] = useState<TwinRecord | null>(null)
  const totalSteps = 4
  const auth = useAuth()
  const twinMvp = useTwinMvp()

  const handleCreateTwin = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || auth.status !== 'authenticated') return

    const twin = await twinMvp.createTwin({
      name: trimmedName,
      description: description.trim(),
      style,
      visibility,
      categories: ['KI-Zwilling', 'Wissen', 'Erinnerungen'],
      languages: ['de'],
    })
    if (!twin) return

    const knowledge = [
      valuesText.trim() && `Werte: ${valuesText.trim()}`,
      wisdomText.trim() && `Lebensweisheit: ${wisdomText.trim()}`,
      decisionText.trim() && `Entscheidungen: ${decisionText.trim()}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    if (knowledge) {
      await twinMvp.addKnowledge({
        twinId: twin.id,
        title: 'Twin Builder Grundlage',
        text: knowledge,
      })
    }

    setSavedTwin(twin)
    onNavigate('twin-chat')
  }

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
                Per GitHub fortfahren — Free-Only Auth ueber Cloudflare Worker und KV, DSGVO-orientiert und ohne bezahlten Auth-Dienst.
              </p>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[260px]">
              <Suspense fallback={null}>
                <GitHubSignInButton variant="official" returnTo="/twin-builder" />
              </Suspense>
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
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
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
                  value={valuesText}
                  onChange={(event) => setValuesText(event.target.value)}
                  placeholder="z.B. Familie, Ehrlichkeit, Verantwortung..."
                  className="w-full resize-none rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Welche Lebensweisheit möchtest du weitergeben?</label>
                <textarea
                  rows={4}
                  value={wisdomText}
                  onChange={(event) => setWisdomText(event.target.value)}
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
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value as TwinStyle)}
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                >
                  <option value="warm">Warm und empathisch</option>
                  <option value="direct">Direkt und sachlich</option>
                  <option value="humorous">Humorvoll und locker</option>
                  <option value="wise">Weise und bedacht</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Wie triffst du wichtige Entscheidungen?</label>
                <textarea
                  rows={4}
                  value={decisionText}
                  onChange={(event) => setDecisionText(event.target.value)}
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
            {savedTwin && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-800">
                Twin "{savedTwin.name}" wurde als Free-only-MVP gespeichert.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`rounded-lg border p-4 transition-colors ${visibility === 'private' ? 'border-[#59C7FF] bg-[#59C7FF]/12' : 'border-white/26 bg-white/12'}`}>
                <input
                  type="radio"
                  name="twin-visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="sr-only"
                />
                <p className="text-sm font-semibold">Privat</p>
                <p className="mt-1 text-xs text-[#767d87]">Nur angemeldet sichtbar. Profilseiten bekommen automatisch noindex.</p>
              </label>

              <label className={`rounded-lg border p-4 transition-colors ${visibility === 'public' ? 'border-[#59C7FF] bg-[#59C7FF]/12' : 'border-white/26 bg-white/12'}`}>
                <input
                  type="radio"
                  name="twin-visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                  className="sr-only"
                />
                <p className="text-sm font-semibold">Öffentlich</p>
                <p className="mt-1 text-xs text-[#767d87]">SEO-freundliche URL, indexierbar und schnell aus Cloudflare KV lesbar.</p>
              </label>
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
            disabled={(step === totalSteps && (auth.status !== 'authenticated' || !name.trim())) || twinMvp.loading}
            onClick={() => {
              if (step < totalSteps) {
                setStep(step + 1)
              } else {
                void handleCreateTwin()
              }
            }}
          >
            {step === totalSteps ? (twinMvp.loading ? 'Speichert...' : 'Twin erstellen') : 'Weiter'}
          </Button>
        </div>
        {twinMvp.error && (
          <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700">{twinMvp.error}</p>
        )}
      </Card>
    </div>
  )
}

// Memory Upload View
function inferMemoryCategory(file: File): MemoryCategory {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function MemoryUploadView() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const auth = useAuth()
  const memoryUpload = useMemoryUpload()
  const [uploaded, setUploaded] = useState<Array<UploadResult & { name: string; category: MemoryCategory; uploadedAt: number }>>([])

  const handleFiles = async (files: FileList | File[]) => {
    if (auth.status !== 'authenticated') return
    for (const file of Array.from(files)) {
      const category = inferMemoryCategory(file)
      const result = await memoryUpload.upload(file, category)
      if (result) {
        setUploaded((current) => [
          { ...result, name: file.name, category, uploadedAt: Date.now() },
          ...current,
        ])
      }
    }
  }

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Memory Upload</h1>
        <p className="text-base text-[#555b64]">Lade deine Erinnerungen hoch und mache sie lebendig.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-8">
            {auth.status === 'anonymous' && (
              <div className="mb-6 rounded-lg border border-white/26 bg-white/12 p-4">
                <p className="mb-3 text-sm font-medium">Anmelden, um direkt nach IDrive e2 hochzuladen.</p>
                <Suspense fallback={null}>
                  <GitHubSignInButton variant="official" returnTo="/memory-upload" />
                </Suspense>
              </div>
            )}
            <div
              className="rounded-lg border-2 border-dashed border-white/42 bg-white/12 p-12 text-center transition-colors hover:border-[#59C7FF]/50 hover:bg-white/18"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void handleFiles(e.dataTransfer.files)
              }}
            >
              <div className="mb-4 text-6xl">📤</div>
              <h3 className="mb-2 text-xl font-semibold">Dateien hierher ziehen</h3>
              <p className="mb-4 text-sm text-[#767d87]">oder klicke zum Auswählen</p>
	              <input
	                ref={inputRef}
	                type="file"
	                multiple
	                accept="image/*,video/*,audio/*,.pdf,.txt,.md,.markdown,.csv,.docx,.xlsx,.pptx"
	                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void handleFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
              <Button disabled={auth.status !== 'authenticated' || memoryUpload.uploading} onClick={() => inputRef.current?.click()}>
                Dateien auswählen
              </Button>
              <p className="mt-4 text-xs text-[#767d87]">
	                Unterstützt: PDF, DOCX, TXT, MP3, WAV, JPG, PNG, MP4 (max. 50 MB pro Datei)
              </p>
            </div>

            {memoryUpload.uploading && memoryUpload.progress && (
              <div className="mt-6 rounded-lg bg-white/12 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Upload läuft...</span>
                  <span>{memoryUpload.progress.percentage}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/20">
                  <div
                    className="h-2 animate-pulse rounded-full bg-[#59C7FF]"
                    style={{ width: `${memoryUpload.progress.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}
            {memoryUpload.error && (
              <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700">{memoryUpload.error}</p>
            )}
          </Card>

          <Card className="mt-6">
            <h3 className="mb-4 text-lg font-semibold">Kürzlich hochgeladen</h3>
            <div className="space-y-3">
              {(uploaded.length
                ? uploaded.map((file) => ({
                    name: file.name,
                    type: file.category,
                    date: new Date(file.uploadedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                    status: 'processed',
                  }))
                : [
                    { name: 'Noch keine Datei hochgeladen', type: 'document', date: 'IDrive e2 bereit', status: 'processing' },
                  ]
              ).map((file, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-white/12 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/18 text-xl">
                      {file.type === 'image' ? '🖼️' : file.type === 'audio' ? '🎵' : file.type === 'video' ? '🎬' : '📄'}
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
                <p className="text-2xl font-bold">{uploaded.length}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-[#767d87]">Verarbeitete Dateien</p>
                <p className="text-2xl font-bold">{uploaded.length}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-[#767d87]">Speicher verwendet</p>
                <p className="text-2xl font-bold">{(uploaded.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</p>
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
  type TwinChatUiMessage = {
    id: string
    role: 'ai' | 'user'
    content: string
    streaming?: boolean
  }

  const [messages, setMessages] = useState<TwinChatUiMessage[]>([
    {
      id: 'welcome',
      role: 'ai',
      content: 'Hallo. Ich bin dein digitaler Zwilling. Frag mich etwas zu deinem Wissen, deinen Erinnerungen oder deinen Entscheidungen.',
    },
  ])
  const [input, setInput] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [activeTwin, setActiveTwin] = useState<TwinRecord | null>(null)
  const [isReplying, setIsReplying] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const auth = useAuth()
  const twinMvp = useTwinMvp()

  const canSend = auth.status === 'authenticated' && input.trim().length > 0 && !isReplying
  const initials = (activeTwin?.name ?? 'Smyst')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
  const suggestions = [
    'Was ist mein wichtigster Lebensrat?',
    'Wie treffe ich schwierige Entscheidungen?',
    'Was ist mir in Beziehungen wichtig?',
    'Welche Erfahrungen prägen meine Sicht?',
  ]

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  useEffect(() => {
    let alive = true
    if (auth.status !== 'authenticated') return

    void twinMvp.listTwins().then((twins) => {
      if (!alive || activeTwin) return
      setActiveTwin(twins?.[0] ?? null)
    })

    return () => {
      alive = false
    }
  }, [auth.status])

  const resizeInput = (value: string) => {
    setInput(value)
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`
  }

  const streamAssistantMessage = async (messageId: string, content: string) => {
    const chars = Array.from(content)
    let index = 0
    while (index < chars.length) {
      index = Math.min(chars.length, index + 7)
      const partial = chars.slice(0, index).join('')
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: partial, streaming: index < chars.length }
            : message,
        ),
      )
      await new Promise((resolve) => window.setTimeout(resolve, 12))
    }
  }

  const handleSend = async () => {
    const message = input.trim()
    if (!message || auth.status !== 'authenticated' || isReplying) return

    const userMessage: TwinChatUiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }
    const assistantId = crypto.randomUUID()
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'ai', content: '', streaming: true },
    ])
    resizeInput('')
    setIsReplying(true)

    try {
      let nextTwin = activeTwin
      if (!nextTwin) {
        const twins = await twinMvp.listTwins()
        nextTwin = twins?.[0] ?? null
        setActiveTwin(nextTwin)
      }

      let nextChatId = chatId
      if (!nextChatId) {
        const chat = await twinMvp.startTwinChat(nextTwin?.id)
        if (!chat) throw new Error('Chat konnte nicht gestartet werden.')
        nextChatId = chat.id
        setChatId(nextChatId)
      }

      const reply = await twinMvp.sendTwinMessage(nextChatId, message)
      if (!reply?.message) throw new Error('Keine Antwort vom Chat-Worker erhalten.')
      await streamAssistantMessage(assistantId, reply.message.content)
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Der Chat ist gerade nicht erreichbar.'
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `${text} Deine Nachricht wurde lokal angezeigt; der Free-only Worker bleibt die einzige API-Schicht.`,
                streaming: false,
              }
            : item,
        ),
      )
    } finally {
      setIsReplying(false)
    }
  }

  return (
    <div className="pt-6 sm:pt-[72px]">
      {auth.status === 'anonymous' && (
        <Card className="mb-4 p-5 sm:mb-6 sm:p-6">
          <CardContent className="flex flex-col items-start gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Twin Chat</h1>
              <p className="text-sm text-[#555b64]">Melde dich an, um deinen gespeicherten Free-only Twin-Kontext zu laden.</p>
            </div>
            <Suspense fallback={null}>
              <GitHubSignInButton variant="official" returnTo="/twin-chat" />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <section className="mx-auto flex h-[calc(100dvh-132px)] min-h-[620px] max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-white/42 bg-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_24px_80px_rgba(82,88,98,0.16)] backdrop-blur-[30px] sm:h-[calc(100dvh-164px)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/26 bg-white/18 px-4 py-3 backdrop-blur-[22px] sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#59C7FF]/20 text-sm font-bold text-[#0b1c44] ring-1 ring-white/44">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{activeTwin?.name ?? 'Dein Twin'}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#555b64]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Bereit
                </span>
                <span>{activeTwin ? `${activeTwin.style} Stil` : 'Free-only MVP'}</span>
                <span>{activeTwin ? `${activeTwin.knowledgeTexts.length} Wissenstexte` : 'KV + IDrive e2'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setChatId(null)
              setMessages([
                {
                  id: crypto.randomUUID(),
                  role: 'ai',
                  content: 'Neuer Chat ist bereit. Schreib einfach los.',
                },
              ])
              inputRef.current?.focus()
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/42 bg-white/18 text-[#16181b] transition-colors hover:bg-white/30"
            aria-label="Neuen Chat starten"
            title="Neuen Chat starten"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto flex max-w-[760px] flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] sm:max-w-[74%] ${
                    msg.role === 'user'
                      ? 'rounded-br-md bg-[#59C7FF]/28 text-[#0b1c44]'
                      : 'rounded-bl-md border border-white/30 bg-white/24 text-[#16181b]'
                  }`}
                >
                  {msg.streaming && !msg.content ? (
                    <div className="flex h-6 items-center gap-1" aria-label="Antwort wird vorbereitet">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#555b64]"></span>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#555b64] [animation-delay:120ms]"></span>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#555b64] [animation-delay:240ms]"></span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  {msg.streaming && msg.content && (
                    <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-[#59C7FF] align-middle"></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/26 bg-white/18 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-[24px] sm:px-5 sm:pb-5">
          <div className="mx-auto max-w-[760px]">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    resizeInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="shrink-0 rounded-full border border-white/36 bg-white/16 px-3 py-2 text-xs font-medium text-[#555b64] transition-colors hover:bg-white/28"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2 rounded-[24px] border border-white/42 bg-white/28 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[20px]">
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#555b64] transition-colors hover:bg-white/24"
                aria-label="Medien hinzufügen"
                title="Medien hinzufügen"
              >
                <Plus className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(event) => resizeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder={auth.status === 'authenticated' ? 'Nachricht an deinen Twin...' : 'Bitte anmelden, um zu chatten'}
                disabled={auth.status !== 'authenticated'}
                className="max-h-[132px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-6 text-[#16181b] outline-none placeholder:text-[#767d87] disabled:cursor-not-allowed disabled:opacity-70"
              />
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#555b64] transition-colors hover:bg-white/24"
                aria-label="Spracheingabe"
                title="Spracheingabe"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void handleSend()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#59C7FF] text-[#0b1c44] shadow-[0_10px_24px_rgba(89,199,255,0.26)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-white/28 disabled:text-[#767d87] disabled:shadow-none"
                aria-label="Nachricht senden"
                title="Nachricht senden"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
            {twinMvp.error && (
              <p className="mt-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{twinMvp.error}</p>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
