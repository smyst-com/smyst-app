// Remote-TTS-Client fuer Piper auf dem Salad-Backend (POST /api/tts).
// Fallback-Kette: Aufrufer nutzt bei false die lokale System-Stimme.
import { buildServiceUrl } from '@/lib/serviceEndpoints'

let activeAudio: HTMLAudioElement | null = null
let activeUrl: string | null = null

export function isRemoteSpeechActive(): boolean {
  return activeAudio !== null
}

export function stopRemoteSpeech(): void {
  const audio = activeAudio
  activeAudio = null
  if (audio) {
    audio.onended = null
    audio.onerror = null
    audio.pause()
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl)
    activeUrl = null
  }
}

export async function playRemoteSpeech(
  text: string,
  lang: string | undefined,
  gender: 'female' | 'male' | undefined,
  onDone: () => void,
): Promise<boolean> {
  stopRemoteSpeech()
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    const response = await fetch(buildServiceUrl('/api/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 800), lang: lang ?? 'de', gender }),
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (!response.ok) return false
    const blob = await response.blob()
    if (blob.size < 100) return false
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    const finish = () => {
      if (activeAudio === audio) activeAudio = null
      URL.revokeObjectURL(url)
      if (activeUrl === url) activeUrl = null
      onDone()
    }
    audio.onended = finish
    audio.onerror = finish
    activeAudio = audio
    activeUrl = url
    await audio.play()
    return true
  } catch {
    stopRemoteSpeech()
    return false
  }
}
