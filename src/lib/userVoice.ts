// Eigene Stimme (Phase 1): Zuordnung "meine Stimme" -> eigene Twins.
// Privacy by Design: Wirkung nur fuer die eigenen Profile des angemeldeten
// Kontos; Quelle ist GET /api/voice/profile (Consent-pflichtig, widerrufbar).
import { fetchService } from '@/lib/serviceEndpoints'
import { observeAuthState } from '@/lib/useAuth'

let overrideVoiceId: string | undefined
let overrideNames = new Set<string>()
let loaded = false
let loading: Promise<void> | null = null
let sessionAuthenticated = false

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
          voice?: { consent?: boolean; voiceId?: string; sampleKey?: string } | null
          names?: string[]
        }
        // Logout waehrend des Requests: veraltete Antwort verwerfen.
        if (!sessionAuthenticated) return
        applyUserVoiceProfile(
          data?.names,
          data?.voice?.consent ? (data.voice.sampleKey ? 'de-own' : data.voice.voiceId) : undefined,
        )
      } catch {
        loaded = true
      }
    })()
  }
  await loading
}

// Laedt das Stimmprofil im Hintergrund (idempotent, ein Request pro Sitzung).
// Ohne Session kein Request: /api/voice/profile antwortet Gaesten mit 401 und
// wuerde bei jedem Seitenaufruf einen Konsolenfehler erzeugen.
export function primeUserVoice(): void {
  if (!sessionAuthenticated) return
  void loadOnce()
}

// Liefert die eigene Stimme, wenn der Sprecher (voiceKey) ein eigener Twin
// oder der eigene Anzeigename ist — sonst undefined (kuratierte Stimmenwahl).
export function userVoiceIdFor(voiceKey: string | undefined): string | undefined {
  primeUserVoice()
  if (!overrideVoiceId || !voiceKey) return undefined
  return overrideNames.has(voiceKey.trim().toLowerCase()) ? overrideVoiceId : undefined
}

// Beim App-Start im Hintergrund laden, damit bereits die ERSTE Sprachausgabe
// nach dem Seitenaufruf die eigene Stimme nutzt (kein Lazy-Miss). Geladen wird
// erst, wenn /auth/me eine Session bestaetigt hat; bei Logout wird der
// Override verworfen, damit ein spaeterer Login frisch laedt.
if (typeof window !== 'undefined') {
  observeAuthState((state) => {
    if (state.status === 'authenticated') {
      sessionAuthenticated = true
      void loadOnce()
    } else if (state.status === 'anonymous') {
      sessionAuthenticated = false
      loaded = false
      loading = null
      overrideVoiceId = undefined
      overrideNames = new Set()
    }
  })
}
