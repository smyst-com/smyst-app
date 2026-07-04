import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import LangSwitcher from '@/components/LangSwitcher'
import type { NavItem } from '@/components/MobileNav'
import { DEFAULT_LANG, SUPPORTED_LANGS, useLanguage, type SupportedLang } from '@/lib/i18n'
import {
  categoryFacets,
  newProfiles,
  popularProfiles,
  rankProfiles,
  recentlyUsedProfiles,
  recommendedProfiles,
  similarProfiles,
  type DiscoveryProfile,
} from '@/lib/profileDiscovery'
import { DEFAULT_TRANSLATIONS, useStaticTranslations } from '@/lib/staticTranslations'
import { useAuth } from '@/lib/useAuth'
import { pickVoiceSettings, remoteVoiceIdFor, voiceGenderFor } from '@/lib/voiceProfiles'
import { isRemoteSpeechActive, playRemoteSpeech, stopRemoteSpeech, unlockAudioPlayback } from '@/lib/ttsClient'
import { useMemoryUpload, type MemoryCategory, type UploadResult } from '@/lib/useMemoryUpload'
import { useTwinMvp, type ChatSearchResult, type MemoryRecord, type PublicTwinProfile, type SupportReportType, type TwinChatRecord, type TwinRecord, type TwinStyle, type UserProfileRecord } from '@/lib/useTwinMvp'
import {
  CURATED_PUBLIC_TWIN_BASE_TIME,
  CURATED_PUBLIC_TWIN_LANGUAGES,
  CURATED_PUBLIC_TWIN_SPECS,
  type CuratedPublicTwinSpec,
} from './data/curated-public-twin-data'

const CookieConsent = lazy(() => import('@/components/CookieConsent'))
const GitHubSignInButton = lazy(() => import('@/components/GitHubSignInButton'))
const EmailAuthForm = lazy(() => import('@/components/EmailAuthForm'))
const MobileNav = lazy(() => import('@/components/MobileNav'))
import AccountPrivacyActions from '@/components/AccountPrivacyActions'
import PasswordResetGate from '@/components/PasswordResetGate'

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

function Share(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.7 6.8-4.4" />
      <path d="m8.6 13.3 6.8 4.4" />
    </svg>
  )
}

function Speaker(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M18.5 7a8 8 0 0 1 0 10" />
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

function ImageIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L6 19" />
    </svg>
  )
}

function FileIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  )
}

function LinkIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  )
}

function BookSpark(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
      <path d="M12 7l.7 1.6L14.5 9l-1.8.4L12 11l-.7-1.6L9.5 9l1.8-.4Z" />
    </svg>
  )
}

function MapPinIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function CameraIcon(props: IconProps) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
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

function SmystLockup() {
  return (
    <div className="inline-flex flex-col items-center text-center" aria-label="smyst Create Your AI Twin">
      <span className="font-smyst-logo text-[48px] font-medium leading-none tracking-normal text-white sm:text-[70px]">
        smyst
      </span>
      <span className="mt-1 whitespace-nowrap text-[13px] font-semibold leading-none text-[#9aa6b7] sm:text-lg">
        Create Your AI Twin
      </span>
    </div>
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
  | 'trust'
  | 'privacy'
  | 'terms'
  | 'imprint'
  | 'dashboard'
  | 'admin'
  | 'twin-profile'
  | 'not-found'

type AppTheme = 'dark' | 'light'
type NameSortMode = 'famous' | 'used' | 'popular' | 'trend' | 'manual'
type SpeechRecognitionState = 'idle' | 'listening' | 'paused' | 'replying'
type ChatAttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'contact' | 'location' | 'file' | 'link'

type ChatAttachment = {
  id: string
  kind: ChatAttachmentKind
  name: string
  status: 'ready' | 'uploading' | 'uploaded' | 'failed'
  url?: string
  uploadId?: string
  key?: string
  contentType?: string
  size?: number
}

type BrowserSpeechRecognitionEvent = Event & {
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      length: number
      [index: number]: { transcript: string }
    }
  }
}

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type BrowserContact = {
  name?: string[]
  email?: string[]
  tel?: string[]
}

type BrowserContactsManager = {
  select?: (properties: string[], options?: { multiple?: boolean }) => Promise<BrowserContact[]>
}

type BrowserNavigatorWithContacts = Navigator & {
  contacts?: BrowserContactsManager
}

const nameSortOptions: Array<{ mode: NameSortMode; label: string; detail: string }> = [
  { mode: 'famous', label: 'Freigegeben', detail: 'Bereite KI-Profile zuerst' },
  { mode: 'used', label: 'Zuletzt genutzt', detail: 'Aktive Chats zuerst' },
  { mode: 'popular', label: 'Relevanz', detail: 'Passende Profile zuerst' },
  { mode: 'trend', label: 'Aktualisiert', detail: 'Neue Profile zuerst' },
  { mode: 'manual', label: 'Manuell', detail: 'Eigene Reihenfolge' },
]

function isNameSortMode(value: string | null): value is NameSortMode {
  return value === 'famous' || value === 'used' || value === 'popular' || value === 'trend' || value === 'manual'
}

function speechLangFor(lang?: string) {
  if (!lang) return 'de-DE'
  if (lang === 'en') return 'en-US'
  if (lang === 'tr') return 'tr-TR'
  if (lang === 'fr') return 'fr-FR'
  if (lang === 'es') return 'es-ES'
  if (lang === 'pt') return 'pt-PT'
  if (lang === 'ar') return 'ar-SA'
  if (lang === 'zh') return 'zh-CN'
  if (lang === 'ja') return 'ja-JP'
  if (lang === 'ko') return 'ko-KR'
  return 'de-DE'
}

function speakLocal(text: string, lang: string, onDone: () => void, voiceKey?: string) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const targetLang = speechLangFor(lang)
  utterance.lang = targetLang
  const voiceSettings = pickVoiceSettings(voiceKey, window.speechSynthesis.getVoices(), targetLang)
  if (voiceSettings.voice) utterance.voice = voiceSettings.voice
  utterance.rate = voiceSettings.rate
  utterance.pitch = voiceSettings.pitch
  utterance.onend = onDone
  utterance.onerror = onDone
  window.speechSynthesis.speak(utterance)
  return true
}

function speakText(text: string, lang: string, onDone: () => void, voiceKey?: string) {
  const cleanText = text.trim()
  if (!cleanText) return false
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  stopRemoteSpeech()
  void playRemoteSpeech(cleanText, lang, voiceGenderFor(voiceKey), onDone, remoteVoiceIdFor(voiceKey, lang)).then((started) => {
    if (!started && !speakLocal(cleanText, lang, onDone, voiceKey)) onDone()
  })
  return true
}

function speechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const candidate = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

function speechRecognitionSupported() {
  return Boolean(speechRecognitionConstructor())
}

function VoiceWaveStatus({
  state,
  isSpeaking,
  variant = 'dark',
}: {
  state: SpeechRecognitionState
  isSpeaking: boolean
  variant?: 'dark' | 'light'
}) {
  if (state === 'idle' && !isSpeaking) return null

  const label = isSpeaking
    ? 'Twin spricht laut'
    : state === 'listening'
      ? 'Sprachwelle hört zu'
      : state === 'paused'
        ? 'Sprachwelle pausiert'
        : 'Antwort wird vorbereitet'
  const detail = isSpeaking
    ? 'Laut vorlesen aktiv'
    : state === 'listening'
      ? 'Sprich weiter. Nach kurzer Ruhe wird automatisch gesendet.'
      : state === 'paused'
        ? 'Tippe die Welle erneut, um weiterzusprechen.'
        : 'Der Twin antwortet gleich und liest danach laut vor.'

  return (
    <div className={`smyst-voice-wave smyst-voice-wave-${variant}`} data-voice-state={isSpeaking ? 'speaking' : state}>
      <span className="smyst-voice-wave-bars" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
          <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} />
        ))}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-black uppercase tracking-[0.14em]">{label}</span>
        <span className="block truncate text-[11px] font-semibold opacity-78">{detail}</span>
      </span>
    </div>
  )
}

function mediaCategoryForFile(file: File): MemoryCategory {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (name.endsWith('.vcf') || type === 'text/vcard') return 'document'
  return 'document'
}

function attachmentKindForFile(file: File): ChatAttachmentKind {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (name.endsWith('.vcf') || type === 'text/vcard') return 'contact'
  if (type.includes('pdf') || type.includes('document') || type.startsWith('text/')) return 'document'
  return 'file'
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function attachmentLine(attachment: ChatAttachment) {
  const size = formatBytes(attachment.size)
  const meta = [attachment.contentType, size].filter(Boolean).join(', ')
  const target = attachment.url ?? attachment.key
  return `- ${attachment.name}${meta ? ` (${meta})` : ''}${target ? `: ${target}` : ''}`
}

function composeMessageWithAttachments(text: string, attachments: ChatAttachment[]) {
  const body = text.trim()
  const uploaded = attachments.filter((attachment) => attachment.status === 'uploaded' || attachment.status === 'ready')
  if (!uploaded.length) return body
  const list = uploaded.map(attachmentLine).join('\n')
  return [body, `Anhänge:\n${list}`].filter(Boolean).join('\n\n')
}

function contactsToText(contacts: BrowserContact[]) {
  return contacts
    .map((contact) => {
      const name = contact.name?.join(' ') || 'Kontakt'
      const tel = contact.tel?.join(', ')
      const email = contact.email?.join(', ')
      return [name, tel && `Telefon: ${tel}`, email && `E-Mail: ${email}`].filter(Boolean).join(' · ')
    })
    .join('\n')
}

const viewPaths: Record<Exclude<AppView, 'twin-profile' | 'not-found'>, string> = {
  landing: '/',
  'account-profile': '/profile',
  'my-twins': '/twins',
  'twin-builder': '/twin-builder',
  'memory-upload': '/memory-upload',
  'twin-chat': '/twin-chat',
  settings: '/settings',
  trust: '/trust',
  privacy: '/privacy',
  terms: '/terms',
  imprint: '/imprint',
  dashboard: '/dashboard',
  admin: '/admin',
}

function splitLocalizedPath(pathname: string): { langPrefix: SupportedLang | null; appPath: string } {
  const parts = pathname.split('/').filter(Boolean)
  const maybeLang = parts[0] as SupportedLang | undefined
  if (maybeLang && SUPPORTED_LANGS.includes(maybeLang)) {
    const rest = parts.slice(1).join('/')
    return { langPrefix: maybeLang, appPath: rest ? `/${rest}` : '/' }
  }
  return { langPrefix: null, appPath: pathname || '/' }
}

function localizedPath(path: string): string {
  const { langPrefix } = splitLocalizedPath(window.location.pathname)
  if (!langPrefix || langPrefix === DEFAULT_LANG) return path
  if (path === '/') return `/${langPrefix}`
  return `/${langPrefix}${path}`
}

function initialRoute(): { view: AppView; profileSlug: string | null; privateTwinId: string | null } {
  const { appPath: rawAppPath } = splitLocalizedPath(window.location.pathname)
  const path = rawAppPath !== '/' && rawAppPath.endsWith('/') ? rawAppPath.replace(/\/+$/, '') : rawAppPath
  if (path === '/') return { view: 'landing', profileSlug: null, privateTwinId: null }
  if (path.startsWith('/t/')) {
    return { view: 'twin-profile', profileSlug: decodeURIComponent(path.slice(3)), privateTwinId: null }
  }
  if (path.startsWith('/twins/')) {
    return { view: 'twin-profile', profileSlug: decodeURIComponent(path.slice('/twins/'.length)), privateTwinId: null }
  }
  if (path.startsWith('/private/twins/')) {
    return { view: 'twin-profile', profileSlug: null, privateTwinId: decodeURIComponent(path.slice('/private/twins/'.length)) }
  }
  if (path === '/profile') return { view: 'account-profile', profileSlug: null, privateTwinId: null }
  if (path === '/twins') return { view: 'my-twins', profileSlug: null, privateTwinId: null }
  if (path === '/twin-builder' || path === '/builder') return { view: 'twin-builder', profileSlug: null, privateTwinId: null }
  if (path === '/memory-upload' || path === '/upload') return { view: 'memory-upload', profileSlug: null, privateTwinId: null }
  if (path.startsWith('/chat/')) {
    return { view: 'twin-chat', profileSlug: decodeURIComponent(path.slice('/chat/'.length)), privateTwinId: null }
  }
  if (path === '/twin-chat' || path === '/chat' || path === '/chats') return { view: 'twin-chat', profileSlug: null, privateTwinId: null }
  if (path === '/settings') return { view: 'settings', profileSlug: null, privateTwinId: null }
  if (path === '/trust') return { view: 'trust', profileSlug: null, privateTwinId: null }
  if (path === '/privacy') return { view: 'privacy', profileSlug: null, privateTwinId: null }
  if (path === '/terms') return { view: 'terms', profileSlug: null, privateTwinId: null }
  if (path === '/imprint') return { view: 'imprint', profileSlug: null, privateTwinId: null }
  if (path === '/dashboard') return { view: 'dashboard', profileSlug: null, privateTwinId: null }
  if (path === '/admin') return { view: 'admin', profileSlug: null, privateTwinId: null }
  return { view: 'not-found', profileSlug: null, privateTwinId: null }
}

export default function App() {
  const route = useMemo(() => initialRoute(), [])
  const { lang: appLang } = useLanguage({ reloadOnChange: false })
  const ft = useStaticTranslations(appLang)
  const [currentView, setCurrentView] = useState<AppView>(route.view)
  const [profileSlug, setProfileSlug] = useState<string | null>(route.profileSlug)
  const [privateTwinId, setPrivateTwinId] = useState<string | null>(route.privateTwinId)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const stored = window.localStorage.getItem('smyst-theme')
    return stored === 'light' ? 'light' : 'dark'
  })
  const [nameSortMode, setNameSortMode] = useState<NameSortMode>(() => {
    const stored = window.localStorage.getItem('smyst-name-sort')
    return isNameSortMode(stored) ? stored : 'famous'
  })
  const auth = useAuth()

  useEffect(() => {
    window.localStorage.setItem('smyst-theme', appTheme)
    document.documentElement.dataset.smystTheme = appTheme
  }, [appTheme])

  useEffect(() => {
    window.localStorage.setItem('smyst-name-sort', nameSortMode)
  }, [nameSortMode])

  useEffect(() => {
    if (currentView !== 'start' && currentView !== 'twin-profile') {
      document.title = 'smyst.com | KI-Zwillinge, digitale Profile und Twin Chat'
    }
  }, [currentView])

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
    if (view !== 'twin-profile' && view !== 'not-found') window.history.pushState({}, '', localizedPath(viewPaths[view]))
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
          { label: 'Admin', onClick: () => navigateTo('admin'), active: currentView === 'admin' },
          { label: 'Mein Profil', onClick: () => navigateTo('account-profile'), active: currentView === 'account-profile' },
          { label: 'Meine Twins', onClick: () => navigateTo('my-twins'), active: currentView === 'my-twins' },
          { label: 'Twin Builder', onClick: () => navigateTo('twin-builder'), active: currentView === 'twin-builder' },
          { label: 'Daten hochladen', onClick: () => navigateTo('memory-upload'), active: currentView === 'memory-upload' },
          { label: 'Chats', onClick: () => navigateTo('twin-chat'), active: currentView === 'twin-chat' },
          { label: 'Trust', onClick: () => navigateTo('trust'), active: currentView === 'trust' },
          { label: 'Einstellungen', onClick: () => navigateTo('settings'), active: currentView === 'settings' },
        ]

  if (currentView === 'landing') {
    return (
      <div className={appTheme === 'dark' ? 'smyst-app-dark min-h-screen bg-[#111722] text-[#f4f7fb]' : 'smyst-app-light min-h-screen bg-[#d9dee7] text-[#111722]'}>
        <SmystStartPage
          onNavigate={navigateTo}
          appTheme={appTheme}
          onThemeChange={setAppTheme}
          nameSortMode={nameSortMode}
          onNameSortModeChange={setNameSortMode}
        />
		  <PasswordResetGate />
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={mobileNavOpen}
              className="inline-flex h-11 w-11 items-center justify-center border border-white/[0.1] bg-white/[0.04] text-white backdrop-blur-md transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              <MenuGlyph className="h-5 w-5" />
            </button>
            <button onClick={() => navigateTo('landing')} className="font-smyst-logo inline-flex flex-col items-start text-left text-white transition-opacity hover:opacity-80">
              <span className="text-2xl leading-none">smyst<span className="text-[0.78em]">.com</span></span>
              <span className="mt-0.5 text-[11px] font-semibold leading-none text-[#59C7FF]">Create Your AI Twin</span>
            </button>
          </div>

          <nav className="hidden items-center gap-5 md:flex" aria-label="Hauptnavigation">
            <button onClick={() => navigateTo('dashboard')} className={`text-sm ${currentView === 'dashboard' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Dashboard</button>
            <button onClick={() => navigateTo('admin')} className={`text-sm ${currentView === 'admin' ? 'font-semibold text-white' : 'text-[#9aa6b7]'} transition-colors hover:text-white`}>Admin</button>
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
      <main
        id="main"
        className={
          currentView === 'twin-chat'
            ? 'min-h-[calc(100dvh-80px)] w-full px-0 pb-0 sm:min-h-[calc(100dvh-92px)]'
            : currentView === 'admin'
              ? 'mx-auto min-h-[calc(100dvh-145px)] w-full max-w-[1520px] px-3 pb-10 sm:px-5'
            : 'mx-auto min-h-[calc(100dvh-145px)] w-full max-w-[1200px] px-4 pb-10 sm:px-6'
        }
      >
        {currentView === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
        {currentView === 'admin' && <AdminControlCenterView />}
        {currentView === 'account-profile' && <AccountProfileView onNavigate={navigateTo} />}
        {currentView === 'my-twins' && <MyTwinsView onNavigate={navigateTo} />}
        {currentView === 'twin-builder' && <TwinBuilderView onNavigate={navigateTo} />}
        {currentView === 'memory-upload' && <MemoryUploadView />}
        {currentView === 'twin-chat' && <TwinChatView initialTwinId={profileSlug} onNavigate={navigateTo} />}
        {currentView === 'settings' && (
          <SettingsView
            onNavigate={navigateTo}
            nameSortMode={nameSortMode}
            onNameSortModeChange={setNameSortMode}
          />
        )}
        {currentView === 'trust' && <TrustView onNavigate={navigateTo} />}
		  {currentView === 'trust' && <AccountPrivacyActions />}
        {currentView === 'privacy' && <LegalView kind="privacy" />}
        {currentView === 'terms' && <LegalView kind="terms" />}
        {currentView === 'imprint' && <LegalView kind="imprint" />}
        {currentView === 'twin-profile' && <TwinProfileView slug={profileSlug} privateTwinId={privateTwinId} onNavigate={navigateTo} />}
        {currentView === 'not-found' && <NotFoundView onNavigate={navigateTo} />}
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
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">{ft.footer.columnProduct}</h4>
              <button onClick={() => navigateTo('twin-builder')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Twin Builder</button>
              <button onClick={() => navigateTo('memory-upload')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Memory Upload</button>
              <button onClick={() => navigateTo('twin-chat')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Twin Chat</button>
              <button onClick={() => navigateTo('admin')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Admin</button>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">{ft.footer.columnCompany}</h4>
              <button onClick={() => navigateTo('trust')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">Trust Center</button>
              <a href="mailto:i@smyst.com?subject=Karriere%20bei%20smyst.com" className="inline-flex min-h-8 items-center text-sm text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.careers}</a>
              <a href="mailto:b2b@smyst.com" className="inline-flex min-h-8 items-center text-sm text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.b2b}</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">{ft.footer.columnLegal}</h4>
              <button onClick={() => navigateTo('imprint')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.imprint}</button>
              <button onClick={() => navigateTo('privacy')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.privacy}</button>
              <button onClick={() => navigateTo('terms')} className="inline-flex min-h-8 items-center text-left text-sm text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.terms}</button>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-6 md:flex-row">
          <p className="text-sm text-[#9aa6b7]">{ft.footer.rights}</p>
          <div className="flex flex-wrap gap-5">
            <a href="mailto:i@smyst.com" className="inline-flex min-h-8 items-center text-sm font-semibold text-[#9aa6b7] transition-colors hover:text-white">{ft.footer.contact}</a>
            <button onClick={() => navigateTo('trust')} className="inline-flex min-h-8 items-center text-sm font-semibold text-[#9aa6b7] transition-colors hover:text-white">Trust</button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('smyst:open-cookie-settings'))}
              className="inline-flex min-h-8 items-center text-sm font-semibold text-[#9aa6b7] transition-colors hover:text-white"
            >
              {ft.footer.appData}
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

type StartTwin = {
  id: string
  name: string
  description: string
  role: string
  accent: string
  initials: string
  tone: string
  manualRank: number
  profileSlug?: string
  imageUrl?: string | null
  categories: string[]
  languages: string[]
  createdAt: number
  updatedAt: number
  knowledgeCount: number
  mediaCount: number
  chatCount: number
  lastChatAt: number
  publicProfile: boolean
  mainCategory?: string
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
  searchIndex?: string
} & DiscoveryProfile

type ProfileUsage = {
  chatCount: number
  lastChatAt: number
}

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}

function formatIsoDate(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function ageAtDeath(profile: {
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
}): number | null {
  if (profile.birthDate && profile.deathDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) && /^\d{4}-\d{2}-\d{2}$/.test(profile.deathDate)) {
    const [birthYear, birthMonth, birthDay] = profile.birthDate.split('-').map(Number)
    const [deathYear, deathMonth, deathDay] = profile.deathDate.split('-').map(Number)
    let age = deathYear - birthYear
    if (deathMonth < birthMonth || (deathMonth === birthMonth && deathDay < birthDay)) age -= 1
    return age >= 0 ? age : null
  }
  if (typeof profile.birthYear === 'number' && typeof profile.deathYear === 'number') {
    const age = profile.deathYear - profile.birthYear
    return age >= 0 ? age : null
  }
  return null
}

function profileMainCategory(profile: { mainCategory?: string; categories: string[] }): string {
  return profile.mainCategory || profile.categories.slice(0, 2).join(', ') || 'KI-Profil'
}

function profileLifeLine(profile: {
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
}): string {
  const age = ageAtDeath(profile)
  const birth = profile.birthLabel || formatIsoDate(profile.birthDate)
  const death = profile.deathLabel || formatIsoDate(profile.deathDate)
  if (age !== null && birth && death) return `${age} Jahre • ${birth} – ${death}`
  if (birth && death) return `${birth} – ${death}`
  return 'Lebensdaten nicht hinterlegt'
}

function hasLifeDates(profile: {
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
}): boolean {
  const hasDateLife = Boolean(profile.birthDate?.trim() && profile.deathDate?.trim())
  const hasYearLife = Number.isFinite(profile.birthYear) && Number.isFinite(profile.deathYear) &&
    Boolean(profile.birthLabel?.trim() && profile.deathLabel?.trim())
  return hasDateLife || hasYearLife
}

function hasRequiredProfileImage(profile: { imageUrl?: string | null }): boolean {
  return Boolean(profile.imageUrl?.trim())
}

function isCompleteTwinRecord(twin: TwinRecord): boolean {
  return (
    twin.status === 'ready' &&
    Boolean(twin.name.trim()) &&
    twin.description.trim().length >= 40 &&
    hasRequiredProfileImage(twin) &&
    (twin.categories ?? []).some((item) => item.trim().length >= 2) &&
    (twin.languages ?? []).some((item) => item.trim().length >= 2)
  )
}

function isCompletePublicProfile(profile: PublicTwinProfile): boolean {
  return (
    profile.status === 'ready' &&
    profile.visibility === 'public' &&
    profile.quality?.ok !== false &&
    Boolean(profile.name.trim()) &&
    Boolean(profile.mainCategory?.trim()) &&
    profile.description.trim().length >= 40 &&
    hasRequiredProfileImage(profile) &&
    hasLifeDates(profile) &&
    (profile.categories ?? []).some((item) => item.trim().length >= 2) &&
    (profile.languages ?? []).some((item) => item.trim().length >= 2)
  )
}

function realTwinToStartTwin(twin: TwinRecord, index: number, usage: ProfileUsage = { chatCount: 0, lastChatAt: 0 }): StartTwin {
  const publicProfile = twin.visibility === 'public'
  const categories = (twin.categories ?? []).filter(Boolean)
  const languages = (twin.languages ?? []).filter(Boolean)
  const knowledgeCount = twin.knowledgeTexts?.length ?? 0
  const mediaCount = twin.mediaRefs?.length ?? 0
  return {
    id: twin.id,
    name: twin.name,
    description: twin.description || 'Persönlicher KI-Zwilling',
    role: publicProfile ? 'Öffentlich' : 'Privat',
    accent: ['#71E8FF', '#A8FFCB', '#9DBBFF', '#FFFFFF', '#FFD56A'][index % 5] ?? '#71E8FF',
    initials: initialsForName(twin.name),
    tone: twin.style,
    manualRank: index + 1,
    profileSlug: publicProfile ? twin.slug : undefined,
    imageUrl: twin.imageUrl ?? null,
    categories,
    languages,
    createdAt: twin.createdAt,
    updatedAt: twin.updatedAt,
    knowledgeCount,
    mediaCount,
    chatCount: usage.chatCount,
    lastChatAt: usage.lastChatAt,
    publicProfile,
    mainCategory: twin.mainCategory,
    birthDate: twin.birthDate,
    deathDate: twin.deathDate,
    birthYear: twin.birthYear,
    deathYear: twin.deathYear,
    birthLabel: twin.birthLabel,
    deathLabel: twin.deathLabel,
    searchIndex: twin.searchIndex,
  }
}

function publicProfileToStartTwin(profile: PublicTwinProfile, index: number, usage: ProfileUsage = { chatCount: 0, lastChatAt: 0 }): StartTwin {
  const categories = (profile.categories ?? []).filter(Boolean)
  const languages = (profile.languages ?? []).filter(Boolean)
  return {
    id: profile.slug,
    name: profile.name,
    description: profile.description || 'Öffentliches KI-Profil',
    role: 'Öffentlich',
    accent: ['#71E8FF', '#A8FFCB', '#9DBBFF', '#FFFFFF', '#FFD56A'][index % 5] ?? '#71E8FF',
    initials: initialsForName(profile.name),
    tone: profile.style,
    manualRank: index + 1,
    profileSlug: profile.slug,
    imageUrl: profile.imageUrl ?? null,
    categories,
    languages,
    createdAt: profile.createdAt ?? profile.updatedAt,
    updatedAt: profile.updatedAt,
    knowledgeCount: profile.knowledgeCount,
    mediaCount: profile.mediaCount,
    chatCount: usage.chatCount,
    lastChatAt: usage.lastChatAt,
    publicProfile: true,
    mainCategory: profile.mainCategory,
    birthDate: profile.birthDate,
    deathDate: profile.deathDate,
    birthYear: profile.birthYear,
    deathYear: profile.deathYear,
    birthLabel: profile.birthLabel,
    deathLabel: profile.deathLabel,
    searchIndex: profile.searchIndex,
  }
}

function curatedPublicProfileToPublicTwinProfile(spec: CuratedPublicTwinSpec, index: number): PublicTwinProfile {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smyst.com'
  const updatedAt = CURATED_PUBLIC_TWIN_BASE_TIME + (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000
  // Distinct "catalog age": earlier specs were added first (older), later specs
  // are newer. Keeps "Neu" a real recency order, separate from the curated
  // "Empfohlen" importance order.
  const createdAt = CURATED_PUBLIC_TWIN_BASE_TIME - (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000
  const imageUrl = spec.imageFile ? `/public/profile-images/${spec.imageFile}` : null
  return {
    id: `curated-${spec.slug}`,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    imageUrl,
    categories: spec.categories,
    languages: CURATED_PUBLIC_TWIN_LANGUAGES,
    visibility: 'public',
    style: spec.style,
    status: 'ready',
    url: `${origin}/t/${spec.slug}`,
    chatPath: `/twin-chat?twin=${encodeURIComponent(spec.slug)}`,
    uploadedContents: [
      { category: 'Profilbild', count: imageUrl ? 1 : 0 },
      { category: 'Wissensprofil', count: 1 },
    ],
    mediaCount: imageUrl ? 1 : 0,
    knowledgeCount: 1,
    contextSummary: `${spec.name}: ${spec.knowledge}`,
    guardrail: 'Historisches, kuratiertes KI-Profil. Es simuliert nicht die echte Person, sondern nutzt öffentliches Wissen, Denkstil und Quellenhinweise.',
    rightsPosture: spec.rightsPosture,
    mainCategory: spec.mainCategory,
    birthDate: spec.birthDate,
    deathDate: spec.deathDate,
    birthYear: spec.birthYear,
    deathYear: spec.deathYear,
    birthLabel: spec.birthLabel,
    deathLabel: spec.deathLabel,
    exampleQuestions: spec.exampleQuestions,
    searchIndex: spec.searchIndex,
    sources: spec.sources,
    quality: { ok: Boolean(imageUrl), issues: imageUrl ? [] : ['missing_profile_image'] },
    createdAt,
    updatedAt,
    seo: {
      title: `${spec.name} KI-Profil | smyst.com`,
      description: spec.description,
      canonical: `${origin}/t/${spec.slug}`,
      robots: 'index,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${spec.name} KI-Profil`,
        url: `${origin}/t/${spec.slug}`,
        description: spec.description,
        inLanguage: CURATED_PUBLIC_TWIN_LANGUAGES,
        isPartOf: { '@type': 'WebSite', name: 'smyst.com', url: origin },
      },
    },
  }
}

