// Remote-TTS-Client fuer Piper auf dem Salad-Backend (POST /api/tts).
// Fallback-Kette: Aufrufer nutzt bei false die lokale System-Stimme.
// Shared-Audio-Element + Unlock im Klick-Kontext (iOS/Android Autoplay-Policy),
// Session-Cache fuer wiederkehrende Texte (z. B. Begruessungen).
import { buildServiceUrl } from '@/lib/serviceEndpoints'
import { remoteBaseFor, resolveSpeechLang } from '@/lib/voiceProfiles'

const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let sharedAudio: HTMLAudioElement | null = null
let active = false
const audioCache = new Map<string, string>()

function getSharedAudio(): HTMLAudioElement {
    if (!sharedAudio) sharedAudio = new Audio()
    return sharedAudio
}

// Muss synchron in einem User-Klick-Handler aufgerufen werden, damit iOS/Android
// spaetere programmgesteuerte Wiedergaben auf demselben Element erlauben.
export function unlockAudioPlayback(): void {
    try {
          const audio = getSharedAudio()
          if (active) return
          audio.muted = true
          audio.src = SILENT_WAV
          const attempt = audio.play()
          if (attempt) attempt.catch(() => undefined)
          audio.pause()
          audio.muted = false
    } catch {
          // Unlock ist best effort
    }
}

export function isRemoteSpeechActive(): boolean {
    return active
}

export function stopRemoteSpeech(): void {
    active = false
    if (activeSentenceQueue) {
          const queue = activeSentenceQueue
          activeSentenceQueue = null
          queue.cancelQueue()
    }
    if (sharedAudio) {
          sharedAudio.onended = null
          sharedAudio.onerror = null
          sharedAudio.pause()
    }
}

export async function playRemoteSpeech(
    text: string,
    lang: string | undefined,
    gender: 'female' | 'male' | undefined,
    onDone: () => void,
    voiceId?: string,
    rate?: number,
  ): Promise<boolean> {
    stopRemoteSpeech()
    // Sofort als aktiv markieren: auch waehrend die Stimme generiert/geladen wird,
    // darf das Mikro nicht wieder aufmachen - sonst Echo-Loop in der Ladeluecke.
    active = true
    try {
          const cleanText = text.slice(0, 800)
          // Sprach-Korrektur: Antworten koennen von der UI-Sprache abweichen
      // (z. B. tuerkische Antwort bei deutscher UI). Die Stimme muss zur
      // Sprache des Texts passen, sonst liest eine falsche Stimme vor.
      const effectiveLang = resolveSpeechLang(cleanText, lang)
          const expectedBase = remoteBaseFor(effectiveLang)
          const effectiveVoiceId =
                  voiceId && voiceId.startsWith(expectedBase + '-') ? voiceId : undefined
          const cacheKey =
                  (effectiveVoiceId ?? gender ?? 'x') + '|' + (rate ?? '') + '|' + effectiveLang + '|' + cleanText
          let url = audioCache.get(cacheKey)
          if (!url) {
                  const controller = new AbortController()
                  const timer = window.setTimeout(
                    () => controller.abort(),
                    effectiveVoiceId === 'de-own' ? 45000 : 6000,
                  )
                  const response = await fetch(buildServiceUrl('/api/tts'), {
                            method: 'POST',
          credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                        text: cleanText,
                                        lang: effectiveLang,
                                        gender,
                                        voiceId: effectiveVoiceId,
                                        rate,
                            }),
                            signal: controller.signal,
                  })
                  window.clearTimeout(timer)
                  if (!response.ok) {
                        active = false
                        return false
                  }
                  const blob = await response.blob()
                  if (blob.size < 100) {
                        active = false
                        return false
                  }
                  url = URL.createObjectURL(blob)
                  if (audioCache.size >= 24) {
                            for (const [oldKey, oldUrl] of audioCache) {
                                        URL.revokeObjectURL(oldUrl)
                                        audioCache.delete(oldKey)
                                        break
                            }
                  }
                  audioCache.set(cacheKey, url)
          }
          const audio = getSharedAudio()
          const finish = () => {
                  if (!active) return
                  active = false
                  onDone()
          }
          audio.onended = finish
          audio.onerror = finish
          // Wurde waehrend des Ladens gestoppt? Dann nicht mehr abspielen.
          if (!active) return false
          audio.src = url
          await audio.play()
          return true
    } catch {
          stopRemoteSpeech()
          return false
    }
}

// --- Streaming-Satz-TTS (Runde 37) ---
// Fertige Saetze einer gestreamten Chat-Antwort werden sofort synthetisiert
// (Prefetch) und in einer Queue OHNE Ueberlappung abgespielt. Stopp ueber
// stopRemoteSpeech() (alle bestehenden Stopp-Pfade) bricht Queue + Audio ab.

export interface SentenceSpeech {
    feed(fullText: string): void
    finish(finalText?: string): void
    cancel(): void
    active(): boolean
}

interface SentenceQueueHandle {
    cancelQueue(): void
}

let activeSentenceQueue: SentenceQueueHandle | null = null

