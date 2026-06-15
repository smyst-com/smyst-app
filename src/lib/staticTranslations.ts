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
      'smyst.com ist eine Plattform fuer oeffentliche und private KI-Zwillinge, Wissen, Erinnerungen und schnelle Twin-Chats.',
    keywords: 'KI-Zwilling, AI Twin, digitaler Zwilling, Wissensprofil, Erinnerungen, smyst',
  },
  start: {
    searchLabel: 'Twin suchen',
    searchPlaceholder: 'Profil oder Twin suchen',
    changeTwin: 'Ausgewählten Twin ändern',
    chooseTwin: 'Twin wählen',
    emptyText: 'Wähle oben ein KI-Profil oder schreibe direkt. Das ausgewählte Profil bleibt oben fixiert.',
    messagePlaceholder: 'Nachricht an {{name}}',
    addFile: 'Datei hinzufügen',
    voiceInput: 'Spracheingabe',
    send: 'Nachricht senden',
    freeOnlyNotice:
      'Oeffentliche und private Profile bleiben klar getrennt. Du entscheidest, womit du chatten moechtest.',
  },
  chat: {
    replyIntro: 'Ich antworte dir direkt aus meiner Rolle.',
    replyMvp: 'Ich wuerde es ruhig betrachten: Die Welt ist voller Tempo, Wissen und Unruhe zugleich.',
    replyQuestion: 'Zu deiner Frage: "{{question}}"',
    replyNextStep: 'Wichtig ist, genauer hinzusehen, neugierig zu bleiben und Fortschritt mit Verantwortung zu verbinden.',
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
