// Social-Media-Links (Phase 1) — Links hinzufuegen, KI-gestuetzt pruefen und
// importieren. Es werden nur erlaubte OEFFENTLICHE Informationen gelesen
// (OpenGraph/Meta), kein Login-Bypass, kein aggressives Scraping. Der Nutzer
// kann alles jederzeit ansehen, bearbeiten, neu pruefen und loeschen.
import { useCallback, useEffect, useState } from 'react'
import { Check, MoreHorizontal, Pencil, RotateCw, Trash2, X } from 'lucide-react'
import { fetchService } from '@/lib/serviceEndpoints'
import { DEFAULT_LANG, useLanguage } from '@/lib/i18n'
import { useStaticTranslations } from '@/lib/staticTranslations'

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
  const { lang } = useLanguage()
  const sl = useStaticTranslations(lang).social
  const [links, setLinks] = useState<SocialLink[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('person')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [undoLink, setUndoLink] = useState<SocialLink | null>(null)

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
    setStatus(lang === DEFAULT_LANG ? 'Link wird geprüft und importiert …' : sl.addChecking)
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
        setStatus(data?.error?.message ?? (lang === DEFAULT_LANG ? `Hinzufügen fehlgeschlagen (${response.status}).` : `${sl.addFailed} (${response.status}).`))
      } else {
        setLinks((current) => [...current, data.link as SocialLink])
        setInput('')
        setStatus(lang === DEFAULT_LANG ? 'Link gespeichert.' : sl.added)
      }
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Gerade nicht möglich. Bitte später erneut versuchen.' : sl.addUnavailable)
    }
    setBusy(false)
  }, [input, lang, sl])

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
        setStatus(lang === DEFAULT_LANG ? 'Neu geprüft.' : sl.rechecked)
      } else {
        setStatus(lang === DEFAULT_LANG ? `Prüfung fehlgeschlagen (${response.status}).` : `${sl.recheckFailed} (${response.status}).`)
      }
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Prüfung gerade nicht möglich.' : sl.recheckUnavailable)
    }
    setBusyId(null)
  }, [lang, sl])

  const restoreRemovedLink = useCallback(async () => {
    if (!undoLink) return
    const linkToRestore = undoLink
    setUndoLink(null)
    setBusy(true)
    setStatus(lang === DEFAULT_LANG ? 'Link wird wiederhergestellt …' : sl.restoring)
    try {
      const response = await fetchService('/api/social/links', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({ url: linkToRestore.url }),
      })
      const data = (await response.json().catch(() => null)) as { link?: SocialLink; error?: { message?: string } } | null
      if (!response.ok || !data?.link) {
        setLinks((current) => current.some((item) => item.url === linkToRestore.url) ? current : [...current, linkToRestore])
        setStatus(data?.error?.message ?? (lang === DEFAULT_LANG ? 'Link lokal wieder angezeigt. Bitte später erneut speichern.' : sl.restoredLocalSave))
        return
      }
      const restored = data.link as SocialLink
      const patchResponse = await fetchService(`/api/social/links/${encodeURIComponent(restored.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
        body: JSON.stringify({
          displayName: linkToRestore.displayName ?? '',
          category: linkToRestore.category ?? 'person',
          bio: linkToRestore.bio ?? '',
          topics: linkToRestore.topics ?? [],
          summary: linkToRestore.summary ?? '',
        }),
      })
      const patchData = (await patchResponse.json().catch(() => null)) as { link?: SocialLink } | null
      setLinks((current) => [...current, patchResponse.ok && patchData?.link ? patchData.link : restored])
      setStatus(lang === DEFAULT_LANG ? 'Link wiederhergestellt.' : sl.restored)
    } catch {
      setLinks((current) => current.some((item) => item.url === linkToRestore.url) ? current : [...current, linkToRestore])
      setStatus(lang === DEFAULT_LANG ? 'Link lokal wieder angezeigt. Bitte Verbindung prüfen.' : sl.restoredLocalConn)
    } finally {
      setBusy(false)
    }
  }, [undoLink, lang, sl])

  const remove = useCallback(async (link: SocialLink) => {
    const id = link.id
    setConfirmRemoveId(null)
    setMenuOpenId(null)
    setBusyId(id)
    try {
      const response = await fetchService(`/api/social/links/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-Smyst-CSRF': '1', 'X-Smyst-Delete-Confirm': 'delete-social-link' },
      })
      if (response.ok) {
        setLinks((current) => current.filter((item) => item.id !== id))
        setUndoLink(link)
        setStatus(lang === DEFAULT_LANG ? 'Link entfernt. Rückgängig ist kurz möglich.' : sl.removed)
      } else {
        setStatus(lang === DEFAULT_LANG ? `Entfernen fehlgeschlagen (${response.status}).` : `${sl.removeFailed} (${response.status}).`)
      }
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Entfernen gerade nicht möglich.' : sl.removeUnavailable)
    }
    setBusyId(null)
  }, [lang, sl])

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
        setStatus(lang === DEFAULT_LANG ? 'Änderungen gespeichert.' : sl.editSaved)
      } else {
        setStatus(lang === DEFAULT_LANG ? `Speichern fehlgeschlagen (${response.status}).` : `${sl.editSaveFailed} (${response.status}).`)
      }
    } catch {
      setStatus(lang === DEFAULT_LANG ? 'Speichern gerade nicht möglich.' : sl.editSaveUnavailable)
    }
    setBusyId(null)
  }, [editName, editCategory, lang, sl])

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.05] p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-lg font-semibold">{lang === DEFAULT_LANG ? 'Social-Media-Links' : sl.title}</h3>
          <p className="text-sm text-[#555b64]">
            {lang === DEFAULT_LANG ? 'Verknüpfe deine Profile (Instagram, TikTok, YouTube, X, LinkedIn, Website …). Die KI erkennt die Plattform, prüft den Link und fasst öffentliche Infos zusammen.' : sl.subtitle}
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
          placeholder={lang === DEFAULT_LANG ? 'z. B. instagram.com/deinname oder deine-website.de' : sl.inputPlaceholder}
          className="rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[#59C7FF]"
        />
        <button
          type="button"
          onClick={() => void addLink()}
          disabled={busy || !input.trim()}
          className="rounded-lg border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (lang === DEFAULT_LANG ? 'Prüft …' : sl.checking) : (lang === DEFAULT_LANG ? 'Hinzufügen' : sl.addButton)}
        </button>
      </div>

      {status && <p className="mt-2 text-sm text-[#8e97a8]">{status}</p>}

      <div className="mt-4 grid gap-3">
        {links.length === 0 && (
          <p className="text-sm text-[#767d87]">{lang === DEFAULT_LANG ? 'Noch keine Links gespeichert.' : sl.empty}</p>
        )}
        {links.map((link) => {
          const badge = STATUS_BADGES[link.status] ?? STATUS_BADGES.pending
          return (
            <div key={link.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {PLATFORM_LABELS[link.platform] ?? link.platform}
                  </span>
                  {link.username && <span className="text-sm text-[#8e97a8]">@{link.username}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                    {lang === DEFAULT_LANG ? badge.label : (sl.status[link.status] ?? badge.label)}
                  </span>
                  {link.category && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#8e97a8]">
                      {link.category}
                    </span>
                  )}
                </div>
                {editingId !== link.id && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmRemoveId(null)
                        setMenuOpenId((current) => (current === link.id ? null : link.id))
                      }}
                      aria-label={lang === DEFAULT_LANG ? 'Weitere Optionen' : sl.moreOptions}
                      title={lang === DEFAULT_LANG ? 'Weitere Optionen' : sl.moreOptions}
                      className="grid h-9 w-9 place-items-center rounded-md border border-white/20 bg-white/[0.04] text-[#8e97a8] transition-colors hover:bg-white/[0.1] hover:text-white"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpenId === link.id && (
                      <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-white/14 bg-[#101722] p-2 shadow-xl">
                        <button
                          type="button"
                          onClick={() => void recheck(link.id)}
                          disabled={busyId === link.id}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-[#d8dee8] hover:bg-white/10 disabled:opacity-50"
                        >
                          <RotateCw className="h-4 w-4" />
                          {busyId === link.id ? (lang === DEFAULT_LANG ? 'Prüft …' : sl.checking) : (lang === DEFAULT_LANG ? 'Neu prüfen' : sl.recheck)}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(link.id)
                            setEditName(link.displayName ?? '')
                            setEditCategory(link.category && CATEGORY_OPTIONS.includes(link.category) ? link.category : 'person')
                            setMenuOpenId(null)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-[#d8dee8] hover:bg-white/10"
                        >
                          <Pencil className="h-4 w-4" />
                          {lang === DEFAULT_LANG ? 'Bearbeiten' : sl.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(link.id)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-red-300 hover:bg-red-500/12"
                        >
                          <Trash2 className="h-4 w-4" />
                          {lang === DEFAULT_LANG ? 'Entfernen vorbereiten' : sl.removePrepare}
                        </button>
                      </div>
                    )}
                  </div>
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
                    placeholder={lang === DEFAULT_LANG ? 'Anzeigename' : sl.namePlaceholder}
                    className="rounded-md border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm outline-none focus:border-[#59C7FF]"
                  />
                  <select
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                    className="rounded-md border border-white/20 bg-white/[0.04] px-2 py-1.5 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{lang === DEFAULT_LANG ? option : (sl.linkCats[option] ?? option)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveEdit(link.id)}
                    disabled={busyId === link.id}
                    className="rounded-md border border-white/20 bg-white/[0.08] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.14] disabled:opacity-50"
                  >
                    {lang === DEFAULT_LANG ? 'Speichern' : sl.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/[0.08]"
                  >
                    {lang === DEFAULT_LANG ? 'Abbrechen' : sl.cancel}
                  </button>
                </div>
              ) : (
                confirmRemoveId === link.id && (
                  <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-xs font-semibold text-red-200">
                      {lang === DEFAULT_LANG ? 'Diesen Link entfernen? Die Verbindung wird aus deinem Profilbereich gelöscht.' : sl.confirmRemoveText}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void remove(link)}
                        disabled={busyId === link.id}
                        className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/14 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/22 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        {lang === DEFAULT_LANG ? 'Ja, entfernen' : sl.confirmRemoveYes}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRemoveId(null)
                          setMenuOpenId(null)
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.08]"
                      >
                        <X className="h-4 w-4" />
                        {lang === DEFAULT_LANG ? 'Abbrechen' : sl.cancel}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>

      {undoLink && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
          <span>{lang === DEFAULT_LANG ? `„${PLATFORM_LABELS[undoLink.platform] ?? undoLink.platform}“ wurde entfernt.` : sl.removedToast.replace('{name}', PLATFORM_LABELS[undoLink.platform] ?? undoLink.platform)}</span>
          <button
            type="button"
            onClick={() => void restoreRemovedLink()}
            disabled={busy}
            className="rounded-md border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-400/10 disabled:opacity-50"
          >
            {lang === DEFAULT_LANG ? 'Rückgängig' : sl.undo}
          </button>
        </div>
      )}

      <p className="mt-4 text-xs text-[#767d87]">
        {lang === DEFAULT_LANG ? 'Es werden nur öffentlich sichtbare Informationen (Meta-Angaben) gelesen — kein Login, keine privaten Daten. Einige Plattformen geben ohne Anmeldung nur wenig frei; solche Links erscheinen als „Eingeschränkt".' : sl.footer}
      </p>
    </section>
  )
}