async function fetchSpeechUrl(
    cleanText: string,
    lang: string | undefined,
    gender: 'female' | 'male' | undefined,
    voiceId?: string,
    rate?: number,
): Promise<string | null> {
    try {
        const effectiveLang = resolveSpeechLang(cleanText, lang)
        const expectedBase = remoteBaseFor(effectiveLang)
        const effectiveVoiceId =
            voiceId && voiceId.startsWith(expectedBase + '-') ? voiceId : undefined
        const cacheKey =
            (effectiveVoiceId ?? gender ?? 'x') + '|' + (rate ?? '') + '|' + effectiveLang + '|' + cleanText
        const cached = audioCache.get(cacheKey)
        if (cached) return cached
        const controller = new AbortController()
        const timer = window.setTimeout(
            () => controller.abort(),
            effectiveVoiceId === 'de-own' ? 45000 : 6000,
        )
        const response = await fetch(buildServiceUrl('/api/tts'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: cleanText,
                lang: effectiveLang,
                gender,
                voiceId: effectiveVoiceId,
                rate,
            }),
            signal: controller.signal,
        })
        window.clearTimeout(timer)
        if (!response.ok) return null
        const blob = await response.blob()
        if (blob.size < 100) return null
        const url = URL.createObjectURL(blob)
        if (audioCache.size >= 24) {
            for (const [oldKey, oldUrl] of audioCache) {
                URL.revokeObjectURL(oldUrl)
                audioCache.delete(oldKey)
                break
            }
        }
        audioCache.set(cacheKey, url)
        return url
    } catch {
        return null
    }
}

// Satzende finden: Punkt/!/?/Ellipse + Anfuehrungszeichen + Leerraum bzw.
// CJK-Satzzeichen ohne Leerraum. Abkuerzungen ("z.", "B.", "Dr.", "1.") und
// Mini-Fragmente (< 8 Zeichen) werden nicht als Satzende gewertet.
function nextSentenceEnd(text: string, from: number): number {
    const re = /[.!?…]["'»«")\]]*\s+|[。！？]["'»«")\]]*/g
    re.lastIndex = from
    let match = re.exec(text)
    while (match) {
        const end = match.index + match[0].length
        let skip = end - from < 8
        if (!skip && match[0][0] === '.') {
            const before = text.slice(from, match.index).trim()
            const words = before.split(/\s+/)
            const lastWord = words[words.length - 1] ?? ''
            if (lastWord.length <= 2 || /^\d+$/.test(lastWord)) skip = true
        }
        if (!skip) return end
        match = re.exec(text)
    }
    return -1
}

function splitLongSentence(text: string, limit = 780): string[] {
    if (text.length <= limit) return [text]
    const parts: string[] = []
    let rest = text
    while (rest.length > limit) {
        let cut = rest.lastIndexOf(' ', limit)
        if (cut < limit / 2) cut = limit
        parts.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
    }
    if (rest) parts.push(rest)
    return parts
}

export function startSentenceSpeech(
    lang: string | undefined,
    gender: 'female' | 'male' | undefined,
    voiceId: string | undefined,
    onDone: () => void,
    rate?: number,
): SentenceSpeech {
    stopRemoteSpeech()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    active = true
    let cancelled = false
    let finished = false
    let done = false
    let consumed = 0
    let lastFull = ''
    let pumping = false
    const entries: Array<{ text: string; job: Promise<string | null> }> = []

    const handle: SentenceQueueHandle = {
        cancelQueue() {
            cancelled = true
        },
    }
    activeSentenceQueue = handle

    const playUrl = (url: string) =>
        new Promise<void>((resolvePlayed) => {
            const audio = getSharedAudio()
            let watchdog = 0
            const finishOne = () => {
                window.clearInterval(watchdog)
                audio.onended = null
                audio.onerror = null
                resolvePlayed()
            }
            watchdog = window.setInterval(() => {
                if (cancelled) finishOne()
            }, 250)
            audio.onended = finishOne
            audio.onerror = finishOne
            audio.src = url
            const attempt = audio.play()
            if (attempt) attempt.catch(finishOne)
        })

    const speakLocally = (text: string) =>
        new Promise<void>((resolveSpoken) => {
            if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
                resolveSpoken()
                return
            }
            let watchdog = 0
            const finishOne = () => {
                window.clearInterval(watchdog)
                resolveSpoken()
            }
            watchdog = window.setInterval(() => {
                if (cancelled) finishOne()
            }, 250)
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.lang = resolveSpeechLang(text, lang)
            utterance.onend = finishOne
            utterance.onerror = finishOne
            window.speechSynthesis.speak(utterance)
        })

    const pump = async () => {
        if (pumping) return
        pumping = true
        let index = 0
        for (;;) {
            if (cancelled) break
            if (index >= entries.length) {
                if (finished) break
                await new Promise((resolveTick) => window.setTimeout(resolveTick, 120))
                continue
            }
            const entry = entries[index]
            const url = await entry.job
            if (cancelled) break
            if (url) await playUrl(url)
            else await speakLocally(entry.text)
            index += 1
        }
        if (activeSentenceQueue === handle) activeSentenceQueue = null
        done = true
        if (!cancelled) {
            active = false
            onDone()
        }
    }

    const enqueue = (rawText: string) => {
        const text = rawText.trim()
        if (!text) return
        for (const part of splitLongSentence(text)) {
            entries.push({ text: part, job: fetchSpeechUrl(part, lang, gender, voiceId, rate) })
        }
        void pump()
    }

    const drainCompleteSentences = (fullText: string) => {
        for (;;) {
            const end = nextSentenceEnd(fullText, consumed)
            if (end === -1) return
            enqueue(fullText.slice(consumed, end))
            consumed = end
        }
    }

    return {
        feed(fullText: string) {
            if (cancelled || finished || fullText.length < lastFull.length) return
            lastFull = fullText
            drainCompleteSentences(fullText)
        },
        finish(finalText?: string) {
            if (cancelled || finished) return
            const base = finalText && finalText.length >= lastFull.length ? finalText : lastFull
            drainCompleteSentences(base)
            const tail = base.slice(consumed).trim()
            consumed = base.length
            if (tail) enqueue(tail)
            finished = true
            void pump()
        },
        cancel() {
            if (done) return
            cancelled = true
            if (activeSentenceQueue === handle) {
                stopRemoteSpeech()
            }
        },
        active() {
            return !cancelled && !done
        },
    }
}
