// Kuratierte Stimmen-Metadaten pro Profil (Stufe 2a).
// Quelle der Regeln: docs/voice-profiles.md - nur synthetische Stimmen,
// keine Klone realer Personen; Auswahl passend zu Sprache, Geschlecht und Charakter.
// Die Stimmen-Zuordnung pro Twin liegt in src/data/curated-voice-hints.ts.
import { CURATED_VOICE_HINTS } from '@/data/curated-voice-hints'
import { detectVoiceLanguage } from '@/lib/voiceLanguage'

export type VoiceGender = 'female' | 'male'

export type RemoteVoiceBase = 'de' | 'en' | 'tr'

export type VoiceProfileHint = {
    gender?: VoiceGender
    pitch?: number
    rate?: number
    voiceIds?: Partial<Record<RemoteVoiceBase, string>>
}

export type VoiceSettings = {
    voice?: SpeechSynthesisVoice
    pitch: number
    rate: number
}

const PREMIUM_PATTERN = /natural|premium|enhanced|neural/i

const FEMALE_VOICE_NAMES = [
    'anna', 'helena', 'petra', 'hedda', 'katja', 'marlene', 'vicki', 'samantha',
    'victoria', 'kathrin', 'katrin', 'laura', 'sara', 'eva', 'lena', 'gisela',
    'shelley', 'sandy', 'grandma', 'oma', 'nora', 'monica', 'paulina', 'alice',
    'allison', 'ava', 'susan', 'karen', 'moira', 'tessa', 'fiona', 'zoe',
    'milena', 'alva', 'klara', 'ellen', 'ingrid', 'melina', 'kyoko',
  ]

const MALE_VOICE_NAMES = [
    'eddy', 'reed', 'rocko', 'grandpa', 'opa', 'stefan', 'markus', 'yannick',
    'conrad', 'daniel', 'fred', 'ralph', 'viktor', 'hans', 'klaus', 'diego',
    'carlos', 'thomas', 'oliver', 'aaron', 'arthur', 'bruce', 'alex', 'martin',
    'xander', 'jorge', 'juan',
  ]

export function voiceGenderFor(voiceKey: string | undefined): VoiceGender | undefined {
    if (!voiceKey) return undefined
    return VOICE_HINTS[normalizeKey(voiceKey)]?.gender
}

// Verfuegbare Piper-Stimmen auf dem Salad-Backend (siehe backend routes/tts.py).
const REMOTE_VOICES: Record<string, string[]> = {
    'de-male': ['de-thorsten', 'de-karlsson', 'de-pavoque'],
    'de-female': ['de-kerstin', 'de-ramona', 'de-eva'],
    'en-male': ['en-ryan', 'en-joe', 'en-lessac', 'en-hfc-male'],
    'en-female': ['en-amy', 'en-hfc-female'],
    'tr-male': ['tr-dfki'],
    'tr-female': ['tr-dfki'],
}

// Sprachen, fuer die das Salad-Backend eigene Piper-Modelle hat.
export function remoteBaseFor(lang: string | undefined): RemoteVoiceBase {
    const value = (lang ?? 'de').toLowerCase()
    if (value.startsWith('de')) return 'de'
    if (value.startsWith('tr')) return 'tr'
    return 'en'
}

export function remoteVoiceIdFor(voiceKey: string | undefined, lang: string | undefined): string | undefined {
    if (!voiceKey) return undefined
    const base = remoteBaseFor(lang)
    const key = normalizeKey(voiceKey)
    const hint: VoiceProfileHint | undefined = VOICE_HINTS[key]
    const curated = hint?.voiceIds?.[base]
    if (curated) return curated
    const gender = hint?.gender === 'female' ? 'female' : 'male'
    const pool = REMOTE_VOICES[base + '-' + gender] ?? []
        if (pool.length === 0) return undefined
    return pool[hashSeed(key) % pool.length]
}

// Kuratiertes Sprechtempo des Twins fuer das Remote-TTS (Piper length_scale
// im Backend). undefined = Standardtempo der Stimme.
export function remoteRateFor(voiceKey: string | undefined): number | undefined {
    if (!voiceKey) return undefined
    return VOICE_HINTS[normalizeKey(voiceKey)]?.rate
}

export function detectTextLang(text: string): string | undefined {
    const sample = text.slice(0, 600).trim()
    if (!sample) return undefined
    return detectVoiceLanguage(sample)
}

// Effektive Sprache fuer die Sprachausgabe: erkannte Textsprache vor UI-Sprache.
export function resolveSpeechLang(text: string, lang: string | undefined): string {
    return detectTextLang(text) ?? lang ?? 'de'
}

// Kuratierte Hinweise pro Twin (Schluessel: Name normalisiert per normalizeKey).
const VOICE_HINTS: Record<string, VoiceProfileHint> = CURATED_VOICE_HINTS

// Kleinschreibung + Diakritika entfernen ("Atatürk" -> "ataturk"), damit
// Namensvarianten aus Daten oder Pipeline dieselbe Stimme treffen.
function normalizeKey(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function hashSeed(value: string): number {
    let seed = 0
    for (let index = 0; index < value.length; index += 1) {
          seed = (seed * 31 + value.charCodeAt(index)) % 997
    }
    return seed
}

function matchesAny(name: string, patterns: string[]): boolean {
    const lower = name.toLowerCase()
    return patterns.some((pattern) => lower.includes(pattern))
}

export function pickVoiceSettings(
    voiceKey: string | undefined,
    voices: SpeechSynthesisVoice[],
    targetLang: string,
  ): VoiceSettings {
    const preferred = voices.filter((item) => item.lang === targetLang && PREMIUM_PATTERN.test(item.name))
    const sameLang = voices.filter((item) => item.lang === targetLang)
    const sameBase = voices.filter((item) => item.lang.startsWith(targetLang.slice(0, 2)))
    const basePool = preferred.length > 0 ? preferred : sameLang.length > 0 ? sameLang : sameBase
    const key = voiceKey ? normalizeKey(voiceKey) : ''
    if (!key) return { voice: basePool[0], pitch: 1, rate: 0.96 }
    const seed = hashSeed(key)
    const hint: VoiceProfileHint | undefined = VOICE_HINTS[key]
    let pool = basePool
    if (hint?.gender) {
          const names = hint.gender === 'female' ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES
          const widePool = sameLang.length > 0 ? sameLang : sameBase
          const genderPool = widePool.filter((item) => matchesAny(item.name, names))
          if (genderPool.length > 0) pool = genderPool
    }
    const voice = pool.length > 0 ? pool[seed % pool.length] : undefined
    return {
          voice,
          pitch: hint?.pitch ?? 0.9 + (seed % 11) * 0.02,
          rate: hint?.rate ?? 0.92 + (seed % 5) * 0.02,
    }
}
