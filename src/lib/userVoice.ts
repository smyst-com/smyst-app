// Eigene Stimme (Phase 1): Zuordnung "meine Stimme" -> eigene Twins.
// Privacy by Design: Wirkung nur fuer die eigenen Profile des angemeldeten
// Kontos; Quelle ist GET /api/voice/profile (Consent-pflichtig, widerrufbar).
import { fetchService } from '@/lib/serviceEndpoints'

let overrideVoiceId: string | undefined
let overrideNames = new Set<string>()
let loaded = false
let loading: Promise<void> | null = null

export function applyUserVoiceProfile(
  names: string[] | undefined,
  voiceId: string | null | undefined,
): void {
  overrideNames = new Set(
    (names ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  )
  overrideVoiceId = voiceId || undefined
  loaded = true
}

async function loadOnce(): Promise<void> {
  if (loaded) return
  if (!loading) {
    loading = (async () => {
      try {
        const response = await fetchService('/api/voice/profile', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          loaded = true
          return
        }
        const data = (await response.json()) as {
          voice?: { consent?: boolean; voiceId?: string } | null
          names?: string[]
        }
        applyUserVoiceProfile(
          data?.names,
          data?.voice?.consent ? data.voice.voiceId : undefined,
        )
      } catch {
        loaded = true
      }
    })()
  }
  await loading
}

// Laedt das Stimmprofil im Hintergrund (idempotent, ein Request pro Sitzung).
export function primeUserVoice(): void {
  void loadOnce()
}

// Liefert die eigene Stimme, wenn der Sprecher (voiceKey) ein eigener Twin
// oder der eigene Anzeigename ist — sonst undefined (kuratierte Stimmenwahl).
export function userVoiceIdFor(voiceKey: string | undefined): string | undefined {
  primeUserVoice()
  if (!overrideVoiceId || !voiceKey) return undefined
  return overrideNames.has(voiceKey.trim().toLowerCase()) ? overrideVoiceId : undefined
}

