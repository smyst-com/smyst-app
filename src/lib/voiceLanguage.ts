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

// Nur Woerter aufnehmen, die innerhalb dieser 15 Sprachen eindeutig sind —
// countMatches() strippt Diakritika, also zaehlt z. B. 'erzähl' als 'erzahl'.
// Mehrdeutige Kurzwoerter ('was' de/en, 'me' es/en, 'in' de/en) gehoeren nur
// in die Liste EINER Sprache, sonst kippt der Tie-Break zur erstgelisteten.
const WORD_MARKERS: Record<VoiceLang, readonly string[]> = {
  en: ['the', 'and', 'please', 'what', 'how', 'why', 'hello', 'hi', 'hey', 'thanks', 'you', 'your', 'is', 'are', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'my', 'of', 'to', 'this', 'that', 'tell', 'about', 'who', 'which', 'have', 'has', 'not', 'it'],
  zh: [],
  es: ['que', 'como', 'por', 'para', 'hola', 'gracias', 'usted', 'quiero', 'esta', 'quien', 'cuando', 'donde', 'dime', 'cuentame', 'puedes', 'eres', 'soy', 'muy', 'tambien'],
  ar: [],
  fr: ['bonjour', 'merci', 'comment', 'pourquoi', 'avec', 'vous', 'etre', 'dans', 'est', 'oui', 'très', 'ça', 'salut', 'quel', 'quelle', 'quoi', 'moi', 'toi', 'votre', 'notre', 'raconte', 'parle', 'peux', 'suis'],
  de: ['ich', 'du', 'der', 'die', 'das', 'und', 'nicht', 'bitte', 'danke', 'warum', 'ist', 'was', 'wie', 'ein', 'eine', 'mit', 'auch', 'für', 'über', 'schön', 'aber', 'hallo', 'erzähl', 'erzähle', 'erklär', 'erkläre', 'sag', 'mir', 'dir', 'mich', 'dich', 'wer', 'wo', 'wann', 'wieso', 'weshalb', 'welche', 'welcher', 'kann', 'kannst', 'bist', 'sind', 'hast', 'habe', 'haben', 'dein', 'deine', 'deiner', 'mein', 'meine', 'sehr', 'heute', 'jetzt', 'noch', 'schon', 'dann', 'oder', 'vom', 'zum', 'zur', 'auf', 'aus', 'bei', 'nach', 'von', 'wichtigste', 'wichtig'],
  pt: ['ola', 'obrigado', 'obrigada', 'como', 'porque', 'voce', 'para', 'com', 'muito', 'não', 'sim', 'quem', 'onde', 'conte', 'pode', 'sou', 'fale', 'falar'],
  ru: [],
  tr: ['merhaba', 'tesekkur', 'ederim', 'nasilsin', 'nasıl', 'ben', 'bir', 'icin', 'için', 'degil', 'değil', 'lutfen', 'lütfen', 'çok', 'neden', 'güzel', 'önemli', 'kadar', 'evet', 'nedir', 'teşekkürler'],
  ja: [],
  ko: [],
  it: ['ciao', 'grazie', 'come', 'perche', 'perchè', 'sono', 'voglio', 'con', 'chi', 'dove', 'cosa', 'sei', 'dimmi', 'puoi', 'raccontami', 'parlami'],
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

// Explizite Sprachwuensche deterministisch erkennen: "kannst du mit mir
// tuerkisch reden" besteht nur aus deutschen Woertern, die Wortmarker-Erkennung
// liefert also de — und das Modell blieb bei Deutsch statt zu wechseln
// (live 28.07.). Ein Sprachwunsch braucht BEIDES in einer Nachricht: den Namen
// einer unterstuetzten Sprache UND ein Sprech-/Antwort-Verb. Namen matchen nur
// als ganzes Wort (Latein) bzw. Teilstring (CJK/Arabisch/Indisch), damit
// "tuerkische Musik" oder "in der Tuerkei" nicht ausloesen.
const LANGUAGE_REQUEST_NAMES: Record<VoiceLang, readonly string[]> = {
  en: ['englisch', 'english', 'ingles', 'anglais', 'inglese', 'ingilizce', 'англиис', 'انجليزية', 'الإنجليزية', '英語', '英语', '영어', 'अंग्रेजी', 'ইংরেজি', 'inggris'],
  zh: ['chinesisch', 'chinese', 'chino', 'chinois', 'cinese', 'chines', 'cince', 'китаис', 'صينية', '中文', '中国語', '중국어', 'चीनी', 'চীনা', 'mandarin'],
  es: ['spanisch', 'spanish', 'espanol', 'espagnol', 'spagnolo', 'espanhol', 'ispanyolca', 'испанс', 'إسبانية', 'スペイン語', '西班牙语', '스페인어', 'स्पेनिश', 'স্প্যানিশ'],
  ar: ['arabisch', 'arabic', 'arabe', 'arabo', 'arapca', 'арабс', 'عربية', 'العربية', 'アラビア語', '阿拉伯语', '아랍어', 'अरबी', 'আরবি'],
  fr: ['franzosisch', 'french', 'frances', 'francais', 'francese', 'fransizca', 'французс', 'فرنسية', 'フランス語', '法语', '프랑스어', 'फ्रेंच', 'ফরাসি'],
  de: ['deutsch', 'german', 'aleman', 'allemand', 'tedesco', 'alemao', 'almanca', 'немецк', 'ألمانية', 'ドイツ語', '德语', '독일어', 'जर्मन', 'জার্মান'],
  pt: ['portugiesisch', 'portuguese', 'portugues', 'portugais', 'portoghese', 'portekizce', 'португальс', 'برتغالية', 'ポルトガル語', '葡萄牙语', '포르투갈어', 'पुर्तगाली', 'পর্তুগিজ'],
  ru: ['russisch', 'russian', 'ruso', 'russe', 'russo', 'rusca', 'русск', 'روسية', 'ロシア語', '俄语', '러시아어', 'रूसी', 'রুশ'],
  tr: ['turkisch', 'turkish', 'turco', 'turc', 'turkce', 'турецк', 'تركية', 'トルコ語', '土耳其语', '터키어', 'तुर्की', 'তুর্কি'],
  ja: ['japanisch', 'japanese', 'japones', 'japonais', 'giapponese', 'japonca', 'японс', 'يابانية', '日本語', '日语', '일본어', 'जापानी', 'জাপানি'],
  ko: ['koreanisch', 'korean', 'coreano', 'coreen', 'korece', 'корейс', 'كورية', '韓国語', '韩语', '한국어', 'कोरियाई', 'কোরিয়ান'],
  it: ['italienisch', 'italian', 'italiano', 'italien', 'italyanca', 'итальянс', 'إيطالية', 'イタリア語', '意大利语', '이탈리아어', 'इतालवी', 'ইতালীয়'],
  hi: ['hindi', 'хинди', 'هندية', 'ヒンディー語', '印地语', '힌디어', 'हिंदी', 'हिन्दी', 'হিন্দি'],
  id: ['indonesisch', 'indonesian', 'indonesio', 'indonesien', 'indonesiano', 'endonezce', 'индонезийс', 'إندونيسية', 'インドネシア語', '印尼语', '인도네시아어', 'इंडोनेशियाई', 'ইন্দোনেশীয়'],
  bn: ['bengalisch', 'bengali', 'bengalí', 'bengalce', 'бенгальс', 'بنغالية', 'ベンガル語', '孟加拉语', '벵골어', 'बंगाली', 'বাংলা'],
}

const SPEAK_VERB_MARKERS: readonly string[] = [
  // de
  'red', 'rede', 'reden', 'redest', 'sprich', 'sprichst', 'sprechen', 'sprech', 'antworte', 'antworten', 'antwortest', 'schreib', 'schreibe', 'schreiben', 'wechsle', 'wechseln', 'umschalten',
  // en
  'speak', 'talk', 'answer', 'reply', 'respond', 'write', 'switch', 'chat',
  // es / pt / it / fr
  'habla', 'hablar', 'hablas', 'responde', 'responder', 'escribe', 'fala', 'falar', 'fale', 'parla', 'parlare', 'parlami', 'rispondi', 'parle', 'parler', 'parles', 'reponds', 'ecris',
  // tr
  'konus', 'konusur', 'konusabilir', 'konusalim', 'cevap', 'yanit', 'yaz',
  // id
  'bicara', 'berbicara', 'jawab', 'tulis',
]

// Nicht-lateinische Schriften haben keine Wortgrenzen im \s-Sinn (CJK) —
// dort reicht der Sprachname als Teilstring als Signal fuer den Wunsch.
const NON_LATIN_NAME = /[^a-z]/

export function detectRequestedLanguage(text: string): VoiceLang | null {
  const value = text.trim()
  if (!value) return null
  const normalized = normalizeForWordMarkers(value)
  const words = new Set(normalized.split(/\s+/).filter(Boolean))
  const compact = normalized.replace(/\s+/g, '')

  let requested: VoiceLang | null = null
  for (const lang of REQUIRED_VOICE_LANGUAGES) {
    for (const name of LANGUAGE_REQUEST_NAMES[lang]) {
      const normalizedName = normalizeForWordMarkers(name).replace(/\s+/g, '')
      if (!normalizedName) continue
      const isNonLatin = NON_LATIN_NAME.test(normalizedName)
      const hit = isNonLatin ? compact.includes(normalizedName) : words.has(normalizedName)
      if (hit) {
        // Mehrere Sprachnamen in einer Nachricht ("uebersetze deutsch nach
        // tuerkisch")? Dann ist der Wunsch mehrdeutig — nicht umschalten.
        if (requested && requested !== lang) return null
        requested = lang
      }
    }
  }
  if (!requested) return null

  const hasSpeakVerb = SPEAK_VERB_MARKERS.some((verb) => words.has(verb))
    || /話し|話せ|말해|말할|تكلم|تحدث|говор|बोल|बात|লেখ|বল/.test(value)
  return hasSpeakVerb ? requested : null
}

export function detectVoiceLanguage(text: string, fallback: string = DEFAULT_LANG): VoiceLang {
  const value = text.trim()
  if (!value) return toVoiceLang(fallback)

  if (/[\u0600-\u06ff]/.test(value)) return 'ar'
  if (/[\u0980-\u09ff]/.test(value)) return 'bn'
  if (/[\u0900-\u097f]/.test(value)) return 'hi'
  // Kana zuerst: Japanisch enthält fast immer Hiragana/Katakana, aber auch Kanji (CJK).
  // Der CJK-Check zuerst würde japanische Sätze fälschlich als Chinesisch einstufen.
  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  // Nur eindeutig türkische Buchstaben (ı/İ ohne/mit Punkt, ğ, ş).
  // ç/ö/ü sind mehrdeutig (Deutsch, Französisch, Portugiesisch) und führten zu
  // falscher Türkisch-Erkennung, z. B. bei "schön", "für" oder "ça".
  if (/[ğışİĞŞ]/.test(value)) return 'tr'
  // ß existiert nur im Deutschen
  if (/[ßẞ]/.test(value)) return 'de'

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

// Startsprache fuer Chat/Voice = die Sprache, in der die Seite gerade angezeigt
// wird. navigator.language darf hier NICHT gewinnen: die Seite liefert unter
// smyst.com immer die deutsche UI aus, viele Geraete stehen aber auf Englisch —
// der alte navigator-Vorrang machte 'en' zum Fallback, und sobald die
// Wortmarker-Erkennung einen deutschen Satz nicht erkannte, ging
// "Answer only in English" an das Modell (alle Antworten englisch, 27.07.).
export function preferredVoiceLanguage(current: string = DEFAULT_LANG): VoiceLang {
  return toVoiceLang(current)
}

// Standardsprache mit Wechsel-Erlaubnis, KEIN harter Zwang: "Answer only in X.
// Do not switch languages" liess Twins Sprachwechsel-Bitten ablehnen ("Ich kann
// nur auf Deutsch antworten" auf "kannst du mit mir tuerkisch reden", 28.07.).
// Das Praefix "[Voice language: Name (xx)." muss erhalten bleiben —
// degraded_messages.py im Backend parst genau dieses Muster.
export function voiceLanguageInstruction(message: string, lang: string): string {
  const voiceLang = toVoiceLang(lang)
  const name = voiceLanguageName(voiceLang)
  return [
    `[Voice language: ${name} (${voiceLang}). Answer in ${name} by default. You speak every language fluently. Highest priority: if the user asks you to talk in another language (e.g. "kannst du tuerkisch reden", "speak English"), your ENTIRE reply must already be in that requested language — never answer such a request in ${name}, never refuse, never claim you can only speak one language. Do not mix languages within a single reply unless asked for a translation.]`,
    message,
  ].join('\n\n')
}
