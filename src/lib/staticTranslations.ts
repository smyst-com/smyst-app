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
    voiceInputUnsupported: string
    liveVoiceStart: string
    liveVoicePause: string
    liveVoiceResume: string
    liveVoiceStop: string
    speechOutputOn: string
    speechOutputOff: string
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
  dashboard: {
    heroTitle: string
    heroSubtitle: string
    actionChooseSubtitle: string
    actionAskSubtitle: string
    actionCreateSubtitle: string
    privateByDefaultText: string
    welcomeBack: string
    readyTitle: string
    introAuthed: string
    introGuest: string
    cardChatText: string
    cardUploadText: string
    cardSettingsTitle: string
    cardSettingsText: string
    activityTitle: string
    lastConversation: string
    conversations: string
    loadedFromHistory: string
    savableAfterLogin: string
    resume: string
    open: string
    manageUploads: string
    uploadAfterLogin: string
    view: string
    profileCompleteness: string
    conversationQuality: string
  }
}

export const DEFAULT_TRANSLATIONS: StaticTranslations = {
  locale: DEFAULT_LANG,
  dir: 'ltr',
  seo: {
    title: 'smyst.com | KI-Zwillinge, digitale Profile und Twin Chat',
    description:
      'smyst.com ist eine Plattform für öffentliche und private KI-Zwillinge, Wissen, Erinnerungen und schnelle Twin-Chats.',
    keywords: 'KI-Zwilling, AI Twin, digitaler Zwilling, Wissensprofil, Erinnerungen, smyst',
  },
  start: {
    searchLabel: 'Profil suchen',
    searchPlaceholder: 'Profil suchen',
    changeTwin: 'Ausgewähltes Profil ändern',
    chooseTwin: 'Profil wählen',
    emptyText: 'Wähle oben ein KI-Profil oder schreibe direkt. Das ausgewählte Profil bleibt oben fixiert.',
    messagePlaceholder: 'Nachricht an {{name}}',
    addFile: 'Datei hinzufügen',
    voiceInput: 'Spracheingabe',
    voiceInputUnsupported: 'Spracheingabe nicht unterstützt',
    liveVoiceStart: 'Live-Sprachmodus starten',
    liveVoicePause: 'Live-Sprachmodus pausieren',
    liveVoiceResume: 'Live-Sprachmodus fortsetzen',
    liveVoiceStop: 'Live-Sprachmodus beenden',
    speechOutputOn: 'Antworten vorlesen',
    speechOutputOff: 'Sprachausgabe ausschalten',
    send: 'Nachricht senden',
    freeOnlyNotice:
      'Öffentliche und private Profile bleiben klar getrennt. Du entscheidest, womit du chatten möchtest.',
  },
  chat: {
    replyIntro: 'Antworte kurz, direkt und sachlich.',
    replyMvp: 'Ich würde es ruhig betrachten: Die Welt ist voller Tempo, Wissen und Unruhe zugleich.',
    replyQuestion: 'Zu deiner Frage: "{{question}}"',
    replyNextStep: 'Wichtig ist, genauer hinzusehen, neugierig zu bleiben und Fortschritt mit Verantwortung zu verbinden.',
  },
  profile: {
    publicProfile: 'Öffentliches Twin-Profil',
    privateProfile: 'Privates Twin-Profil',
    chatButton: 'Mit Twin chatten',
    noindex: 'Private Profile werden nicht indexiert.',
  },
  dashboard: {
    heroTitle: 'Was möchtest du heute mit einem KI-Twin tun?',
    heroSubtitle: 'Wähle einen Twin, frage direkt oder erstelle deinen eigenen Zwilling.',
    actionChooseSubtitle: 'Profile, Themen, Wissen',
    actionAskSubtitle: 'Chat startet sofort',
    actionCreateSubtitle: 'Identität + Memories',
    privateByDefaultText:
      'IDrive E2 speichert Medien, Wissen, Backups und signierte Dateien. Salad rechnet nur API, KI, Suche und Cronjobs.',
    welcomeBack: 'Willkommen zurück, {{name}}',
    readyTitle: 'Dein Dashboard ist bereit',
    introAuthed: 'Deine Twins, Memories und Gespräche bleiben getrennt und kontrollierbar.',
    introGuest: 'Melde dich an, um persönliche Twins, Memories und Chatverläufe sicher zu speichern.',
    cardChatText: 'Sprich mit deinem digitalen Zwilling. Stelle Fragen und erhalte Antworten in deinem Stil.',
    cardUploadText: 'Füge neue Erinnerungen hinzu. Texte, Audio, Fotos und Dokumente werden automatisch verarbeitet.',
    cardSettingsTitle: 'Twin Einstellungen',
    cardSettingsText: 'Passe die Persönlichkeit deines Twins an. Werte, Sprachstil und Zugriffsrechte verwalten.',
    activityTitle: 'Aktivitätsübersicht',
    lastConversation: 'Letzte Konversation',
    conversations: 'Gespräche',
    loadedFromHistory: 'Wird aus deinem Verlauf geladen',
    savableAfterLogin: 'Nach Anmeldung speicherbar',
    resume: 'Fortsetzen',
    open: 'Öffnen',
    manageUploads: 'Uploads und Quellen verwalten',
    uploadAfterLogin: 'Nach Anmeldung Dateien sicher hochladen',
    view: 'Ansehen',
    profileCompleteness: 'Profil Vollständigkeit',
    conversationQuality: 'Gesprächsqualität',
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
    dashboard: { ...DEFAULT_TRANSLATIONS.dashboard, ...value.dashboard },
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
