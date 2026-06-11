import { useEffect, useState } from 'react'
import { DEFAULT_LANG, type SupportedLang } from './i18n'

export interface StaticTranslations {
  locale: SupportedLang
  dir: 'ltr' | 'rtl'
  seo: {
    title: string
    description: string
    keywords: string
  }
  start: {
    searchLabel: string
    searchPlaceholder: string
    changeTwin: string
    chooseTwin: string
    emptyText: string
    messagePlaceholder: string
    addFile: string
    voiceInput: string
    send: string
    freeOnlyNotice: string
  }
  chat: {
    replyIntro: string
    replyMvp: string
    replyQuestion: string
    replyNextStep: string
  }
  profile: {
    publicProfile: string
    privateProfile: string
    chatButton: string
    noindex: string
  }
}

export const DEFAULT_TRANSLATIONS: StaticTranslations = {
  locale: DEFAULT_LANG,
  dir: 'ltr',
  seo: {
    title: 'smyst.com | KI-Zwillinge, digitale Profile und Twin Chat',
    description:
      'smyst.com ist eine Free-only KI-Zwilling Plattform fuer öffentliche und private Profile, Wissen, Erinnerungen und schnelle Twin-Chats.',
    keywords: 'KI-Zwilling, AI Twin, digitaler Zwilling, Wissensprofil, Erinnerungen, smyst',
  },
  start: {
    searchLabel: 'Twin suchen',
    searchPlaceholder: 'Name oder Twin suchen',
    changeTwin: 'Ausgewählten Twin ändern',
    chooseTwin: 'Twin wählen',
    emptyText: 'Wähle oben einen Namen oder schreibe direkt. Der ausgewählte Twin bleibt oben rechts fixiert.',
    messagePlaceholder: 'Nachricht an {{name}}',
    addFile: 'Datei hinzufügen',
    voiceInput: 'Spracheingabe',
    send: 'Nachricht senden',
    freeOnlyNotice:
      'Free-only MVP: GitHub Free, Cloudflare Free, IDrive e2. Keine bezahlten KI- oder Analytics-Dienste.',
  },
  chat: {
    replyIntro: 'Ich antworte als {{name}}.',
    replyMvp: 'Für den Free-only-MVP nutze ich eine lokale, simulierte Antwortlogik ohne bezahlten KI-Dienst.',
    replyQuestion: 'Deine Frage: "{{question}}"',
    replyNextStep: 'Nächster Schritt: echte Twin-Daten kommen über Cloudflare Worker/KV und IDrive e2 dazu.',
  },
  profile: {
    publicProfile: 'Öffentliches Twin-Profil',
    privateProfile: 'Privates Twin-Profil',
    chatButton: 'Mit Twin chatten',
    noindex: 'Private Profile werden nicht indexiert.',
  },
}

const cache = new Map<SupportedLang, StaticTranslations>([[DEFAULT_LANG, DEFAULT_TRANSLATIONS]])

function mergeTranslations(value: Partial<StaticTranslations>): StaticTranslations {
  return {
    ...DEFAULT_TRANSLATIONS,
    ...value,
    seo: { ...DEFAULT_TRANSLATIONS.seo, ...value.seo },
    start: { ...DEFAULT_TRANSLATIONS.start, ...value.start },
    chat: { ...DEFAULT_TRANSLATIONS.chat, ...value.chat },
    profile: { ...DEFAULT_TRANSLATIONS.profile, ...value.profile },
  }
}

export function useStaticTranslations(lang: SupportedLang): StaticTranslations {
  const [translations, setTranslations] = useState<StaticTranslations>(
    () => cache.get(lang) ?? DEFAULT_TRANSLATIONS,
  )

  useEffect(() => {
    let alive = true
    const cached = cache.get(lang)
    if (cached) {
      setTranslations(cached)
      return () => {
        alive = false
      }
    }

    void fetch(`/locales/${lang}.json`, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: Partial<StaticTranslations> | null) => {
        if (!alive || !json) return
        const next = mergeTranslations(json)
        cache.set(lang, next)
        setTranslations(next)
      })
      .catch(() => {
        if (alive) setTranslations(DEFAULT_TRANSLATIONS)
      })

    return () => {
      alive = false
    }
  }, [lang])

  return translations
}
