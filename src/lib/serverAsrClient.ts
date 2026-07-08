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

const DEFAULT_MAX_RECORDING_MS = 5200
const MIN_RECORDING_MS = 900
const SILENCE_STOP_MS = 1250
const SILENCE_RMS_THRESHOLD = 0.012

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
  const audioContext = new AudioContext()
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.2
  source.connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  const startedAt = performance.now()
  let heardSpeech = false
  let silentSince = 0
  let silenceTimer = 0
  try {
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => reject(new Error('Aufnahme konnte nicht verarbeitet werden.'))
      recorder.onstop = () => resolve()
    })
    recorder.start(250)
    const stopRecorder = () => {
      if (recorder.state !== 'inactive') recorder.stop()
    }
    const checkSilence = () => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        const centered = sample - 0
        sum += centered * centered
      }
      const rms = Math.sqrt(sum / samples.length)
      const elapsed = performance.now() - startedAt
      if (rms > SILENCE_RMS_THRESHOLD) {
        heardSpeech = true
        silentSince = 0
      } else if (heardSpeech && elapsed > MIN_RECORDING_MS) {
        silentSince = silentSince || performance.now()
      }
      if (silentSince && performance.now() - silentSince >= SILENCE_STOP_MS) {
        stopRecorder()
        return
      }
      if (elapsed >= Math.max(maxMs, DEFAULT_MAX_RECORDING_MS)) {
        stopRecorder()
        return
      }
      silenceTimer = window.setTimeout(checkSilence, 120)
    }
    silenceTimer = window.setTimeout(checkSilence, 120)
    await stopped
  } finally {
    if (silenceTimer) window.clearTimeout(silenceTimer)
    source.disconnect()
    await audioContext.close().catch(() => undefined)
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