function curatedPublicProfiles(): PublicTwinProfile[] {
  return CURATED_PUBLIC_TWIN_SPECS.map(curatedPublicProfileToPublicTwinProfile)
}

function curatedPublicProfileBySlug(slug: string): PublicTwinProfile | null {
  const normalized = slug.trim().toLowerCase()
  const index = CURATED_PUBLIC_TWIN_SPECS.findIndex((spec) => spec.slug === normalized)
  return index >= 0 ? curatedPublicProfileToPublicTwinProfile(CURATED_PUBLIC_TWIN_SPECS[index], index) : null
}

function usageByTwinId(chats: TwinChatRecord[] | null | undefined): Map<string, ProfileUsage> {
  const usage = new Map<string, ProfileUsage>()
  for (const chat of chats ?? []) {
    const key = chat.twinId ?? chat.publicTwinSlug ?? ''
    if (!key) continue
    const current = usage.get(key) ?? { chatCount: 0, lastChatAt: 0 }
    usage.set(key, {
      chatCount: current.chatCount + 1,
      lastChatAt: Math.max(current.lastChatAt, chat.updatedAt ?? chat.createdAt ?? 0),
    })
  }
  return usage
}

type ChatMessage = {
  id: string
  role: 'ai' | 'user'
  content: string
  streaming?: boolean
  speakable?: boolean
}

