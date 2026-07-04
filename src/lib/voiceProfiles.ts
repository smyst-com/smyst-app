// Kuratierte Stimmen-Metadaten pro Profil (Stufe 2a).
// Quelle der Regeln: docs/voice-profiles.md - nur synthetische Stimmen,
// keine Klone realer Personen; Auswahl passend zu Sprache, Geschlecht und Charakter.

export type VoiceGender = 'female' | 'male'

export type VoiceProfileHint = {
    gender?: VoiceGender
    pitch?: number
    rate?: number
    voiceId?: string
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
export function remoteBaseFor(lang: string | undefined): string {
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
    if (hint?.voiceId && hint.voiceId.startsWith(base)) return hint.voiceId
    const gender = hint?.gender === 'female' ? 'female' : 'male'
    const pool = REMOTE_VOICES[base + '-' + gender] ?? []
        if (pool.length === 0) return undefined
    return pool[hashSeed(key) % pool.length]
}

// Erkennt die Sprache eines Antworttexts fuer die Stimmenwahl (Piper-Sprachen).
// Hintergrund: `lang` ist die UI-Sprache; Antworten koennen davon abweichen
// (z. B. tuerkische Antwort bei deutscher UI). Ohne Erkennung liest sonst eine
// deutsche/englische Stimme tuerkischen Text vor.
const LANG_MARKERS: Array<{ lang: string; words: string[] }> = [
  { lang: 'tr', words: ['bir', 've', 'bu', 'için', 'çok', 'değil', 'ben', 'gibi', 'daha', 'ama', 'olarak', 'her', 'ile', 'ne', 'olan', 'var', 'sen', 'biz', 'evet', 'nasıl'] },
  { lang: 'de', words: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'ein', 'eine', 'zu', 'mit', 'auf', 'für', 'sich', 'auch', 'wir', 'sie', 'aber', 'werden', 'oder'] },
  { lang: 'en', words: ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'you', 'for', 'with', 'was', 'are', 'not', 'this', 'have', 'but', 'they', 'from', 'what'] },
  ]

export function detectTextLang(text: string): string | undefined {
    const sample = text.slice(0, 600)
    const words = sample
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
    if (words.length === 0) return undefined
    let bestLang: string | undefined
    let bestScore = 0
    for (const entry of LANG_MARKERS) {
          const set = new Set(entry.words)
          let score = words.reduce((acc, word) => (set.has(word) ? acc + 1 : acc), 0)
          if (entry.lang === 'tr' && /[ığş]/.test(sample)) score += 3
          if (entry.lang === 'de' && /ß/.test(sample)) score += 2
          if (score > bestScore) {
                  bestScore = score
                  bestLang = entry.lang
          }
    }
    return bestScore >= 2 ? bestLang : undefined
}

// Effektive Sprache fuer die Sprachausgabe: erkannte Textsprache vor UI-Sprache.
export function resolveSpeechLang(text: string, lang: string | undefined): string {
    return detectTextLang(text) ?? lang ?? 'de'
}

// Kuratierte Hinweise fuer bekannte Profile (Schluessel: Name in Kleinschreibung).
const VOICE_HINTS: Record<string, VoiceProfileHint> = {
    'albert einstein': { gender: 'male', pitch: 0.88, rate: 0.92, voiceId: 'de-thorsten' },
    'marie curie': { gender: 'female', pitch: 1.04, rate: 0.94, voiceId: 'de-ramona' },
    'ada lovelace': { gender: 'female', pitch: 1.08, rate: 0.97, voiceId: 'de-eva' },
    'jane austen': { gender: 'female', pitch: 1.06, rate: 0.96, voiceId: 'de-kerstin' },
    'mary shelley': { gender: 'female', pitch: 1.02, rate: 0.95, voiceId: 'de-eva' },
    'sokrates': { gender: 'male', pitch: 0.86, rate: 0.9, voiceId: 'de-pavoque' },
    'platon': { gender: 'male', pitch: 0.92, rate: 0.93, voiceId: 'de-karlsson' },
    'aristoteles': { gender: 'male', pitch: 0.9, rate: 0.92, voiceId: 'de-thorsten' },
    'leonardo da vinci': { gender: 'male', pitch: 0.98, rate: 0.97, voiceId: 'de-karlsson' },
    'wolfgang amadeus mozart': { gender: 'male', pitch: 1.06, rate: 1.02, voiceId: 'de-thorsten' },
    'ludwig van beethoven': { gender: 'male', pitch: 0.84, rate: 0.9, voiceId: 'de-pavoque' },
    'johann sebastian bach': { gender: 'male', pitch: 0.9, rate: 0.92, voiceId: 'de-karlsson' },
    'friedrich nietzsche': { gender: 'male', pitch: 0.92, rate: 0.95, voiceId: 'de-pavoque' },
    'immanuel kant': { gender: 'male', pitch: 0.94, rate: 0.9, voiceId: 'de-karlsson' },
    'napoleon bonaparte': { gender: 'male', pitch: 0.96, rate: 1.0, voiceId: 'de-thorsten' },
    'william shakespeare': { gender: 'male', pitch: 1.0, rate: 0.98, voiceId: 'de-karlsson' },
    'nikola tesla': { gender: 'male', pitch: 0.96, rate: 0.99, voiceId: 'de-thorsten' },
    'isaac newton': { gender: 'male', pitch: 0.92, rate: 0.93, voiceId: 'de-pavoque' },
    'johann wolfgang von goethe': { gender: 'male', pitch: 0.95, rate: 0.94, voiceId: 'de-thorsten' },
    'karl marx': { gender: 'male', pitch: 0.87, rate: 0.94, voiceId: 'de-karlsson' },
    'charles darwin': { gender: 'male', pitch: 0.9, rate: 0.92, voiceId: 'de-pavoque' },
    'galileo galilei': { gender: 'male', pitch: 0.93, rate: 0.96, voiceId: 'de-karlsson' },
    'oscar wilde': { gender: 'male', pitch: 1.04, rate: 1.0, voiceId: 'de-thorsten' },
    'vincent van gogh': { gender: 'male', pitch: 0.97, rate: 0.95, voiceId: 'de-pavoque' },
    // Tuerkisch: wuerdevolle, ruhige maennliche Stimme; einzige tr-Piper-Stimme ist tr-dfki.
    // Rechtlich: Gesetz 5816 (Tuerkei) beachten - keine Imitation, respektvolle Darstellung.
    'mustafa kemal atatuerk': { gender: 'male', pitch: 0.92, rate: 0.93, voiceId: 'tr-dfki' },
}

function normalizeKey(value: string): string {
    return value.trim().toLowerCase()
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
