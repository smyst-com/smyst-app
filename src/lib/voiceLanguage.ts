import { DEFAULT_LANG, type SupportedLang } from './i18n'

export type VoiceLang = SupportedLang

export const REQUIRED_VOICE_LANGUAGES: readonly VoiceLang[] = [
  'en',
  'zh',
  'es',
  'ar',
  'fr',
  'de',
  'pt',
  'ru',
  'tr',
  'ja',
  'ko',
  'it',
  'hi',
  'id',
  'bn',
] as const

const LANGUAGE_NAMES: Record<VoiceLang, string> = {
  en: 'English',
  zh: 'Chinese',
  es: 'Spanish',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  ja: 'Japanese',
  ko: 'Korean',
  it: 'Italian',
  hi: 'Hindi',
  id: 'Indonesian',
  bn: 'Bengali',
}

const SPEECH_LANGS: Record<VoiceLang, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  es: 'es-ES',
  ar: 'ar-SA',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ru: 'ru-RU',
  tr: 'tr-TR',
  ja: 'ja-JP',
  ko: 'ko-KR',
  it: 'it-IT',
  hi: 'hi-IN',
  id: 'id-ID',
  bn: 'bn-BD',
}

const WORD_MARKERS: Record<VoiceLang, readonly string[]> = {
  en: ['the', 'and', 'please', 'what', 'how', 'why', 'hello', 'thanks', 'you'],
  zh: [],
  es: ['que', 'como', 'por', 'para', 'hola', 'gracias', 'usted', 'quiero', 'esta'],
  ar: [],
  fr: ['bonjour', 'merci', 'comment', 'pourquoi', 'avec', 'vous', 'etre', 'dans'],
  de: ['ich', 'du', 'der', 'die', 'das', 'und', 'nicht', 'bitte', 'danke', 'warum'],
  pt: ['ola', 'obrigado', 'obrigada', 'como', 'porque', 'voce', 'para', 'com'],
  ru: [],
  tr: ['merhaba', 'tesekkur', 'ederim', 'nasilsin', 'nasıl', 'ben', 'bir', 'icin', 'için', 'degil', 'değil', 'lutfen', 'lütfen'],
  ja: [],
  ko: [],
  it: ['ciao', 'grazie', 'come', 'perche', 'perchè', 'sono', 'voglio', 'con'],
  hi: [],
  id: ['halo', 'terima', 'kasih', 'bagaimana', 'saya', 'untuk', 'dengan', 'tidak'],
  bn: [],
}

export function toVoiceLang(value: string | null | undefined): VoiceLang {
  const normalized = (value || '').toLowerCase().split(/[-_]/)[0] as VoiceLang
  return REQUIRED_VOICE_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANG
}

export function speechLangForVoice(lang?: string): string {
  return SPEECH_LANGS[toVoiceLang(lang)]
}

export function voiceLanguageName(lang?: string): string {
  return LANGUAGE_NAMES[toVoiceLang(lang)]
}

function normalizeForWordMarkers(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
}

function countMatches(text: string, markers: readonly string[]): number {
  if (!markers.length) return 0
  const words = new Set(normalizeForWordMarkers(text).split(/\s+/).filter(Boolean))
  return markers.reduce((score, marker) => score + (words.has(normalizeForWordMarkers(marker)) ? 1 : 0), 0)
}

export function detectVoiceLanguage(text: string, fallback: string = DEFAULT_LANG): VoiceLang {
  const value = text.trim()
  if (!value) return toVoiceLang(fallback)

  if (/[\u0600-\u06ff]/.test(value)) return 'ar'
  if (/[\u0980-\u09ff]/.test(value)) return 'bn'
  if (/[\u0900-\u097f]/.test(value)) return 'hi'
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh'
  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  if (/[çğıöşüİĞŞ]/.test(value)) return 'tr'

  let bestLang = toVoiceLang(fallback)
  let bestScore = 0
  for (const lang of REQUIRED_VOICE_LANGUAGES) {
    const score = countMatches(value, WORD_MARKERS[lang])
    if (score > bestScore) {
      bestLang = lang
      bestScore = score
    }
  }
  return bestLang
}

export function preferredVoiceLanguage(current: string = DEFAULT_LANG): VoiceLang {
  const currentLang = toVoiceLang(current)
  if (typeof navigator === 'undefined') return currentLang
  const browserLanguages = [navigator.language, ...(navigator.languages ?? [])]
  return browserLanguages.map(toVoiceLang).find((lang) => REQUIRED_VOICE_LANGUAGES.includes(lang)) ?? currentLang
}

export function voiceLanguageInstruction(message: string, lang: string): string {
  const voiceLang = toVoiceLang(lang)
  const name = voiceLanguageName(voiceLang)
  return [
    `[Voice language: ${name} (${voiceLang}). Answer only in ${name}. Do not mix German, Turkish, English, or any other language unless the user explicitly asks for translation.]`,
    message,
  ].join('\n\n')
}
