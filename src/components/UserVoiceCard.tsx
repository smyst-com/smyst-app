// Eigene Stimme (Phase 1) — Aufnahme, Zustimmung und Stimmwahl fuer die
// eigenen Twins. Privacy by Design: Aufnahme nur mit expliziter Zustimmung,
// privat im Object Brain (IDrive e2), Wirkung nur fuer eigene Profile,
// jederzeit widerrufbar. Phase 2 (echte Klon-Stimme) nutzt die Aufnahme.
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildServiceUrl, fetchService } from '@/lib/serviceEndpoints'
import { applyUserVoiceProfile } from '@/lib/userVoice'

const VOICE_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'de-thorsten', label: 'Männlich · klar' },
  { id: 'de-karlsson', label: 'Männlich · ruhig' },
  { id: 'de-pavoque', label: 'Männlich · tief' },
  { id: 'de-kerstin', label: 'Weiblich · klar' },
  { id: 'de-ramona', label: 'Weiblich · warm' },
  { id: 'de-eva', label: 'Weiblich · hell' },
]

const PREVIEW_TEXT = 'Hallo, so klingt dein Twin auf smyst.com.'
const MAX_RECORD_SECONDS = 30

interface VoiceProfileState {
  consent?: boolean
  voiceId?: string
  sampleKey?: string
  sampleFilename?: string
  status?: string
  updatedAt?: number
}

