// Eigene Stimme (Phase 1) — Aufnahme, Zustimmung und Stimmwahl fuer die
// eigenen Twins. Privacy by Design: Aufnahme nur mit expliziter Zustimmung,
// privat im Object Brain (IDrive e2), Wirkung nur fuer eigene Profile,
// jederzeit widerrufbar. Phase 2 (echte Klon-Stimme) nutzt die Aufnahme.
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildServiceUrl, fetchService } from '@/lib/serviceEndpoints'
import { applyUserVoiceProfile } from '@/lib/userVoice'
import { DEFAULT_LANG, useLanguage } from '@/lib/i18n'
import { useStaticTranslations } from '@/lib/staticTranslations'

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
  const { lang } = useLanguage()
  const v = useStaticTranslations(lang).voice
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
      setStatus(lang === DEFAULT_LANG ? 'Mikrofon nicht verfügbar. Bitte Mikrofon-Zugriff erlauben.' : v.micDenied)
    }
  }, [stopRecording, lang, v])

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
        const filename = `stimmprobe-${Date.now()}.${extension}`
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
            filename,
          }),
        })
        const uploadData = (await uploadResponse.json().catch(() => null)) as
          | { ok?: boolean; sampleKey?: string; error?: { message?: string } }
          | null
        if (!uploadResponse.ok || !uploadData?.sampleKey) {
          setStatus(uploadData?.error?.message ?? (lang === DEFAULT_LANG ? 'Stimmprobe konnte nicht hochgeladen werden.' : v.sampleUploadFailed))
          setSaving(false)
          return
        }
        sampleKey = uploadData.sampleKey
        sampleFilename = filename
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
        setStatus(data?.error?.message ?? (lang === DEFAULT_LANG ? `Speichern fehlgeschlagen (${response.status}).` : `${v.saveFailed} (${response.status}).`))
        setSaving(false)
        return
      }
      setVoice(data?.voice ?? null)
      applyUserVoiceProfile(data?.names, data?.voice?.consent ? (data?.voice?.sampleKey ? 'de-own' : data?.voice?.voiceId) : undefined)
      setStatus(lang === DEFAULT_LANG ? 'Stimmprofil gespeichert. Dein Twin spricht jetzt mit dieser Stimme.' : v.saved)
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Speichern gerade nicht möglich. Bitte später erneut versuchen.' : v.saveUnavailable)
    }
    setSaving(false)
  }, [consentChecked, selectedVoiceId, sampleBlob, lang, v])

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
        setStatus(lang === DEFAULT_LANG ? 'Zustimmung widerrufen. Dein Twin nutzt wieder die Standardstimme.' : v.revoked)
      } else {
        setStatus(lang === DEFAULT_LANG ? `Widerruf fehlgeschlagen (${response.status}).` : `${v.revokeFailed} (${response.status}).`)
      }
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Widerruf gerade nicht möglich. Bitte später erneut versuchen.' : v.revokeUnavailable)
    }
    setSaving(false)
  }, [lang, v])

  const active = Boolean(voice?.consent && voice?.voiceId)
  const activeChoice = VOICE_CHOICES.find((choice) => choice.id === voice?.voiceId)
  const activeLabel = activeChoice ? (lang === DEFAULT_LANG ? activeChoice.label : (v.choices[activeChoice.id] ?? activeChoice.label)) : undefined
  const voiceStatusItems = [
    [lang === DEFAULT_LANG ? 'Stimmprobe' : v.statSample, voice?.sampleKey || sampleBlob ? (lang === DEFAULT_LANG ? 'vorhanden' : v.statSampleYes) : (lang === DEFAULT_LANG ? 'optional' : v.statSampleOptional)],
    [lang === DEFAULT_LANG ? 'Geltung' : v.statScope, lang === DEFAULT_LANG ? 'nur eigene Twins' : v.statScopeValue],
    [lang === DEFAULT_LANG ? 'Freigabe' : v.statRelease, active ? (lang === DEFAULT_LANG ? 'aktiv' : v.statReleaseActive) : (lang === DEFAULT_LANG ? 'offen' : v.statReleaseOpen)],
  ]

  return (
    <section className="rounded-lg border border-white/12 bg-white/[0.05] p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-lg font-semibold">{lang === DEFAULT_LANG ? 'Meine Stimme' : v.title}</h3>
          <p className="text-sm text-[#555b64]">
            {lang === DEFAULT_LANG ? 'Dein Twin spricht mit deiner gewählten Stimme, sobald du mit deinen eigenen Profilen chattest.' : v.subtitle}
          </p>
        </div>
        {active && (
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500">
            {lang === DEFAULT_LANG ? 'Aktiv' : v.badgeActive}{activeLabel ? ` · ${activeLabel}` : ''}{voice?.sampleKey ? (lang === DEFAULT_LANG ? ' · Stimmprobe hinterlegt' : ` · ${v.badgeSampleStored}`) : ''}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {voiceStatusItems.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">{lang === DEFAULT_LANG ? '1. Stimmprobe aufnehmen' : v.step1Title}</p>
          <p className="mt-1 text-xs text-[#767d87]">
            {lang === DEFAULT_LANG ? 'Sprich 10–30 Sekunden frei. Die Aufnahme bleibt privat gespeichert und vorbereitet, damit dein eigener Twin später natürlicher klingen kann.' : v.step1Text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (recording ? stopRecording() : void startRecording())}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${recording ? 'bg-red-500/20 text-red-400' : 'border border-white/20 bg-white/[0.06] hover:bg-white/[0.12]'}`}
            >
              {recording ? (lang === DEFAULT_LANG ? `Aufnahme stoppen (${recordSeconds}s)` : `${v.recordStop} (${recordSeconds}s)`) : sampleBlob ? (lang === DEFAULT_LANG ? 'Neu aufnehmen' : v.recordNew) : (lang === DEFAULT_LANG ? 'Aufnahme starten' : v.recordStart)}
            </button>
            {sampleUrl && !recording && (
              <audio controls src={sampleUrl} className="h-9 max-w-full" />
            )}
          </div>
          {saving && sampleBlob && (
            <p className="mt-2 text-xs text-[#767d87]">{lang === DEFAULT_LANG ? 'Stimmprobe wird hochgeladen …' : v.uploading}</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">{lang === DEFAULT_LANG ? '2. Twin-Stimme wählen' : v.step2Title}</p>
          <p className="mt-1 text-xs text-[#767d87]">
            {lang === DEFAULT_LANG ? 'Wähle die smyst.com-Stimme, die deiner am nächsten kommt. Mit „Anhören" kannst du jede Stimme kurz testen.' : v.step2Text}
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
                  {lang === DEFAULT_LANG ? choice.label : (v.choices[choice.id] ?? choice.label)}
                </span>
                <button
                  type="button"
                  onClick={() => void previewVoice(choice.id)}
                  disabled={previewingId !== null}
                  className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {previewingId === choice.id ? (lang === DEFAULT_LANG ? 'Spielt …' : v.previewPlaying) : (lang === DEFAULT_LANG ? 'Anhören' : v.previewBtn)}
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
          {lang === DEFAULT_LANG ? 'Ich stimme zu, dass smyst.com meine Stimmaufnahme privat speichert, um mein persönliches Stimmprofil zu erstellen. Es gilt nur für meine eigenen Twins, wird nicht öffentlich geteilt und ich kann die Zustimmung jederzeit widerrufen.' : v.agreeText}
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!consentChecked || !selectedVoiceId || saving || recording}
          className="rounded-md border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (lang === DEFAULT_LANG ? 'Speichert …' : v.saveBusy) : (lang === DEFAULT_LANG ? 'Stimme aktivieren' : v.saveBtn)}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={saving}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {lang === DEFAULT_LANG ? 'Zustimmung widerrufen' : v.revokeBtn}
          </button>
        )}
        {status && <p className="text-sm text-[#8e97a8]">{status}</p>}
      </div>
    </section>
  )
}
