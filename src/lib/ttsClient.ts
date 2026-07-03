// Remote-TTS-Client fuer Piper auf dem Salad-Backend (POST /api/tts).
// Fallback-Kette: Aufrufer nutzt bei false die lokale System-Stimme.
// Shared-Audio-Element + Unlock im Klick-Kontext (iOS/Android Autoplay-Policy),
// Session-Cache fuer wiederkehrende Texte (z. B. Begruessungen).
import { buildServiceUrl } from '@/lib/serviceEndpoints'

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
): Promise<boolean> {
  stopRemoteSpeech()
  try {
    const cleanText = text.slice(0, 800)
    const cacheKey = (voiceId ?? gender ?? 'x') + '|' + (lang ?? 'de') + '|' + cleanText
    let url = audioCache.get(cacheKey)
    if (!url) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 6000)
      const response = await fetch(buildServiceUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, lang: lang ?? 'de', gender, voiceId }),
        signal: controller.signal,
      })
      window.clearTimeout(timer)
      if (!response.ok) return false
      const blob = await response.blob()
      if (blob.size < 100) return false
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
    audio.src = url
    active = true
    await audio.play()
    return true
  } catch {
    stopRemoteSpeech()
    return false
  }
}