export default function UserVoiceCard() {
  const [voice, setVoice] = useState<VoiceProfileState | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [sampleBlob, setSampleBlob] = useState<Blob | null>(null)
  const [sampleUrl, setSampleUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetchService('/api/voice/profile', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok || cancelled) return
        const data = (await response.json()) as { voice?: VoiceProfileState | null; names?: string[] }
        if (cancelled) return
        setVoice(data.voice ?? null)
        if (data.voice?.voiceId) setSelectedVoiceId(data.voice.voiceId)
        if (data.voice?.consent) setConsentChecked(true)
        applyUserVoiceProfile(data.names, data.voice?.consent ? (data.voice.sampleKey ? 'de-own' : data.voice.voiceId) : undefined)
      } catch {
        // Karte bleibt nutzbar; Speichern zeigt Fehler transparent an.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (sampleUrl) URL.revokeObjectURL(sampleUrl)
      recorderRef.current?.stream?.getTracks().forEach((track) => track.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    setStatus('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : undefined
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          setSampleBlob(blob)
          setSampleUrl((current) => {
            if (current) URL.revokeObjectURL(current)
            return URL.createObjectURL(blob)
          })
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((current) => {
          if (current + 1 >= MAX_RECORD_SECONDS) stopRecording()
          return current + 1
        })
      }, 1000)
    } catch {
      setStatus('Mikrofon nicht verfügbar. Bitte Mikrofon-Zugriff erlauben.')
    }
  }, [stopRecording])

  const previewVoice = useCallback(async (voiceId: string) => {
    try {
      setPreviewingId(voiceId)
      const response = await fetch(buildServiceUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: PREVIEW_TEXT, lang: 'de', voiceId }),
      })
      if (!response.ok) {
        setPreviewingId(null)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (!previewAudioRef.current) previewAudioRef.current = new Audio()
      const audio = previewAudioRef.current
      audio.src = url
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPreviewingId(null)
      }
      await audio.play()
    } catch {
      setPreviewingId(null)
    }
  }, [])

  const save = useCallback(async () => {
    if (!consentChecked || !selectedVoiceId) return
    setSaving(true)
    setStatus('')
    try {
      let sampleKey: string | undefined
      let sampleUploadId: string | undefined
      let sampleFilename: string | undefined
      if (sampleBlob) {
        const extension = sampleBlob.type.includes('webm') ? 'webm' : 'wav'
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const value = String(reader.result ?? '')
            resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value)
          }
          reader.onerror = () => reject(new Error('read failed'))
          reader.readAsDataURL(sampleBlob)
        })
        const uploadResponse = await fetchService('/api/voice/sample', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
          body: JSON.stringify({
            audioBase64: base64,
            contentType: sampleBlob.type || 'audio/webm',
            filename: `stimmprobe-${Date.now()}.${extension}`,
          }),
        })
        const uploadData = (await uploadResponse.json().catch(() => null)) as
          | { ok?: boolean; sampleKey?: string; error?: { message?: string } }
          | null
        if (!uploadResponse.ok || !uploadData?.sampleKey) {
          setStatus(uploadData?.error?.message ?? 'Stimmprobe konnte nicht hochgeladen werden.')
          setSaving(false)
          return
        }
        sampleKey = uploadData.sampleKey
        sampleFilename = `stimmprobe-${Date.now()}.${extension}`
      }
      const response = await fetchService('/api/voice/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({
          consent: true,
          voiceId: selectedVoiceId,
          sampleKey,
          sampleUploadId,
          sampleFilename,
        }),
      })
      const data = (await response.json().catch(() => null)) as
        | { voice?: VoiceProfileState | null; names?: string[]; error?: { message?: string } }
        | null
      if (!response.ok) {
        setStatus(data?.error?.message ?? `Speichern fehlgeschlagen (${response.status}).`)
        setSaving(false)
        return
      }
      setVoice(data?.voice ?? null)
      applyUserVoiceProfile(data?.names, data?.voice?.consent ? (data?.voice?.sampleKey ? 'de-own' : data?.voice?.voiceId) : undefined)
      setStatus('Stimmprofil gespeichert. Dein Twin spricht jetzt mit dieser Stimme.')
    } catch {
      setStatus('Speichern gerade nicht möglich. Bitte später erneut versuchen.')
    }
    setSaving(false)
  }, [consentChecked, selectedVoiceId, sampleBlob])

  const revoke = useCallback(async () => {
    setSaving(true)
    setStatus('')
    try {
      const response = await fetchService('/api/voice/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ consent: false }),
      })
      if (response.ok) {
        const data = (await response.json().catch(() => null)) as { names?: string[] } | null
        setVoice(null)
        setConsentChecked(false)
        applyUserVoiceProfile(data?.names, undefined)
        setStatus('Zustimmung widerrufen. Dein Twin nutzt wieder die Standardstimme.')
      } else {
        setStatus(`Widerruf fehlgeschlagen (${response.status}).`)
      }
    } catch {
      setStatus('Widerruf gerade nicht möglich. Bitte später erneut versuchen.')
    }
    setSaving(false)
  }, [])

  const active = Boolean(voice?.consent && voice?.voiceId)
  const activeLabel = VOICE_CHOICES.find((choice) => choice.id === voice?.voiceId)?.label

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.05] p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-lg font-semibold">Meine Stimme</h3>
          <p className="text-sm text-[#555b64]">
            Dein Twin antwortet mit deiner gewählten Stimme — nur für deine eigenen Profile.
          </p>
        </div>
        {active && (
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500">
            Aktiv{activeLabel ? ` · ${activeLabel}` : ''}{voice?.sampleKey ? ' · Stimmprobe hinterlegt' : ''}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">1. Stimmprobe aufnehmen (empfohlen)</p>
          <p className="mt-1 text-xs text-[#767d87]">
            Sprich 10–30 Sekunden frei, z. B. wer du bist und was dir wichtig ist. Die Aufnahme
            bleibt privat gespeichert und wird für deine kommende Klon-Stimme (Phase 2) genutzt.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (recording ? stopRecording() : void startRecording())}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${recording ? 'bg-red-500/20 text-red-400' : 'border border-white/20 bg-white/[0.06] hover:bg-white/[0.12]'}`}
            >
              {recording ? `Aufnahme stoppen (${recordSeconds}s)` : sampleBlob ? 'Neu aufnehmen' : 'Aufnahme starten'}
            </button>
            {sampleUrl && !recording && (
              <audio controls src={sampleUrl} className="h-9 max-w-full" />
            )}
          </div>
          {saving && sampleBlob && (
            <p className="mt-2 text-xs text-[#767d87]">Stimmprobe wird hochgeladen …</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">2. Twin-Stimme wählen</p>
          <p className="mt-1 text-xs text-[#767d87]">
            Phase 1: Wähle die smyst-Stimme, die deiner am nächsten kommt. Mit „Anhören" kannst du
            jede Stimme testen.
          </p>
          <div className="mt-3 grid gap-2">
            {VOICE_CHOICES.map((choice) => (
              <label
                key={choice.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${selectedVoiceId === choice.id ? 'border-[#59C7FF] bg-[#59C7FF]/10' : 'border-white/12 bg-white/[0.02]'}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="user-voice-choice"
                    checked={selectedVoiceId === choice.id}
                    onChange={() => setSelectedVoiceId(choice.id)}
                  />
                  {choice.label}
                </span>
                <button
                  type="button"
                  onClick={() => void previewVoice(choice.id)}
                  disabled={previewingId !== null}
                  className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {previewingId === choice.id ? 'Spielt …' : 'Anhören'}
                </button>
              </label>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(event) => setConsentChecked(event.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[#8e97a8]">
          Ich stimme zu, dass smyst.com meine Stimmaufnahme privat speichert, um mein persönliches
          Stimmprofil zu erstellen. Es gilt nur für meine eigenen Twins und ich kann die Zustimmung
          jederzeit widerrufen.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!consentChecked || !selectedVoiceId || saving || recording}
          className="rounded-md border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Speichert …' : 'Stimme aktivieren'}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={saving}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            Zustimmung widerrufen
          </button>
        )}
        {status && <p className="text-sm text-[#8e97a8]">{status}</p>}
      </div>
    </section>
  )
}
