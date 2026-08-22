/**
 * useTwinMvp — Free-only KI-Zwilling MVP API.
 *
 * Speichert kleine Twin-Metadaten in der aktiven API, referenziert Dateien in
 * IDrive e2 und nutzt nur regelbasierte Chatantworten ohne bezahlte KI-API.
 */

import { useCallback, useState } from 'react'
import { fetchService } from './serviceEndpoints'

export type TwinStyle = 'warm' | 'direct' | 'humorous' | 'wise' | 'neutral'
export type TwinVisibility = 'private' | 'public'

export interface TwinKnowledgeItem {
  id: string
  title?: string
  text: string
  createdAt: number
}

export interface TwinMediaRef {
  id: string
  uploadId?: string
  key: string
  category: string
  contentType?: string
  filename?: string
  size?: number
  createdAt: number
}

export interface TwinRecord {
  id: string
  userSub: string
  name: string
  slug: string
  description: string
  imageUrl?: string
  imageKey?: string
  // Aufgeloester Avatar nach SSOT-Regel: Twin-Bild ?? Besitzer-Avatar ?? Platzhalter.
  resolvedAvatarUrl?: string
  categories: string[]
  languages: string[]
  visibility: TwinVisibility
  style: TwinStyle
  knowledgeTexts: TwinKnowledgeItem[]
  mediaRefs: TwinMediaRef[]
  contextSummary: string
  lifeSlug?: string
  mainCategory?: string
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
  exampleQuestions?: string[]
  searchIndex?: string
  status: 'draft' | 'ready'
  createdAt: number
  updatedAt: number
}

export interface PublicTwinProfile {
  id: string
  name: string
  slug: string
  description: string
  imageUrl: string | null
  categories: string[]
  languages: string[]
  // Stimmen-Geschlecht (Wikidata P21) der Pipeline-Profile; kuratierte
  // Profile beziehen es weiterhin aus den Voice-Hints per Name.
  voiceGender?: 'female' | 'male'
  visibility: TwinVisibility
  style: TwinStyle
  status: 'draft' | 'ready'
  url: string
  chatPath: string
  uploadedContents: Array<{ category: string; count: number }>
  mediaCount: number
  knowledgeCount: number
  contextSummary: string
  guardrail?: string
  rightsPosture?: string
  mainCategory?: string
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
  birthPlace?: string
  deathPlace?: string
  exampleQuestions?: string[]
  searchIndex?: string
  sources?: Array<{ title: string; publisher: string; url: string }>
  milestones?: Array<{ year: string; title: string; place?: string }>
  quality?: { ok: boolean; issues: string[] }
  createdAt?: number
  updatedAt: number
  seo: {
    title: string
    description: string
    canonical: string
    robots: string
    schema: Record<string, unknown>
  }
}

export interface TwinChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  webResearch?: WebResearchMeta
  feedback?: { rating: ChatFeedbackRating; comment?: string | null; createdAt: number }
}

export type ChatFeedbackRating = 'up' | 'down' | 'report'

export interface AccountExportBundle {
  ok: boolean
  exportedAt: string
  storageNote: string
  user: unknown
  profile?: UserProfileRecord
  memories?: MemoryRecord[]
  twins: TwinRecord[]
  chats: Array<{ id: string; title: string; messages: TwinChatMessage[]; createdAt: number; updatedAt: number }>
  objectLayout?: {
    profile: string
    chatArchives: string[]
    memories: string[]
  }
}

export interface TwinChatRecord {
  id: string
  title: string
  twinId: string | null
  publicTwinSlug?: string | null
  messages: TwinChatMessage[]
  summary?: string
  archiveObjectKey?: string
  visibility?: ProfileVisibility
  sensitivity?: SensitivityLevel
  messageCount: number
  createdAt: number
  updatedAt: number
}

export type SupportReportType = 'bug' | 'abuse' | 'privacy' | 'safety' | 'feedback'
export type ProfileVisibility = 'private' | 'shared' | 'public_snapshot' | 'deleted'
export type SensitivityLevel = 'normal' | 'personal' | 'sensitive'
export type MemoryStatus = 'pending' | 'confirmed' | 'edited' | 'rejected'
export type MemoryType = 'fact' | 'preference' | 'goal' | 'relationship' | 'project' | 'style' | 'decision' | 'warning' | 'sensitive'

