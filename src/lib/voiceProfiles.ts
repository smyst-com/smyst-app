// Kuratierte Stimmen-Metadaten pro Profil (Stufe 2a).
// Quelle der Regeln: docs/voice-profiles.md - nur synthetische Stimmen,
// keine Klone realer Personen; Auswahl passend zu Sprache, Geschlecht und Charakter.

export type VoiceGender = 'female' | 'male'

export type VoiceProfileHint = {
  gender?: VoiceGender
  pitch?: number
  rate?: number
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

// Kuratierte Hinweise fuer bekannte Profile (Schluessel: Name in Kleinschreibung).
const VOICE_HINTS: Record<string, VoiceProfileHint> = {
  'albert einstein': { gender: 'male', pitch: 0.88, rate: 0.92 },
  'marie curie': { gender: 'female', pitch: 1.04, rate: 0.94 },
  'ada lovelace': { gender: 'female', pitch: 1.08, rate: 0.97 },
  'jane austen': { gender: 'female', pitch: 1.06, rate: 0.96 },
  'mary shelley': { gender: 'female', pitch: 1.02, rate: 0.95 },
  'sokrates': { gender: 'male', pitch: 0.86, rate: 0.9 },
  'platon': { gender: 'male', pitch: 0.92, rate: 0.93 },
  'aristoteles': { gender: 'male', pitch: 0.9, rate: 0.92 },
  'leonardo da vinci': { gender: 'male', pitch: 0.98, rate: 0.97 },
  'wolfgang amadeus mozart': { gender: 'male', pitch: 1.06, rate: 1.02 },
  'ludwig van beethoven': { gender: 'male', pitch: 0.84, rate: 0.9 },
  'johann sebastian bach': { gender: 'male', pitch: 0.9, rate: 0.92 },
  'friedrich nietzsche': { gender: 'male', pitch: 0.92, rate: 0.95 },
  'immanuel kant': { gender: 'male', pitch: 0.94, rate: 0.9 },
  'napoleon bonaparte': { gender: 'male', pitch: 0.96, rate: 1.0 },
  'william shakespeare': { gender: 'male', pitch: 1.0, rate: 0.98 },
  'nikola tesla': { gender: 'male', pitch: 0.96, rate: 0.99 },
  'isaac newton': { gender: 'male', pitch: 0.92, rate: 0.93 },
  'johann wolfgang von goethe': { gender: 'male', pitch: 0.95, rate: 0.94 },
  'karl marx': { gender: 'male', pitch: 0.87, rate: 0.94 },
  'charles darwin': { gender: 'male', pitch: 0.9, rate: 0.92 },
  'galileo galilei': { gender: 'male', pitch: 0.93, rate: 0.96 },
  'oscar wilde': { gender: 'male', pitch: 1.04, rate: 1.0 },
  'vincent van gogh': { gender: 'male', pitch: 0.97, rate: 0.95 },
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