function SmystStartPage({
  onNavigate,
  appTheme,
  onThemeChange,
  nameSortMode,
  onNameSortModeChange,
}: {
  onNavigate: (view: AppView) => void
  appTheme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  nameSortMode: NameSortMode
  onNameSortModeChange: (mode: NameSortMode) => void
}) {
  const { lang } = useLanguage({ reloadOnChange: false })
  const t = useStaticTranslations(lang)
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const memoryUpload = useMemoryUpload()
  const [query, setQuery] = useState('')
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [selectedTwin, setSelectedTwin] = useState<StartTwin | null>(null)
  const [realStartTwins, setRealStartTwins] = useState<StartTwin[]>([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const [profilesLoadError, setProfilesLoadError] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [chatProfileKey, setChatProfileKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [namePickerOpen, setNamePickerOpen] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(false)
  const [voiceState, setVoiceState] = useState<SpeechRecognitionState>('idle')
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [composerNotice, setComposerNotice] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const liveVoiceDraftRef = useRef('')
  const liveVoiceActiveRef = useRef(false)
  const liveVoiceSendTimerRef = useRef<number | null>(null)

  const latestAssistantText =
    [...messages].reverse().find((message) => message.role === 'ai' && message.speakable !== false && message.content.trim().length > 0)?.content ?? ''
  const pendingAttachmentCount = attachments.filter((attachment) => attachment.status === 'uploading').length

  const filteredTwins = useMemo(() => {
    const categoryFiltered = activeCategory
      ? realStartTwins.filter((twin) => twin.categories.some((category) => category === activeCategory))
      : realStartTwins
    return rankProfiles(categoryFiltered, query, nameSortMode) as StartTwin[]
  }, [activeCategory, nameSortMode, query, realStartTwins])

  const activeTwin = selectedTwin ?? realStartTwins[0] ?? null
  const genericMessageLabel =
    lang === DEFAULT_LANG
      ? 'Nachricht schreiben'
      : t.start.messagePlaceholder.replace(/\s*(an|to)?\s*\{\{name\}\}/i, '').trim()
  const messageInputLabel = selectedTwin
    ? t.start.messagePlaceholder.replace('{{name}}', selectedTwin.name)
    : genericMessageLabel || DEFAULT_TRANSLATIONS.start.messagePlaceholder.replace(/\s*an\s*\{\{name\}\}/i, '').trim()
  const liveVoiceLabel =
    voiceState === 'idle'
      ? t.start.liveVoiceStart
      : voiceState === 'listening'
        ? t.start.liveVoicePause
        : voiceState === 'paused'
          ? t.start.liveVoiceResume
          : t.start.liveVoiceStop
  const canSend = input.trim().length > 0 || attachments.some((attachment) => attachment.status === 'uploaded' || attachment.status === 'ready')
  const canSpeak = latestAssistantText.length > 0 && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const composerLine = selectedTwin ? 'border-white/[0.14]' : 'border-white/[0.08]'
  const showNamePicker = !selectedTwin && (namePickerOpen || query.trim().length > 0)
  const selectedSortOption = nameSortOptions.find((option) => option.mode === nameSortMode) ?? nameSortOptions[0]
  const visibleCategories = useMemo(() => categoryFacets(realStartTwins, 10), [realStartTwins])
  const recommendedTwins = useMemo(() => recommendedProfiles(realStartTwins, 8) as StartTwin[], [realStartTwins])
  const popularTwins = useMemo(() => popularProfiles(realStartTwins, 8) as StartTwin[], [realStartTwins])
  const freshTwins = useMemo(() => newProfiles(realStartTwins, 8) as StartTwin[], [realStartTwins])
  const recentTwins = useMemo(() => recentlyUsedProfiles(realStartTwins, 8) as StartTwin[], [realStartTwins])
  const relatedTwins = useMemo(() => similarProfiles(activeTwin, realStartTwins, 6) as StartTwin[], [activeTwin, realStartTwins])
  const glassPreviewMode = new URLSearchParams(window.location.search).get('glass')
  const glassPreviewClass =
    glassPreviewMode === 'dark'
      ? ' smyst-start-shell-glass-dark'
      : glassPreviewMode === 'light'
        ? ' smyst-start-shell-glass-light'
        : ''
  const shellTheme =
    glassPreviewMode === 'dark' ? 'dark' : glassPreviewMode === 'light' ? 'light' : appTheme
  const shellThemeClass =
    shellTheme === 'light' ? ' smyst-start-shell-theme-light' : ' smyst-start-shell-theme-dark'

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
    let alive = true

    const loadRealProfiles = async () => {
      if (auth.status === 'loading') return
      setProfilesLoaded(false)
      setProfilesLoadError('')
      try {
        if (auth.status !== 'authenticated') {
          const publicProfiles = await twinMvp.listPublicTwins()
          if (!alive) return
          const next = (publicProfiles?.length ? publicProfiles : curatedPublicProfiles())
            .filter(isCompletePublicProfile)
            .map((profile, index) => publicProfileToStartTwin(profile, index))
          setRealStartTwins(next)
          setSelectedTwin(null)
          setProfilesLoaded(true)
          return
        }

        const [twins, publicProfiles, chats] = await Promise.all([
          twinMvp.listTwins(),
          twinMvp.listPublicTwins(),
          twinMvp.listTwinChats(),
        ])
        if (!alive) return
        const usage = usageByTwinId(chats)
        const ownProfiles = (twins ?? [])
          .filter(isCompleteTwinRecord)
          .map((twin, index) => realTwinToStartTwin(twin, index, usage.get(twin.id) ?? usage.get(twin.slug)))
        const ownPublicSlugs = new Set(ownProfiles.map((profile) => profile.profileSlug).filter(Boolean))
        const publicStartProfiles = (publicProfiles?.length ? publicProfiles : curatedPublicProfiles())
          .filter((profile) => isCompletePublicProfile(profile) && !ownPublicSlugs.has(profile.slug))
          .map((profile, index) => publicProfileToStartTwin(profile, ownProfiles.length + index, usage.get(profile.slug)))
        const next = [...ownProfiles, ...publicStartProfiles]
        setRealStartTwins(next)
        setSelectedTwin((current) => (current && next.some((twin) => twin.id === current.id) ? current : next[0] ?? null))
        setProfilesLoaded(true)
      } catch (err) {
        if (!alive) return
        const message = err instanceof Error ? err.message : 'Profile konnten nicht geladen werden.'
        setProfilesLoadError(message)
        setRealStartTwins([])
        setSelectedTwin(null)
        setProfilesLoaded(true)
      }
    }

    void loadRealProfiles()

    return () => {
      alive = false
    }
  }, [auth.status])

  useEffect(() => {
    if (messages.length === 0) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!realStartTwins.length) return
    const timeout = window.setTimeout(() => {
      for (const twin of realStartTwins.slice(0, 8)) {
        if (!twin.imageUrl) continue
        const image = new Image()
        image.decoding = 'async'
        image.src = twin.imageUrl
      }
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [realStartTwins])

  useEffect(() => {
    if (menuRef.current) menuRef.current.inert = !menuOpen
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  useEffect(() => {
    return () => {
      clearLiveVoiceTimer()
      liveVoiceDraftRef.current = ''
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      recognitionRef.current?.abort()
    }
  }, [])

  const fitInputHeight = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '0px'
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const headerHeight = document.querySelector('main.fixed > header')?.getBoundingClientRect().height ?? 0
    const iconBarHeight = textarea.parentElement?.nextElementSibling?.getBoundingClientRect().height ?? 44
    const textWrapStyle = window.getComputedStyle(textarea.parentElement ?? textarea)
    const textWrapPadding =
      Number.parseFloat(textWrapStyle.paddingTop || '0') + Number.parseFloat(textWrapStyle.paddingBottom || '0')
    const topGap = selectedTwin ? 2 : Math.max(viewportHeight * 0.08, 72)
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

  const resetActiveChat = () => {
    clearLiveVoiceTimer()
    liveVoiceDraftRef.current = ''
    setChatId(null)
    setChatProfileKey(null)
    setMessages([])
    resizeInput('')
    setAttachments([])
    setComposerMenuOpen(false)
    setComposerNotice('')
  }

  const selectTwin = (twin: StartTwin) => {
    if (selectedTwin?.id !== twin.id) resetActiveChat()
    setSelectedTwin(twin)
    setQuery('')
    setActiveCategory(null)
    setNamePickerOpen(false)
    window.requestAnimationFrame(() => {
      fitInputHeight()
      textareaRef.current?.focus()
    })
  }

  const removeProfileWithBrokenImage = (imageUrl: string) => {
    setRealStartTwins((current) => current.map((twin) => (twin.imageUrl === imageUrl ? { ...twin, imageUrl: '' } : twin)))
    setSelectedTwin((current) => (current?.imageUrl === imageUrl ? { ...current, imageUrl: '' } : current))
  }

  const renderProfileAvatar = (twin: StartTwin, className = 'h-12 w-12') => (
    <span
      className={`${className} relative grid shrink-0 place-items-center overflow-hidden border border-white/18 bg-white/[0.08] text-sm font-bold text-white shadow-none`}
      style={{ boxShadow: `inset 0 0 0 1px ${twin.accent}33` }}
    >
      <span>{twin.initials}</span>
      {twin.imageUrl ? (
        <img
          src={twin.imageUrl}
          alt={twin.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => removeProfileWithBrokenImage(twin.imageUrl as string)}
        />
      ) : null}
    </span>
  )

  const renderProfileCard = (twin: StartTwin, compact = false) => (
    <button
      key={twin.id}
      type="button"
      onClick={() => selectTwin(twin)}
      className={`group flex min-w-0 overflow-hidden text-left transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 ${
        compact
          ? 'w-[292px] shrink-0 rounded-md border border-white/[0.08] bg-white/[0.045]'
          : 'w-full items-stretch border-b border-white/[0.08]'
      }`}
    >
      <span className={compact ? 'grid h-[92px] w-[92px] shrink-0 place-items-center bg-white/[0.045]' : 'grid h-[104px] w-[104px] shrink-0 place-items-center bg-white/[0.045] sm:h-[118px] sm:w-[118px]'}>
        {renderProfileAvatar(twin, compact ? 'h-full w-full' : 'h-full w-full')}
      </span>
      <span className={`${compact ? 'flex min-w-0 flex-1 flex-col justify-center px-3 py-2' : 'flex min-w-0 flex-1 flex-col justify-center px-4 py-3 sm:px-6'}`}>
        <span className="min-w-0">
          <span className={`${compact ? 'text-[15px]' : 'text-lg sm:text-2xl'} block truncate font-bold leading-tight text-[#edf4ff]`}>
            {twin.name}
          </span>
          <span className={`${compact ? 'text-[13px]' : 'text-sm sm:text-base'} mt-1 block truncate font-semibold leading-tight text-[#aab4c4]`}>
            {profileMainCategory(twin)}
          </span>
          <span className={`${compact ? 'text-[12px]' : 'text-sm'} mt-1 block truncate font-medium leading-tight text-[#8e97a8]`}>
            {profileLifeLine(twin)}
          </span>
        </span>
      </span>
    </button>
  )

  const renderDiscoveryRail = (title: string, twins: StartTwin[]) => {
    if (!twins.length) return null
    return (
      <div className="border-b border-white/[0.08] px-3 py-3 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#8e97a8]">{title}</h2>
          <span className="text-[11px] font-semibold text-[#6f7a8c]">{twins.length}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {twins.map((twin) => renderProfileCard(twin, true))}
        </div>
      </div>
    )
  }

  const renderProfileLoadingState = () => (
    <div className="smyst-glass-panel min-h-[260px] border-b border-white/[0.08] px-4 py-5 sm:min-h-[320px] sm:px-6">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8e97a8]">Profilentdeckung</p>
        <p className="mt-1 text-sm font-semibold text-[#d5dbe5]">
          Echte KI-Profile werden geladen...
        </p>
      </div>
      <div className="grid gap-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex min-h-[92px] animate-pulse overflow-hidden border border-white/[0.08] bg-white/[0.035]">
            <div className="h-[92px] w-[92px] shrink-0 bg-white/[0.06]" />
            <div className="flex flex-1 flex-col justify-center gap-2 px-4">
              <div className="h-4 w-3/5 rounded-sm bg-white/[0.08]" />
              <div className="h-3 w-2/5 rounded-sm bg-white/[0.06]" />
              <div className="h-3 w-1/2 rounded-sm bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

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

  const updateAttachment = (id: string, patch: Partial<ChatAttachment>) => {
    setAttachments((current) => current.map((attachment) => (attachment.id === id ? { ...attachment, ...patch } : attachment)))
  }

  const addNotice = (notice: string) => {
    setComposerNotice(notice)
    window.setTimeout(() => setComposerNotice((current) => (current === notice ? '' : current)), 4200)
  }

  const handleFilesSelected = async (files: FileList | null) => {
    const selected = Array.from(files ?? [])
    if (!selected.length) return
    setComposerMenuOpen(false)
    if (auth.status !== 'authenticated') {
      addNotice('Bitte anmelden, um Dateien sicher hochzuladen und im Chat zu speichern.')
      return
    }

    for (const file of selected.slice(0, 6)) {
      const id = crypto.randomUUID()
      const draft: ChatAttachment = {
        id,
        kind: attachmentKindForFile(file),
        name: file.name,
        status: 'uploading',
        contentType: file.type || undefined,
        size: file.size,
      }
      setAttachments((current) => [...current, draft])
      const uploaded = await memoryUpload.upload(file, mediaCategoryForFile(file))
      if (!uploaded) {
        updateAttachment(id, { status: 'failed' })
        addNotice(memoryUpload.error || 'Upload fehlgeschlagen. Bitte Datei prüfen und erneut versuchen.')
        continue
      }
      updateAttachment(id, {
        status: 'uploaded',
        uploadId: uploaded.uploadId,
        key: uploaded.key,
        url: uploaded.getUrl,
        contentType: uploaded.contentType,
        size: uploaded.size,
      })
    }
  }

  const handlePickContacts = async () => {
    setComposerMenuOpen(false)
    const contactsApi = (navigator as BrowserNavigatorWithContacts).contacts
    if (!contactsApi?.select) {
      fileInputRef.current?.click()
      addNotice('Kontakt-Auswahl wird hier nicht direkt unterstützt. Du kannst eine .vcf-Datei anhängen.')
      return
    }
    try {
      const contacts = await contactsApi.select(['name', 'email', 'tel'], { multiple: true })
      const text = contactsToText(contacts)
      if (!text) return
      setAttachments((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: 'contact', name: 'Kontakt', status: 'ready' },
      ])
      resizeInput([input, `Kontakt:\n${text}`].filter(Boolean).join('\n\n'))
    } catch {
      addNotice('Kontakt-Auswahl wurde abgebrochen oder nicht erlaubt.')
    }
  }

  const handleAttachLink = () => {
    setComposerMenuOpen(false)
    const rawLink = window.prompt('Link einfügen')
    if (!rawLink?.trim()) return
    try {
      const url = new URL(rawLink.trim())
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
      setAttachments((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: 'link',
          name: url.hostname.replace(/^www\./, '') || 'Link',
          status: 'ready',
          url: url.href,
        },
      ])
      addNotice('Link wurde angehängt.')
    } catch {
      addNotice('Bitte einen gültigen http- oder https-Link einfügen.')
    }
  }

  const handleAttachLocation = () => {
    setComposerMenuOpen(false)
    if (!('geolocation' in navigator)) {
      addNotice('Standort wird von diesem Browser nicht unterstützt.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const url = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`
        setAttachments((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: 'location',
            name: 'Standort',
            status: 'ready',
            url,
          },
        ])
        addNotice('Standort wurde angehängt.')
      },
      () => addNotice('Standort konnte nicht gelesen werden. Bitte Berechtigung prüfen.'),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
  }

  const clearLiveVoiceTimer = () => {
    if (liveVoiceSendTimerRef.current === null) return
    window.clearTimeout(liveVoiceSendTimerRef.current)
    liveVoiceSendTimerRef.current = null
  }

  const startDictation = (options: { live?: boolean } = {}) => {
    const Recognition = speechRecognitionConstructor()
    if (!Recognition) {
      if (options.live) setSpeechOutputEnabled(false)
      addNotice('Spracheingabe wird von diesem Browser nicht unterstützt. Du kannst deine Nachricht normal eintippen.')
      return
    }
    recognitionRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = speechLangFor(lang)
    recognition.interimResults = true
    recognition.continuous = Boolean(options.live)
    recognition.onstart = () => setVoiceState('listening')
    recognition.onerror = (event) => {
      const error = event.error ?? ''
      if (options.live && (error === 'no-speech' || error === 'aborted')) return
      setVoiceState('idle')
      if (options.live) {
        liveVoiceActiveRef.current = false
        setSpeechOutputEnabled(false)
      }
      addNotice(
        error === 'not-allowed' || error === 'service-not-allowed'
          ? 'Mikrofon ist nicht erlaubt. Bitte Browser-Berechtigung prüfen oder Nachricht eintippen.'
          : 'Spracheingabe konnte nicht gestartet werden. Du kannst deine Nachricht normal eintippen.',
      )
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setVoiceState((current) => {
        if (current === 'paused' || current === 'replying') return current
        if (current === 'listening' && options.live && liveVoiceActiveRef.current) {
          window.setTimeout(() => {
            if (liveVoiceActiveRef.current && !recognitionRef.current && !window.speechSynthesis.speaking && !isRemoteSpeechActive()) {
              startDictation({ live: true })
            }
          }, 300)
          return 'listening'
        }
        return 'idle'
      })
	}
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript?.trim()
        if (!transcript) continue
        if (result.isFinal) finalText += `${transcript} `
        else interimText += `${transcript} `
      }
      const nextText = (finalText || interimText).trim()
      if (!nextText) return
      if (options.live) {
        const finalChunk = finalText.trim()
        if (finalChunk) {
          liveVoiceDraftRef.current = [liveVoiceDraftRef.current.trim(), finalChunk].filter(Boolean).join(' ')
        }
        if (finalChunk) {
          clearLiveVoiceTimer()
          liveVoiceSendTimerRef.current = window.setTimeout(() => {
            const message = liveVoiceDraftRef.current.trim()
            if (!message) return
            liveVoiceDraftRef.current = ''
            recognition.stop()
            setVoiceState('replying')
            void handleSend(message, [], { forceSpeech: true }).finally(() => {
              const resumeListening = () => {
                if (!liveVoiceActiveRef.current) {
                  setVoiceState('idle')
                  return
                }
                if (window.speechSynthesis.speaking || window.speechSynthesis.pending || isRemoteSpeechActive()) {
                  window.setTimeout(resumeListening, 350)
                  return
                }
                startDictation({ live: true })
              }
              window.setTimeout(resumeListening, 500)
            })
          }, 1600)
        }
        return
      }
      resizeInput(nextText)
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setVoiceState('idle')
      if (options.live) setSpeechOutputEnabled(false)
      addNotice('Spracheingabe konnte nicht gestartet werden. Du kannst deine Nachricht normal eintippen.')
    }
  }

  const handleToggleLiveVoice = () => {
    unlockAudioPlayback()
    if (voiceState === 'listening') {
      liveVoiceActiveRef.current = false
      clearLiveVoiceTimer()
      recognitionRef.current?.stop()
      setVoiceState('paused')
      addNotice('Live-Sprachmodus pausiert.')
      return
    }
    if (voiceState === 'paused' || voiceState === 'idle') {
      liveVoiceActiveRef.current = true
      setSpeechOutputEnabled(true)
      if (voiceState === 'idle') {
        liveVoiceDraftRef.current = ''
        const twinName = (selectedTwin ?? activeTwin)?.name?.trim()
        const greeting =
          lang === 'de'
            ? twinName
              ? 'Hallo! Hier ist ' + twinName + '. Schön, dass du da bist. Was kann ich für dich tun?'
              : 'Hallo! Schön, dass du da bist. Was kann ich für dich tun?'
            : twinName
              ? 'Hello! This is ' + twinName + '. Nice to meet you. What can I do for you?'
              : 'Hello! Nice to meet you. What can I do for you?'
        setVoiceState('replying')
        const started = speakText(greeting, lang, () => {
          setIsSpeaking(false)
          if (liveVoiceActiveRef.current) startDictation({ live: true })
          else setVoiceState('idle')
        }, twinName)
        if (started) {
          setIsSpeaking(true)
        } else {
          startDictation({ live: true })
        }
        return
      }
      startDictation({ live: true })
      return
    }
    liveVoiceActiveRef.current = false
    clearLiveVoiceTimer()
    liveVoiceDraftRef.current = ''
    recognitionRef.current?.abort()
    window.speechSynthesis.cancel()
    setVoiceState('idle')
    setIsSpeaking(false)
    setSpeechOutputEnabled(false)
  }

  const handleSend = async (
    overrideText?: string,
    overrideAttachments?: ChatAttachment[],
    options: { forceSpeech?: boolean } = {},
  ): Promise<string | null> => {
    const text = (overrideText ?? input).trim()
    const sendAttachments = overrideAttachments ?? attachments
    const fullMessage = composeMessageWithAttachments(text, sendAttachments)
    if (!fullMessage) return null
    if (sendAttachments.some((attachment) => attachment.status === 'uploading')) {
      addNotice('Bitte warten, bis alle Anhänge hochgeladen sind.')
      return null
    }

    const twin = selectedTwin ?? filteredTwins[0] ?? activeTwin
    if (!twin) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: fullMessage },
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content:
            auth.status === 'authenticated'
              ? 'Erstelle zuerst ein echtes Profil. Danach kannst du diese Person direkt anschreiben.'
              : 'Melde dich an und erstelle ein echtes Profil. Danach kannst du direkt mit diesem Profil chatten.',
        },
      ])
      resizeInput('')
      setAttachments([])
      return null
    }
    if (!selectedTwin) selectTwin(twin)

    if (auth.status !== 'authenticated' && !twin.publicProfile) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: fullMessage },
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content: 'Melde dich an, um den Chat mit diesem echten KI-Profil zu starten und den Verlauf zu speichern.',
        },
      ])
      resizeInput('')
      setAttachments([])
      return null
    }

    const assistantId = crypto.randomUUID()
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: fullMessage },
      { id: assistantId, role: 'ai', content: '', streaming: true },
    ])
    resizeInput('')
    setAttachments([])

    try {
      const twinChatKey = twin.publicProfile && twin.profileSlug ? twin.profileSlug : twin.id
      let nextChatId = chatProfileKey === twinChatKey ? chatId : null
      if (!nextChatId) {
        const chat = await twinMvp.startTwinChat(twinChatKey)
        if (!chat) throw new Error('Chat konnte nicht gestartet werden.')
        nextChatId = chat.id
        setChatId(nextChatId)
        setChatProfileKey(twinChatKey)
      }
      const reply = await twinMvp.sendTwinMessage(nextChatId, fullMessage)
      if (!reply?.message?.content) throw new Error('Keine Antwort vom Profil erhalten.')
      await streamText(assistantId, reply.message.content)
      if ((speechOutputEnabled || options.forceSpeech) && speakText(reply.message.content, lang, () => setIsSpeaking(false), twin.name)) {
        setIsSpeaking(true)
      }
      return reply.message.content
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Der Chat ist gerade nicht erreichbar.'
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `${message} Bitte versuche es gleich noch einmal.`,
                streaming: false,
              }
            : item,
        ),
      )
      return null
    }
  }

  const handleSpeakInput = () => {
    unlockAudioPlayback()
    if (speechOutputEnabled || isSpeaking) {
      window.speechSynthesis.cancel()
      stopRemoteSpeech()
      setIsSpeaking(false)
      setSpeechOutputEnabled(false)
      return
    }
    if (!latestAssistantText) {
      addNotice('Noch keine Antwort zum Vorlesen vorhanden. Sende zuerst eine Nachricht.')
      return
    }
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      addNotice('Vorlesen wird von diesem Browser nicht unterstützt.')
      return
    }
    setSpeechOutputEnabled(true)
    const started = speakText(latestAssistantText, lang, () => setIsSpeaking(false), (selectedTwin ?? activeTwin)?.name)
    if (started) setIsSpeaking(true)
  }

  const handleSendButtonClick = () => {
    if (!canSend) {
      addNotice('Schreibe zuerst eine Nachricht oder füge eine Datei hinzu.')
      textareaRef.current?.focus()
      return
    }
    void handleSend()
  }

  const menuItems: Array<{ label: string; view: AppView; detail: string }> = [
    { label: 'Mein Profil', view: 'account-profile', detail: 'Identität, Bio, Rollen und Profilqualität' },
    { label: 'Twin erstellen', view: 'twin-builder', detail: 'Persönlichkeit, Wissen und Sichtbarkeit' },
    { label: 'Meine Twins', view: 'my-twins', detail: 'Private und öffentliche AI Twins' },
    { label: 'Memories', view: 'memory-upload', detail: 'Dateien, Wissen und Erinnerungen hochladen' },
    { label: 'Chats', view: 'twin-chat', detail: 'Letzte Gespräche und Twin-Auswahl' },
    { label: 'Admin', view: 'admin', detail: 'User, Werbung, Umsatz, Sicherheit und Betrieb' },
    { label: 'Datenschutz', view: 'trust', detail: 'Private Defaults, noindex, Export und Löschung' },
    { label: 'Einstellungen', view: 'settings', detail: 'Sprache, Theme, Account und Logout' },
  ]

  const goFromMenu = (view: AppView) => {
    setMenuOpen(false)
    onNavigate(view)
  }

  const loginOptions = [
	  { provider: 'ID', title: 'Normaler Login', detail: 'E-Mail und Passwort', status: 'Aktiv', onClick: () => setShowEmailForm((value) => !value) },
    {
      provider: 'GO',
      title: 'Mit Google fortfahren',
      detail: 'Schneller Login mit Google',
      status: 'Aktiv',
      onClick: () => auth.signInWithGoogle('/'),
    },
  ]

  const profileQuickActions = [
    { label: 'Profil öffnen', view: 'account-profile' as const },
    { label: 'Twin erstellen', view: 'twin-builder' as const },
    { label: 'Daten hochladen', view: 'memory-upload' as const },
  ]

  const profileControlCards = [
    ['Identität', 'Name, Rollen, Expertise und Bio sauber pflegen.'],
    ['AI Twin', 'Persönlichkeit, Wissen und Sichtbarkeit steuern.'],
    ['Memories', 'Uploads, Quellen und Erinnerungen als Kontext verwalten.'],
    ['Datenschutz', 'Export, Löschung, noindex und private Defaults.'],
  ]

  return (
    <main id="main" className={`smyst-start-shell${shellThemeClass}${glassPreviewClass} fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden text-[#f4f7fb]`}>
      <div
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        ref={menuRef}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? 'true' : undefined}
        aria-label="Startmenü"
        aria-hidden={!menuOpen}
        style={{ left: menuOpen ? 0 : '-100%', transform: 'none' }}
        className={`smyst-glass-panel fixed inset-y-0 z-50 flex w-[90vw] max-w-[390px] flex-col border-r border-white/10 shadow-2xl ${
          menuOpen ? 'visible' : 'pointer-events-none invisible'
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
              className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {auth.status === 'authenticated' ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#242b37] text-sm font-bold text-white">
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
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ['72', 'Profil'],
                  [String(messages.length), 'Chats'],
                  [String(attachments.length), 'Uploads'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                    <p className="text-lg font-bold leading-none text-white">{value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#8e97a8]">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {profileQuickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => goFromMenu(action.view)}
                    className="flex min-h-[42px] items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 text-left text-sm font-bold text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <span>{action.label}</span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#8e97a8]" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="mb-3">
                <p className="text-sm font-bold text-white">Anmelden oder registrieren</p>
                <p className="mt-1 text-xs leading-relaxed text-[#9aa3b2]">
                  Dein Profil, Twins, Memories und Chats bleiben an einem sicheren Account.
                </p>
              </div>
              <div className="grid gap-2">
                {loginOptions.map((option) => {
                  const disabled = !option.onClick
                  return (
                    <button
                      key={option.title}
                      type="button"
                      onClick={option.onClick}
                      disabled={disabled}
                      className={`flex min-h-[50px] w-full items-center gap-3 rounded-lg border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        disabled
                          ? 'cursor-not-allowed border-white/10 bg-white/[0.025] text-[#7f8998]'
                          : 'border-white/20 bg-white text-[#111722] hover:bg-[#eef6ff]'
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${
                          disabled ? 'bg-white/[0.06] text-[#9aa3b2]' : 'bg-[#111722] text-white'
                        }`}
                      >
                        {option.provider}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{option.title}</span>
                        <span className={`block truncate text-xs ${disabled ? 'text-[#8e97a8]' : 'text-[#4f5866]'}`}>
                          {option.detail}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                          disabled ? 'bg-white/[0.06] text-[#9aa3b2]' : 'bg-[#59C7FF]/18 text-[#0b2635]'
                        }`}
                      >
                        {option.status}
                      </span>
                    </button>
                  )
                })}
              </div>
              {showEmailForm && (
                <div className="mt-3">
                  <Suspense fallback={null}>
                    <EmailAuthForm onClose={() => setShowEmailForm(false)} />
                  </Suspense>
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['HttpOnly', 'Noindex', 'Export'].map((label) => (
                  <span key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-center text-[11px] font-bold text-[#d5dbe5]">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Startmenü Navigation">
          <div className="mb-4 grid gap-2 px-2">
            <p className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">Profilbereich</p>
            {profileControlCards.map(([title, text]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <p className="text-xs font-bold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8e97a8]">{text}</p>
              </div>
            ))}
          </div>

          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => goFromMenu(item.view)}
                  className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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

          <div className="mt-5 grid gap-2 border-t border-white/10 px-2 pt-5">
            {[
              ['HttpOnly Session', 'Login bleibt serverseitig geschützt.'],
              ['Private Inhalte noindex', 'Private Profile werden nicht indexiert.'],
              ['Export & Löschung', 'Datenkontrolle bleibt im Profilbereich.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <p className="text-xs font-bold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8e97a8]">{text}</p>
              </div>
            ))}
          </div>

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

          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="px-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">KI-Profile</p>
            <div className="mt-3 space-y-2 px-2">
              {nameSortOptions.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => onNameSortModeChange(option.mode)}
                  className={`min-h-[54px] w-full border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                    nameSortMode === option.mode
                      ? 'border-white/35 bg-[#f4f7fb] text-[#111722]'
                      : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className={`block text-xs ${nameSortMode === option.mode ? 'text-[#4f5866]' : 'text-[#9aa3b2]'}`}>
                    {option.detail}
                  </span>
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
              className="flex min-h-[48px] w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Logout
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goFromMenu('twin-builder')}
              className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-[#111722] hover:opacity-90"
            >
              Twin vorbereiten
            </button>
          )}
        </div>
      </aside>

      {selectedTwin ? (
        <header className="smyst-glass-panel z-20 shrink-0 border-b border-white/[0.08] pt-[env(safe-area-inset-top)]">
          <div className="relative flex min-h-[66px] items-center justify-center px-1 sm:min-h-[74px]">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={menuOpen}
              className="absolute left-0 top-0 grid h-11 w-11 shrink-0 place-items-center text-white transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              <MenuGlyph className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedTwin(null)
                resetActiveChat()
                setNamePickerOpen(true)
                setQuery('')
                setActiveCategory(null)
              }}
              aria-label="Profil wechseln"
              className="absolute right-0 top-0 grid h-11 w-11 shrink-0 place-items-center text-white transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            >
              <User className="h-6 w-6" />
            </button>

            <div className="smyst-glass-control flex h-14 max-w-[min(360px,calc(100vw-104px))] items-stretch border border-white/[0.08] text-left sm:h-16 sm:max-w-[520px]">
              <span className="grid aspect-square h-full shrink-0 place-items-center overflow-hidden border-r border-white/[0.08] bg-white/[0.045] text-xs font-bold text-white/[0.86]">
                {selectedTwin.imageUrl ? (
                  <img
                    src={selectedTwin.imageUrl}
                    alt={selectedTwin.name}
                    className="h-full w-full object-cover"
                    decoding="async"
                    onError={() => removeProfileWithBrokenImage(selectedTwin.imageUrl as string)}
                  />
                ) : (
                  selectedTwin.initials
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center px-2">
                <span className="truncate text-sm font-bold leading-tight text-white sm:text-base">{selectedTwin.name}</span>
                <span className="truncate text-[11px] font-semibold leading-tight text-[#aab4c4] sm:text-xs">{profileMainCategory(selectedTwin)}</span>
                <span className="truncate text-[10px] font-medium leading-tight text-[#8e97a8] sm:text-[11px]">{profileLifeLine(selectedTwin)}</span>
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="smyst-glass-panel z-20 shrink-0 border-b border-white/10 pt-[max(env(safe-area-inset-top),18px)]">
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

            <h1>
              <SmystLockup />
            </h1>
          </div>

          <div className="smyst-glass-panel flex min-h-[70px] items-stretch border-y border-white/[0.08] sm:min-h-[82px]">
            <label className="relative flex min-w-0 flex-1 items-stretch">
              <Search
                className={`pointer-events-none absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#8e97a8] transition-opacity sm:right-7 sm:h-8 sm:w-8 ${
                  query ? 'opacity-0' : 'opacity-100'
                }`}
                aria-hidden="true"
              />
              <span className="sr-only">{t.start.searchLabel}</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  if (selectedTwin) resetActiveChat()
                  setSelectedTwin(null)
                  setNamePickerOpen(true)
                }}
                onFocus={() => setNamePickerOpen(true)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  const twin = filteredTwins[0]
                  if (!twin) return
                  event.preventDefault()
                  selectTwin(twin)
                }}
                placeholder="Profil suchen"
                className="smyst-glass-control min-w-0 flex-1 rounded-none border-0 px-5 pr-12 text-[20px] font-bold text-white outline-none placeholder:text-[#8e97a8] focus:bg-[#141a25] sm:px-7 sm:pr-16 sm:text-4xl"
              />
            </label>
            <button
              type="button"
              onClick={() => setNamePickerOpen((open) => !open)}
              className="smyst-glass-control inline-flex w-[150px] shrink-0 items-center justify-center gap-2 border-l border-white/[0.08] px-2 text-[15px] font-bold text-white transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 sm:w-[180px] sm:gap-3 sm:text-lg"
              aria-label={t.start.chooseTwin}
              aria-expanded={namePickerOpen}
            >
              <User className="h-7 w-7 shrink-0 text-white sm:h-9 sm:w-9" />
              <span className="whitespace-nowrap">Profil wählen</span>
            </button>
          </div>
          {visibleCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-white/[0.08] px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory(null)
                  if (selectedTwin) resetActiveChat()
                  setSelectedTwin(null)
                  setNamePickerOpen(true)
                }}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  activeCategory === null
                    ? 'border-white/35 bg-white text-[#111722]'
                    : 'border-white/12 bg-white/[0.06] text-[#c7d1de]'
                }`}
              >
                Alle
              </button>
              {visibleCategories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.name)
                    if (selectedTwin) resetActiveChat()
                    setNamePickerOpen(true)
                    setSelectedTwin(null)
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition ${
                    activeCategory === category.name
                      ? 'border-white/35 bg-white text-[#111722]'
                      : 'border-white/12 bg-white/[0.06] text-[#c7d1de]'
                  }`}
                >
                  {category.name}
                  <span className="ml-1 opacity-65">{category.count}</span>
                </button>
              ))}
            </div>
          )}
        </header>
      )}

      <section ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="min-h-full">
          {!selectedTwin && !showNamePicker && !profilesLoaded && renderProfileLoadingState()}
          {!selectedTwin && !showNamePicker && realStartTwins.length > 0 && (
            <div className="smyst-glass-panel min-h-[260px] border-b border-white/[0.08] sm:min-h-[320px]">
              <div className="border-b border-white/[0.08] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8e97a8]">Profilentdeckung</p>
                <p className="mt-1 text-sm font-semibold text-[#d5dbe5]">
                  {realStartTwins.length} echte KI-Profile bereit. Wähle ein Profil und schreibe direkt los.
                </p>
              </div>
              {renderDiscoveryRail('Empfohlen', recommendedTwins)}
              {renderDiscoveryRail('Beliebt', popularTwins)}
              {renderDiscoveryRail('Neu', freshTwins)}
              {renderDiscoveryRail('Kürzlich genutzt', recentTwins)}
            </div>
          )}
          {!selectedTwin && !showNamePicker && profilesLoaded && profilesLoadError && (
            <div className="grid min-h-[260px] place-items-center px-5 py-10 text-center sm:min-h-[320px]">
              <div className="max-w-[30rem]">
                <p className="text-base font-bold text-[#d5dbe5]">Profile konnten gerade nicht geladen werden</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#8e97a8]">
                  Bitte Verbindung prüfen oder gleich eine Nachricht schreiben. Die App bleibt bedienbar.
                </p>
              </div>
            </div>
          )}
          {!selectedTwin && !showNamePicker && profilesLoaded && realStartTwins.length === 0 && !profilesLoadError && (
            <div className="grid min-h-[260px] place-items-center px-5 py-10 text-center sm:min-h-[320px]">
              <div className="max-w-[28rem]">
                <p className="text-base font-bold text-[#d5dbe5]">Noch keine echten KI-Profile sichtbar</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#8e97a8]">
                  Sobald echte freigegebene Profile vorhanden sind, erscheinen sie hier mit Suche, Kategorien und direktem Chat.
                </p>
              </div>
            </div>
          )}
          {showNamePicker && (
            <div className="smyst-glass-panel border-b border-white/[0.08]">
              <div className="flex min-h-[42px] items-center justify-between border-b border-white/[0.08] px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#8e97a8]">
                <span>{activeCategory ? `${selectedSortOption.label} · ${activeCategory}` : selectedSortOption.label}</span>
                <span>{filteredTwins.length} {filteredTwins.length === 1 ? 'Profil' : 'Profile'}</span>
              </div>
              <div>
                {filteredTwins.map((twin) => renderProfileCard(twin))}
                {filteredTwins.length === 0 && (
                  <div className="px-5 py-8 text-sm font-semibold text-[#8e97a8]">
                    {profilesLoaded
                      ? auth.status === 'authenticated'
                        ? query.trim() || activeCategory
                          ? 'Keine passenden echten Profile gefunden. Suche nach Name, Thema oder Kategorie.'
                          : 'Noch kein echtes Profil vorhanden. Erstelle zuerst einen Twin.'
                        : 'Melde dich an, um echte Profile zu laden.'
                      : 'Echte Profile werden geladen...'}
                  </div>
                )}
              </div>
            </div>
          )}
          {selectedTwin && messages.length === 0 && relatedTwins.length > 0 && (
            <div className="smyst-glass-panel border-b border-white/[0.08]">
              {renderDiscoveryRail('Ähnliche Profile', relatedTwins)}
            </div>
          )}
          {messages.length > 0 && (
            <div className="relative z-10 flex flex-col gap-1 px-[3px] py-1 sm:px-2 sm:py-2">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[calc(100%-8px)] rounded-[10px] border px-3 py-2 text-[15px] leading-snug shadow-none sm:max-w-[94%] sm:text-base ${
                      message.role === 'user'
                        ? 'smyst-chat-bubble-user rounded-br-[3px] border-white/[0.14] bg-white/[0.92] text-[#111722]'
                        : 'smyst-chat-bubble-assistant rounded-bl-[3px] border-white/[0.08] bg-white/[0.07] text-[#f4f7fb] backdrop-blur-xl'
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

      <footer className={`smyst-glass-panel-strong shrink-0 border-t ${composerLine}`}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.vcf,text/vcard"
          onChange={(event) => {
            void handleFilesSelected(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            void handleFilesSelected(event.target.files)
            event.target.value = ''
          }}
        />
        <div className={`border-b ${composerLine} px-2 py-1 sm:px-3`}>
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
            placeholder={messageInputLabel}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="block min-h-[34px] w-full resize-none overflow-y-auto bg-transparent text-xl font-light leading-tight text-white outline-none placeholder:text-[#aeb6c4]/[0.66] sm:text-2xl"
            aria-label={messageInputLabel}
          />
        </div>
        {(composerMenuOpen || attachments.length > 0 || composerNotice || memoryUpload.uploading) && (
          <div className={`border-b ${composerLine} px-2 py-1 text-xs font-semibold text-[#d5dbe5] sm:px-3`}>
            {composerMenuOpen && (
              <div className="mb-1 flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none]">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Foto oder Video hinzufügen" title="Foto oder Video hinzufügen">
                  <ImageIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Kamera öffnen" title="Kamera öffnen">
                  <CameraIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Dateien" title="Dateien">
                  <FileIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Audio hinzufügen" title="Audio hinzufügen">
                  <Mic className="h-4 w-4" />
                </button>
                <button type="button" onClick={handleAttachLink} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Link" title="Link">
                  <LinkIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { setComposerMenuOpen(false); onNavigate('memory-upload') }} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Memory" title="Memory">
                  <BookSpark className="h-4 w-4" />
                </button>
                <button type="button" onClick={handlePickContacts} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Kontakte" title="Kontakte">
                  <User className="h-4 w-4" />
                </button>
                <button type="button" onClick={handleAttachLocation} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.14] bg-white/[0.08] transition-colors hover:bg-white/[0.14]" aria-label="Standort" title="Standort">
                  <MapPinIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none]">
                {attachments.map((attachment) => (
                  <span key={attachment.id} className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.07] px-2 py-1">
                    {attachment.name} · {attachment.status}
                  </span>
                ))}
              </div>
            )}
            {(composerNotice || pendingAttachmentCount > 0 || memoryUpload.uploading) && (
              <p className="mt-1 text-[#aeb6c4]">
                {pendingAttachmentCount > 0 || memoryUpload.uploading
                  ? `Upload läuft${memoryUpload.progress ? ` · ${memoryUpload.progress.percentage}%` : ''}`
                  : composerNotice}
              </p>
            )}
          </div>
        )}
        {(voiceState !== 'idle' || isSpeaking) && (
          <div className="px-2 py-1 sm:px-3">
            <VoiceWaveStatus state={voiceState} isSpeaking={isSpeaking} variant={shellTheme === 'light' ? 'light' : 'dark'} />
          </div>
        )}
        <div className="flex h-[44px] items-center justify-between px-2 text-white sm:px-3">
          <div className="flex h-full items-center">
            <button
              type="button"
              onClick={() => setComposerMenuOpen((open) => !open)}
              className={`smyst-icon-button grid h-10 w-10 place-items-center rounded-md text-white transition-colors ${
                composerMenuOpen || attachments.length > 0 ? 'bg-white/[0.12]' : ''
              }`}
              aria-label={t.start.addFile}
              title={t.start.addFile}
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
          <div className="flex h-full items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => startDictation()}
              className={`smyst-icon-button grid h-10 w-10 place-items-center rounded-md text-white transition-colors ${
                voiceState === 'listening' ? 'bg-white/[0.12]' : ''
              }`}
              aria-label={t.start.voiceInput}
              title={speechRecognitionSupported() ? t.start.voiceInput : t.start.voiceInputUnsupported}
            >
              <Mic className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={handleToggleLiveVoice}
              className={`smyst-icon-button grid h-10 w-10 place-items-center rounded-md text-white transition-colors ${
                voiceState !== 'idle' ? 'bg-white/[0.12]' : ''
              }`}
              aria-label={liveVoiceLabel}
              title={liveVoiceLabel}
            >
              <Waveform className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={handleSpeakInput}
              className={`smyst-icon-button grid h-10 w-10 place-items-center rounded-md text-white transition-colors ${
                speechOutputEnabled || isSpeaking ? 'bg-white/[0.12]' : ''
              }`}
              data-ready={canSpeak ? 'true' : 'false'}
              aria-label={speechOutputEnabled ? t.start.speechOutputOff : t.start.speechOutputOn}
              title={speechOutputEnabled ? t.start.speechOutputOff : t.start.speechOutputOn}
            >
              <Speaker className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={handleSendButtonClick}
              className={`smyst-icon-button grid h-10 w-10 place-items-center rounded-md text-white transition-colors ${
                canSend ? 'bg-white/[0.12]' : 'opacity-70'
              }`}
              data-ready={canSend ? 'true' : 'false'}
              aria-label={t.start.send}
              title={t.start.send}
            >
              <ArrowUp className="h-7 w-7" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  )
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
  const [publicProfile, setPublicProfile] = useState<PublicTwinProfile | null>(null)
  const [privateTwin, setPrivateTwin] = useState<TwinRecord | null>(null)
  const [loaded, setLoaded] = useState(!slug && !privateTwinId)
  const [shareStatus, setShareStatus] = useState('')
  const [profileImageBroken, setProfileImageBroken] = useState(false)
  const isPrivate = Boolean(privateTwinId)

  useEffect(() => {
    let alive = true
    if (slug) {
      void twinMvp.getPublicTwin(slug).then((profile) => {
        if (alive) setPublicProfile(profile ?? curatedPublicProfileBySlug(slug))
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
        mainCategory: privateTwin.mainCategory,
        birthDate: privateTwin.birthDate,
        deathDate: privateTwin.deathDate,
        birthYear: privateTwin.birthYear,
        deathYear: privateTwin.deathYear,
        birthLabel: privateTwin.birthLabel,
        deathLabel: privateTwin.deathLabel,
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
    setProfileImageBroken(false)
  }, [profile?.imageUrl])

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
          <p className="text-sm text-[#555b64]">Profil und Inhalte werden vorbereitet.</p>
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

  if (!profile.imageUrl || profileImageBroken) {
    return (
      <div className="pt-[72px]">
        <Card className="mx-auto max-w-[720px] p-8">
          <h1 className="mb-2 text-2xl font-bold">Twin-Profil nicht vollständig</h1>
          <p className="text-sm text-[#555b64]">Dieses Profil braucht ein funktionierendes Profilbild, bevor es öffentlich angezeigt wird.</p>
        </Card>
      </div>
    )
  }

  const profileShareUrl = profile.seo.canonical || `${window.location.origin}${profile.chatPath}`
  const shareProfile = async () => {
    setShareStatus('')
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile.seo.title,
          text: profile.description,
          url: profileShareUrl,
        })
        setShareStatus('Geteilt')
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileShareUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = profileShareUrl
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setShareStatus('Link kopiert')
    } catch {
      setShareStatus('Teilen nicht möglich')
    } finally {
      window.setTimeout(() => setShareStatus(''), 2200)
    }
  }

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
                <img
                  src={profile.imageUrl}
                  alt={profile.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setProfileImageBroken(true)}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigate('twin-chat')
                  window.history.replaceState({}, '', profile.chatPath)
                }}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#17191d] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                Mit Twin chatten
              </button>
              <button
                type="button"
                onClick={() => void shareProfile()}
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/40 bg-white/18 px-5 text-sm font-semibold text-[#17191d] transition-colors hover:bg-white/30"
              >
                <Share className="h-4 w-4" />
                Profil teilen
              </button>
              {shareStatus && (
                <p className="mt-2 rounded-full bg-white/26 px-3 py-2 text-center text-xs font-semibold text-[#555b64]" role="status">
                  {shareStatus}
                </p>
              )}
            </div>

            <div className="p-6 sm:p-8">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#667085]">KI-Zwilling Profil</p>
              <h1 className="text-4xl font-bold tracking-tight">{profile.name}</h1>
              <p className="text-xl font-semibold text-[#20252d]">{profileMainCategory(profile)}</p>
              <p className="mt-1 text-sm font-semibold text-[#667085]">{profileLifeLine(profile)}</p>
              <p className="mt-4 max-w-[720px] text-base leading-relaxed text-[#555b64]">{profile.description || 'Dieses Twin-Profil hat noch keine öffentliche Beschreibung.'}</p>

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

              {(profile.guardrail || profile.rightsPosture) && (
                <section className="mt-6 rounded-lg border border-amber-300/50 bg-amber-50/70 p-4">
                  <h2 className="mb-2 text-lg font-semibold text-amber-950">Historisches Profil</h2>
                  {profile.guardrail && <p className="text-sm leading-relaxed text-amber-950">{profile.guardrail}</p>}
                  {profile.rightsPosture && <p className="mt-2 text-sm leading-relaxed text-amber-900">{profile.rightsPosture}</p>}
                </section>
              )}

              {profile.sources?.length ? (
                <section className="mt-6">
                  <h2 className="mb-3 text-lg font-semibold">Quellen</h2>
                  <div className="grid gap-2">
                    {profile.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-white/32 bg-white/16 px-4 py-3 text-sm font-medium text-[#0b1c44] transition-colors hover:bg-white/28"
                      >
                        {source.publisher}: {source.title}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}

function emailAuthMessageForCode(result: { ok: boolean; code?: string; message?: string }): string {
  switch (result.code) {
    case 'email_service_unavailable':
      return 'E-Mail-Login wird gerade eingerichtet. Bitte nutze solange den Google-Login.'
    case 'email_not_verified':
      return 'Bitte bestätige zuerst deine E-Mail über den Link, den wir dir geschickt haben.'
    case 'invalid_credentials':
      return 'E-Mail oder Passwort ist falsch.'
    case 'email_taken':
      return 'Für diese E-Mail gibt es bereits ein Konto. Bitte logge dich ein.'
    case 'weak_password':
      return 'Das Passwort muss mindestens 8 Zeichen lang sein.'
    case 'invalid_email':
      return 'Bitte gib eine gültige E-Mail-Adresse an.'
    default:
      return result.message || 'Aktion fehlgeschlagen. Bitte versuche es erneut.'
  }
}

function EmailPasswordForm({ returnTo }: { returnTo?: string }) {
  const auth = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async () => {
    if (busy) return
    setError('')
    setInfo('')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        const result = await auth.registerWithEmail(cleanEmail, password, name.trim() || undefined)
        if (result.ok) {
          window.location.assign(returnTo || window.location.pathname + window.location.search)
        } else {
          setError(emailAuthMessageForCode(result))
        }
      } else {
        const result = await auth.signInWithEmail(cleanEmail, password)
        if (result.ok) {
          window.location.assign(returnTo || window.location.pathname + window.location.search)
        } else {
          setError(emailAuthMessageForCode(result))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (busy) return
    setError('')
    setInfo('')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setError('Bitte gib zuerst deine E-Mail-Adresse ein.')
      return
    }
    setBusy(true)
    try {
      await auth.requestPasswordReset(cleanEmail)
      setInfo('Falls ein Konto existiert, haben wir dir eine E-Mail zum Zurücksetzen geschickt.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-[#0b1c44]/16 bg-white/70 px-3 py-2 text-sm text-[#16181b] outline-none transition-colors focus:border-[#0b1c44]/40'

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex w-full flex-col gap-2"
    >
      {mode === 'register' && (
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name (optional)"
          autoComplete="name"
          className={inputClass}
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="E-Mail"
        autoComplete="email"
        required
        className={inputClass}
      />
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={mode === 'register' ? 'Passwort (min. 8 Zeichen)' : 'Passwort'}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        required
        className={inputClass}
      />
      {error && <p className="text-xs font-medium text-[#b91c1c]">{error}</p>}
      {info && <p className="text-xs font-medium text-[#0b7a3b]">{info}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-[#0b1c44]/14 bg-[#0b1c44] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#173064] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Bitte warten…' : mode === 'register' ? 'Konto erstellen' : 'Mit E-Mail einloggen'}
      </button>
      <div className="flex items-center justify-between text-xs text-[#555b64]">
        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === 'login' ? 'register' : 'login'))
            setError('')
            setInfo('')
          }}
          className="font-medium text-[#0b1c44] hover:underline"
        >
          {mode === 'login' ? 'Neu hier? Konto erstellen' : 'Schon ein Konto? Einloggen'}
        </button>
        {mode === 'login' && (
          <button type="button" onClick={() => void forgot()} className="hover:underline">
            Passwort vergessen?
          </button>
        )}
      </div>
    </form>
  )
}

const SIGN_IN_RULES = [
  'Chat darf sofort sichtbar sein',
  'Private Daten erst nach Login speichern',
  'Fehlertext sagt immer, was zu tun ist',
  'HttpOnly-Session statt Token im Browser',
  'Export/Löschung direkt auffindbar',
  'Bot-Schutz an, ohne dass Login stört',
]

function SignInRequiredCard({ title, text, returnTo }: { title: string; text: string; returnTo: string }) {
  return (
    <Card className="p-6 sm:p-8">
      <CardContent className="flex flex-col items-start gap-4 p-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-[#555b64]">{text}</p>
          <ul className="mt-4 space-y-1.5">
            {SIGN_IN_RULES.map((rule) => (
              <li key={rule} className="flex items-center gap-2 text-sm text-[#555b64]">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#22c55e]/15 text-[10px] font-bold text-[#0b7a3b]">✓</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[260px]">
          <Suspense fallback={null}>
            <GitHubSignInButton variant="official" returnTo={returnTo} />
          </Suspense>
          <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#9aa6b7]">
            <span className="h-px flex-1 bg-[#0b1c44]/10"></span>oder<span className="h-px flex-1 bg-[#0b1c44]/10"></span>
          </div>
          <EmailPasswordForm returnTo={returnTo} />
        </div>
      </CardContent>
    </Card>
  )
}

function AccountProfileView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [chatResults, setChatResults] = useState<ChatSearchResult[]>([])
  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    headline: '',
    privateBio: '',
    publicBio: '',
    roles: '',
    expertise: '',
    goals: '',
    languages: '',
    tone: 'professional',
  })
  const [memoryDraft, setMemoryDraft] = useState('')
  const [chatQuery, setChatQuery] = useState('')

  const splitDraftList = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  const hydrateProfileDraft = (next: UserProfileRecord) => {
    setProfileDraft({
      displayName: next.displayName,
      headline: next.headline ?? '',
      privateBio: next.privateBio ?? '',
      publicBio: next.publicBio ?? '',
      roles: next.roles.join(', '),
      expertise: next.expertise.join(', '),
      goals: next.goals.join(', '),
      languages: next.languages.join(', '),
      tone: next.tone,
    })
  }

  const refreshProfileData = async () => {
    const [profileResponse, memoryResponse] = await Promise.all([
      twinMvp.getProfile(),
      twinMvp.listMemories(),
    ])
    if (profileResponse?.profile) {
      setProfile(profileResponse.profile)
      hydrateProfileDraft(profileResponse.profile)
    }
    if (memoryResponse?.memories) setMemories(memoryResponse.memories)
  }

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    void refreshProfileData()
  }, [auth.status])

  const saveProfile = async () => {
    const result = await twinMvp.updateProfile({
      displayName: profileDraft.displayName,
      headline: profileDraft.headline,
      privateBio: profileDraft.privateBio,
      publicBio: profileDraft.publicBio,
      roles: splitDraftList(profileDraft.roles),
      expertise: splitDraftList(profileDraft.expertise),
      goals: splitDraftList(profileDraft.goals),
      languages: splitDraftList(profileDraft.languages),
      tone: profileDraft.tone,
      visibility: 'private',
    })
    if (!result?.profile) return
    setProfile(result.profile)
    hydrateProfileDraft(result.profile)
    setPrivacyStatus('Profil gespeichert und für IDrive-e2-Objektpersistenz vorgemerkt.')
  }

  const createManualMemory = async () => {
    if (!memoryDraft.trim()) return
    const memory = await twinMvp.createMemory({
      type: 'fact',
      text: memoryDraft,
      sourceType: 'manual',
      sourceLabel: 'Profilseite',
      status: 'confirmed',
      visibility: 'private',
      sensitivity: 'personal',
      confidence: 0.85,
    })
    if (!memory) return
    setMemoryDraft('')
    await refreshProfileData()
    setPrivacyStatus('Memory gespeichert.')
  }

  const confirmMemory = async (memory: MemoryRecord) => {
    const next = await twinMvp.updateMemory(memory.id, { status: 'confirmed', confidence: Math.max(memory.confidence, 0.85) })
    if (!next) return
    setMemories((current) => current.map((item) => (item.id === next.id ? next : item)))
  }

  const deleteMemory = async (memory: MemoryRecord) => {
    const confirmed = window.confirm('Diese Memory wirklich löschen?')
    if (!confirmed) return
    const result = await twinMvp.deleteMemory(memory.id)
    if (!result) return
    setMemories((current) => current.filter((item) => item.id !== memory.id))
    setPrivacyStatus('Memory gelöscht.')
  }

  const searchChats = async () => {
    const result = await twinMvp.searchTwinChats(chatQuery)
    if (!result) return
    setChatResults(result.results)
  }

  const exportAccount = async () => {
    const bundle = await twinMvp.exportAccount()
    if (!bundle) return
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `smyst-account-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setPrivacyStatus('Export erstellt.')
  }

  const deleteAccount = async () => {
    const confirmed = window.confirm('Account, Chats, Twins und bekannte Dateien wirklich löschen?')
    if (!confirmed) return
    const result = await twinMvp.deleteAccount()
    if (!result) return
    setPrivacyStatus('Account-Löschung ausgeführt. Du wirst abgemeldet.')
    window.setTimeout(() => {
      window.location.href = '/'
    }, 800)
  }

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Mein Profil</h1>
        <p className="text-base text-[#555b64]">Account, Session und Datenschutzstatus für deinen smyst-Zugang.</p>
      </div>

      {auth.status !== 'authenticated' ? (
        <SignInRequiredCard
          title="Anmelden oder registrieren"
          text="Melde dich an, damit private Daten geschützt bleiben und nur für dich sichtbar sind."
          returnTo="/profile"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                <p className="mt-1 text-sm font-semibold">Private Inhalte standardmäßig noindex</p>
              </div>
              <div className="rounded-lg bg-white/16 p-4">
                <p className="text-xs text-[#667085]">Speicher</p>
                <p className="mt-1 text-sm font-semibold">Dateien und Medien geschützt</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Anzeigename
                  <input
                    value={profileDraft.displayName}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))}
                    className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Headline
                  <input
                    value={profileDraft.headline}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, headline: event.target.value }))}
                    className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-semibold">
                Private Bio
                <textarea
                  value={profileDraft.privateBio}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, privateBio: event.target.value }))}
                  rows={4}
                  className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Öffentliche Bio
                <textarea
                  value={profileDraft.publicBio}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, publicBio: event.target.value }))}
                  rows={3}
                  className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Rollen
                  <input value={profileDraft.roles} onChange={(event) => setProfileDraft((current) => ({ ...current, roles: event.target.value }))} className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Expertise
                  <input value={profileDraft.expertise} onChange={(event) => setProfileDraft((current) => ({ ...current, expertise: event.target.value }))} className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Ziele
                  <input value={profileDraft.goals} onChange={(event) => setProfileDraft((current) => ({ ...current, goals: event.target.value }))} className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]" />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Sprachen
                  <input value={profileDraft.languages} onChange={(event) => setProfileDraft((current) => ({ ...current, languages: event.target.value }))} className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]" />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/14 p-4">
                <div>
                  <p className="text-sm font-semibold">Profilqualität {profile?.qualityScore ?? 0}/100</p>
                  <p className="text-xs text-[#667085]">{profile?.chatCount ?? 0} Chats · {profile?.memoryCount ?? 0} Memories</p>
                </div>
                <Button onClick={() => void saveProfile()}>Profil speichern</Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold">Nächste Schritte</h3>
            <div className="space-y-3">
              <Button className="w-full justify-center" onClick={() => onNavigate('twin-builder')}>Twin erstellen</Button>
              <Button className="w-full justify-center" variant="secondary" onClick={() => onNavigate('memory-upload')}>Daten hochladen</Button>
              <Button className="w-full justify-center" variant="secondary" onClick={() => onNavigate('settings')}>Einstellungen</Button>
            </div>
          </Card>

          <Card className="p-6 lg:col-start-2">
            <h3 className="mb-2 text-lg font-semibold">Datenschutz</h3>
            <p className="mb-4 text-sm text-[#555b64]">
              Exportiere deine Daten oder lösche bekannte Account-, Chat-, Twin- und Upload-Daten.
            </p>
            <div className="space-y-3">
              <Button className="w-full justify-center" variant="secondary" onClick={() => void exportAccount()}>
                Daten exportieren
              </Button>
              <Button className="w-full justify-center border-red-200 bg-red-50 text-red-700 hover:bg-red-100" variant="secondary" onClick={() => void deleteAccount()}>
                Account löschen
              </Button>
            </div>
            {(privacyStatus || twinMvp.error) && (
              <p className="mt-4 rounded-lg bg-white/18 p-3 text-sm text-[#555b64]">
                {privacyStatus || twinMvp.error}
              </p>
            )}
          </Card>

          <Card className="p-6 lg:col-span-2">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Memory</h3>
                <p className="text-sm text-[#555b64]">Bestätigte Informationen bleiben privat im Profil und können später pro Twin genutzt werden.</p>
              </div>
              <Button variant="secondary" onClick={() => void refreshProfileData()}>Aktualisieren</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="Neue Memory als Fakt speichern..."
                className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
              />
              <Button onClick={() => void createManualMemory()}>Memory speichern</Button>
            </div>
            <div className="mt-5 grid gap-3">
              {(memories.length ? memories : []).map((memory) => (
                <div key={memory.id} className="rounded-lg border border-white/20 bg-white/12 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{memory.text || 'Gelöschte Memory'}</p>
                      <p className="mt-1 text-xs text-[#667085]">
                        {memory.type} · {memory.status} · {memory.sensitivity} · Confidence {Math.round(memory.confidence * 100)}%
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {memory.status !== 'confirmed' && (
                        <Button size="sm" variant="secondary" onClick={() => void confirmMemory(memory)}>Bestätigen</Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => void deleteMemory(memory)}>Löschen</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!memories.length && (
                <div className="rounded-lg bg-white/12 p-4 text-sm text-[#555b64]">Noch keine Memories gespeichert.</div>
              )}
            </div>
          </Card>

          <Card className="p-6 lg:col-span-2">
            <h3 className="mb-2 text-lg font-semibold">Chatverlauf suchen</h3>
            <p className="mb-4 text-sm text-[#555b64]">Suche in deinen privaten Chat-Summaries und gespeicherten MVP-Nachrichten.</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={chatQuery}
                onChange={(event) => setChatQuery(event.target.value)}
                placeholder="Wonach suchst du?"
                className="rounded-lg border border-white/24 bg-white/18 px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
              />
              <Button onClick={() => void searchChats()}>Suchen</Button>
            </div>
            <div className="mt-5 grid gap-3">
              {chatResults.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onNavigate('twin-chat')}
                  className="rounded-lg border border-white/20 bg-white/12 p-4 text-left transition-colors hover:bg-white/18"
                >
                  <p className="text-sm font-semibold">{chat.title}</p>
                  <p className="mt-1 text-sm text-[#555b64]">{chat.summary}</p>
                  <p className="mt-2 break-all text-xs text-[#667085]">{chat.archiveObjectKey}</p>
                </button>
              ))}
              {!chatResults.length && chatQuery && (
                <div className="rounded-lg bg-white/12 p-4 text-sm text-[#555b64]">Keine Treffer.</div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function MyTwinsView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { lang } = useLanguage({ reloadOnChange: false })
  const t = useStaticTranslations(lang)
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
          <h1 className="mb-2 text-4xl font-bold tracking-tight">{t.myTwins.title}</h1>
          <p className="text-base text-[#555b64]">{t.myTwins.subtitle}</p>
        </div>
        <Button onClick={() => onNavigate('twin-builder')}>{t.myTwins.createButton}</Button>
      </div>

      {auth.status !== 'authenticated' ? (
        <SignInRequiredCard
          title={t.myTwins.signInTitle}
          text={t.myTwins.signInText}
          returnTo="/twins"
        />
      ) : !loaded ? (
        <Card className="p-8 text-sm text-[#555b64]">{t.myTwins.loading}</Card>
      ) : twins.length === 0 ? (
        <Card className="p-8">
          <h2 className="mb-2 text-xl font-bold">{t.myTwins.emptyTitle}</h2>
          <p className="mb-5 text-sm text-[#555b64]">{t.myTwins.emptyText}</p>
          <Button onClick={() => onNavigate('twin-builder')}>{t.myTwins.emptyButton}</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {twins.map((twin) => (
            <Card key={twin.id} className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{twin.name}</h2>
                  <p className="mt-1 text-sm text-[#555b64]">{twin.description || t.myTwins.noDescription}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${twin.visibility === 'public' ? 'bg-emerald-500/14 text-emerald-800' : 'bg-slate-500/14 text-slate-700'}`}>
                  {twin.visibility === 'public' ? 'Public' : 'Private'}
                </span>
              </div>
              <div className="mb-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-lg font-bold">{twin.knowledgeTexts.length}</p>
                  <p className="text-xs text-[#667085]">{t.myTwins.statKnowledge}</p>
                </div>
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-lg font-bold">{twin.mediaRefs.length}</p>
                  <p className="text-xs text-[#667085]">{t.myTwins.statMedia}</p>
                </div>
                <div className="rounded-lg bg-white/16 p-3">
                  <p className="text-sm font-bold capitalize">{twin.style}</p>
                  <p className="text-xs text-[#667085]">{t.myTwins.statStyle}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onNavigate('twin-chat')
                    window.history.replaceState({}, '', `/twin-chat?twin=${encodeURIComponent(twin.id)}`)
                  }}
                >
                  Chat
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onNavigate('memory-upload')}>{t.myTwins.uploadButton}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {twinMvp.error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700">{twinMvp.error}</p>}
    </div>
  )
}

function SettingsView({
  onNavigate,
  nameSortMode,
  onNameSortModeChange,
}: {
  onNavigate: (view: AppView) => void
  nameSortMode: NameSortMode
  onNameSortModeChange: (mode: NameSortMode) => void
}) {
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const [reportType, setReportType] = useState<SupportReportType>('feedback')
  const [reportSubject, setReportSubject] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportContact, setReportContact] = useState('')
  const [reportStatus, setReportStatus] = useState<string | null>(null)

  const submitReport = async () => {
    const result = await twinMvp.submitSupportReport({
      type: reportType,
      subject: reportSubject,
      message: reportMessage,
      contact: reportContact,
      url: window.location.pathname + window.location.search,
    })
    if (!result) return
    setReportSubject('')
    setReportMessage('')
    setReportStatus(`Meldung gespeichert: ${result.reportId.slice(0, 8)}`)
  }

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-base text-[#555b64]">Datenschutz, Sicherheit und Account-Aktionen.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold">Account</h2>
          {auth.status === 'authenticated' ? (
            <div className="space-y-4">
              <p className="text-sm text-[#555b64]">Angemeldet als <span className="font-semibold text-[#17191d]">{auth.user?.email}</span></p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onNavigate('account-profile')}>Profil öffnen</Button>
                <Button variant="secondary" onClick={() => void auth.signOut()}>Logout</Button>
                <Button variant="secondary" onClick={() => void auth.signOutAll()}>Alle Sessions abmelden</Button>
              </div>
            </div>
          ) : (
            <Suspense fallback={null}>
              <GitHubSignInButton variant="official" returnTo="/settings" />
            </Suspense>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-xl font-bold">Sicherheitsregeln</h2>
          <div className="space-y-3 text-sm text-[#555b64]">
            <p>Private Inhalte bleiben geschützt und werden nicht öffentlich angezeigt.</p>
            <p>Dateien, Medien und Twin-Daten werden getrennt vom öffentlichen Profil behandelt.</p>
            <p>Externe Dienste werden nur eingesetzt, wenn sie zur Sicherheits- und Datenschutzstrategie passen.</p>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-xl font-bold">KI-Profile</h2>
          <p className="mb-4 text-sm text-[#555b64]">
            Legt fest, welche KI-Profile beim Suchen und in der Auswahl zuerst erscheinen.
          </p>
          <div className="grid gap-3 md:grid-cols-5">
            {nameSortOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => onNameSortModeChange(option.mode)}
                className={`min-h-[92px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111722]/40 ${
                  nameSortMode === option.mode
                    ? 'border-[#111722] bg-[#111722] text-white'
                    : 'border-[#d7dce5] bg-white/55 text-[#17191d] hover:bg-white'
                }`}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className={`mt-1 block text-xs ${nameSortMode === option.mode ? 'text-[#c6ceda]' : 'text-[#667085]'}`}>
                  {option.detail}
                </span>
              </button>
            ))}
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

        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Feedback, Fehler oder Missbrauch melden</h2>
              <p className="mt-1 text-sm text-[#555b64]">
                Meldungen werden gespeichert und können vom verantwortlichen Team geprüft werden.
              </p>
            </div>
            <Button variant="secondary" onClick={() => onNavigate('trust')}>Trust Center</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Typ
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value as SupportReportType)}
                className="h-12 border border-white/20 bg-white/10 px-3 text-sm"
              >
                <option value="feedback">Feedback</option>
                <option value="bug">Fehler</option>
                <option value="abuse">Missbrauch</option>
                <option value="privacy">Datenschutz</option>
                <option value="safety">Sicherheit</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Betreff
              <input
                value={reportSubject}
                onChange={(event) => setReportSubject(event.target.value)}
                placeholder="Kurz beschreiben"
                className="h-12 border border-white/20 bg-white/10 px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold md:col-span-2">
              Nachricht
              <textarea
                value={reportMessage}
                onChange={(event) => setReportMessage(event.target.value)}
                placeholder="Was ist passiert? Welche Seite, welcher Name, welcher Upload?"
                className="min-h-[120px] border border-white/20 bg-white/10 p-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold md:col-span-2">
              Kontakt optional
              <input
                value={reportContact}
                onChange={(event) => setReportContact(event.target.value)}
                placeholder="E-Mail oder Hinweis, falls Rückfrage erwünscht ist"
                className="h-12 border border-white/20 bg-white/10 px-3 text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button onClick={() => void submitReport()} disabled={!reportSubject.trim() || reportMessage.trim().length < 12 || twinMvp.loading}>
                Meldung speichern
              </Button>
              {(reportStatus || twinMvp.error) && (
                <p className="text-sm text-[#667085]">{reportStatus || twinMvp.error}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TrustView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { lang } = useLanguage({ reloadOnChange: false })
  const t = useStaticTranslations(lang)
  const items = [
    [t.trust.item1Title, t.trust.item1Text],
    [t.trust.item2Title, t.trust.item2Text],
    [t.trust.item3Title, t.trust.item3Text],
    [t.trust.item4Title, t.trust.item4Text],
    [t.trust.item5Title, t.trust.item5Text],
    [t.trust.item6Title, t.trust.item6Text],
  ]

  return (
    <div className="pt-[72px]">
      <div className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">Trust Center</p>
        <h1 className="mb-2 text-4xl font-bold tracking-tight">{t.trust.title}</h1>
        <p className="max-w-[760px] text-base text-[#9aa6b7]">
          {t.trust.intro}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([title, text]) => (
          <Card key={title} className="p-6">
            <h2 className="mb-2 text-xl font-bold">{title}</h2>
            <p className="text-sm text-[#9aa6b7]">{text}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6">
        <h2 className="mb-2 text-xl font-bold">{t.trust.openTitle}</h2>
        <p className="text-sm leading-relaxed text-[#9aa6b7]">
          {t.trust.openText}
          
          
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => onNavigate('settings')}>{t.trust.reportButton}</Button>
          <Button variant="secondary" onClick={() => onNavigate('privacy')}>{t.trust.privacyButton}</Button>
        </div>
      </Card>
    </div>
  )
}

function LegalView({ kind }: { kind: 'privacy' | 'terms' | 'imprint' }) {
  const content = {
    privacy: {
      title: 'Datenschutz',
      intro: 'Verantwortlich: AUS2001 LLC, 30 N Gould St Ste R, Sheridan, WY 82801, USA. E-Mail: s@smyst.com. Stand: 4. Juli 2026. Es gilt die auf smyst.com/privacy veroeffentlichte Fassung.',
      points: [
        'Ohne Konto verarbeiten wir technische Zugriffsdaten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser- und Geraetetyp) fuer Betrieb, Stabilitaet und Missbrauchsabwehr (Art. 6 Abs. 1 lit. f DSGVO). Chat-Anfragen an oeffentliche KI-Profile werden zur Beantwortung an unser Backend uebertragen; ohne Anmeldung wird kein Chat-Verlauf dauerhaft gespeichert.',
        'Mit Konto verarbeiten wir E-Mail-Adresse, Name (optional), Passwort ausschliesslich als kryptografischen Hash (scrypt), Profilinhalte, erstellte AI-Twins, hochgeladene Dateien (Dokumente, Bilder, Audio, Video), Chat-Verlaeufe sowie Einstellungs- und Sitzungsdaten zur Bereitstellung deines Kontos und der Kernfunktionen (Art. 6 Abs. 1 lit. b DSGVO).',
        'Bei Google-Login erhalten wir nur die Google-Konto-Basisdaten (E-Mail-Adresse, Name, Profilbild-URL). Dein Google-Passwort wird nicht an uns uebertragen.',
        'Technisch notwendige lokale Speicherung (Session-Cookie bzw. signiertes Token, Sprach- und Design-Einstellung, Consent-Status) erfolgt nach Par. 25 Abs. 2 TDDDG bzw. Art. 6 Abs. 1 lit. b/f DSGVO. Optionale anonyme Nutzungsstatistik nur nach Einwilligung ueber das Consent-Banner, jederzeit widerrufbar. Keine Werbe-Tracker von Drittanbietern.',
        'Dienstleister: IDrive Inc. (USA, Objektspeicher und Auslieferung der Website-Dateien), Salad Technologies (USA, Backend fuer Login, API und KI-Antworten), GitHub Inc. (USA, Code-Hosting), Google LLC (USA, nur bei Google-Login), Spaceship/Namecheap-Gruppe (Domain, DNS, E-Mail-Weiterleitung an s@smyst.com).',
        'Drittlandbezug: Die Verarbeitung findet ueberwiegend in den USA statt, gestuetzt auf das EU-US Data Privacy Framework, soweit Anbieter zertifiziert sind, andernfalls auf EU-Standardvertragsklauseln bzw. die Standard-Datenschutzvereinbarungen der Anbieter (Art. 44 ff. DSGVO).',
        'Speicherdauer: Kontodaten bleiben gespeichert, solange dein Konto besteht. Nach Konto-Loeschung werden personenbezogene Daten zweistufig entfernt (sofortige Sperrung, anschliessend endgueltige Loeschung der Datenobjekte). Technische Logs nur so lange, wie fuer Betrieb und Sicherheit erforderlich. Chats ohne Konto werden nicht dauerhaft gespeichert.',
        'Deine Rechte: Auskunft (Art. 15), Berichtigung (Art. 16), Loeschung (Art. 17), Einschraenkung (Art. 18), Datenuebertragbarkeit (Art. 20), Widerspruch (Art. 21) und jederzeitiger Widerruf erteilter Einwilligungen. Konto-Export und Konto-Loeschung stehen direkt im Produkt bereit (Trust Center, Deine Daten: Export und Loeschung); zusaetzlich per E-Mail an s@smyst.com. Du kannst dich ausserdem bei einer Datenschutz-Aufsichtsbehoerde beschweren.',
        'KI-Hinweise: AI-Twins sind kuratierte digitale Profile und geben nicht die echte (historische) Person wieder. Private Profile und private Uploads werden nicht fuer Suchmaschinen indexiert und sind an deine Login-Session gebunden. Wir verwenden deine privaten Inhalte nicht zum Training fremder Modelle.',
        'Datensicherheit: Uebertragung ausschliesslich ueber HTTPS, signierte und serverseitig gepruefte Sessions, Passwoerter nur als scrypt-Hash, serverseitige Upload-Pruefung (Typ, Groesse, Besitzerpfad), getrennte App-, Datei- und Datenbereiche.',
        'Aenderungen: Wir passen diese Erklaerung an, wenn sich Funktionen oder Dienstleister aendern.',
      ],
    },
    terms: {
      title: 'Nutzungsbedingungen',
      intro: 'Diese Bedingungen definieren die sichere Nutzung bis zur finalen juristischen Freigabe.',
      points: [
        'Nutzer dürfen nur Daten hochladen, für die sie Rechte und Einwilligungen haben.',
        'Missbrauch, Spam, illegale Inhalte und Verletzungen von Persönlichkeitsrechten sind verboten.',
        'AI-Twins sind digitale Profile und dürfen nicht als echte Person ausgegeben werden.',
        'Öffentliche Twins können indexiert werden; private Twins bleiben privat und noindex.',
        'Uploads, Speicher und API-Nutzung haben Schutz- und Missbrauchsgrenzen.',
      ],
    },
    imprint: {
      title: 'Impressum',
      intro: 'Angaben zum Betreiber von smyst.com.',
      points: [
        'Betreiber: AUS2001 LLC',
        'Anschrift: 30 N Gould St Ste R, Sheridan, WY 82801, USA',
        'E-Mail: s@smyst.com',
        'Domain: smyst.com',
      ],
    },
  }[kind]

  return (
    <div className="pt-[72px]">
      <Card className="mx-auto max-w-[860px] p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">Rechtliches</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight">{content.title}</h1>
        <p className="mb-6 text-sm leading-relaxed text-[#9aa6b7]">{content.intro}</p>
        <div className="space-y-3">
          {content.points.map((point) => (
            <div key={point} className="border border-white/[0.08] bg-white/[0.04] p-4">
              <p className="text-sm leading-relaxed text-[#d5dbe5]">{point}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function NotFoundView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  return (
    <section className="flex min-h-[calc(100dvh-220px)] items-center py-16">
      <div className="w-full max-w-[760px]">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8e97a8]">404</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Diese Seite gibt es nicht.</h1>
        <p className="max-w-[620px] text-base leading-relaxed text-[#9aa6b7]">
          Der Link ist unvollständig, veraltet oder zeigt auf einen Bereich, der nicht veröffentlicht ist.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={() => onNavigate('landing')}>Zur Startseite</Button>
          <Button variant="secondary" onClick={() => onNavigate('twin-chat')}>Chats öffnen</Button>
          <Button variant="secondary" onClick={() => onNavigate('trust')}>Trust Center</Button>
        </div>
      </div>
    </section>
  )
}

type AdminSection =
  | 'overview'
  | 'look'
  | 'users'
  | 'registrations'
  | 'profiles'
  | 'aiQuality'
  | 'ads'
  | 'revenue'
  | 'finance'
  | 'moderation'
  | 'security'
  | 'storage'
  | 'idrive'
  | 'salad'
  | 'support'
  | 'releases'
  | 'apps'
  | 'checklist'

type AdminMetric = {
  label: string
  value: string
  detail: string
  tone: 'green' | 'cyan' | 'amber' | 'red' | 'navy'
}

type AdminRow = Record<string, string>

type AdminOverviewApi = {
  ok: boolean
  mode?: string
  metrics?: {
    usersSeen?: number
    blockedUsers?: number
    revenueProfiles?: number
    heldProfiles?: number
    validRevenueCents?: number
    userShareCents?: number
    userSharePercent?: number
    auditEvents?: number
  }
  storagePlan?: {
    metadata?: string
    objects?: string
    compute?: string
  }
  computePlan?: {
    ready?: boolean
    status?: 'ready' | 'blocked'
    missing?: string[]
    mode?: string
    primaryProvider?: string
    streamingEnabled?: boolean
    note?: string
  }
  computeQueue?: ComputeJobSummary
}

type ComputeJobSummary = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  retryable: number
  staleRunning: number
}

type ComputeRuntimeApi = {
  ok: boolean
  runtime?: {
    checkedAt: number
    configurationReady: boolean
    operational: boolean
    provider: 'salad'
    container: {
      status: string
      description: string
      counts: {
        allocating: number
        creating: number
        running: number
        stopping: number
      }
      replicas: number
      priority: string | null
      pendingChange: boolean
      dns: string | null
      port: number
      auth: boolean
    }
    health: {
      ok: boolean
      status: number
      service: string | null
      error: string | null
    }
    wake: {
      attempted: boolean
      ok: boolean
      status: number
      body?: unknown
    } | null
  }
}

type AdminMfaStatusApi = {
  ok: boolean
  required: boolean
  configured: boolean
  verified: boolean
  method: 'totp' | null
  expiresAt: number | null
  canVerify: boolean
  note?: string | null
}

type StorageCapabilitiesApi = {
  ok: boolean
  provider?: string
  configuration?: {
    ready: boolean
    status: 'ready' | 'blocked'
    missing?: string[]
    note?: string
  }
}

type ComputeCapabilitiesApi = {
  ok: boolean
  provider?: string
  configuration?: {
    ready: boolean
    status: 'ready' | 'blocked'
    missing?: string[]
    mode?: string
    primaryProvider?: string
    streamingEnabled?: boolean
    note?: string
  }
  latencyBudgetMs?: {
    chatStart?: number
    firstToken?: number
    fallbackReply?: number
    heavyJobQueueAck?: number
  }
  saladRuntime?: {
    apiBaseUrl?: string | null
    organizationName?: string | null
    projectName?: string | null
    containerGroup?: string | null
    healthUrl?: string | null
  }
}

type ComputeJobsApi = {
  ok: boolean
  summary: ComputeJobSummary
  jobs: Array<{
    id: string
    type: string
    status: string
    priority: number
    target: string
    provider: string
    attempts: number
    maxAttempts: number
    lastError?: string | null
    resultObjectKey?: string | null
    createdAt: number
    updatedAt: number
  }>
}

const adminSections: Array<{ id: AdminSection; label: string; detail: string }> = [
  { id: 'overview', label: 'Overview', detail: 'Live Status' },
  { id: 'look', label: 'Look', detail: 'Design System' },
  { id: 'users', label: 'Users', detail: 'Sperren, Rollen, Export' },
  { id: 'registrations', label: 'Registrations', detail: 'Funnel und Bots' },
  { id: 'profiles', label: 'Profiles', detail: 'AI Twins und Qualität' },
  { id: 'aiQuality', label: 'AI Quality', detail: 'Modelle, RAG, Tests' },
  { id: 'ads', label: 'Ads', detail: 'AdSense Slots' },
  { id: 'revenue', label: 'Revenue', detail: '25 % User-Anteil' },
  { id: 'finance', label: 'Finance', detail: 'Payouts, KYC, Tax' },
  { id: 'moderation', label: 'Moderation', detail: 'Abuse Queue' },
  { id: 'security', label: 'Security', detail: 'Audit und Privacy' },
  { id: 'storage', label: 'Storage', detail: 'IDrive E2, Salad' },
  { id: 'idrive', label: 'IDrive e2', detail: 'Object Map, Signed URLs' },
  { id: 'salad', label: 'Salad', detail: 'Compute, Job-Pipeline, Jobs' },
  { id: 'support', label: 'Support', detail: 'Tickets und Rollen' },
  { id: 'releases', label: 'Releases', detail: 'Apps, PWA, Rollback' },
  { id: 'apps', label: 'Apps', detail: 'PWA, iPhone, Android' },
  { id: 'checklist', label: 'A-Z', detail: 'Launch Kontrolle' },
]

const adminMetricTone: Record<AdminMetric['tone'], string> = {
  green: 'bg-emerald-500',
  cyan: 'bg-sky-400',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  navy: 'bg-[#111722]',
}

function AdminStatusChip({ children, tone = 'green' }: { children: string; tone?: AdminMetric['tone'] }) {
  return (
    <span className="inline-flex min-h-0 items-center gap-2 rounded-md border border-[#d9e2ec] bg-white px-2.5 py-1 text-xs font-bold text-[#172033]">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${adminMetricTone[tone]}`} />
      {children}
    </span>
  )
}

function AdminMetricCard({ metric }: { metric: AdminMetric }) {
  return (
    <div className="rounded-lg border border-[#d9e2ec] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-4 w-4 shrink-0 rounded-sm ${adminMetricTone[metric.tone]}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#5d6776]">{metric.label}</p>
          <p className="mt-2 text-3xl font-bold leading-none text-[#111722]">{metric.value}</p>
          <p className="mt-3 text-sm leading-snug text-[#5d6776]">{metric.detail}</p>
        </div>
      </div>
    </div>
  )
}

function AdminTable({ columns, rows }: { columns: string[]; rows: AdminRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#d9e2ec] bg-white">
      <table className="min-w-full table-fixed text-left text-sm">
        <thead className="border-b border-[#d9e2ec] bg-[#f7fafd] text-xs font-bold uppercase tracking-[0.08em] text-[#5d6776]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7]">
          {rows.map((row, index) => (
            <tr key={`${row[columns[0]]}-${index}`} className="text-[#5d6776]">
              {columns.map((column, columnIndex) => (
                <td key={column} className={`px-4 py-3 ${columnIndex === 0 ? 'font-bold text-[#111722]' : ''}`}>
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminControlCenterView() {
  const [adminGateAuthed, setAdminGateAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/auth/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then((data: { authenticated?: boolean } | null) => {
        if (!cancelled) setAdminGateAuthed(Boolean(data?.authenticated))
      })
      .catch(() => {
        if (!cancelled) setAdminGateAuthed(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  if (adminGateAuthed === null) return null
  if (!adminGateAuthed) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Zugriff nur mit Anmeldung</h1>
        <p className="mt-2 text-sm opacity-80">Der Admin-Bereich von smyst.com ist geschützt. Bitte melde dich zuerst an.</p>
      </div>
    )
  }
  return <AdminControlCenterInner />
}

function AdminControlCenterInner() {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [adminOverview, setAdminOverview] = useState<AdminOverviewApi | null>(null)
  const [adminBackendStatus, setAdminBackendStatus] = useState<'loading' | 'live' | 'denied' | 'offline'>('loading')
  const [adminMfaStatus, setAdminMfaStatus] = useState<AdminMfaStatusApi | null>(null)
  const [adminMfaCode, setAdminMfaCode] = useState('')
  const [adminMfaMessage, setAdminMfaMessage] = useState<string | null>(null)
  const [adminMfaSubmitting, setAdminMfaSubmitting] = useState(false)
  const [storageCapabilities, setStorageCapabilities] = useState<StorageCapabilitiesApi | null>(null)
  const [computeCapabilities, setComputeCapabilities] = useState<ComputeCapabilitiesApi | null>(null)
  const [computeJobs, setComputeJobs] = useState<ComputeJobsApi | null>(null)
  const [computeRuntime, setComputeRuntime] = useState<ComputeRuntimeApi | null>(null)
  const [computeWakeBusy, setComputeWakeBusy] = useState(false)

  const refreshAdminOverview = useCallback(() => {
    let alive = true
    setAdminBackendStatus('loading')
    fetch('/api/admin/overview', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        if (response.ok && payload?.ok) {
          setAdminOverview(payload as AdminOverviewApi)
          setAdminBackendStatus('live')
        } else {
          setAdminOverview(null)
          setAdminBackendStatus(response.status === 401 || response.status === 403 ? 'denied' : 'offline')
        }
      })
      .catch(() => {
        if (!alive) return
        setAdminOverview(null)
        setAdminBackendStatus('offline')
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return refreshAdminOverview()
  }, [refreshAdminOverview])

  useEffect(() => {
    let alive = true
    fetch('/auth/admin-2fa/status', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        setAdminMfaStatus(response.ok && payload?.ok ? payload as AdminMfaStatusApi : null)
      })
      .catch(() => {
        if (!alive) return
        setAdminMfaStatus(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/storage/capabilities', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        setStorageCapabilities(response.ok && payload?.ok ? payload as StorageCapabilitiesApi : null)
      })
      .catch(() => {
        if (!alive) return
        setStorageCapabilities(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/compute/capabilities', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        setComputeCapabilities(response.ok && payload?.ok ? payload as ComputeCapabilitiesApi : null)
      })
      .catch(() => {
        if (!alive) return
        setComputeCapabilities(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/compute/jobs', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        setComputeJobs(response.ok && payload?.ok ? payload as ComputeJobsApi : null)
      })
      .catch(() => {
        if (!alive) return
        setComputeJobs(null)
      })
    return () => {
      alive = false
    }
  }, [adminOverview?.mode])

  const refreshComputeRuntime = useCallback(() => {
    let alive = true
    fetch('/api/admin/compute/runtime', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!alive) return
        setComputeRuntime(response.ok && payload?.ok ? payload as ComputeRuntimeApi : null)
      })
      .catch(() => {
        if (!alive) return
        setComputeRuntime(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return refreshComputeRuntime()
  }, [refreshComputeRuntime, adminOverview?.mode])

  const wakeComputeRuntime = async () => {
    setComputeWakeBusy(true)
    try {
      const response = await fetch('/api/admin/compute/runtime', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-smyst-csrf': '1' },
      })
      const payload = await response.json().catch(() => ({}))
      setComputeRuntime(response.ok && payload?.ok ? payload as ComputeRuntimeApi : null)
      refreshAdminOverview()
    } catch {
      setComputeRuntime(null)
    } finally {
      setComputeWakeBusy(false)
    }
  }

  const verifyAdminMfa = async () => {
    const code = adminMfaCode.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(code)) {
      setAdminMfaMessage('Bitte gib einen 6-stelligen Authenticator-Code ein.')
      return
    }
    setAdminMfaSubmitting(true)
    setAdminMfaMessage(null)
    try {
      const response = await fetch('/auth/admin-2fa/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ code }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.ok) {
        const message = typeof payload?.error?.message === 'string'
          ? payload.error.message
          : 'Admin-2FA konnte nicht verifiziert werden.'
        throw new Error(message)
      }
      setAdminMfaStatus((current) => current ? { ...current, verified: true, expiresAt: payload.expiresAt ?? current.expiresAt } : current)
      setAdminMfaCode('')
      setAdminMfaMessage('Admin-2FA aktiv. Admin-Daten werden neu geladen.')
      refreshAdminOverview()
    } catch (err) {
      setAdminMfaMessage(err instanceof Error ? err.message : 'Admin-2FA konnte nicht verifiziert werden.')
    } finally {
      setAdminMfaSubmitting(false)
    }
  }

  const formatCents = (value?: number) => {
    const amount = (value ?? 0) / 100
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  const overviewMetrics: AdminMetric[] = [
    {
      label: 'Live Nutzer',
      value: adminOverview?.metrics?.usersSeen !== undefined ? String(adminOverview.metrics.usersSeen) : '18.4M',
      detail: adminOverview ? `${adminOverview.metrics?.blockedUsers ?? 0} blockiert, KV-User sichtbar.` : 'Web, PWA, iPhone, Android und API zusammen.',
      tone: 'green',
    },
    { label: 'Chat Start', value: '142 ms', detail: 'Ziel: Chat sofort offen, Streaming sofort sichtbar.', tone: 'cyan' },
    {
      label: 'Ad Revenue',
      value: adminOverview ? formatCents(adminOverview.metrics?.validRevenueCents) : '$248K',
      detail: 'Nur gültige Anzeigenumsätze nach Policy-Filter.',
      tone: 'amber',
    },
    {
      label: 'User Share',
      value: adminOverview ? formatCents(adminOverview.metrics?.userShareCents) : '$62K',
      detail: `${adminOverview?.metrics?.userSharePercent ?? 25} % Pool für genutzte AI-Profile.`,
      tone: 'green',
    },
  ]

  const users: AdminRow[] = [
    { User: 'amina@smyst', Status: 'aktiv', Risiko: 'niedrig', Registriert: 'Web / DE', 'AI-Profile': '12 Twins', Umsatz: '$842', Aktion: 'Details' },
    { User: 'leo@smyst', Status: 'review', Risiko: 'mittel', Registriert: 'PWA / US', 'AI-Profile': '3 Twins', Umsatz: '$128', Aktion: 'Prüfen' },
    { User: 'botnet-44', Status: 'hold', Risiko: 'hoch', Registriert: 'API / unknown', 'AI-Profile': '0 Twins', Umsatz: '$0', Aktion: 'Block' },
    { User: 'sara@smyst', Status: 'aktiv', Risiko: 'niedrig', Registriert: 'iPhone / FR', 'AI-Profile': '1 Twin', Umsatz: '$2,405', Aktion: 'Pay' },
    { User: 'max@smyst', Status: 'gesperrt', Risiko: 'hoch', Registriert: 'Android / DE', 'AI-Profile': '6 Twins', Umsatz: '$0', Aktion: 'Appeal' },
  ]

  const profileRevenue: AdminRow[] = [
    { Profil: 'Einstein', Chats: '12.8M', Qualität: '94', 'Ad RPM': '$3.20', 'gültiger Umsatz': '$40,960', '25 % Anteil': '$10,240', Status: 'payable' },
    { Profil: 'Fitness Coach', Chats: '8.1M', Qualität: '88', 'Ad RPM': '$2.70', 'gültiger Umsatz': '$21,870', '25 % Anteil': '$5,467', Status: 'review' },
    { Profil: 'Deutsch Tutor', Chats: '6.4M', Qualität: '91', 'Ad RPM': '$3.90', 'gültiger Umsatz': '$24,960', '25 % Anteil': '$6,240', Status: 'payable' },
    { Profil: 'Crypto Guru', Chats: '3.9M', Qualität: '62', 'Ad RPM': '$5.10', 'gültiger Umsatz': '$19,890', '25 % Anteil': 'hold', Status: 'policy' },
    { Profil: 'Recipe Helper', Chats: '2.2M', Qualität: '85', 'Ad RPM': '$2.10', 'gültiger Umsatz': '$4,620', '25 % Anteil': '$1,155', Status: 'payable' },
  ]

  const sectionTitle = adminSections.find((section) => section.id === activeSection)?.label ?? 'Overview'

  const renderLook = () => {
    const colors = [
      ['Ink', '#111722', 'Primary text, sidebar, premium contrast'],
      ['Sky', '#59c7ff', 'Primary action, live state, streaming'],
      ['Mint', '#43d17a', 'Success, safe status, payouts ready'],
      ['Amber', '#f7b733', 'Policy watch, review, warning'],
      ['Canvas', '#f7fafd', 'Admin surfaces and calm backgrounds'],
      ['Line', '#d9e2ec', 'Borders, tables, separators'],
    ]

    return (
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { label: 'Composer', value: 'locked', detail: 'Schreibbereich bleibt exakt im bisherigen Design mit bestehenden Icons.', tone: 'green' },
            { label: 'Layout', value: 'A-Z', detail: 'Ein konsistentes System für Web, PWA, iPhone und Android.', tone: 'cyan' },
            { label: 'A11y', value: 'AA+', detail: 'Kontrast, Fokus, Touch-Ziele und klare Zustände.', tone: 'green' },
            { label: 'Motion', value: 'subtle', detail: 'Streaming fühlt sich schnell an, ohne unruhig zu werden.', tone: 'amber' },
          ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
            <h2 className="text-xl font-bold text-[#111722]">Design Tokens</h2>
            <div className="mt-5 grid gap-3">
              {colors.map(([name, color, detail]) => (
                <div key={name} className="grid gap-3 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 sm:grid-cols-[88px_1fr]">
                  <span className="h-12 rounded-md border border-[#d9e2ec]" style={{ backgroundColor: color }} />
                  <div>
                    <p className="text-sm font-black text-[#111722]">{name} <span className="font-mono text-xs text-[#667085]">{color}</span></p>
                    <p className="mt-1 text-sm font-semibold text-[#5d6776]">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
            <h2 className="text-xl font-bold text-[#111722]">UI Regeln</h2>
            <div className="mt-5 grid gap-3">
              {[
                ['Chat Composer', 'Nicht verändern: gleiche Position, gleiche Icons, gleiche Bedienlogik.'],
                ['Kinderleicht', 'Jede Hauptaktion braucht einen klaren Primärbutton und sofortige Rückmeldung.'],
                ['Dichte', 'Admin bleibt dicht, scanbar und arbeitsorientiert statt Marketing-Layout.'],
                ['Fehler', 'Jede Fehlermeldung sagt Ursache, Status und nächste Aktion.'],
                ['Mobile', 'Keine überlappenden Texte, keine Layoutsprünge, Touch-Ziele mindestens 44px.'],
                ['Future Platforms', 'Tokens und Komponenten müssen auf neue Oberflächen übertragbar bleiben.'],
              ].map(([label, detail]) => (
                <div key={label} className="grid gap-2 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 sm:grid-cols-[160px_1fr]">
                  <AdminStatusChip tone="cyan">{label}</AdminStatusChip>
                  <p className="text-sm font-bold text-[#172033]">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    )
  }

  const renderOverview = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {overviewMetrics.map((metric) => <AdminMetricCard key={metric.label} metric={metric} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-2xl font-bold text-[#111722]">Heute wichtig</h2>
          <div className="mt-5 grid gap-3">
            {[
              ['AdSense Policy', 'Mobile-Abstand prüfen', 'amber'],
              ['Invalid Traffic', '0.18 % verdächtig, Auto-Hold aktiv', 'green'],
              ['Registrierungen', '+42 % durch Creator-Profile', 'cyan'],
              ['Salad Queue', 'Suche und Embeddings normal', 'green'],
            ].map(([label, detail, tone]) => (
              <div key={label} className="grid gap-2 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 sm:grid-cols-[190px_1fr]">
                <AdminStatusChip tone={tone as AdminMetric['tone']}>{label}</AdminStatusChip>
                <p className="text-sm font-semibold text-[#5d6776]">{detail}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-2xl font-bold text-[#111722]">A-Z Abdeckung</h2>
          <div className="mt-5 grid gap-3">
            {[
              'Users sperren, prüfen, Rollen ändern',
              'Profile/Twins messen und monetarisieren',
              'AdSense Slots, Consent, Invalid-Traffic',
              'Auszahlungen, KYC, Steuerstatus',
              'IDrive E2, Salad, DNS, Releases, Logs',
            ].map((item) => (
              <div key={item} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3">
                <AdminStatusChip>integriert</AdminStatusChip>
                <p className="text-sm font-bold text-[#172033]">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  const renderUsers = () => (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {['Alle', 'Neu', 'Creator', 'Verdächtig', 'Gesperrt', 'VIP', 'Auszahlung offen'].map((filter, index) => (
          <button key={filter} type="button" className={`min-h-10 rounded-md border px-4 text-sm font-bold ${index === 0 ? 'border-[#111722] bg-[#111722] text-white' : 'border-[#d9e2ec] bg-white text-[#172033]'}`}>
            {filter}
          </button>
        ))}
      </div>
      <AdminTable columns={['User', 'Status', 'Risiko', 'Registriert', 'AI-Profile', 'Umsatz', 'Aktion']} rows={users} />
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">User-Aktionen</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {['Soft Warnung', 'Login sperren', 'Chat sperren', 'Upload sperren', 'Payout halten', 'Daten exportieren', 'DSGVO löschen', 'Appeal prüfen'].map((action) => (
            <button key={action} type="button" className="min-h-11 rounded-md border border-[#d9e2ec] bg-[#f7fafd] px-3 text-sm font-bold text-[#172033]">
              {action}
            </button>
          ))}
        </div>
      </section>
    </div>
  )

  const renderRegistrations = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Neue Nutzer', value: '482K', detail: 'Heute, nach Bot-Filter.', tone: 'green' },
          { label: 'Aktivierung', value: '71 %', detail: 'Erster Chat in 60 Sekunden.', tone: 'cyan' },
          { label: 'Bot-Block', value: '38K', detail: 'Rate-limit, Device-Fingerprint, CAPTCHA.', tone: 'amber' },
          { label: 'Kosten/User', value: '$0.013', detail: 'Compute, Storage und Index.', tone: 'green' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Funnel</h2>
          {[
            ['Landing', '100 %', 'w-full'],
            ['Signup', '74 %', 'w-[74%]'],
            ['Verify', '69 %', 'w-[69%]'],
            ['First chat', '61 %', 'w-[61%]'],
            ['Profile created', '34 %', 'w-[34%]'],
          ].map(([label, value, width]) => (
            <div key={label} className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm font-bold text-[#172033]"><span>{label}</span><span>{value}</span></div>
              <div className="h-3 rounded-md bg-[#e8eef5]"><div className={`h-3 rounded-md bg-[#59c7ff] ${width}`} /></div>
            </div>
          ))}
        </section>
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Onboarding muss idiotensicher sein</h2>
          <div className="mt-4 grid gap-3">
            {['1 Klick: Chat sofort starten', 'Später registrieren, wenn Nutzer Wert sieht', 'Profil-Erstellung in 3 Schritten', 'Upload/Memory mit klarer Datenschutz-Frage', 'Jede Fehlermeldung hat eine Lösungsschaltfläche'].map((item) => (
              <div key={item} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3">
                <AdminStatusChip tone="cyan">Pflicht</AdminStatusChip>
                <span className="text-sm font-bold text-[#172033]">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  const renderProfiles = () => (
    <div className="grid gap-5">
      <AdminTable columns={['Profil', 'Chats', 'Qualität', 'Ad RPM', 'gültiger Umsatz', '25 % Anteil', 'Status']} rows={profileRevenue} />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Ranking-Logik</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#5d6776]">Nutzung zählt nur, wenn Session echt ist, Ad-Impression gültig ist, Profil nicht gegen Policy verstößt und der Nutzer dem Revenue-Share zugestimmt hat.</p>
        </section>
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Profil-Qualität</h2>
          {[
            ['Antwortqualität', 'w-[92%]', 'bg-emerald-500'],
            ['Sicherheitsrisiko', 'w-[28%]', 'bg-amber-400'],
            ['Quellenqualität', 'w-[88%]', 'bg-sky-400'],
            ['Nutzerzufriedenheit', 'w-[91%]', 'bg-emerald-500'],
          ].map(([label, width, color]) => (
            <div key={label} className="mt-4">
              <p className="mb-1 text-sm font-bold text-[#172033]">{label}</p>
              <div className="h-3 rounded-md bg-[#e8eef5]"><div className={`h-3 rounded-md ${color} ${width}`} /></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )

  const renderAds = () => (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">Web Layout mit Werbeplätzen</h2>
        <div className="mt-5 rounded-lg border border-[#d9e2ec] bg-[#f7fafd] p-5">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700">Anzeige oben / native</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="rounded-md border border-[#d9e2ec] bg-white p-5">
              <p className="text-lg font-bold text-[#111722]">Chat Antwort</p>
              <p className="mt-2 text-sm font-semibold text-[#5d6776]">Keine Anzeige im Schreibbereich</p>
            </div>
            <div className="grid min-h-[128px] place-items-center rounded-md border border-amber-300 bg-amber-50 text-2xl font-bold text-amber-600">Ad</div>
          </div>
          <div className="mt-5 rounded-md border border-[#d9e2ec] bg-white px-4 py-3 text-sm font-semibold text-[#7b8493]">Nachricht schreiben</div>
        </div>
      </section>
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">AdSense Schutzregeln</h2>
        <div className="mt-5 grid gap-3">
          {[
            ['Label', 'Anzeige klar kennzeichnen', 'green'],
            ['Distance', 'Abstand zu Buttons und Composer', 'green'],
            ['Consent', 'EU/UK Datenschutz vor Laden', 'green'],
            ['Invalid Traffic', 'Klick-Muster, Bots, Freunde-Klicks filtern', 'amber'],
            ['Performance', 'Lazy-load, keine Layoutsprünge', 'green'],
            ['Hold', 'Verdächtige Einnahmen nicht auszahlen', 'green'],
          ].map(([label, detail, tone]) => (
            <div key={label} className="grid gap-2 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 sm:grid-cols-[160px_1fr]">
              <AdminStatusChip tone={tone as AdminMetric['tone']}>{label}</AdminStatusChip>
              <p className="text-sm font-bold text-[#172033]">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderRevenue = () => (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <p className="text-xl font-bold text-[#111722]">Formel</p>
        <p className="mt-3 text-2xl font-bold text-emerald-600 md:text-3xl">User-Anteil = gültiger AdSense-Umsatz eines Profils x 25 %</p>
        <p className="mt-2 text-sm font-semibold text-[#5d6776]">Beispiel: $40,960 gültiger Profil-Umsatz x 0.25 = $10,240 Auszahlung an Profilinhaber.</p>
      </section>
      <AdminTable columns={['Profil', 'Chats', 'Qualität', 'Ad RPM', 'gültiger Umsatz', '25 % Anteil', 'Status']} rows={profileRevenue} />
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-[#172033]">Auszahlung erst nach Finalisierung, Invalid-Traffic-Abzug, Mindestbetrag, KYC/Steuerprüfung und Admin-Freigabe.</div>
    </div>
  )

  const renderModerationSecurity = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Abuse Queue', value: '1,284', detail: 'Spam, Prompt Injection, gefährliche Inhalte.', tone: 'amber' },
          { label: 'Invalid Ads', value: '0.18 %', detail: 'Verdächtige Klicks und Trafficquellen.', tone: 'green' },
          { label: 'Audit Events', value: '9.2M', detail: 'Jede Änderung revisionssicher.', tone: 'cyan' },
          { label: 'Privacy Requests', value: '742', detail: 'Export, Löschung, Korrektur.', tone: 'green' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <AdminTable columns={['Fall', 'Risiko', 'Quelle', 'Grund', 'Owner', 'Aktion']} rows={[
        { Fall: 'A-30941', Risiko: 'hoch', Quelle: 'Chat', Grund: 'Policy / Selbstschaden', Owner: 'Trust', Aktion: 'Escalate' },
        { Fall: 'AD-8821', Risiko: 'mittel', Quelle: 'Ad Click', Grund: 'Invalid pattern', Owner: 'Ads', Aktion: 'Hold' },
        { Fall: 'U-1180', Risiko: 'hoch', Quelle: 'Signup', Grund: 'Bot cluster', Owner: 'Security', Aktion: 'Block' },
        { Fall: 'P-7754', Risiko: 'mittel', Quelle: 'Twin', Grund: 'Copyright claim', Owner: 'Legal', Aktion: 'Review' },
        { Fall: 'D-204', Risiko: 'niedrig', Quelle: 'DSGVO', Grund: 'Data export', Owner: 'Privacy', Aktion: 'Send' },
      ]} />
    </div>
  )

  const renderStorage = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'IDrive E2', value: '14.8 PB', detail: '99 % Storage, Backups, Uploads, Medien.', tone: 'green' },
          { label: 'Salad', value: '62K Jobs', detail: 'Compute, API, KI, Suche, Cronjobs.', tone: 'cyan' },
          { label: 'GitHub', value: '42 repos', detail: 'Code und Versionierung only.', tone: 'navy' },
          { label: 'Spaceship', value: 'healthy', detail: 'Domain und DNS.', tone: 'amber' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Workloads + Jobs</h2>
          {[
            ['API inference', 'w-[72%]', 'bg-sky-400'],
            ['Search indexing', 'w-[44%]', 'bg-emerald-500'],
            ['Embedding builds', 'w-[61%]', 'bg-amber-400'],
            ['Media processing', 'w-[37%]', 'bg-emerald-500'],
            ['Backups', 'w-[29%]', 'bg-emerald-500'],
          ].map(([label, width, color]) => (
            <div key={label} className="mt-4">
              <p className="mb-1 text-sm font-bold text-[#172033]">{label}</p>
              <div className="h-3 rounded-md bg-[#e8eef5]"><div className={`h-3 rounded-md ${color} ${width}`} /></div>
            </div>
          ))}
        </section>
        <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
          <h2 className="text-xl font-bold text-[#111722]">Release Safety</h2>
          <div className="mt-4 grid gap-3">
            {['Canary 1 %', 'Crash-free 99.98 %', 'Rollback-Paket auf IDrive E2', 'App/PWA Offline-Dateien', 'Audit + Fehlerberichte'].map((item) => (
              <div key={item} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3">
                <AdminStatusChip>OK</AdminStatusChip>
                <span className="text-sm font-bold text-[#172033]">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  const renderSupport = () => (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <AdminTable columns={['Queue', 'Count', 'Owner', 'SLA', 'Aktion']} rows={[
        { Queue: 'Offene Tickets', Count: '4,280', Owner: 'Support', SLA: '92 %', Aktion: 'Priorisieren' },
        { Queue: 'VIP Eskalationen', Count: '48', Owner: 'Support Lead', SLA: '99 %', Aktion: 'Sofort' },
        { Queue: 'Payout Fragen', Count: '382', Owner: 'Finance', SLA: '88 %', Aktion: 'Prüfen' },
        { Queue: 'Bug Reports', Count: '1,204', Owner: 'QA', SLA: '91 %', Aktion: 'Triagieren' },
      ]} />
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">Admin Rollen</h2>
        <div className="mt-4 grid gap-2">
          {['Super Admin', 'Trust & Safety', 'Finance', 'Support', 'Release Manager', 'Read-only Auditor'].map((role) => (
            <button key={role} type="button" className="min-h-11 rounded-md border border-[#d9e2ec] bg-[#f7fafd] px-3 text-left text-sm font-bold text-[#172033]">
              {role}
            </button>
          ))}
        </div>
      </section>
    </div>
  )

  const renderFinance = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Payable', value: '$62K', detail: '25 % User-Anteil nach Validierung.', tone: 'green' },
          { label: 'On Hold', value: '$8.4K', detail: 'Policy, KYC oder Invalid-Traffic offen.', tone: 'amber' },
          { label: 'KYC Ready', value: '91 %', detail: 'Auszahlbare Creator mit vollständigem Profil.', tone: 'cyan' },
          { label: 'Tax Queue', value: '318', detail: 'Steuerdaten, Rechnungen und Export.', tone: 'navy' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <AdminTable columns={['User', 'Profil', 'gültiger Umsatz', '25 % Anteil', 'KYC', 'Tax', 'Aktion']} rows={[
        { User: 'sara@smyst', Profil: 'Deutsch Tutor', 'gültiger Umsatz': '$24,960', '25 % Anteil': '$6,240', KYC: 'ready', Tax: 'ready', Aktion: 'Pay batch' },
        { User: 'amina@smyst', Profil: 'Einstein', 'gültiger Umsatz': '$40,960', '25 % Anteil': '$10,240', KYC: 'ready', Tax: 'pending', Aktion: 'Tax check' },
        { User: 'team@smyst', Profil: 'Fitness Coach', 'gültiger Umsatz': '$21,870', '25 % Anteil': '$5,467', KYC: 'review', Tax: 'ready', Aktion: 'Review' },
        { User: 'hold@smyst', Profil: 'Crypto Guru', 'gültiger Umsatz': '$19,890', '25 % Anteil': 'hold', KYC: 'blocked', Tax: 'missing', Aktion: 'Policy hold' },
      ]} />
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">Auszahlungsregeln</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            'Nur finaler, gültiger AdSense-Umsatz wird geteilt.',
            'Profilinhaber erhalten 25 % pro genutztem AI-Profil.',
            'Invalid Traffic, Policy Claims und Refunds gehen vor Auszahlung ab.',
            'KYC, Steuerstatus, Mindestbetrag und Admin-Freigabe sind Pflicht.',
            'Jede Auszahlung erzeugt Audit-Log, Export und IDrive-e2-Beleg.',
            'User sieht transparent: Impressionen, Abzüge, Anteil und Status.',
          ].map((item) => (
            <div key={item} className="rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 text-sm font-bold text-[#172033]">{item}</div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderAiQuality = () => {
    const routerRows = [
      ['Fast Chat', '89 %', '#43d17a', 'Sofortantwort, niedrige Kosten'],
      ['Deep Reasoning', '41 %', '#59c7ff', 'Komplexe Aufgaben, längere Kontexte'],
      ['RAG Verified', '68 %', '#f7b733', 'Quellengebundene Antworten'],
      ['Safety Rewrite', '12 %', '#ef4444', 'Policy, Risiko, sensible Inhalte'],
    ]

    return (
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { label: 'Answer p95', value: '1.2 s', detail: 'Streaming sofort sichtbar, Antwort bleibt flüssig.', tone: 'green' },
            { label: 'Quality Score', value: '93', detail: 'Eval, Nutzerfeedback, Quellenabgleich.', tone: 'cyan' },
            { label: 'RAG Freshness', value: '11 m', detail: 'Index und Embeddings frisch gehalten.', tone: 'green' },
            { label: 'Safety Holds', value: '0.7 %', detail: 'Unsichere Antworten werden gestoppt oder umgeschrieben.', tone: 'amber' },
          ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
            <h2 className="text-xl font-bold text-[#111722]">Model Router</h2>
            {routerRows.map(([label, value, color, detail]) => (
              <div key={label} className="mt-4">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm font-bold text-[#172033]">
                  <span>{label}</span>
                  <span>{detail}</span>
                </div>
                <div className="h-3 rounded-md bg-[#e8eef5]">
                  <div className="h-3 rounded-md" style={{ width: value, backgroundColor: color }} />
                </div>
              </div>
            ))}
          </section>
          <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
            <h2 className="text-xl font-bold text-[#111722]">Qualitäts-Prüfungen</h2>
            <div className="mt-5 grid gap-3">
              {[
                ['Eval Suites', 'Regression gegen ChatGPT, Gemini, Claude, Grok und Open-Model Benchmarks.'],
                ['Prompt Library', 'Versionierte Systemprompts in IDrive e2, Code in GitHub.'],
                ['RAG Guardrails', 'Quellenpflicht, Halluzinationsscore, Zitierbarkeit.'],
                ['Memory Safety', 'Profilwissen getrennt, verschlüsselt und exportierbar.'],
                ['Latency Budget', 'Vorberechnung, Cache, Queue und Fallback pro Intent.'],
              ].map(([label, detail]) => (
                <div key={label} className="grid gap-2 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3 sm:grid-cols-[160px_1fr]">
                  <AdminStatusChip tone="green">{label}</AdminStatusChip>
                  <p className="text-sm font-bold text-[#172033]">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    )
  }

  const renderIdrive = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Public CDN', value: 'cdn.', detail: 'Assets, PWA, Downloads, SEO-Dateien.', tone: 'green' },
          { label: 'Private', value: 'signed', detail: 'Uploads, Archive, Profilwissen, Backups.', tone: 'cyan' },
          { label: 'Immutable', value: 'releases', detail: 'Builds, APK/AAB/IPA, Rollbacks.', tone: 'navy' },
          { label: 'Encrypted', value: 'backups', detail: 'DB, Audit, RAG, Suchindex, Fehlerberichte.', tone: 'amber' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <AdminTable columns={['Bucket/Pfad', 'Inhalt', 'Zugriff', 'Retention', 'Owner']} rows={[
        { 'Bucket/Pfad': 'public/assets/', Inhalt: 'statische App-Dateien, Bilder, CSS, JSON', Zugriff: 'public/CDN', Retention: 'versioniert', Owner: 'Release' },
        { 'Bucket/Pfad': 'media/profiles/', Inhalt: 'Profilbilder, Thumbnails, Vorschauen', Zugriff: 'signed/public mix', Retention: 'lifecycle', Owner: 'Product' },
        { 'Bucket/Pfad': 'private/uploads/', Inhalt: 'User Uploads, PDFs, Audio, Videos', Zugriff: 'signed URL', Retention: 'policy', Owner: 'Storage' },
        { 'Bucket/Pfad': 'ai/rag/', Inhalt: 'RAG docs, embeddings, prompt files', Zugriff: 'private', Retention: 'versioniert', Owner: 'AI' },
        { 'Bucket/Pfad': 'audit/backups/', Inhalt: 'Logs, Exporte, Fehlerberichte, Rollbacks', Zugriff: 'private encrypted', Retention: 'compliance', Owner: 'Security' },
      ]} />
      <section className="rounded-lg border border-[#d9e2ec] bg-white p-5">
        <h2 className="text-xl font-bold text-[#111722]">Nicht in IDrive e2</h2>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-[#5d6776]">
          Login, Live-Datenbank, Sessions, Zahlungen, Rechteprüfung, Echtzeit-Chat, KI-Antworten und serverseitige Logik laufen nicht direkt in IDrive e2. Diese Aufgaben gehen über API/Compute, während Ergebnisse wieder nach IDrive e2 gespeichert werden.
        </p>
      </section>
    </div>
  )

  const renderSalad = () => {
    const config = computeCapabilities?.configuration ?? adminOverview?.computePlan
    const missing = config?.missing ?? []
    const ready = Boolean(config?.ready)
    const latency = computeCapabilities?.latencyBudgetMs
    const status = ready ? 'ready' : 'blocked'
    const queue = computeJobs?.summary ?? adminOverview?.computeQueue
    const runtime = computeRuntime?.runtime
    const runtimeStatus = runtime?.container.status ?? 'checking'
    const runtimeOperational = Boolean(runtime?.operational)
    const runtimeCounts = runtime?.container.counts
    const healthStatus = runtime?.health.status ? String(runtime.health.status) : 'pending'
    const jobRows: AdminRow[] = computeJobs?.jobs.length
      ? computeJobs.jobs.slice(0, 10).map((job) => ({
          Job: job.type,
          Ziel: job.target,
          Status: job.status,
          Provider: job.provider,
          Versuche: `${job.attempts}/${job.maxAttempts}`,
          Fehler: job.lastError ?? '-',
        }))
      : [
          { Job: 'KI Antwort', Ziel: 'chat/archive/', Status: ready ? 'salad-ready' : 'blocked', Provider: 'salad', Versuche: '0/3', Fehler: ready ? '-' : 'compute_not_ready' },
          { Job: 'Embedding Build', Ziel: 'ai/embeddings/', Status: ready ? 'salad-ready' : 'blocked', Provider: 'salad', Versuche: '0/3', Fehler: missing.length ? 'compute_not_configured' : '-' },
          { Job: 'Upload Scan', Ziel: 'private/uploads/', Status: ready ? 'salad-ready' : 'blocked', Provider: 'salad', Versuche: '0/3', Fehler: missing.length ? 'compute_not_configured' : '-' },
        ]

    return (
      <div className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { label: 'Compute Status', value: status, detail: ready ? 'Salad kann schwere Jobs übernehmen.' : 'Salad muss noch vollständig bereit sein.', tone: ready ? 'green' : 'amber' },
            { label: 'Runtime', value: runtimeOperational ? 'running' : runtimeStatus, detail: runtimeCounts ? `${runtimeCounts.running} running, ${runtimeCounts.allocating} allocating, ${runtimeCounts.creating} creating` : 'Salad Runtime wird geprüft.', tone: runtimeOperational ? 'green' : runtimeStatus === 'deploying' ? 'amber' : ready ? 'cyan' : 'red' },
            { label: 'Queue', value: queue ? String(queue.queued + queue.running) : '0', detail: queue ? `${queue.running} running, ${queue.failed} failed, ${queue.retryable} retry` : 'Noch keine Jobs im Ledger.', tone: queue?.failed ? 'red' : 'cyan' },
            { label: 'Missing', value: missing.length ? String(missing.length) : '0', detail: missing.length ? missing.join(', ') : 'Keine Compute-Blocker.', tone: missing.length ? 'red' : 'green' },
          ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { label: 'Health', value: healthStatus, detail: runtime?.health.ok ? runtime.health.service ?? 'Worker antwortet.' : runtime?.health.error ?? 'Health noch nicht bestätigt.', tone: runtime?.health.ok ? 'green' : 'amber' },
            { label: 'First Token', value: latency?.firstToken ? `${latency.firstToken} ms` : 'pending', detail: config?.streamingEnabled ? 'Streaming ist konfiguriert.' : 'Streaming wartet auf Compute.', tone: config?.streamingEnabled ? 'green' : 'amber' },
            { label: 'Leases', value: queue ? String(queue.running) : '0', detail: 'Aktive Compute-Worker-Leases.', tone: queue?.running ? 'cyan' : 'navy' },
            { label: 'Succeeded', value: queue ? String(queue.succeeded) : '0', detail: 'Erfolgreich abgeschlossene Jobs.', tone: 'green' },
          ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          {[
            ['Queue', 'Priorität pro Aufgabe: Chat zuerst, danach Suche, Medien, Batch.'],
            ['Compute', ready ? 'Salad ist für stateless Rechenarbeit vorbereitet.' : 'Salad bleibt blockiert, bis API, Organisation, Projekt, Container Group und Secret gesetzt sind.'],
            ['Persist', 'Ergebnisse, Logs und Artefakte gehen nach IDrive e2 zurück.'],
          ].map(([title, detail]) => (
            <section key={title} className="rounded-lg border border-[#d9e2ec] bg-white p-5">
              <AdminStatusChip tone={title === 'Compute' && !ready ? 'amber' : title === 'Compute' ? 'cyan' : 'green'}>{title}</AdminStatusChip>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-[#5d6776]">{detail}</p>
              {title === 'Compute' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void wakeComputeRuntime()} disabled={computeWakeBusy || !ready}>
                    {computeWakeBusy ? 'Starte...' : 'Worker starten'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => refreshComputeRuntime()}>
                    Aktualisieren
                  </Button>
                  <span className="min-w-0 self-center text-xs font-bold text-[#5d6776]">
                    {runtime?.container.dns ? `${runtime.container.dns}:${runtime.container.port}` : 'DNS wird von Salad gemeldet.'}
                  </span>
                </div>
              )}
            </section>
          ))}
        </div>
        <AdminTable columns={['Job', 'Ziel', 'Status', 'Provider', 'Versuche', 'Fehler']} rows={jobRows} />
      </div>
    )
  }

  const renderApps = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Web', value: 'ready', detail: 'smyst.com und app.smyst.com als Hauptoberfläche.', tone: 'green' },
          { label: 'PWA', value: 'first', detail: 'Installierbar, offline fähig, schnelle Updates.', tone: 'cyan' },
          { label: 'iPhone', value: 'wrap', detail: 'Später Wrapper/native Shell mit gleicher API.', tone: 'amber' },
          { label: 'Android', value: 'wrap', detail: 'Später Play Store, Huawei und weitere Stores.', tone: 'amber' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <AdminTable columns={['Plattform', 'Status', 'Pflicht vor Launch', 'Updatequelle', 'Risiko']} rows={[
        { Plattform: 'Web', Status: 'laufend', 'Pflicht vor Launch': 'DNS, SSL, Cache, Monitoring', Updatequelle: 'GitHub release + IDrive assets', Risiko: 'niedrig' },
        { Plattform: 'PWA', Status: 'nächster Fokus', 'Pflicht vor Launch': 'Manifest, Service Worker, Offline UI', Updatequelle: 'assets.smyst.com', Risiko: 'mittel' },
        { Plattform: 'iPhone', Status: 'später', 'Pflicht vor Launch': 'App Review, Privacy Nutrition, Login', Updatequelle: 'IPA/TestFlight + IDrive build archive', Risiko: 'mittel' },
        { Plattform: 'Android', Status: 'später', 'Pflicht vor Launch': 'APK/AAB, Play Policy, Push', Updatequelle: 'AAB/APK + IDrive build archive', Risiko: 'mittel' },
        { Plattform: 'Future', Status: 'geplant', 'Pflicht vor Launch': 'Design tokens, API compatibility', Updatequelle: 'versionierte configs', Risiko: 'niedrig' },
      ]} />
    </div>
  )

  const renderChecklist = () => (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Mockup', value: '24 pages', detail: 'Start bis Ende als PDF und Long Image.', tone: 'green' },
          { label: 'Admin A-Z', value: '17 tabs', detail: 'Look, User, Ads, Finance, Storage, Apps.', tone: 'green' },
          { label: 'Live Checks', value: 'needed', detail: 'DNS, IDrive, Salad, Secrets, API.', tone: 'amber' },
          { label: 'Scale Plan', value: 'staged', detail: 'PWA zuerst, Compute nur bei Bedarf.', tone: 'cyan' },
        ].map((metric) => <AdminMetricCard key={metric.label} metric={metric as AdminMetric} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {[
          ['Produkt', ['Sofort-Chat', 'Composer unverändert', 'Profil/Twin Flow', 'Upload/Memory', 'Support/Privacy']],
          ['Admin', ['User sperren', 'Registrierungen prüfen', 'AdSense Regeln', '25 % Revenue Share', 'KYC/Tax/Payout']],
          ['Infrastruktur', ['Spaceship DNS', 'GitHub Code only', 'IDrive 99 % Storage', 'Salad Compute', 'Secrets getrennt']],
          ['Qualität', ['Mobile QA', 'Performance Budget', 'Security Audit', 'Rollback', 'Monitoring']],
        ].map(([group, items]) => (
          <section key={group as string} className="rounded-lg border border-[#d9e2ec] bg-white p-5">
            <h2 className="text-xl font-bold text-[#111722]">{group}</h2>
            <div className="mt-4 grid gap-3">
              {(items as string[]).map((item, index) => (
                <div key={item} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#edf2f7] bg-[#f7fafd] p-3">
                  <AdminStatusChip tone={index < 2 ? 'green' : 'amber'}>{index < 2 ? 'done' : 'verify'}</AdminStatusChip>
                  <span className="text-sm font-bold text-[#172033]">{item}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )

  const renderActiveSection = () => {
    if (activeSection === 'overview') return renderOverview()
    if (activeSection === 'look') return renderLook()
    if (activeSection === 'users') return renderUsers()
    if (activeSection === 'registrations') return renderRegistrations()
    if (activeSection === 'profiles') return renderProfiles()
    if (activeSection === 'aiQuality') return renderAiQuality()
    if (activeSection === 'ads') return renderAds()
    if (activeSection === 'revenue') return renderRevenue()
    if (activeSection === 'finance') return renderFinance()
    if (activeSection === 'moderation' || activeSection === 'security') return renderModerationSecurity()
    if (activeSection === 'storage' || activeSection === 'releases') return renderStorage()
    if (activeSection === 'idrive') return renderIdrive()
    if (activeSection === 'salad') return renderSalad()
    if (activeSection === 'apps') return renderApps()
    if (activeSection === 'checklist') return renderChecklist()
    return renderSupport()
  }

  return (
    <div className="smyst-admin-shell py-5 text-[#111722]">
      <div className="grid gap-5 lg:grid-cols-[272px_1fr]">
        <aside className="rounded-lg bg-[#111722] p-5 text-white lg:sticky lg:top-24 lg:max-h-[calc(100dvh-130px)] lg:overflow-y-auto">
          <div className="mb-6">
            <p className="font-smyst-logo text-3xl leading-none">smyst.com Admin</p>
            <p className="mt-2 text-sm font-semibold text-[#aeb6c4]">Global control</p>
          </div>
          <nav className="grid gap-2" aria-label="Admin Navigation">
            {adminSections.map((section) => {
              const selected = section.id === activeSection
              return (
                <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className={`flex min-h-[52px] items-center gap-3 rounded-md border px-3 text-left transition ${selected ? 'border-[#314158] bg-[#223044] text-white' : 'border-transparent bg-transparent text-[#c7cfda] hover:bg-white/[0.06]'}`}>
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${selected ? 'bg-[#59c7ff]' : 'bg-[#66758a]'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{section.label}</span>
                    <span className="block truncate text-xs font-semibold text-[#8996a8]">{section.detail}</span>
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>
        <section className="rounded-lg border border-[#d9e2ec] bg-[#f7fafd] p-4 shadow-sm sm:p-6">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#5d6776]">Admin Command Center</p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal text-[#111722] sm:text-4xl">{sectionTitle}</h1>
              <p className="mt-3 max-w-4xl text-base leading-relaxed text-[#5d6776]">
                Ein Kontrollzentrum für Milliarden-Nutzer-Betrieb: Look, User, AI-Profile, AdSense, 25 % Revenue Share, Finance, Sicherheit, IDrive e2, Salad, Apps, Support und Releases an einem Ort.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <AdminStatusChip tone={adminBackendStatus === 'live' ? 'green' : adminBackendStatus === 'denied' ? 'amber' : adminBackendStatus === 'loading' ? 'cyan' : 'red'}>
                {adminBackendStatus === 'live' ? 'Backend live' : adminBackendStatus === 'denied' ? 'Login/Rechte' : adminBackendStatus === 'loading' ? 'Backend check' : 'Backend offline'}
              </AdminStatusChip>
              <AdminStatusChip tone="amber">Policy watch</AdminStatusChip>
              <AdminStatusChip tone="cyan">Live data</AdminStatusChip>
            </div>
          </div>
          {adminMfaStatus?.required && !adminMfaStatus.verified && (
            <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Admin 2FA</p>
                  <h2 className="mt-1 text-xl font-bold text-[#111722]">Zweiter Faktor erforderlich</h2>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-[#5d6776]">
                    Admin-Daten bleiben gesperrt, bis ein frischer Authenticator-Code verifiziert wurde.
                    {!adminMfaStatus.configured && ' Für diesen Admin ist noch kein TOTP-Secret konfiguriert.'}
                    {adminMfaStatus.note ? ` ${adminMfaStatus.note}` : ''}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={adminMfaCode}
                    onChange={(event) => setAdminMfaCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    disabled={!adminMfaStatus.canVerify || adminMfaSubmitting}
                    className="min-h-11 rounded-md border border-amber-300 bg-white px-3 text-center text-lg font-black tracking-[0.18em] text-[#111722] outline-none focus:border-[#111722]"
                  />
                  <button
                    type="button"
                    onClick={() => void verifyAdminMfa()}
                    disabled={!adminMfaStatus.canVerify || adminMfaSubmitting}
                    className="min-h-11 rounded-md bg-[#111722] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#8892a0]"
                  >
                    {adminMfaSubmitting ? 'Prüfen' : 'Verifizieren'}
                  </button>
                  {adminMfaMessage && (
                    <p className="text-sm font-bold text-amber-800 sm:col-span-2">{adminMfaMessage}</p>
                  )}
                </div>
              </div>
            </section>
          )}
          <section className="mb-6 grid gap-3 rounded-lg border border-[#d9e2ec] bg-white p-4 lg:grid-cols-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">Admin API</p>
              <p className="mt-1 text-sm font-bold text-[#111722]">
                {adminBackendStatus === 'live'
                  ? adminOverview?.mode ?? 'salad-admin-control'
                  : adminBackendStatus === 'denied'
                    ? 'Admin-Session oder Rechte fehlen'
                    : adminBackendStatus === 'loading'
                      ? 'Prüfung läuft'
                      : 'API nicht erreichbar'}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">KV Ledger</p>
              <p className="mt-1 text-sm font-bold text-[#111722]">
                {adminOverview
                  ? `${adminOverview.metrics?.revenueProfiles ?? 0} Profile, ${adminOverview.metrics?.heldProfiles ?? 0} Holds`
                  : 'Wartet auf Live-Daten'}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">Speicherplan</p>
              <p className="mt-1 text-sm font-bold text-[#111722]">
                {storageCapabilities?.configuration
                  ? storageCapabilities.configuration.ready
                    ? `${storageCapabilities.provider ?? 'IDrive e2'} bereit`
                    : `IDrive e2 blockiert: ${(storageCapabilities.configuration.missing ?? []).join(', ')}`
                  : adminOverview?.storagePlan
                    ? `${adminOverview.storagePlan.metadata} + ${adminOverview.storagePlan.objects}`
                    : 'IDrive e2 + Salad API'}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">Compute</p>
              <p className="mt-1 text-sm font-bold text-[#111722]">
                {computeCapabilities?.configuration
                  ? computeCapabilities.configuration.ready
                    ? `${computeCapabilities.provider ?? 'Salad'} bereit`
                    : `Salad blockiert: ${(computeCapabilities.configuration.missing ?? []).join(', ')}`
                  : adminOverview?.computePlan
                    ? `${adminOverview.computePlan.mode ?? 'salad'}`
                    : 'Prüfung läuft'}
              </p>
            </div>
          </section>
          {storageCapabilities?.configuration && !storageCapabilities.configuration.ready && (
            <section className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">
              IDrive e2 ist noch nicht produktiv nutzbar. Fehlende Storage-Konfiguration:
              {' '}
              {(storageCapabilities.configuration.missing ?? []).join(', ')}.
              {' '}
              Uploads, Downloads, Backups, RAG-Dateien und Release-Objekte bleiben blockiert, bis diese Secrets gesetzt sind.
            </section>
          )}
          {computeCapabilities?.configuration && !computeCapabilities.configuration.ready && (
            <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              Salad Compute ist noch nicht produktiv aktiv. Fehlend:
              {' '}
              {(computeCapabilities.configuration.missing ?? []).join(', ')}.
              {' '}
              Chats bleiben blockiert, bis Salad API, Container Group und Secret gesetzt sind.
            </section>
          )}
          {renderActiveSection()}
        </section>
      </div>
    </div>
  )
}

// Dashboard View
function DashboardView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { lang } = useLanguage({ reloadOnChange: false })
  const t = useStaticTranslations(lang)
  const auth = useAuth()
  const isAuthenticated = auth.status === 'authenticated'
  const displayName = auth.user?.name || auth.user?.email?.split('@')[0] || 'zurück'
  const startActions: { key: string; title: string; subtitle: string; dot: string; target: AppView }[] = [
    { key: 'choose', title: 'Choose a Twin', subtitle: t.dashboard.actionChooseSubtitle, dot: '#59C7FF', target: 'my-twins' },
    { key: 'ask', title: 'Ask anything', subtitle: t.dashboard.actionAskSubtitle, dot: '#22c55e', target: 'twin-chat' },
    { key: 'create', title: 'Create Twin', subtitle: t.dashboard.actionCreateSubtitle, dot: '#f59e0b', target: 'twin-builder' },
  ]
  return (
    <div className="pt-[72px]">
      <div className="mb-8 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-[18px] sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.dashboard.heroTitle}</h2>
        <p className="mt-1 text-sm text-[#555b64] sm:text-base">{t.dashboard.heroSubtitle}</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {startActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => onNavigate(action.target)}
              className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/12 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white/20"
            >
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: action.dot }}></span>
              <span>
                <span className="block text-base font-semibold text-[#16181b]">{action.title}</span>
                <span className="block text-sm text-[#555b64]">{action.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-white/20 bg-white/8 p-4">
          <p className="text-base font-semibold text-[#16181b]">Private by default</p>
          <p className="mt-0.5 text-sm text-[#555b64]">
            {t.dashboard.privateByDefaultText}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">
          {isAuthenticated ? t.dashboard.welcomeBack.replace('{{name}}', displayName) : t.dashboard.readyTitle}
        </h1>
        <p className="text-base text-[#555b64]">
          {isAuthenticated
            ? t.dashboard.introAuthed
            : t.dashboard.introGuest}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('twin-chat')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">💬</div>
          <h3 className="mb-2 text-xl font-semibold">Twin Chat</h3>
          <p className="text-sm text-[#555b64]">{t.dashboard.cardChatText}</p>
        </Card>

        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('memory-upload')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(139,124,255,0.18)] text-2xl">📁</div>
          <h3 className="mb-2 text-xl font-semibold">Memory Upload</h3>
          <p className="text-sm text-[#555b64]">{t.dashboard.cardUploadText}</p>
        </Card>

        <Card className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => onNavigate('twin-builder')}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">⚙️</div>
          <h3 className="mb-2 text-xl font-semibold">{t.dashboard.cardSettingsTitle}</h3>
          <p className="text-sm text-[#555b64]">{t.dashboard.cardSettingsText}</p>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-semibold">{t.dashboard.activityTitle}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-white/12 p-3">
              <div>
                <p className="text-sm font-medium">{isAuthenticated ? t.dashboard.lastConversation : t.dashboard.conversations}</p>
                <p className="text-xs text-[#767d87]">{isAuthenticated ? t.dashboard.loadedFromHistory : t.dashboard.savableAfterLogin}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('twin-chat')}>{isAuthenticated ? t.dashboard.resume : t.dashboard.open}</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/12 p-3">
              <div>
                <p className="text-sm font-medium">{isAuthenticated ? 'Memories' : 'Memory Upload'}</p>
                <p className="text-xs text-[#767d87]">{isAuthenticated ? t.dashboard.manageUploads : t.dashboard.uploadAfterLogin}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('memory-upload')}>{t.dashboard.view}</Button>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-semibold">Twin Status</h3>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{t.dashboard.profileCompleteness}</span>
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
                <span className="text-sm font-medium">{t.dashboard.conversationQuality}</span>
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
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [expertiseText, setExpertiseText] = useState('')
  const [valuesText, setValuesText] = useState('')
  const [wisdomText, setWisdomText] = useState('')
  const [decisionText, setDecisionText] = useState('')
  const [style, setStyle] = useState<TwinStyle>('warm')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [savedTwin, setSavedTwin] = useState<TwinRecord | null>(null)
  const totalSteps = 4
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const trimmedDescription = description.trim()
  const parsedCategories = expertiseText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
  const publicationIssues = [
    !name.trim() && 'Name fehlt',
    trimmedDescription.length < 40 && 'Beschreibung mindestens 40 Zeichen',
    parsedCategories.length === 0 && 'Mindestens eine Kategorie',
    !profileImageUrl.trim() && 'Profilbild-URL erforderlich',
  ].filter(Boolean) as string[]
  const canPublish = publicationIssues.length === 0

  const handleCreateTwin = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || auth.status !== 'authenticated') return

    const twin = await twinMvp.createTwin({
      name: trimmedName,
      description: trimmedDescription,
      style,
      visibility: visibility === 'public' && canPublish ? 'public' : 'private',
      imageUrl: profileImageUrl.trim() || undefined,
      categories: parsedCategories.length ? parsedCategories : ['KI-Zwilling', 'Wissen', 'Erinnerungen'],
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
                Mit Google oder E-Mail fortfahren, damit dein Twin sicher deinem Account zugeordnet wird.
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
              <h2 className="mb-2 text-2xl font-semibold">Profilgrundlage</h2>
              <p className="text-sm text-[#555b64]">Name, Bild, Beschreibung und Themen bestimmen, ob ein KI-Profil klar erkennbar ist.</p>
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
                <label className="mb-2 block text-sm font-medium">Kurzbeschreibung</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Wer ist dieses KI-Profil, wofür steht es und wobei soll es helfen?"
                  className="w-full resize-none rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
                <p className="mt-1 text-xs text-[#767d87]">{trimmedDescription.length}/40 Zeichen für öffentliche Profile</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Expertise / Kategorien</label>
                <input
                  type="text"
                  value={expertiseText}
                  onChange={(event) => setExpertiseText(event.target.value)}
                  placeholder="z.B. Strategie, Finanzen, Marketing"
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
                <p className="mt-1 text-xs text-[#767d87]">Mehrere Kategorien mit Komma trennen.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Profilbild-URL</label>
                <input
                  type="text"
                  value={profileImageUrl}
                  onChange={(event) => setProfileImageUrl(event.target.value)}
                  placeholder="/storage/file/..."
                  className="w-full rounded-lg border border-white/42 bg-white/18 px-4 py-3 text-sm backdrop-blur-[18px] focus:border-[#59C7FF] focus:outline-none focus:ring-2 focus:ring-[#59C7FF]/20"
                />
                <p className="mt-1 text-xs text-[#767d87]">Für öffentliche Profile ist ein eigenes Profilbild erforderlich.</p>
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
                Twin "{savedTwin.name}" wurde gespeichert.
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
                <p className="mt-1 text-xs text-[#767d87]">Sichtbar erst mit Beschreibung, Kategorie, Sprache, Profilbild und fertigem Profil.</p>
              </label>
            </div>

            {visibility === 'public' && (
              <div className={`rounded-lg border p-4 text-sm ${canPublish ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800' : 'border-amber-400/40 bg-amber-50/70 text-amber-950'}`}>
                <p className="font-semibold">{canPublish ? 'Bereit für öffentliche Freigabe' : 'Noch nicht bereit für öffentliche Freigabe'}</p>
                <ul className="mt-2 grid gap-1">
                  {(publicationIssues.length ? publicationIssues : ['Alle Mindestanforderungen erfüllt']).map((issue) => (
                    <li key={issue}>- {issue}</li>
                  ))}
                </ul>
              </div>
            )}
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
            disabled={(step === totalSteps && (auth.status !== 'authenticated' || !name.trim() || (visibility === 'public' && !canPublish))) || twinMvp.loading}
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
  const uploadCategoryCounts = uploaded.reduce<Record<string, number>>((acc, file) => {
    acc[file.category] = (acc[file.category] ?? 0) + 1
    return acc
  }, {})

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
                <p className="mb-3 text-sm font-medium">Anmelden, um Dateien sicher hochzuladen.</p>
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
                    { name: 'Noch keine Datei hochgeladen', type: 'document', date: 'Bereit', status: 'processing' },
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
              {(['profile_image', 'image', 'audio', 'video', 'document', 'backup', 'twin_data'] as MemoryCategory[]).map((category) => (
                <div key={category} className="flex items-center justify-between rounded-lg bg-white/12 p-3">
                  <span className="text-sm font-medium">{category.replace('_', ' ')}</span>
                  <span className="text-xs font-semibold">{uploadCategoryCounts[category] ?? 0}</span>
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
function TwinChatView({
  initialTwinId = null,
  onNavigate,
}: {
  initialTwinId?: string | null
  onNavigate: (view: AppView) => void
}) {
  type TwinChatUiMessage = {
    id: string
    role: 'ai' | 'user'
    content: string
    streaming?: boolean
    speakable?: boolean
  }
  type ChatTwinSummary = {
    id: string
    slug?: string
    name: string
    style: TwinStyle
    knowledgeCount: number
    label: string
    publicProfile: boolean
    imageUrl?: string | null
    branch: string
    lifeLine: string
  }

  const privateTwinToChatSummary = (twin: TwinRecord): ChatTwinSummary => ({
    id: twin.id,
    slug: twin.slug,
    name: twin.name,
    style: twin.style,
    knowledgeCount: twin.knowledgeTexts.length,
    label: 'Eigener Twin',
    publicProfile: false,
    imageUrl: twin.imageUrl ?? null,
    branch: profileMainCategory(twin),
    lifeLine: profileLifeLine(twin),
  })

  const publicTwinToChatSummary = (profile: PublicTwinProfile): ChatTwinSummary => ({
    id: profile.slug,
    slug: profile.slug,
    name: profile.name,
    style: profile.style,
    knowledgeCount: profile.knowledgeCount,
    label: profile.categories[0] ?? 'Öffentliches Profil',
    publicProfile: true,
    imageUrl: profile.imageUrl,
    branch: profileMainCategory(profile),
    lifeLine: profileLifeLine(profile),
  })

  const [messages, setMessages] = useState<TwinChatUiMessage[]>([])
  const [input, setInput] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [activeTwin, setActiveTwin] = useState<ChatTwinSummary | null>(null)
  const [requestedTwinId] = useState(() => {
    const queryTwin = new URLSearchParams(window.location.search).get('twin')?.trim()
    return queryTwin || initialTwinId?.trim() || ''
  })
  const [isReplying, setIsReplying] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const liveVoiceDraftRef = useRef('')
  const liveVoiceSendTimerRef = useRef<number | null>(null)
  const { lang } = useLanguage({ reloadOnChange: false })
  const auth = useAuth()
  const twinMvp = useTwinMvp()
  const memoryUpload = useMemoryUpload()
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(false)
  const [voiceState, setVoiceState] = useState<SpeechRecognitionState>('idle')
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [composerNotice, setComposerNotice] = useState('')
  const [savedMemoryIds, setSavedMemoryIds] = useState<Set<string>>(() => new Set())
  const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteStatus, setNoteStatus] = useState('')

  const hasUserTurn = messages.some((message) => message.role === 'user')
  const latestAssistantText =
    [...messages].reverse().find((message) => message.role === 'ai' && message.speakable !== false && message.content.trim().length > 0)?.content ?? ''
  const pendingAttachmentCount = attachments.filter((attachment) => attachment.status === 'uploading').length
  const canSend =
    Boolean(activeTwin) &&
    (auth.status === 'authenticated' || Boolean(activeTwin?.publicProfile)) &&
    (input.trim().length > 0 || attachments.some((attachment) => attachment.status === 'uploaded' || attachment.status === 'ready')) &&
    !isReplying
  const canSpeak = latestAssistantText.length > 0 && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const initials = (activeTwin?.name ?? 'Smyst')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
  const suggestions = activeTwin
    ? [
        'Was ist mein wichtigster Lebensrat?',
        'Wie treffe ich schwierige Entscheidungen?',
        activeTwin.publicProfile ? `Was ist bei ${activeTwin.name} gut belegt?` : 'Was ist mir in Beziehungen wichtig?',
        activeTwin.publicProfile ? 'Welche Quellen nutzt du?' : 'Welche Erfahrungen prägen meine Sicht?',
      ]
    : []

  const readyMessage = (twin: ChatTwinSummary): TwinChatUiMessage => ({
    id: crypto.randomUUID(),
    role: 'ai',
    content: `Chat mit ${twin.name} ist bereit. Schreib deine Frage direkt.`,
    speakable: false,
  })

  const hasLegacyOrBrokenAssistantMessage = (chat: TwinChatRecord) =>
    chat.messages.some((message) => {
      if (message.role !== 'assistant') return false
      return /Ich antworte als|Profilperspektive|historische Linse|Meine Linse:|Chat konnte nicht gestartet werden|Keine Antwort vom Chat|API failed|Der Chat ist gerade nicht erreichbar/i.test(
        message.content,
      )
    })

  const restoreStoredChat = async (twin: ChatTwinSummary | null) => {
    if (!twin || auth.status !== 'authenticated') return
    const chats = await twinMvp.listTwinChats()
    const match = chats
      ?.filter((chat) =>
        twin.publicProfile
          ? chat.publicTwinSlug === twin.slug || chat.publicTwinSlug === twin.id
          : chat.twinId === twin.id,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (!match) return
    if (hasLegacyOrBrokenAssistantMessage(match)) {
      setChatId(null)
      setMessages([readyMessage(twin)])
      return
    }
    setChatId(match.id)
    if (match.messages.length) {
      setMessages(
        match.messages.map((message) => ({
          id: message.id,
          role: message.role === 'assistant' ? 'ai' : 'user',
          content: message.content,
        })),
      )
    } else {
      setMessages([readyMessage(twin)])
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  useEffect(() => {
    let alive = true
    if (auth.status === 'loading') return

    const loadRequestedTwin = async () => {
      if (requestedTwinId && auth.status === 'authenticated') {
        const twins = await twinMvp.listTwins()
        if (!alive) return
        const ownTwin = twins?.find((twin) => twin.id === requestedTwinId || twin.slug === requestedTwinId)
        if (ownTwin) {
          const summary = privateTwinToChatSummary(ownTwin)
          setActiveTwin(summary)
          await restoreStoredChat(summary)
          return
        }
      }

      if (requestedTwinId) {
        const publicTwin = await twinMvp.getPublicTwin(requestedTwinId) ?? curatedPublicProfileBySlug(requestedTwinId)
        if (!alive || !publicTwin) return
        const summary = publicTwinToChatSummary(publicTwin)
        setActiveTwin(summary)
        await restoreStoredChat(summary)
        setMessages((current) =>
          current.length === 0
            ? auth.status === 'authenticated'
              ? [readyMessage(summary)]
              : [
                  {
                    id: crypto.randomUUID(),
                    role: 'ai',
                    content: `${publicTwin.name} ist bereit. Schreib deine Frage direkt. Melde dich an, um den Verlauf zu speichern.`,
                    speakable: false,
                  },
                ]
            : current,
        )
        return
      }

      if (auth.status !== 'authenticated') return
      const twins = await twinMvp.listTwins()
      if (!alive) return
      const firstTwin = twins?.[0]
      if (!activeTwin && firstTwin) {
        const summary = privateTwinToChatSummary(firstTwin)
        setActiveTwin(summary)
        await restoreStoredChat(summary)
        setMessages((current) => (current.length ? current : [readyMessage(summary)]))
      }
    }

    void loadRequestedTwin()

    return () => {
      alive = false
    }
  }, [auth.status, requestedTwinId])

  useEffect(() => {
    return () => {
      clearLiveVoiceTimer()
      liveVoiceDraftRef.current = ''
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      recognitionRef.current?.abort()
    }
  }, [])

  const resizeInput = (value: string) => {
    setInput(value)
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
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

  const updateAttachment = (id: string, patch: Partial<ChatAttachment>) => {
    setAttachments((current) => current.map((attachment) => (attachment.id === id ? { ...attachment, ...patch } : attachment)))
  }

  const clearLiveVoiceTimer = () => {
    if (liveVoiceSendTimerRef.current === null) return
    window.clearTimeout(liveVoiceSendTimerRef.current)
    liveVoiceSendTimerRef.current = null
  }

  const addNotice = (notice: string) => {
    setComposerNotice(notice)
    window.setTimeout(() => setComposerNotice((current) => (current === notice ? '' : current)), 4200)
  }

  const handleFilesSelected = async (files: FileList | null) => {
    const selected = Array.from(files ?? [])
    if (!selected.length) return
    setComposerMenuOpen(false)
    if (auth.status !== 'authenticated') {
      addNotice('Bitte anmelden, um Dateien sicher hochzuladen und im Chat zu speichern.')
      return
    }
    for (const file of selected.slice(0, 6)) {
      const id = crypto.randomUUID()
      setAttachments((current) => [
        ...current,
        {
          id,
          kind: attachmentKindForFile(file),
          name: file.name,
          status: 'uploading',
          contentType: file.type || undefined,
          size: file.size,
        },
      ])
      const uploaded = await memoryUpload.upload(file, mediaCategoryForFile(file))
      if (!uploaded) {
        updateAttachment(id, { status: 'failed' })
        addNotice(memoryUpload.error || 'Upload fehlgeschlagen. Bitte Datei prüfen und erneut versuchen.')
        continue
      }
      updateAttachment(id, {
        status: 'uploaded',
        uploadId: uploaded.uploadId,
        key: uploaded.key,
        url: uploaded.getUrl,
        contentType: uploaded.contentType,
        size: uploaded.size,
      })
    }
  }

  const handlePickContacts = async () => {
    setComposerMenuOpen(false)
    const contactsApi = (navigator as BrowserNavigatorWithContacts).contacts
    if (!contactsApi?.select) {
      fileInputRef.current?.click()
      addNotice('Kontakt-Auswahl wird hier nicht direkt unterstützt. Du kannst eine .vcf-Datei anhängen.')
      return
    }
    try {
      const contacts = await contactsApi.select(['name', 'email', 'tel'], { multiple: true })
      const text = contactsToText(contacts)
      if (!text) return
      setAttachments((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: 'contact', name: 'Kontakt', status: 'ready' },
      ])
      resizeInput([input, `Kontakt:\n${text}`].filter(Boolean).join('\n\n'))
    } catch {
      addNotice('Kontakt-Auswahl wurde abgebrochen oder nicht erlaubt.')
    }
  }

  const handleAttachLink = () => {
    setComposerMenuOpen(false)
    const rawLink = window.prompt('Link einfügen')
    if (!rawLink?.trim()) return
    try {
      const url = new URL(rawLink.trim())
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
      setAttachments((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: 'link',
          name: url.hostname.replace(/^www\./, '') || 'Link',
          status: 'ready',
          url: url.href,
        },
      ])
      addNotice('Link wurde angehängt.')
    } catch {
      addNotice('Bitte einen gültigen http- oder https-Link einfügen.')
    }
  }

  const handleAttachLocation = () => {
    setComposerMenuOpen(false)
    if (!('geolocation' in navigator)) {
      addNotice('Standort wird von diesem Browser nicht unterstützt.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const url = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`
        setAttachments((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: 'location',
            name: 'Standort',
            status: 'ready',
            url,
          },
        ])
        addNotice('Standort wurde angehängt.')
      },
      () => addNotice('Standort konnte nicht gelesen werden. Bitte Berechtigung prüfen.'),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
  }

  const startDictation = (options: { live?: boolean } = {}) => {
    const Recognition = speechRecognitionConstructor()
    if (!Recognition) {
      if (options.live) setSpeechOutputEnabled(false)
      addNotice('Spracheingabe wird von diesem Browser nicht unterstützt. Du kannst deine Nachricht normal eintippen.')
      return
    }
    recognitionRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = speechLangFor(lang)
    recognition.interimResults = true
    recognition.continuous = Boolean(options.live)
    recognition.onstart = () => setVoiceState('listening')
    recognition.onerror = (event) => {
      setVoiceState('idle')
      if (options.live) setSpeechOutputEnabled(false)
      const error = event.error ?? ''
      addNotice(
        error === 'not-allowed' || error === 'service-not-allowed'
          ? 'Mikrofon ist nicht erlaubt. Bitte Browser-Berechtigung prüfen oder Nachricht eintippen.'
          : 'Spracheingabe konnte nicht gestartet werden. Du kannst deine Nachricht normal eintippen.',
      )
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setVoiceState((current) => (current === 'paused' ? 'paused' : 'idle'))
    }
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript?.trim()
        if (!transcript) continue
        if (result.isFinal) finalText += `${transcript} `
        else interimText += `${transcript} `
      }
      const nextText = (finalText || interimText).trim()
      if (!nextText) return
      if (options.live) {
        const finalChunk = finalText.trim()
        if (finalChunk) {
          liveVoiceDraftRef.current = [liveVoiceDraftRef.current.trim(), finalChunk].filter(Boolean).join(' ')
        }
        if (finalChunk) {
          clearLiveVoiceTimer()
          liveVoiceSendTimerRef.current = window.setTimeout(() => {
            const message = liveVoiceDraftRef.current.trim()
            if (!message) return
            liveVoiceDraftRef.current = ''
            recognition.stop()
            setVoiceState('replying')
            void handleSend(message, [], { forceSpeech: true }).finally(() => {
              setVoiceState('idle')
            })
          }, 1600)
        }
        return
      }
      resizeInput(nextText)
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setVoiceState('idle')
      if (options.live) setSpeechOutputEnabled(false)
      addNotice('Spracheingabe konnte nicht gestartet werden. Du kannst deine Nachricht normal eintippen.')
    }
  }

  const handleToggleLiveVoice = () => {
    if (voiceState === 'listening') {
      clearLiveVoiceTimer()
      recognitionRef.current?.stop()
      setVoiceState('paused')
      addNotice('Live-Sprachmodus pausiert.')
      return
    }
    if (voiceState === 'paused' || voiceState === 'idle') {
      if (voiceState === 'idle') liveVoiceDraftRef.current = ''
      setSpeechOutputEnabled(true)
      startDictation({ live: true })
      return
    }
    clearLiveVoiceTimer()
    liveVoiceDraftRef.current = ''
    recognitionRef.current?.abort()
    window.speechSynthesis.cancel()
    stopRemoteSpeech()
    setVoiceState('idle')
    setIsSpeaking(false)
    setSpeechOutputEnabled(false)
  }

  const handleSend = async (
    overrideText?: string,
    overrideAttachments?: ChatAttachment[],
    options: { forceSpeech?: boolean } = {},
  ): Promise<string | null> => {
    const message = composeMessageWithAttachments((overrideText ?? input).trim(), overrideAttachments ?? attachments)
    const canChatWithActiveTwin = auth.status === 'authenticated' || Boolean(activeTwin?.publicProfile)
    if (!message || !canChatWithActiveTwin || isReplying) return null
    if ((overrideAttachments ?? attachments).some((attachment) => attachment.status === 'uploading')) {
      addNotice('Bitte warten, bis alle Anhänge hochgeladen sind.')
      return null
    }
    if (!activeTwin) {
      setMessages([
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content: 'Wähle oder erstelle zuerst ein echtes KI-Profil. Danach kann der Chat starten.',
        },
      ])
      return null
    }

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
    setAttachments([])
    setIsReplying(true)

    try {
      let nextChatId = chatId
      if (!nextChatId) {
        const chat = await twinMvp.startTwinChat(activeTwin.id)
        if (!chat) throw new Error('Chat konnte nicht gestartet werden.')
        nextChatId = chat.id
        setChatId(nextChatId)
      }

      const reply = await twinMvp.sendTwinMessage(nextChatId, message)
      if (!reply?.message) throw new Error('Keine Antwort vom Chat erhalten.')
      await streamAssistantMessage(assistantId, reply.message.content)
      if ((speechOutputEnabled || options.forceSpeech) && speakText(reply.message.content, lang, () => setIsSpeaking(false))) {
        setIsSpeaking(true)
      }
      return reply.message.content
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Der Chat ist gerade nicht erreichbar.'
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `${text} Deine Nachricht wurde angezeigt, aber die Antwort konnte gerade nicht geladen werden. Bitte versuche es gleich noch einmal.`,
                streaming: false,
              }
            : item,
        ),
      )
      return null
    } finally {
      setIsReplying(false)
    }
  }

  const handleSpeakInput = () => {
    if (speechOutputEnabled || isSpeaking) {
      window.speechSynthesis.cancel()
      stopRemoteSpeech()
      setIsSpeaking(false)
      setSpeechOutputEnabled(false)
      return
    }
    if (!latestAssistantText) {
      addNotice('Noch keine Antwort zum Vorlesen vorhanden. Sende zuerst eine Nachricht.')
      return
    }
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      addNotice('Vorlesen wird von diesem Browser nicht unterstützt.')
      return
    }
    setSpeechOutputEnabled(true)
    const started = speakText(latestAssistantText, lang, () => setIsSpeaking(false))
    if (started) setIsSpeaking(true)
  }

  const handleExplainSimpler = () => {
    if (isReplying || !activeTwin) {
      if (isReplying) addNotice('Antwort läuft gerade. Bitte kurz warten.')
      return
    }
    void handleSend('Erkläre deine letzte Antwort bitte einfacher – in 2–3 kurzen Sätzen, ohne Fachbegriffe.')
  }

  const handleAskFollowUp = () => {
    if (!activeTwin) {
      addNotice('Wähle zuerst ein KI-Profil aus.')
      return
    }
    resizeInput('')
    inputRef.current?.focus()
    addNotice('Stelle direkt deine nächste Frage – der Kontext bleibt erhalten.')
  }

  const handleSaveAnswerToMemory = async (msg: TwinChatUiMessage) => {
    if (msg.role !== 'ai' || !msg.content.trim()) return
    if (auth.status !== 'authenticated') {
      addNotice('Melde dich an, um Antworten dauerhaft im Memory zu speichern.')
      return
    }
    if (savedMemoryIds.has(msg.id) || savingMemoryId) return
    setSavingMemoryId(msg.id)
    try {
      const memory = await twinMvp.createMemory({
        type: 'fact',
        text: msg.content.trim(),
        sourceType: 'chat',
        chatId: chatId ?? undefined,
        sourceLabel: activeTwin ? `Chat mit ${activeTwin.name}` : 'Twin Chat',
        twinIds: activeTwin && !activeTwin.publicProfile ? [activeTwin.id] : undefined,
      })
      if (memory) {
        setSavedMemoryIds((current) => {
          const next = new Set(current)
          next.add(msg.id)
          return next
        })
        addNotice('Antwort wurde im Memory gespeichert.')
      } else {
        addNotice('Speichern im Memory ist gerade nicht möglich. Bitte später erneut versuchen.')
      }
    } catch {
      addNotice('Speichern im Memory ist gerade nicht möglich. Bitte später erneut versuchen.')
    } finally {
      setSavingMemoryId(null)
    }
  }

  const handleCreateNote = async () => {
    const text = noteText.trim()
    if (!text || noteSaving) return
    if (auth.status !== 'authenticated') {
      setNoteStatus('Melde dich an, um Notizen zu speichern.')
      return
    }
    setNoteSaving(true)
    setNoteStatus('')
    try {
      const memory = await twinMvp.createMemory({
        type: 'fact',
        text,
        sourceType: 'manual',
        sourceLabel: activeTwin ? `Notiz zu ${activeTwin.name}` : 'Workspace-Notiz',
        twinIds: activeTwin && !activeTwin.publicProfile ? [activeTwin.id] : undefined,
      })
      if (memory) {
        setNoteText('')
        setNoteStatus('Notiz im Memory gespeichert ✓')
      } else {
        setNoteStatus('Speichern gerade nicht möglich. Bitte später erneut.')
      }
    } catch {
      setNoteStatus('Speichern gerade nicht möglich. Bitte später erneut.')
    } finally {
      setNoteSaving(false)
    }
  }

  const handleSendButtonClick = () => {
    if (!activeTwin) {
      addNotice('Wähle zuerst ein KI-Profil aus.')
      return
    }
    if (auth.status !== 'authenticated' && !activeTwin.publicProfile) {
      addNotice('Melde dich an, um mit diesem privaten Profil zu chatten.')
      return
    }
    if (isReplying) {
      addNotice('Antwort läuft gerade. Bitte kurz warten.')
      return
    }
    if (!input.trim() && !attachments.some((attachment) => attachment.status === 'uploaded' || attachment.status === 'ready')) {
      addNotice('Schreibe zuerst eine Nachricht oder füge eine Datei hinzu.')
      inputRef.current?.focus()
      return
    }
    void handleSend()
  }

  return (
    <div className="flex min-h-[calc(100dvh-80px)] flex-col px-[3px] pt-1 sm:min-h-[calc(100dvh-92px)] sm:px-2 sm:pt-2">
      {auth.status === 'anonymous' && (
        <Card className="mb-1 rounded-md p-2 sm:p-3">
          <CardContent className="flex flex-col items-start gap-2 p-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-base font-bold tracking-tight">Twin Chat</h1>
              <p className="text-xs text-[#555b64]">Melde dich an, um KI-Profile auszuwählen und Chats zu speichern.</p>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[240px]">
              <Suspense fallback={null}>
                <GitHubSignInButton variant="official" returnTo={window.location.pathname + window.location.search} />
              </Suspense>
              <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[#9aa6b7]">
                <span className="h-px flex-1 bg-[#0b1c44]/10"></span>oder<span className="h-px flex-1 bg-[#0b1c44]/10"></span>
              </div>
              <EmailPasswordForm returnTo={window.location.pathname + window.location.search} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-white/24 bg-white/14 shadow-none backdrop-blur-[24px]">
        <header className="flex min-h-[44px] shrink-0 items-center justify-between gap-2 border-b border-white/18 bg-white/14 px-2 py-1 backdrop-blur-[18px] sm:min-h-[48px] sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            {activeTwin?.imageUrl ? (
              <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#59C7FF]/18 text-[11px] font-bold text-[#0b1c44] ring-1 ring-white/40 sm:h-9 sm:w-9">
                {initials}
                <img
                  src={activeTwin.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              </span>
            ) : (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#59C7FF]/18 text-[11px] font-bold text-[#0b1c44] ring-1 ring-white/32 sm:h-9 sm:w-9">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight sm:text-base">{activeTwin?.name ?? 'Kein Profil ausgewählt'}</h1>
              <p className="mt-0.5 truncate text-[11px] font-semibold leading-none text-[#555b64] sm:text-xs">
                {activeTwin ? activeTwin.branch : 'Profil auswählen'}
              </p>
              {activeTwin && (
                <p className="mt-0.5 truncate text-[10px] font-medium leading-none text-[#667085] sm:text-[11px]">
                  {activeTwin.lifeLine}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={!activeTwin}
            onClick={() => {
              if (!activeTwin) return
              setChatId(null)
              setMessages([readyMessage(activeTwin)])
              inputRef.current?.focus()
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/32 bg-white/16 text-[#16181b] transition-colors hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-45 sm:h-9 sm:w-9"
            aria-label="Neuen Chat starten"
            title="Neuen Chat starten"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>

        {isReplying && (
          <div className="flex shrink-0 items-center gap-3 border-b border-white/14 bg-white/10 px-3 py-1 text-[11px] font-medium text-[#555b64]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]"></span>Prompt erhalten
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#59C7FF]"></span>Memory geprüft
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f59e0b]"></span>Antwort streamt
            </span>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-[3px] py-1 sm:px-2 sm:py-2">
          {messages.length === 0 && (
            <div className="grid min-h-full place-items-center px-3 py-8 text-center">
              <div className="max-w-[28rem]">
                <p className="text-base font-bold text-[#16181b]">Kein KI-Profil ausgewählt</p>
                <p className="mt-1 text-sm text-[#555b64]">
                  Smyst ist kein Messenger: Wähle eine KI-Persönlichkeit aus und stelle deine Frage direkt.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('landing')}
                    className="rounded-md border border-[#0b1c44]/14 bg-[#0b1c44] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#173064] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1c44]/35"
                  >
                    Profile ansehen
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('twin-builder')}
                    className="rounded-md border border-[#0b1c44]/14 bg-white/42 px-3 py-2 text-sm font-semibold text-[#0b1c44] transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1c44]/35"
                  >
                    Profil erstellen
                  </button>
                </div>
              </div>
            </div>
          )}
          {messages.length > 0 && (
            <div className="flex flex-col gap-1">
              {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[calc(100%-8px)] rounded-[10px] border px-3 py-2 text-[15px] leading-snug shadow-none sm:max-w-[94%] sm:text-base ${
                    msg.role === 'user'
                      ? 'rounded-br-[3px] border-[#59C7FF]/20 bg-[#59C7FF]/20 text-[#0b1c44]'
                      : 'rounded-bl-[3px] border-white/[0.22] bg-white/20 text-[#16181b]'
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
                {msg.role === 'ai' && !msg.streaming && msg.content.trim().length > 0 && hasUserTurn && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={handleExplainSimpler}
                      disabled={isReplying}
                      className="rounded-full border border-white/30 bg-white/14 px-2.5 py-1 text-[11px] font-medium text-[#555b64] transition-colors hover:bg-white/28 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Einfacher erklären
                    </button>
                    <button
                      type="button"
                      onClick={handleAskFollowUp}
                      className="rounded-full border border-white/30 bg-white/14 px-2.5 py-1 text-[11px] font-medium text-[#555b64] transition-colors hover:bg-white/28"
                    >
                      Nachfragen
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveAnswerToMemory(msg)}
                      disabled={savingMemoryId === msg.id || savedMemoryIds.has(msg.id)}
                      className="rounded-full border border-white/30 bg-white/14 px-2.5 py-1 text-[11px] font-medium text-[#555b64] transition-colors hover:bg-white/28 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savedMemoryIds.has(msg.id)
                        ? 'Im Memory gespeichert ✓'
                        : savingMemoryId === msg.id
                          ? 'Speichern…'
                          : 'Im Memory speichern'}
                    </button>
                  </div>
                )}
              </div>
              ))}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/18 bg-white/16 px-[3px] pb-[calc(4px+env(safe-area-inset-bottom))] pt-1 backdrop-blur-[20px] sm:px-2">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.vcf,text/vcard"
              onChange={(event) => {
                void handleFilesSelected(event.target.files)
                event.target.value = ''
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                void handleFilesSelected(event.target.files)
                event.target.value = ''
              }}
            />
            {suggestions.length > 0 && (
              <div className="mb-1 flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none]">
                {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    resizeInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="shrink-0 rounded-full border border-white/30 bg-white/14 px-2 py-1 text-[11px] font-medium text-[#555b64] transition-colors hover:bg-white/28"
                >
                  {suggestion}
                </button>
                ))}
              </div>
            )}
            {(composerMenuOpen || attachments.length > 0 || composerNotice || memoryUpload.uploading) && (
              <div className="mb-1 rounded-[10px] border border-white/20 bg-white/14 px-2 py-1 text-xs font-semibold text-[#555b64]">
                {composerMenuOpen && (
                  <div className="mb-1 flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none]">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Foto oder Video hinzufügen" title="Foto oder Video hinzufügen">
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Kamera öffnen" title="Kamera öffnen">
                      <CameraIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Dateien" title="Dateien">
                      <FileIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Audio hinzufügen" title="Audio hinzufügen">
                      <Mic className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={handleAttachLink} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Link" title="Link">
                      <LinkIcon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => { setComposerMenuOpen(false); onNavigate('memory-upload') }} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Memory" title="Memory">
                      <BookSpark className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={handlePickContacts} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Kontakte" title="Kontakte">
                      <User className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={handleAttachLocation} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/30 bg-white/20 transition-colors hover:bg-white/30" aria-label="Standort" title="Standort">
                      <MapPinIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none]">
                    {attachments.map((attachment) => (
                      <span key={attachment.id} className="shrink-0 rounded-full border border-white/30 bg-white/18 px-2 py-1">
                        {attachment.name} · {attachment.status}
                      </span>
                    ))}
                  </div>
                )}
                {(composerNotice || pendingAttachmentCount > 0 || memoryUpload.uploading) && (
                  <p className="mt-1 text-[#667085]">
                    {pendingAttachmentCount > 0 || memoryUpload.uploading
                      ? `Upload läuft${memoryUpload.progress ? ` · ${memoryUpload.progress.percentage}%` : ''}`
                      : composerNotice}
                  </p>
                )}
              </div>
            )}
            {(voiceState !== 'idle' || isSpeaking) && (
              <div className="mb-1">
                <VoiceWaveStatus state={voiceState} isSpeaking={isSpeaking} variant="light" />
              </div>
            )}

            <div className="flex items-end gap-1 rounded-[12px] border border-white/34 bg-white/24 p-1 shadow-none backdrop-blur-[18px]">
              <button
                type="button"
                onClick={() => setComposerMenuOpen((open) => !open)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#555b64] transition-colors hover:bg-white/24 ${
                  composerMenuOpen || attachments.length > 0 ? 'bg-white/24 text-[#16181b]' : ''
                }`}
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
                placeholder={
                  activeTwin
                      ? `Nachricht an ${activeTwin.name}...`
                      : auth.status !== 'authenticated'
                        ? 'Öffentliches Profil auswählen'
                        : 'Zuerst KI-Profil auswählen'
                }
                disabled={!activeTwin || (auth.status !== 'authenticated' && !activeTwin.publicProfile)}
                className="max-h-[96px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-5 text-[#16181b] outline-none placeholder:text-[#767d87] disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
              />
              <button
                type="button"
                onClick={() => startDictation()}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#555b64] transition-colors hover:bg-white/24 ${
                  voiceState === 'listening' ? 'bg-white/24 text-[#16181b]' : ''
                }`}
                aria-label="Spracheingabe"
                title={speechRecognitionSupported() ? 'Spracheingabe' : 'Spracheingabe nicht unterstützt'}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleLiveVoice}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#555b64] transition-colors hover:bg-white/24 ${
                  voiceState !== 'idle' ? 'bg-white/24 text-[#16181b]' : ''
                }`}
                aria-label={voiceState === 'idle' ? 'Live-Sprachmodus starten' : voiceState === 'listening' ? 'Live-Sprachmodus pausieren' : 'Live-Sprachmodus fortsetzen'}
                title={voiceState === 'idle' ? 'Live-Sprachmodus starten' : voiceState === 'listening' ? 'Pausieren' : voiceState === 'paused' ? 'Fortsetzen' : 'Beenden'}
              >
                <Waveform className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSpeakInput}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#555b64] transition-colors hover:bg-white/24 ${
                  speechOutputEnabled || isSpeaking ? 'bg-white/24 text-[#16181b]' : ''
                }`}
                data-ready={canSpeak ? 'true' : 'false'}
                aria-label={speechOutputEnabled ? 'Sprachausgabe ausschalten' : 'Antworten vorlesen'}
                title={speechOutputEnabled ? 'Sprachausgabe ausschalten' : 'Antworten vorlesen'}
              >
                <Speaker className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSendButtonClick}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md shadow-none transition-colors ${
                  canSend ? 'bg-[#59C7FF] text-[#0b1c44] hover:bg-[#7dd5ff]' : 'bg-white/28 text-[#767d87]'
                }`}
                data-ready={canSend ? 'true' : 'false'}
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
        <aside className="hidden w-80 shrink-0 flex-col gap-2 overflow-y-auto rounded-md border border-white/24 bg-white/14 p-3 backdrop-blur-[24px] xl:flex">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[#16181b]">Workspace</h2>
            <p className="text-xs text-[#555b64]">Halte Ideen fest und vertiefe die Antwort.</p>
          </div>
          <div className="rounded-[10px] border border-white/22 bg-white/16 p-2">
            <label className="mb-1 block text-xs font-semibold text-[#16181b]">Create note</label>
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Kernidee, einfache Erklärung, Folgefragen …"
              rows={5}
              className="w-full resize-none rounded-md border border-[#0b1c44]/16 bg-white/70 px-2 py-1.5 text-sm text-[#16181b] outline-none focus:border-[#0b1c44]/40"
            />
            <button
              type="button"
              onClick={() => void handleCreateNote()}
              disabled={noteSaving || !noteText.trim()}
              className="mt-2 w-full rounded-md border border-[#0b1c44]/14 bg-[#0b1c44] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#173064] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {noteSaving ? 'Speichern…' : 'Notiz speichern'}
            </button>
            {noteStatus && <p className="mt-1 text-xs font-medium text-[#0b7a3b]">{noteStatus}</p>}
          </div>
          <div className="mt-1 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleExplainSimpler}
              disabled={isReplying || !hasUserTurn}
              className="rounded-md border border-white/30 bg-white/16 px-3 py-1.5 text-sm font-medium text-[#16181b] transition-colors hover:bg-white/28 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Explain simpler
            </button>
            <button
              type="button"
              onClick={handleAskFollowUp}
              className="rounded-md border border-white/30 bg-white/16 px-3 py-1.5 text-sm font-medium text-[#16181b] transition-colors hover:bg-white/28"
            >
              Ask follow-up
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
