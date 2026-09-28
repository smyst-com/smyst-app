/**
 * href-Sanitizer fuer externe Links (Security 28.09.2026).
 *
 * Reaktive Attribute wie href duerfen keine nutzer- oder LLM-kontrollierten
 * javascript:/data:-URLs enthalten - React blockt die nicht zuverlaessig.
 * Erlaubt: http(s), App-relative Pfade und Anker; alles andere wird zum
 * neutralen "#" degrediert (Klick ohne Wirkung, Darstellung unveraendert).
 */
export function safeHref(raw: string | null | undefined): string {
  if (!raw) return '#'
  const trimmed = raw.trim()
  if (!trimmed) return '#'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  if (trimmed.startsWith('#')) return trimmed
  return '#'
}
