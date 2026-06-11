/**
 * LangSwitcher — Sprachumschalter für smyst.com mit Suche/Filter
 *
 * Features:
 *  - 10 Free-only Startsprachen mit Eigennamen
 *  - Such-Input filtert nach nativeName, englishName und Code
 *  - Touch-optimiert (44 px Targets, WCAG 2.2 AA)
 *  - Tastatur-Navigation (Arrow keys, Enter, Escape, Home, End)
 *  - Aria-Combobox-Pattern für Screenreader
 *  - App-preview-kompatibel (kein router-spezifisches Verhalten)
 *  - Automatischer RTL-Switch über useLanguage
 *  - Free-only: keine externen Übersetzungsprovider
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES, useLanguage, type SupportedLang, type LanguageMeta } from '@/lib/i18n';

interface Props {
  /** Anzeigevariante. */
  variant?: 'compact' | 'full';
  className?: string;
  /** Zeigt statische/manuelle Sprachquelle. Default: false. */
  showProvider?: boolean;
}

export default function LangSwitcher({
  variant = 'compact',
  className = '',
  showProvider = false,
}: Props) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusIndex, setFocusIndex] = useState<number>(-1);

  const currentMeta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  // Gefilterte Liste
  const filtered: LanguageMeta[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        l.nativeName.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  // Schließe Menü bei Klick außerhalb
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        menuRef.current &&
        !menuRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Beim Öffnen: Input fokussieren, Index auf aktuelle Sprache
  useEffect(() => {
    if (open) {
      const idx = filtered.findIndex((l) => l.code === lang);
      setFocusIndex(idx >= 0 ? idx : 0);
      // Input-Fokus minimal verzögert (Slide-In abwarten)
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setFocusIndex(-1);
      setQuery('');
    }
  }, [open, lang, filtered]);

  // Bei Filter-Wechsel: Index auf 0 zurück
  useEffect(() => {
    if (!open) return;
    setFocusIndex(0);
  }, [query, open]);

  // Scrolle fokussiertes Item in den Viewport
  useEffect(() => {
    if (!open || focusIndex < 0) return;
    const el = menuRef.current?.querySelector<HTMLButtonElement>(
      `[data-lang-index="${focusIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, focusIndex]);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => (i + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIndex(filtered.length - 1);
    } else if (e.key === 'Enter') {
      const target = filtered[focusIndex];
      if (target) {
        e.preventDefault();
        select(target.code);
      }
    }
  };

  const select = (code: SupportedLang) => {
    setOpen(false);
    setLanguage(code);
  };

  const triggerLabel =
    variant === 'compact'
      ? currentMeta.code.toUpperCase()
      : currentMeta.nativeName;

  const listboxId = 'smyst-lang-listbox';
  const inputId = 'smyst-lang-search';

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={`Sprache wechseln, aktuell: ${currentMeta.englishName}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border border-white/40 bg-white/30 px-3 py-2 text-sm font-medium text-[#16181b] backdrop-blur-md hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition"
      >
        <GlobeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-mono tabular-nums">{triggerLabel}</span>
        <ChevronIcon
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-owns={listboxId}
          onKeyDown={handleKey}
          className="absolute right-0 z-50 mt-2 flex w-[min(calc(100vw-32px),320px)] flex-col rounded-2xl border border-white/40 bg-white/95 shadow-xl backdrop-blur-xl ring-1 ring-black/5"
        >
          {/* Such-Input */}
          <div className="border-b border-black/5 p-2">
            <label htmlFor={inputId} className="sr-only">
              Sprache suchen
            </label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suche … (z. B. español, türkçe, japan)"
                className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-[#16181b] placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-controls={listboxId}
                aria-activedescendant={
                  focusIndex >= 0 && filtered[focusIndex]
                    ? `${listboxId}-${filtered[focusIndex].code}`
                    : undefined
                }
              />
            </div>
          </div>

          {/* Listbox */}
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Sprachen"
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-500">
                Keine Sprache gefunden.
              </li>
            )}
            {filtered.map((meta, i) => {
              const active = meta.code === lang;
              const focused = i === focusIndex;
              return (
                <li key={meta.code}>
                  <button
                    type="button"
                    role="option"
                    id={`${listboxId}-${meta.code}`}
                    aria-selected={active}
                    data-lang-index={i}
                    onClick={() => select(meta.code)}
                    onMouseEnter={() => setFocusIndex(i)}
                    className={`flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active
                        ? 'bg-blue-50 font-semibold text-[#0b1c44]'
                        : focused
                          ? 'bg-gray-100 text-[#16181b]'
                          : 'text-[#16181b] hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-mono text-gray-600"
                      >
                        {meta.code.toUpperCase()}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="truncate text-sm leading-tight" dir={meta.rtl ? 'rtl' : 'ltr'}>
                          {meta.nativeName}
                        </span>
                        <span className="truncate text-xs text-gray-500">{meta.englishName}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {showProvider && meta.provider !== 'identity' && (
                        <span
                          aria-label={`Provider: ${meta.provider}`}
                          className="hidden sm:inline rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800"
                        >
                          Statisch
                        </span>
                      )}
                      {meta.rtl && (
                        <span
                          aria-label="Right-to-left"
                          className="hidden sm:inline rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800"
                        >
                          RTL
                        </span>
                      )}
                      {active && <CheckIcon className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer mit Counter */}
          <div className="border-t border-black/5 px-3 py-2 text-[11px] text-gray-500">
            {filtered.length} von {LANGUAGES.length} Sprachen
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="ml-2 text-blue-600 hover:underline"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live-Region für Screenreader */}
      <span aria-live="polite" className="sr-only">
        Sprache: {currentMeta.englishName}
      </span>
    </div>
  );
}

// ---------- Icons (inline, kein extra Dependency) ----------

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
