import { fetchService } from '@/lib/serviceEndpoints'

export type ServerAsrResult = {
  text: string
  language: string
  engine?: string
  durationMs?: number
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
]

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((mime) => {
    try {
      return MediaRecorder.isTypeSupported(mime)
    } catch {
      return false
    }
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Audio konnte nicht gelesen werden.'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.split(',', 2)[1] : value)
    }
    reader.readAsDataURL(blob)
  })
}

export function serverAsrSupported(): boolean {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined'
}

export async function recordAndTranscribeOnce(lang: string, maxMs = 5200): Promise<ServerAsrResult> {
  if (!serverAsrSupported()) throw new Error('Server-ASR wird von diesem Browser nicht unterstuetzt.')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  const chunks: BlobPart[] = []
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  try {
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => reject(new Error('Aufnahme konnte nicht verarbeitet werden.'))
      recorder.onstop = () => resolve()
    })
    recorder.start(250)
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, maxMs)
    await stopped
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
  if (blob.size < 600) throw new Error('Aufnahme ist zu kurz.')
  const audioBase64 = await blobToBase64(blob)
  const response = await fetchService('/api/asr/transcribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      contentType: blob.type || 'audio/webm',
      lang,
    }),
  })
  if (!response.ok) throw new Error('Server-Spracherkennung ist gerade nicht verfuegbar.')
  const result = (await response.json()) as ServerAsrResult
  if (!result.text?.trim()) throw new Error('Keine Sprache erkannt.')
  return { ...result, text: result.text.trim() }
}