export interface WebResearchSource {
  title: string
  url: string
  snippet?: string
  publisher?: string
  retrieved_at?: string
  trust_score?: number
}

export interface WebResearchMeta {
  searched: boolean
  notice: string
  provider: string
  fromCache: boolean
  category: string
  searchedAt?: string
  trustStatus: string
  injectionWarnings: string[]
  sources: WebResearchSource[]
}

export interface PublicKnowledgeSuggestion {
  suggested: boolean
  message?: string
  status?: 'discovered' | 'reviewed' | 'approved' | 'rejected' | 'stale'
  reviewRequired?: boolean
  profileId?: string
  fact?: string
  retrievedAt?: string
  trustScore?: number
  sources?: WebResearchSource[]
}

export interface UserProfileRecord {
  id: 'default'
  userSub: string
  displayName: string
  // Avatar-SSOT (PR #189): avatarUrl ist der Besitzer-Avatar (beim ersten
  // Profil-Abruf aus dem Google-Login-Bild uebernommen), resolvedAvatarUrl
  // die fertig aufgeloeste Anzeige-URL (immer gesetzt, notfalls Platzhalter).
  avatarUrl?: string
  resolvedAvatarUrl?: string
  headline?: string
  privateBio?: string
  publicBio?: string
  roles: string[]
  expertise: string[]
  goals: string[]
  languages: string[]
  tone: string
  visibility: ProfileVisibility
  qualityScore: number
  memoryCount: number
  chatCount: number
  objectPrefix: string
  createdAt: number
  updatedAt: number
}

export interface MemoryRecord {
  id: string
  userSub: string
  profileId: 'default'
  type: MemoryType
  text: string
  source: {
    type: 'chat' | 'upload' | 'profile' | 'manual'
    chatId?: string
    uploadId?: string
    label?: string
  }
  visibility: ProfileVisibility
  sensitivity: SensitivityLevel
  confidence: number
  status: MemoryStatus
  twinIds: string[]
  reviewAt?: number
  objectKey: string
  createdAt: number
  updatedAt: number
}

export interface ChatSearchResult {
  id: string
  title: string
  twinId: string | null
  publicTwinSlug: string | null
  summary: string
  messageCount: number
  archiveObjectKey: string
  score: number
  createdAt: number
  updatedAt: number
}

interface ApiErrorShape {
  error?: string | { code?: string; message?: string }
}

function apiError(body: unknown, fallback: string): string {
  const maybe = body as ApiErrorShape | null
  if (maybe && typeof maybe.error === 'string') return maybe.error
  if (maybe?.error && typeof maybe.error === 'object') {
    if (maybe.error.code === 'storage_write_limited') {
      return 'Speichern ist gerade wegen eines temporären Speicherlimits pausiert. Lesen und Chatten bleiben verfügbar. Bitte versuche es später erneut.'
    }
    if (maybe.error.message) return maybe.error.message
  }
  return fallback
}


