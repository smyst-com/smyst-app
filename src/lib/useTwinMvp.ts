/**
 * useTwinMvp — Free-only KI-Zwilling MVP API.
 *
 * Speichert kleine Twin-Metadaten in Cloudflare KV, referenziert Dateien in
 * IDrive e2 und nutzt nur regelbasierte Chatantworten ohne bezahlte KI-API.
 */

import { useCallback, useState } from 'react'

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
  categories: string[]
  languages: string[]
  visibility: TwinVisibility
  style: TwinStyle
  knowledgeTexts: TwinKnowledgeItem[]
  mediaRefs: TwinMediaRef[]
  contextSummary: string
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
  sources?: Array<{ title: string; publisher: string; url: string }>
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
}

export interface AccountExportBundle {
  ok: boolean
  exportedAt: string
  storageNote: string
  user: unknown
  twins: TwinRecord[]
  chats: Array<{ id: string; title: string; messages: TwinChatMessage[]; createdAt: number; updatedAt: number }>
}

export type SupportReportType = 'bug' | 'abuse' | 'privacy' | 'safety' | 'feedback'

interface ApiErrorShape {
  error?: string | { message?: string }
}

function apiError(body: unknown, fallback: string): string {
  const maybe = body as ApiErrorShape | null
  if (maybe && typeof maybe.error === 'string') return maybe.error
  if (maybe?.error && typeof maybe.error === 'object' && maybe.error.message) return maybe.error.message
  return fallback
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') {
    headers.set('X-Smyst-CSRF', '1')
  }
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(apiError(body, `API failed (${res.status})`))
  return body as T
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

  const listTwins = useCallback(
    () =>
      run(async () => {
        const body = await apiJson<{ twins: TwinRecord[] }>('/api/twins')
        return body.twins
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
        const body = await apiJson<{ twin: PublicTwinProfile }>(`/api/public/twins/${encodeURIComponent(slug)}`)
        return body.twin
      }),
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
    (chatId: string, message: string) =>
      run(async () => {
        const body = await apiJson<{ chatId: string; twinId: string | null; message: TwinChatMessage; mode: string }>(
          '/api/chat/messages',
          {
            method: 'POST',
            body: JSON.stringify({ chatId, message }),
          },
        )
        return body
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
        const storageRes = await fetch('/storage/account', {
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

  return {
    loading,
    error,
    listTwins,
    getTwin,
    getPublicTwin,
    createTwin,
    updateTwin,
    addKnowledge,
    addMedia,
    startTwinChat,
    sendTwinMessage,
    exportAccount,
    deleteAccount,
    submitSupportReport,
  }
}
