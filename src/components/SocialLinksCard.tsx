// Social-Media-Links (Phase 1) — Links hinzufuegen, KI-gestuetzt pruefen und
// importieren. Es werden nur erlaubte OEFFENTLICHE Informationen gelesen
// (OpenGraph/Meta), kein Login-Bypass, kein aggressives Scraping. Der Nutzer
// kann alles jederzeit ansehen, bearbeiten, neu pruefen und loeschen.
import { useCallback, useEffect, useState } from 'react'
import { fetchService } from '@/lib/serviceEndpoints'

interface SocialLink {
  id: string
  url: string
  platform: string
  username?: string
  displayName?: string
  bio?: string
  imageUrl?: string
  category?: string
  topics?: string[]
  summary?: string
  status: string
  statusDetail?: string
  importStatus?: string
  lastCheckedAt?: number
  aiUsed?: boolean
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  github: 'GitHub',
  twitch: 'Twitch',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  spotify: 'Spotify',
  threads: 'Threads',
  xing: 'Xing',
  reddit: 'Reddit',
  website: 'Website',
}

const CATEGORY_OPTIONS = [
  'person', 'firma', 'restaurant', 'kuenstler', 'influencer',
  'dienstleistung', 'marke', 'organisation', 'sonstiges',
]

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ok: { label: 'Geprüft', className: 'bg-emerald-500/15 text-emerald-500' },
  limited: { label: 'Eingeschränkt', className: 'bg-amber-500/15 text-amber-400' },
  broken: { label: 'Nicht erreichbar', className: 'bg-red-500/15 text-red-400' },
  suspicious: { label: 'Verdächtig', className: 'bg-red-500/20 text-red-400' },
  pending: { label: 'Wird geprüft', className: 'bg-white/10 text-[#8e97a8]' },
}

