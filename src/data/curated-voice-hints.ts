// Kuratierte Stimmen-Zuordnung pro Twin (Stufe 2a, docs/voice-profiles.md).
// Nur synthetische Piper-Stimmen, keine Klone realer Personen.
// Jeder kuratierte Twin bekommt eine feste Stimme pro Sprachbasis (de/en/tr),
// damit er ueber Sessions hinweg wiedererkennbar gleich klingt.
// pitch/rate wirken nur auf die Geraete-Fallback-Stimme (Web Speech API);
// das Remote-TTS nutzt ausschliesslich die voiceIds.
// Schluessel: Twin-Name in Kleinschreibung, Diakritika entfernt (siehe
// normalizeKey in src/lib/voiceProfiles.ts).
import type { VoiceProfileHint } from '@/lib/voiceProfiles'

// Verfuegbare Piper-Stimmen (backend/app/api/v1/routes/tts.py):
// de-male: de-thorsten (klar, modern), de-karlsson (leichter), de-pavoque (tief, getragen)
// de-female: de-kerstin, de-ramona, de-eva
// en-male: en-ryan, en-joe, en-lessac, en-hfc-male
// en-female: en-amy, en-hfc-female
// tr: tr-dfki (einzige tr-Stimme)

export const CURATED_VOICE_HINTS: Record<string, VoiceProfileHint> = {
    // --- Wissenschaft, Physik, Mathematik ---
    'albert einstein': { gender: 'male', pitch: 0.88, rate: 0.92, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'isaac newton': { gender: 'male', pitch: 0.92, rate: 0.93, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'nikola tesla': { gender: 'male', pitch: 0.96, rate: 0.99, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'marie curie': { gender: 'female', pitch: 1.04, rate: 0.94, voiceIds: { de: 'de-ramona', en: 'en-amy' } },
    'charles darwin': { gender: 'male', pitch: 0.9, rate: 0.92, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'galileo galilei': { gender: 'male', pitch: 0.93, rate: 0.96, voiceIds: { de: 'de-karlsson', en: 'en-ryan' } },
    'archimedes': { gender: 'male', pitch: 0.9, rate: 0.94, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'johannes kepler': { gender: 'male', pitch: 0.95, rate: 0.93, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'nikolaus kopernikus': { gender: 'male', pitch: 0.93, rate: 0.92, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'michael faraday': { gender: 'male', pitch: 0.97, rate: 0.96, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'james clerk maxwell': { gender: 'male', pitch: 0.95, rate: 0.95, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'carl friedrich gauss': { gender: 'male', pitch: 0.9, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'ada lovelace': { gender: 'female', pitch: 1.08, rate: 0.97, voiceIds: { de: 'de-eva', en: 'en-amy' } },
    'gregor mendel': { gender: 'male', pitch: 0.96, rate: 0.92, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'louis pasteur': { gender: 'male', pitch: 0.94, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'dmitri mendelejew': { gender: 'male', pitch: 0.88, rate: 0.92, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'leonhard euler': { gender: 'male', pitch: 0.96, rate: 0.97, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'bernhard riemann': { gender: 'male', pitch: 0.97, rate: 0.9, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'blaise pascal': { gender: 'male', pitch: 1.0, rate: 0.96, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'leonardo fibonacci': { gender: 'male', pitch: 0.98, rate: 0.95, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'pythagoras': { gender: 'male', pitch: 0.9, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'euklid': { gender: 'male', pitch: 0.96, rate: 0.92, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'hippokrates': { gender: 'male', pitch: 0.94, rate: 0.92, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'al-khwarizmi': { gender: 'male', pitch: 0.95, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'al-biruni': { gender: 'male', pitch: 0.93, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'ibn sina': { gender: 'male', pitch: 0.92, rate: 0.92, voiceIds: { de: 'de-pavoque', en: 'en-joe' } },
    'ibn khaldun': { gender: 'male', pitch: 0.92, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },

    // --- Philosophie, Ethik ---
    'sokrates': { gender: 'male', pitch: 0.86, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'platon': { gender: 'male', pitch: 0.92, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'aristoteles': { gender: 'male', pitch: 0.9, rate: 0.92, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'konfuzius': { gender: 'male', pitch: 0.9, rate: 0.88, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'laotse': { gender: 'male', pitch: 0.88, rate: 0.86, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'friedrich nietzsche': { gender: 'male', pitch: 0.92, rate: 0.95, voiceIds: { de: 'de-pavoque', en: 'en-ryan' } },
    'immanuel kant': { gender: 'male', pitch: 0.94, rate: 0.9, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'rene descartes': { gender: 'male', pitch: 0.97, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'gottfried wilhelm leibniz': { gender: 'male', pitch: 0.98, rate: 0.97, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'john locke': { gender: 'male', pitch: 0.95, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'david hume': { gender: 'male', pitch: 0.97, rate: 0.96, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'voltaire': { gender: 'male', pitch: 1.02, rate: 1.0, voiceIds: { de: 'de-karlsson', en: 'en-ryan' } },
    'jean-jacques rousseau': { gender: 'male', pitch: 0.99, rate: 0.96, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'arthur schopenhauer': { gender: 'male', pitch: 0.86, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'georg wilhelm friedrich hegel': { gender: 'male', pitch: 0.92, rate: 0.88, voiceIds: { de: 'de-karlsson', en: 'en-hfc-male' } },
    'max weber': { gender: 'male', pitch: 0.95, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'karl marx': { gender: 'male', pitch: 0.87, rate: 0.94, voiceIds: { de: 'de-karlsson', en: 'en-hfc-male' } },
    'marcus aurelius': { gender: 'male', pitch: 0.9, rate: 0.89, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'seneca': { gender: 'male', pitch: 0.93, rate: 0.91, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'epiktet': { gender: 'male', pitch: 0.94, rate: 0.9, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'cicero': { gender: 'male', pitch: 0.98, rate: 0.98, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'al-farabi': { gender: 'male', pitch: 0.94, rate: 0.92, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'rumi': { gender: 'male', pitch: 0.94, rate: 0.88, voiceIds: { de: 'de-pavoque', en: 'en-joe' } },
    'omar khayyam': { gender: 'male', pitch: 0.97, rate: 0.94, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },

    // --- Politik, Fuehrung, Strategie, Geschichte ---
    'napoleon bonaparte': { gender: 'male', pitch: 0.96, rate: 1.0, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'julius caesar': { gender: 'male', pitch: 0.93, rate: 0.97, voiceIds: { de: 'de-pavoque', en: 'en-ryan' } },
    'alexander der grosse': { gender: 'male', pitch: 1.0, rate: 1.01, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    // Wuerdevolle, ruhige Stimme; tr-dfki ist die einzige tr-Piper-Stimme.
    // Rechtlich: Gesetz 5816 (Tuerkei) beachten - keine Imitation, respektvolle Darstellung.
    'mustafa kemal atatuerk': { gender: 'male', pitch: 0.92, rate: 0.93, voiceIds: { de: 'de-thorsten', en: 'en-ryan', tr: 'tr-dfki' } },
    'saladin': { gender: 'male', pitch: 0.91, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'hannibal': { gender: 'male', pitch: 0.9, rate: 0.95, voiceIds: { de: 'de-pavoque', en: 'en-ryan' } },
    'otto von bismarck': { gender: 'male', pitch: 0.85, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'niccolo machiavelli': { gender: 'male', pitch: 0.99, rate: 0.99, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'sun tzu': { gender: 'male', pitch: 0.92, rate: 0.87, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'benjamin franklin': { gender: 'male', pitch: 0.96, rate: 0.95, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
    'thomas jefferson': { gender: 'male', pitch: 0.97, rate: 0.94, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'adam smith': { gender: 'male', pitch: 0.96, rate: 0.93, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'herodot': { gender: 'male', pitch: 0.95, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'thukydides': { gender: 'male', pitch: 0.93, rate: 0.91, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },

    // --- Literatur ---
    'william shakespeare': { gender: 'male', pitch: 1.0, rate: 0.98, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'johann wolfgang von goethe': { gender: 'male', pitch: 0.95, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'dante alighieri': { gender: 'male', pitch: 0.93, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'homer': { gender: 'male', pitch: 0.88, rate: 0.87, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'miguel de cervantes': { gender: 'male', pitch: 0.98, rate: 0.97, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'victor hugo': { gender: 'male', pitch: 0.94, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'leo tolstoi': { gender: 'male', pitch: 0.89, rate: 0.89, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'fjodor dostojewski': { gender: 'male', pitch: 0.9, rate: 0.92, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'charles dickens': { gender: 'male', pitch: 0.99, rate: 0.98, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'mark twain': { gender: 'male', pitch: 1.0, rate: 0.99, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'franz kafka': { gender: 'male', pitch: 1.0, rate: 0.93, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'jules verne': { gender: 'male', pitch: 0.98, rate: 1.0, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'h. g. wells': { gender: 'male', pitch: 0.97, rate: 0.97, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'edgar allan poe': { gender: 'male', pitch: 0.94, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'jane austen': { gender: 'female', pitch: 1.06, rate: 0.96, voiceIds: { de: 'de-kerstin', en: 'en-amy' } },
    'mary shelley': { gender: 'female', pitch: 1.02, rate: 0.95, voiceIds: { de: 'de-eva', en: 'en-hfc-female' } },
    'oscar wilde': { gender: 'male', pitch: 1.04, rate: 1.0, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'hans christian andersen': { gender: 'male', pitch: 1.03, rate: 0.97, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'sophokles': { gender: 'male', pitch: 0.91, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-lessac' } },
    'euripides': { gender: 'male', pitch: 0.94, rate: 0.92, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'vergil': { gender: 'male', pitch: 0.95, rate: 0.91, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },

    // --- Kunst, Architektur ---
    'leonardo da vinci': { gender: 'male', pitch: 0.98, rate: 0.97, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'michelangelo': { gender: 'male', pitch: 0.9, rate: 0.92, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'raphael': { gender: 'male', pitch: 1.01, rate: 0.98, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'mimar sinan': { gender: 'male', pitch: 0.93, rate: 0.91, voiceIds: { de: 'de-thorsten', en: 'en-lessac', tr: 'tr-dfki' } },
    'vincent van gogh': { gender: 'male', pitch: 0.97, rate: 0.95, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },

    // --- Musik ---
    'wolfgang amadeus mozart': { gender: 'male', pitch: 1.06, rate: 1.02, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'ludwig van beethoven': { gender: 'male', pitch: 0.84, rate: 0.9, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'johann sebastian bach': { gender: 'male', pitch: 0.9, rate: 0.92, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'frederic chopin': { gender: 'male', pitch: 1.02, rate: 0.94, voiceIds: { de: 'de-thorsten', en: 'en-lessac' } },
    'franz schubert': { gender: 'male', pitch: 1.01, rate: 0.96, voiceIds: { de: 'de-karlsson', en: 'en-joe' } },
    'giuseppe verdi': { gender: 'male', pitch: 0.92, rate: 0.94, voiceIds: { de: 'de-pavoque', en: 'en-ryan' } },
    'antonio vivaldi': { gender: 'male', pitch: 1.0, rate: 1.0, voiceIds: { de: 'de-thorsten', en: 'en-ryan' } },
    'richard wagner': { gender: 'male', pitch: 0.87, rate: 0.91, voiceIds: { de: 'de-pavoque', en: 'en-hfc-male' } },
    'claude debussy': { gender: 'male', pitch: 0.99, rate: 0.93, voiceIds: { de: 'de-karlsson', en: 'en-lessac' } },
    'pjotr tschaikowski': { gender: 'male', pitch: 0.96, rate: 0.93, voiceIds: { de: 'de-thorsten', en: 'en-joe' } },
}

// Namensvarianten (nach Diakritika-Normalisierung), die auf denselben Twin zeigen.
const VOICE_HINT_ALIASES: Record<string, string> = {
    'mustafa kemal ataturk': 'mustafa kemal atatuerk',
    'ataturk': 'mustafa kemal atatuerk',
    'atatuerk': 'mustafa kemal atatuerk',
}

for (const [alias, target] of Object.entries(VOICE_HINT_ALIASES)) {
    const hint = CURATED_VOICE_HINTS[target]
    if (hint && !CURATED_VOICE_HINTS[alias]) CURATED_VOICE_HINTS[alias] = hint
}
