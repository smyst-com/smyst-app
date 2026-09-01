/**
 * ApiKeysView — Nutzerbereich für smyst API-Keys (smyst 1.0 / smyst 1.1).
 *
 * Aufbau im Stil von OpenRouter (openrouter.ai/.../keys): Überschrift mit
 * "Neuer Key"-Aktion, Suchfeld, Tabelle mit maskierten Keys und
 * Erstell-Dialog, der das volle Secret genau einmal zeigt.
 *
 * Idiotensicher by Design:
 * - Das Secret wird nur einmal angezeigt; Kopieren steht im Vordergrund.
 * - Löschen erfordert eine zweite, klar benannte Bestätigung.
 * - Ohne Login erscheint ein freundlicher Hinweis statt eines Fehlers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchService } from '@/lib/serviceEndpoints'
import { useAuth } from '@/lib/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ApiKeyEntry {
  id: string
  name: string
  model: string
  preview: string
  createdAt: number
  lastUsedAt: number
  usageCount: number
  revokedAt: number
}

interface ApiKeysResponse {
  keys: ApiKeyEntry[]
  limits: { maxKeys: number }
  models: Array<{ id: string; label: string; note: string }>
  server: { online: boolean; modelId: string }
  storageNote?: string
}

type ModelChoice = 'auto' | 'smyst-1.1' | 'smyst-1.0'

const MODEL_LABELS: Record<ModelChoice, { label: string; note: string }> = {
  auto: { label: 'Beide / neueste', note: 'Immer das aktuell trainierte smyst-Modell (empfohlen)' },
  'smyst-1.1': { label: 'smyst 1.1', note: 'Neueste Modellgeneration' },
  'smyst-1.0': { label: 'smyst 1.0', note: 'Erste Modellgeneration' },
}

const API_EXAMPLE = `curl https://api.smyst.com/api/chat/completions \\
  -H "Authorization: Bearer DEIN-KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "smyst-1.1",
    "messages": [{ "role": "user", "content": "Hallo!" }]
  }'`

function formatDate(ms: number): string {
  if (!ms) return 'Nie'
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatLastUsed(ms: number): string {
  if (!ms) return 'Nie'
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days <= 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

function modelLabel(model: string): string {
  return MODEL_LABELS[(model as ModelChoice)]?.label ?? model
}

async function apiKeysFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; data: T | null }> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') headers.set('X-Smyst-CSRF', '1')
  const res = await fetchService(path, { ...init, credentials: 'include', headers })
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  return { ok: res.ok, data }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
      return true
    } catch {
      return false
    }
  }
}

export default function ApiKeysView({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const auth = useAuth()
  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [server, setServer] = useState<{ online: boolean; modelId: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Erstell-Dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newModel, setNewModel] = useState<ModelChoice>('auto')
  const [creating, setCreating] = useState(false)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Lösch-Bestätigung (zwei Schritte, klar benannt)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { ok, data } = await apiKeysFetch<ApiKeysResponse>('/api/api-keys')
    if (ok && data) {
      setKeys(data.keys ?? [])
      setServer(data.server ?? null)
    } else {
      setError('API-Keys konnten nicht geladen werden. Bitte Seite neu laden.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (auth.status === 'authenticated') void loadKeys()
    else if (auth.status === 'anonymous') setLoading(false)
  }, [auth.status, loadKeys])

  const visibleKeys = useMemo(() => {
    const query = search.trim().toLowerCase()
    const active = keys.filter((key) => !key.revokedAt)
    if (!query) return active
    return active.filter(
      (key) => key.name.toLowerCase().includes(query) || key.preview.toLowerCase().includes(query),
    )
  }, [keys, search])

  const createKey = async () => {
    setCreating(true)
    setError(null)
    const { ok, data } = await apiKeysFetch<{ key?: ApiKeyEntry; secret?: string; warning?: string }>(
      '/api/api-keys',
      { method: 'POST', body: JSON.stringify({ name: newName.trim() || 'Mein Key', model: newModel }) },
    )
    setCreating(false)
    if (ok && data?.secret && data.key) {
      setKeys((prev) => [...prev, data.key!])
      setCreatedSecret(data.secret)
      setNewName('')
      setNewModel('auto')
      setCopied(false)
    } else {
      setError(data?.error?.message ?? 'Key konnte nicht erstellt werden. Bitte erneut versuchen.')
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { ok, data } = await apiKeysFetch<{ ok: boolean }>(`/api/api-keys/${encodeURIComponent(deleteId)}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    if (ok) {
      setKeys((prev) => prev.filter((key) => key.id !== deleteId))
      setDeleteId(null)
    } else {
      setError(data?.error?.message ?? 'Key konnte nicht gelöscht werden. Bitte erneut versuchen.')
    }
  }

  const handleCopy = async () => {
    if (!createdSecret) return
    if (await copyText(createdSecret)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    }
  }

  const closeCreateDialog = () => {
    setCreateOpen(false)
    setCreatedSecret(null)
  }

  if (auth.status === 'anonymous') {
    return (
      <div className="pt-6">
        <div className="mb-5">
          <h1 className="mb-1 text-2xl font-bold tracking-tight">API-Keys</h1>
          <p className="text-sm text-[#555b64]">Erstelle und verwalte deine API-Keys für smyst 1.0 und smyst 1.1.</p>
        </div>
        <Card className="mx-auto max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">🔑</div>
          <h2 className="mb-2 text-lg font-bold">Melde dich an, um API-Keys zu verwalten</h2>
          <p className="mb-5 text-sm text-[#555b64]">
            API-Keys gehören zu deinem Konto. Nach dem Anmelden kannst du in Sekunden deinen ersten Key erstellen.
          </p>
          <Button onClick={() => (onNavigate ? onNavigate('account-profile') : (window.location.href = '/profile'))}>
            Jetzt anmelden
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="pt-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">API-Keys</h1>
          <p className="text-sm text-[#555b64]">
            Erstelle und verwalte deine API-Keys für smyst 1.0 und smyst 1.1.
            {server && (
              <span className={`ml-2 inline-block h-2 w-2 rounded-full ${server.online ? 'bg-emerald-500' : 'bg-[#c2410c]'}`} />
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={Boolean(createdSecret)}>
          + Neuer Key
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f0c7c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2d1e]">{error}</div>
      )}

      <Card className="p-0">
        <div className="border-b border-[#e6e9ef] p-4 sm:px-5">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nach Name oder Key suchen …"
            className="h-11 w-full max-w-md rounded-lg border border-[#d7dce5] bg-white/70 px-4 text-sm outline-none transition focus:border-[#111722] focus:ring-2 focus:ring-[#111722]/20"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-[#667085]">Lade API-Keys …</div>
        ) : visibleKeys.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(89,199,255,0.18)] text-2xl">🔑</div>
            <h2 className="mb-1 text-lg font-bold">{search ? 'Kein Key gefunden' : 'Noch keine API-Keys'}</h2>
            <p className="mx-auto mb-5 max-w-sm text-sm text-[#555b64]">
              {search
                ? 'Kein Key passt zu deiner Suche. Versuche einen anderen Namen.'
                : 'Erstelle deinen ersten Key und nutze smyst 1.0 und smyst 1.1 in deinen eigenen Apps.'}
            </p>
            {!search && (
              <Button onClick={() => setCreateOpen(true)}>Ersten Key erstellen</Button>
            )}
          </div>
        ) : (
          <>
            {/* Tabelle ab Tablet-Größe */}
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e6e9ef] text-xs uppercase tracking-wide text-[#667085]">
                    <th className="px-5 py-3 font-semibold">Key</th>
                    <th className="px-3 py-3 font-semibold">Modell</th>
                    <th className="px-3 py-3 font-semibold">Erstellt</th>
                    <th className="px-3 py-3 font-semibold">Zuletzt genutzt</th>
                    <th className="px-3 py-3 font-semibold">Anfragen</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleKeys.map((key) => (
                    <tr key={key.id} className="border-b border-[#e6e9ef] last:border-b-0">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#17191d]">{key.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-[#667085]">{key.preview}</div>
                      </td>
                      <td className="px-3 py-4 text-[#39414d]">{modelLabel(key.model)}</td>
                      <td className="px-3 py-4 text-[#39414d]">{formatDate(key.createdAt)}</td>
                      <td className="px-3 py-4 text-[#39414d]">{formatLastUsed(key.lastUsedAt)}</td>
                      <td className="px-3 py-4 text-[#39414d]">{key.usageCount}</td>
                      <td className="px-5 py-4 text-right">
                        {deleteId === key.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-[#8a2d1e]">Wirklich löschen?</span>
                            <Button size="sm" variant="secondary" onClick={() => setDeleteId(null)} disabled={deleting}>
                              Abbrechen
                            </Button>
                            <Button size="sm" className="bg-[#b3261e] text-white hover:bg-[#9a201a]" onClick={confirmDelete} disabled={deleting}>
                              {deleting ? 'Lösche …' : 'Ja, löschen'}
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setDeleteId(key.id)}>
                            Löschen
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kartenansicht auf dem Handy */}
            <div className="md:hidden">
              {visibleKeys.map((key) => (
                <div key={key.id} className="border-b border-[#e6e9ef] p-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[#17191d]">{key.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-[#667085]">{key.preview}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-xs text-[#39414d]">{modelLabel(key.model)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#667085]">
                    <div>
                      <div className="font-medium text-[#39414d]">Erstellt</div>
                      {formatDate(key.createdAt)}
                    </div>
                    <div>
                      <div className="font-medium text-[#39414d]">Zuletzt</div>
                      {formatLastUsed(key.lastUsedAt)}
                    </div>
                    <div>
                      <div className="font-medium text-[#39414d]">Anfragen</div>
                      {key.usageCount}
                    </div>
                  </div>
                  {deleteId === key.id ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-[#8a2d1e]">Wirklich löschen?</span>
                      <Button size="sm" variant="secondary" onClick={() => setDeleteId(null)} disabled={deleting}>
                        Abbrechen
                      </Button>
                      <Button size="sm" className="bg-[#b3261e] text-white hover:bg-[#9a201a]" onClick={confirmDelete} disabled={deleting}>
                        {deleting ? 'Lösche …' : 'Ja, löschen'}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => setDeleteId(key.id)}>
                      Löschen
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3 text-xs text-[#667085]">
              {visibleKeys.length} {visibleKeys.length === 1 ? 'Key' : 'Keys'}
            </div>
          </>
        )}
      </Card>

      <p className="mt-3 px-1 text-xs text-[#667085]">
        Behandle deine Keys wie Passwörter: Teile sie nicht, speichere sie nie im Code. Gelöschte Keys funktionieren sofort nicht mehr.
      </p>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={createdSecret ? undefined : closeCreateDialog}>
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <Card className="max-h-[90vh] overflow-y-auto">
              {!createdSecret ? (
                <>
                  <h2 className="mb-1 text-xl font-bold">Neuen API-Key erstellen</h2>
                  <p className="mb-5 text-sm text-[#555b64]">Gib dem Key einen Namen, damit du weißt, wofür er gedacht ist.</p>

                  <label className="mb-1 block text-sm font-semibold">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="z. B. Meine App"
                    maxLength={80}
                    autoFocus
                    className="mb-4 h-11 w-full rounded-lg border border-[#d7dce5] bg-white/70 px-4 text-sm outline-none transition focus:border-[#111722] focus:ring-2 focus:ring-[#111722]/20"
                  />

                  <span className="mb-2 block text-sm font-semibold">Modell-Zugriff</span>
                  <div className="mb-5 space-y-2">
                    {(Object.keys(MODEL_LABELS) as ModelChoice[]).map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => setNewModel(model)}
                        className={`w-full border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111722]/40 ${
                          newModel === model
                            ? 'border-[#111722] bg-[#111722] text-white'
                            : 'border-[#d7dce5] bg-white/55 text-[#17191d] hover:bg-white'
                        }`}
                      >
                        <span className="block text-sm font-bold">{MODEL_LABELS[model].label}</span>
                        <span className={`mt-0.5 block text-xs ${newModel === model ? 'text-[#c6ceda]' : 'text-[#667085]'}`}>
                          {MODEL_LABELS[model].note}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={closeCreateDialog} disabled={creating}>
                      Abbrechen
                    </Button>
                    <Button onClick={createKey} disabled={creating}>
                      {creating ? 'Erstelle …' : 'Key erstellen'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
                    <h2 className="text-xl font-bold">Key erstellt!</h2>
                  </div>

                  <div className="mb-4 rounded-lg border border-[#f3d9ad] bg-[#fdf6e7] px-4 py-3 text-sm text-[#7a5310]">
                    Kopiere deinen Key jetzt. Aus Sicherheitsgründen zeigen wir ihn <strong>nur dieses eine Mal</strong> — später ist er nicht mehr sichtbar.
                  </div>

                  <div className="mb-3 break-all rounded-lg border border-[#d7dce5] bg-[#f6f7fa] px-4 py-3 font-mono text-sm text-[#17191d]">
                    {createdSecret}
                  </div>

                  <div className="mb-5 flex flex-col gap-2 sm:flex-row">
                    <Button onClick={handleCopy} className="flex-1">
                      {copied ? '✓ Kopiert!' : 'Key kopieren'}
                    </Button>
                    <Button variant="secondary" onClick={closeCreateDialog}>
                      Fertig
                    </Button>
                  </div>

                  <details className="rounded-lg border border-[#e6e9ef] bg-white/50 p-4 text-sm">
                    <summary className="cursor-pointer font-semibold">So benutzt du deinen Key</summary>
                    <p className="mt-2 text-xs text-[#667085]">Dein Key funktioniert mit jeder OpenAI-kompatiblen Bibliothek. Beispiel:</p>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-[#111722] p-3 text-xs leading-relaxed text-[#d7dce5]">{API_EXAMPLE}</pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={async () => {
                        if (await copyText(API_EXAMPLE)) {
                          setCopied(true)
                          window.setTimeout(() => setCopied(false), 2500)
                        }
                      }}
                    >
                      Beispiel kopieren
                    </Button>
                  </details>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