async function staticPublicJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: 'omit' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') {
    headers.set('X-Smyst-CSRF', '1')
  }
  const res = await fetchService(path, {
    ...init,
    credentials: 'include',
    headers,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(apiError(body, `API failed (${res.status})`))
  return body as T
}

// Die Twin-API speichert keine Lebensdaten (Geburts-/Sterbedatum, Beruf).
// Fehlende Felder werden aus dem oeffentlichen Profilkatalog ergaenzt, damit
// eigene Twins dasselbe 4-Zeilen-Format zeigen wie oeffentliche Profile.
// Vorhandene Werte werden nie ueberschrieben, der Slug bleibt unveraendert.
function lifeMatchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

let publicTwinsPromise: Promise<PublicTwinProfile[]> | null = null
let slimTwinsPromise: Promise<PublicTwinProfile[] | null> | null = null

/**
 * Slim-Katalog (kuratierte + neueste Profile, ~350 KB statt ~11 MB).
 *
 * Die Startseite wartete vorher auf den VOLLSTAENDIGEN Katalog, bevor das
 * Grid renderte — bei 12k+ Profilen ein spuerbarer erster Eindruck. slim.json
 * kommt vom Pages-Build (merge-pipeline-published.mjs); fehlt es (aelterer
 * Deploy), liefert diese Funktion null und der Aufrufer nutzt den Vollweg.
 */
function loadSlimPublicTwins(): Promise<PublicTwinProfile[] | null> {
  if (!slimTwinsPromise) {
    slimTwinsPromise = (async () => {
      const body = await staticPublicJson<{ twins: PublicTwinProfile[] }>('/api/public/twins/slim.json')
      return body?.twins?.length ? body.twins : null
    })().catch(() => {
      slimTwinsPromise = null
      return null
    })
  }
  return slimTwinsPromise
}

/** Holt den oeffentlichen Twin-Katalog; mehrfache Aufrufe teilen eine Anfrage. */
function loadPublicTwins(): Promise<PublicTwinProfile[]> {
  if (!publicTwinsPromise) {
    publicTwinsPromise = (async () => {
      const body =
        (await staticPublicJson<{ twins: PublicTwinProfile[] }>('/api/public/twins/')) ??
        (await publicApiJson<{ twins: PublicTwinProfile[] }>('/api/public/twins'))
      return body?.twins ?? []
    })().catch((err) => {
      // Fehlschlaege duerfen nicht dauerhaft haengen bleiben: Cache leeren,
      // damit ein spaeterer Aufruf es erneut versucht.
      publicTwinsPromise = null
      throw err
    })
  }
  return publicTwinsPromise
}

/**
 * Startet den Katalog-Abruf, ohne auf ihn zu warten.
 *
 * Die Startseite lud die Profile frueher erst NACH /auth/me — obwohl die
 * oeffentliche Liste nie von der Anmeldung abhaengt. Gemessen 15.08.2026:
 * /auth/me lief 483–747 ms, die Inhalte starteten dadurch erst bei 753 ms.
 * Vorgezogen laufen beide parallel.
 */
export function prefetchPublicTwins(): void {
  void loadPublicTwins().catch(() => {
    // Nur Vorwaermen — Fehler behandelt der spaetere echte Aufruf.
  })
}

let lifeIndexPromise: Promise<Map<string, PublicTwinProfile>> | null = null

async function loadPublicLifeIndex(): Promise<Map<string, PublicTwinProfile>> {
  if (!lifeIndexPromise) {
    lifeIndexPromise = (async () => {
      const index = new Map<string, PublicTwinProfile>()
      try {
        // Teilt den Abruf mit listPublicTwins statt denselben Katalog erneut zu holen.
        for (const profile of await loadPublicTwins()) {
          if (profile?.name) index.set(lifeMatchKey(profile.name), profile)
        }
      } catch {
        // Ohne Katalog bleiben die Twins unveraendert - kein harter Fehler.
      }
      return index
    })()
  }
  return lifeIndexPromise
}

async function withPublicLifeData(twins: TwinRecord[]): Promise<TwinRecord[]> {
  if (!twins.some((twin) => !twin.birthDate && !twin.birthYear)) return twins
  const index = await loadPublicLifeIndex()
  if (index.size === 0) return twins
  return twins.map((twin) => {
    if (twin.birthDate || twin.birthYear) return twin
    const match = index.get(lifeMatchKey(twin.name ?? ''))
    if (!match) return twin
    return {
      ...twin,
      lifeSlug: match.slug,
      mainCategory: twin.mainCategory ?? match.mainCategory,
      birthDate: match.birthDate,
      deathDate: match.deathDate,
      birthYear: match.birthYear,
      deathYear: match.deathYear,
      birthLabel: match.birthLabel,
      deathLabel: match.deathLabel,
    }
  })
}

async function publicApiJson<T>(path: string): Promise<T | null> {
  try {
    return await apiJson<T>(path)
  } catch {
    return null
  }
}

export function useTwinMvp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Katalog zweistufig: erst slim (schnelles erstes Grid), dann Upgrade auf
   * den Vollbestand, sobald der im Hintergrund angekommen ist. onUpgrade
   * feuert NUR wenn der Vollbestand mehr enthaelt als der Slim-Stand.
   */
  const listPublicTwinsProgressive = useCallback(
    (onUpgrade?: (alle: PublicTwinProfile[]) => void) =>
      run(async () => {
        const slim = await loadSlimPublicTwins()
        const voll = loadPublicTwins()
        if (slim) {
          void voll.then((alle) => {
            if (alle.length > slim.length) {
              // Macrotask, nicht Microtask: Ist der Vollbestand per prefetch
              // schon VOR slim.json bereit (gemessen live 21.08.2026: voll
              // 360 ms, slim 580 ms), lief das Upgrade im alten Microtask-
              // Timing VOR dem Slim-Render und wurde vom Aufrufer sofort mit
              // dem Slim-Stand (400 Profile) ueberschrieben — die Startseite
              // blieb dauerhaft bei 400 statt 13.915 Profilen. Der Upgrade-
              // Callback muss NACH dem Slim-Render des Aufrufers landen.
              window.setTimeout(() => onUpgrade?.(alle), 0)
            }
          })
          return slim
        }
        const body = await voll.then((alle) => ({ twins: alle }))
        return body.twins
      }),
    [run],
  )

  const listTwins = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ twins: TwinRecord[] }>('/api/twins')
        return await withPublicLifeData(body.twins)
      }),
    [run],
  )

  const getTwin = useCallback(
    (twinId: string) =>
      run(async () => {
        const body = await apiJson<{ twin: TwinRecord }>(`/api/twins/${encodeURIComponent(twinId)}`)
        return body.twin
      }),
    [run],
  )

  const getPublicTwin = useCallback(
    (slug: string) =>
      run(async () => {
        const body =
          (await staticPublicJson<{ twin: PublicTwinProfile }>(`/api/public/twins/${encodeURIComponent(slug)}/`)) ??
          (await publicApiJson<{ twin: PublicTwinProfile }>(`/api/public/twins/${encodeURIComponent(slug)}`))
        return body?.twin ?? null
      }),
    [run],
  )

  const listPublicTwins = useCallback(
    () => run(() => loadPublicTwins()),
    [run],
  )

  const createTwin = useCallback(
    (input: {
      name: string
      description?: string
      style?: TwinStyle
      visibility?: TwinVisibility
      slug?: string
      imageUrl?: string
      imageKey?: string
      categories?: string[]
      languages?: string[]
    }) =>
      run(async () => {
        const body = await apiJson<{ twin: TwinRecord }>('/api/twins', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return body.twin
      }),
    [run],
  )

  const updateTwin = useCallback(
    (
      twinId: string,
      input: {
        name?: string
        description?: string
        style?: TwinStyle
        visibility?: TwinVisibility
        slug?: string
        imageUrl?: string
        imageKey?: string
        categories?: string[]
        languages?: string[]
      },
    ) =>
      run(async () => {
        const body = await apiJson<{ twin: TwinRecord }>(`/api/twins/${encodeURIComponent(twinId)}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        })
        return body.twin
      }),
    [run],
  )

  // Soft-Delete: verschiebt den Twin serverseitig in den Papierkorb
  // (backend twins_delete.py); Chats und Uploads bleiben erhalten.
  const deleteTwin = useCallback(
    (twinId: string) =>
      run(async () => {
        return apiJson<{ ok: boolean; deletedId: string; restorable: boolean; remaining: number }>(
          `/api/twins/${encodeURIComponent(twinId)}`,
          { method: 'DELETE' },
        )
      }),
    [run],
  )

  const restoreTwin = useCallback(
    (twinId: string) =>
      run(async () => {
        return apiJson<{ ok: boolean; restoredId: string; remaining: number }>(
          `/api/twins/${encodeURIComponent(twinId)}/restore`,
          { method: 'POST' },
        )
      }),
    [run],
  )

  const listDeletedTwins = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ twins: TwinRecord[] }>('/api/twins/deleted/list')
        return body.twins
      }),
    [run],
  )

  const addKnowledge = useCallback(
    (input: { twinId: string; title?: string; text: string }) =>
      run(async () => {
        const body = await apiJson<{ twin: TwinRecord; item: TwinKnowledgeItem }>('/api/twins/knowledge', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return body
      }),
    [run],
  )

  const addMedia = useCallback(
    (input: {
      twinId: string
      uploadId?: string
      key: string
      category: string
      contentType?: string
      filename?: string
      size?: number
    }) =>
      run(async () => {
        const body = await apiJson<{ twin: TwinRecord; media: TwinMediaRef }>('/api/twins/media', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return body
      }),
    [run],
  )

  const startTwinChat = useCallback(
    (twinId?: string) =>
      run(async () => {
        const body = await apiJson<{ chat: { id: string; title: string; twinId?: string } }>('/api/chat/start', {
          method: 'POST',
          body: JSON.stringify({ twinId }),
        })
        return body.chat
      }),
    [run],
  )

  const sendTwinMessage = useCallback(
    (chatId: string, message: string, language?: string) =>
      run(async () => {
        const body = await apiJson<{ chatId: string; twinId: string | null; message: TwinChatMessage; mode: string }>(
          '/api/chat/messages',
          {
            method: 'POST',
            body: JSON.stringify({ chatId, message, language }),
          },
        )
        return body
      }),
    [run],
  )

  const sendTwinMessageStream = useCallback(
    (chatId: string, message: string, onPartial: (text: string) => void, language?: string) =>
      run(async () => {
        type ChatReply = { chatId: string; twinId: string | null; message: TwinChatMessage; mode: string }
        try {
          const headers = new Headers()
          headers.set('Content-Type', 'application/json')
          headers.set('X-Smyst-CSRF', '1')
          const res = await fetchService('/api/chat/messages/stream', {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ chatId, message, language }),
          })
          if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`)
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let full = ''
          let finalReply: ChatReply | null = null
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            buffer += decoder.decode(chunk.value, { stream: true })
            const events = buffer.split('\n\n')
            buffer = events.pop() ?? ''
            for (const rawEvent of events) {
              const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'))
              if (!dataLine) continue
              const payload = JSON.parse(dataLine.slice(5)) as {
                delta?: string
                done?: boolean
                error?: boolean
                chatId?: string
                twinId?: string | null
                message?: TwinChatMessage
                mode?: string
              }
              if (typeof payload.delta === 'string') {
                full += payload.delta
                onPartial(full)
              } else if (payload.done && payload.message) {
                finalReply = {
                  chatId: payload.chatId ?? chatId,
                  twinId: payload.twinId ?? null,
                  message: payload.message,
                  mode: payload.mode ?? 'unknown',
                }
              } else if (payload.error) {
                throw new Error('stream error event')
              }
            }
          }
          if (!finalReply) throw new Error('stream ended without done event')
          return { ...finalReply, streamed: true }
        } catch {
          const body = await apiJson<ChatReply>('/api/chat/messages', {
            method: 'POST',
            body: JSON.stringify({ chatId, message }),
          })
          return { ...body, streamed: false }
        }
      }),
    [run],
  )

  const sendChatFeedback = useCallback(
    (chatId: string, messageId: string, rating: ChatFeedbackRating, comment?: string) =>
      run(async () => {
        const body = await apiJson<{ ok: boolean; messageId: string; rating: ChatFeedbackRating }>(
          '/api/chat/feedback',
          {
            method: 'POST',
            body: JSON.stringify({ chatId, messageId, rating, comment }),
          },
        )
        return body
      }),
    [run],
  )

  const listTwinChats = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ chats: TwinChatRecord[] }>('/api/chat/list')
        return body.chats
      }),
    [run],
  )

  const searchTwinChats = useCallback(
    (query: string, twinId?: string) =>
      run(async () => {
        const params = new URLSearchParams()
        if (query) params.set('q', query)
        if (twinId) params.set('twinId', twinId)
        const body = await apiJson<{ query: string; results: ChatSearchResult[] }>(
          `/api/chat/search${params.toString() ? `?${params}` : ''}`,
        )
        return body
      }),
    [run],
  )

  const getProfile = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ profile: UserProfileRecord; limits: Record<string, unknown> }>('/api/profile')
        return body
      }),
    [run],
  )

  const updateProfile = useCallback(
    (input: Partial<Pick<UserProfileRecord, 'displayName' | 'avatarUrl' | 'headline' | 'privateBio' | 'publicBio' | 'roles' | 'expertise' | 'goals' | 'languages' | 'tone' | 'visibility'>>) =>
      run(async () => {
        const body = await apiJson<{ profile: UserProfileRecord; storagePlan: Record<string, unknown> }>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify(input),
        })
        return body
      }),
    [run],
  )

  const suggestPublicKnowledge = useCallback(
    (input: { profileId?: string; question: string; maxResults?: number }) =>
      run(async () => {
        return apiJson<PublicKnowledgeSuggestion>('/api/web-research/public-profile-suggestions', {
          method: 'POST',
          body: JSON.stringify({
            profile_id: input.profileId ?? 'default',
            question: input.question,
            max_results: input.maxResults ?? 3,
            context: {
              profile_id: input.profileId ?? 'default',
              context_type: 'public_profile',
              public_profile_mode: true,
              public_research_allowed: true,
              user_explicitly_requested_search: true,
            },
          }),
        })
      }),
    [run],
  )

  const listMemories = useCallback(
    (filters: { status?: MemoryStatus; twinId?: string } = {}) =>
      run(async () => {
        const params = new URLSearchParams()
        if (filters.status) params.set('status', filters.status)
        if (filters.twinId) params.set('twinId', filters.twinId)
        const body = await apiJson<{ memories: MemoryRecord[]; limits: Record<string, unknown> }>(
          `/api/memories${params.toString() ? `?${params}` : ''}`,
        )
        return body
      }),
    [run],
  )

  const createMemory = useCallback(
    (input: {
      type?: MemoryType
      text: string
      sourceType?: 'chat' | 'upload' | 'profile' | 'manual'
      chatId?: string
      uploadId?: string
      sourceLabel?: string
      visibility?: ProfileVisibility
      sensitivity?: SensitivityLevel
      confidence?: number
      status?: MemoryStatus
      twinIds?: string[]
      reviewAt?: number
    }) =>
      run(async () => {
        const body = await apiJson<{ memory: MemoryRecord }>('/api/memories', {
          method: 'POST',
          body: JSON.stringify(input),
        })
        return body.memory
      }),
    [run],
  )

  const updateMemory = useCallback(
    (memoryId: string, input: Partial<{
      type: MemoryType
      text: string
      visibility: ProfileVisibility
      sensitivity: SensitivityLevel
      confidence: number
      status: MemoryStatus
      twinIds: string[]
      reviewAt: number
    }>) =>
      run(async () => {
        const body = await apiJson<{ memory: MemoryRecord }>(`/api/memories/${encodeURIComponent(memoryId)}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        })
        return body.memory
      }),
    [run],
  )

  const deleteMemory = useCallback(
    (memoryId: string) =>
      run(async () => {
        return apiJson<{ ok: boolean; deleted: string; storageNote: string }>(`/api/memories/${encodeURIComponent(memoryId)}`, {
          method: 'DELETE',
          headers: { 'X-Smyst-Delete-Confirm': 'delete-memory' },
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
      }),
    [run],
  )

  const exportAccount = useCallback(
    () =>
      run(async () => {
        return apiJson<AccountExportBundle>('/api/account/export')
      }),
    [run],
  )

  const deleteAccount = useCallback(
    () =>
      run(async () => {
        const storageRes = await fetchService('/storage/account', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-Smyst-CSRF': '1', 'X-Smyst-Delete-Confirm': 'delete-account-storage' },
        })
        const storageBody = await storageRes.json().catch(() => null)
        if (!storageRes.ok || (storageBody && typeof storageBody === 'object' && 'ok' in storageBody && !storageBody.ok)) {
          throw new Error(apiError(storageBody, `Storage delete failed (${storageRes.status})`))
        }

        const apiBody = await apiJson<{ ok: boolean; deleted: Record<string, unknown>; storageNote: string }>('/api/account', {
          method: 'DELETE',
          headers: { 'X-Smyst-Delete-Confirm': 'delete-account' },
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
        return { storage: storageBody, account: apiBody }
      }),
    [run],
  )

  const submitSupportReport = useCallback(
    (input: { type: SupportReportType; subject: string; message: string; url?: string; contact?: string }) =>
      run(async () => {
        return apiJson<{ ok: boolean; reportId: string; message: string }>('/api/support/report', {
          method: 'POST',
          body: JSON.stringify(input),
        })
      }),
    [run],
  )

  const startPremiumCheckout = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ checkoutUrl: string; sessionId: string }>(
          '/api/billing/checkout-session',
          { method: 'POST', body: JSON.stringify({}) },
        )
        return body
      }),
    [run],
  )

  const getPremiumStatus = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ premiumActive: boolean; premiumSince?: number; stripeCustomerId?: string }>(
          '/api/billing/status',
        )
        return body
      }),
    [run],
  )

  return {
    loading,
    error,
    listTwins,
    getTwin,
    getPublicTwin,
    listPublicTwins,
    listPublicTwinsProgressive,
    createTwin,
    updateTwin,
    deleteTwin,
    restoreTwin,
    listDeletedTwins,
    addKnowledge,
    addMedia,
    startTwinChat,
    sendTwinMessage,
    sendTwinMessageStream,
    sendChatFeedback,
    listTwinChats,
    searchTwinChats,
    getProfile,
    updateProfile,
    suggestPublicKnowledge,
    listMemories,
    createMemory,
    updateMemory,
    deleteMemory,
    exportAccount,
    deleteAccount,
    submitSupportReport,
    startPremiumCheckout,
    getPremiumStatus,
  }
}