export default function SocialLinksCard() {
  const [links, setLinks] = useState<SocialLink[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('person')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetchService('/api/social/links', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok || cancelled) return
        const data = (await response.json()) as { links?: SocialLink[] }
        if (!cancelled) setLinks(data.links ?? [])
      } catch {
        // Liste bleibt leer; Aktionen zeigen Fehler transparent an.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const addLink = useCallback(async () => {
    const url = input.trim()
    if (!url) return
    setBusy(true)
    setStatus('Link wird geprüft und importiert …')
    try {
      const response = await fetchService('/api/social/links', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ url }),
      })
      const data = (await response.json().catch(() => null)) as
        | { link?: SocialLink; error?: { message?: string } }
        | null
      if (!response.ok || !data?.link) {
        setStatus(data?.error?.message ?? `Hinzufügen fehlgeschlagen (${response.status}).`)
      } else {
        setLinks((current) => [...current, data.link as SocialLink])
        setInput('')
        setStatus('Link gespeichert.')
      }
    } catch {
      setStatus('Gerade nicht möglich. Bitte später erneut versuchen.')
    }
    setBusy(false)
  }, [input])

  const recheck = useCallback(async (id: string) => {
    setBusyId(id)
    setStatus('')
    try {
      const response = await fetchService(`/api/social/links/${encodeURIComponent(id)}/recheck`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: '{}',
      })
      const data = (await response.json().catch(() => null)) as { link?: SocialLink } | null
      if (response.ok && data?.link) {
        setLinks((current) => current.map((item) => (item.id === id ? (data.link as SocialLink) : item)))
        setStatus('Neu geprüft.')
      } else {
        setStatus(`Prüfung fehlgeschlagen (${response.status}).`)
      }
    } catch {
      setStatus('Prüfung gerade nicht möglich.')
    }
    setBusyId(null)
  }, [])

  const remove = useCallback(async (id: string) => {
    if (!window.confirm('Diesen Social-Media-Link wirklich entfernen?')) return
    setBusyId(id)
    try {
      const response = await fetchService(`/api/social/links/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-Smyst-CSRF': '1' },
      })
      if (response.ok) {
        setLinks((current) => current.filter((item) => item.id !== id))
        setStatus('Link entfernt.')
      } else {
        setStatus(`Entfernen fehlgeschlagen (${response.status}).`)
      }
    } catch {
      setStatus('Entfernen gerade nicht möglich.')
    }
    setBusyId(null)
  }, [])

  const saveEdit = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const response = await fetchService(`/api/social/links/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ displayName: editName, category: editCategory }),
      })
      const data = (await response.json().catch(() => null)) as { link?: SocialLink } | null
      if (response.ok && data?.link) {
        setLinks((current) => current.map((item) => (item.id === id ? (data.link as SocialLink) : item)))
        setEditingId(null)
        setStatus('Änderungen gespeichert.')
      } else {
        setStatus(`Speichern fehlgeschlagen (${response.status}).`)
      }
    } catch {
      setStatus('Speichern gerade nicht möglich.')
    }
    setBusyId(null)
  }, [editName, editCategory])

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.05] p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-lg font-semibold">Social-Media-Links</h3>
          <p className="text-sm text-[#555b64]">
            Verknüpfe deine Profile (Instagram, TikTok, YouTube, X, LinkedIn, Website …). Die KI
            erkennt die Plattform, prüft den Link und fasst öffentliche Infos zusammen.
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#8e97a8]">
          {links.length} / 25
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void addLink()
          }}
          placeholder="z. B. instagram.com/deinname oder deine-website.de"
          className="rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
        />
        <button
          type="button"
          onClick={() => void addLink()}
          disabled={busy || !input.trim()}
          className="rounded-lg border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Prüft …' : 'Hinzufügen'}
        </button>
      </div>

      {status && <p className="mt-2 text-sm text-[#8e97a8]">{status}</p>}

      <div className="mt-4 grid gap-3">
        {links.length === 0 && (
          <p className="text-sm text-[#767d87]">Noch keine Links gespeichert.</p>
        )}
        {links.map((link) => {
          const badge = STATUS_BADGES[link.status] ?? STATUS_BADGES.pending
          return (
            <div key={link.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {PLATFORM_LABELS[link.platform] ?? link.platform}
                </span>
                {link.username && <span className="text-sm text-[#8e97a8]">@{link.username}</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
                {link.category && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#8e97a8]">
                    {link.category}
                  </span>
                )}
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 block break-all text-xs text-[#59C7FF] hover:underline"
              >
                {link.url}
              </a>
              {link.summary && <p className="mt-2 text-sm text-[#a7b0c0]">{link.summary}</p>}
              {link.statusDetail && link.status !== 'ok' && (
                <p className="mt-1 text-xs text-[#767d87]">{link.statusDetail}</p>
              )}
              {link.topics && link.topics.length > 0 && (
                <p className="mt-1 text-xs text-[#767d87]">Themen: {link.topics.join(', ')}</p>
              )}

              {editingId === link.id ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="Anzeigename"
                    className="rounded-md border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm outline-none focus:border-[#59C7FF]"
                  />
                  <select
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                    className="rounded-md border border-white/20 bg-white/[0.04] px-2 py-1.5 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveEdit(link.id)}
                    disabled={busyId === link.id}
                    className="rounded-md border border-white/20 bg-white/[0.08] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.14] disabled:opacity-50"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/[0.08]"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void recheck(link.id)}
                    disabled={busyId === link.id}
                    className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {busyId === link.id ? 'Prüft …' : 'Neu prüfen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(link.id)
                      setEditName(link.displayName ?? '')
                      setEditCategory(link.category && CATEGORY_OPTIONS.includes(link.category) ? link.category : 'person')
                    }}
                    className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/[0.08]"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(link.id)}
                    disabled={busyId === link.id}
                    className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Entfernen
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-[#767d87]">
        Es werden nur öffentlich sichtbare Informationen (Meta-Angaben) gelesen — kein Login,
        keine privaten Daten. Einige Plattformen geben ohne Anmeldung nur wenig frei; solche
        Links erscheinen als „Eingeschränkt".
      </p>
    </section>
  )
}

