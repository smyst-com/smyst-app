/**
 * smyst.com i18n Helper — Client-Side
 *
 * Gemeinsame Konstanten und Hooks für Spracherkennung im Frontend.
 * Spiegelt die statische Sprachlogik der App.
 */

import { useEffect, useState, useCallback } from 'react';

export type SupportedLang =
  | 'de'
  | 'en'
  | 'tr'
  | 'fr'
  | 'es'
  | 'pt'
  | 'ar'
  | 'zh'
  | 'ja'
  | 'ko';

export const DEFAULT_LANG: SupportedLang = 'de';

export const RTL_LANGS: Set<SupportedLang> = new Set<SupportedLang>([
  'ar',
]);

export interface LanguageMeta {
  code: SupportedLang;
  /** Englischer Name (für Suche / a11y). */
  englishName: string;
  /** Eigenname (im Switcher angezeigt). */
  nativeName: string;
  /** ISO-3166-Alpha2 für Flag-Emoji. */
  region: string;
  rtl: boolean;
  /** Free-only content source. */
  provider: 'identity' | 'static';
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'de', englishName: 'German',     nativeName: 'Deutsch',           region: 'DE', rtl: false, provider: 'identity' },
  { code: 'en', englishName: 'English',    nativeName: 'English',           region: 'US', rtl: false, provider: 'static' },
  { code: 'tr', englishName: 'Turkish',    nativeName: 'Türkçe',            region: 'TR', rtl: false, provider: 'static' },
  { code: 'fr', englishName: 'French',     nativeName: 'Français',          region: 'FR', rtl: false, provider: 'static' },
  { code: 'es', englishName: 'Spanish',    nativeName: 'Español',           region: 'ES', rtl: false, provider: 'static' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português',         region: 'PT', rtl: false, provider: 'static' },
  { code: 'ar', englishName: 'Arabic',     nativeName: 'العربية',           region: 'SA', rtl: true,  provider: 'static' },
  { code: 'zh', englishName: 'Chinese',    nativeName: '中文',               region: 'CN', rtl: false, provider: 'static' },
  { code: 'ja', englishName: 'Japanese',   nativeName: '日本語',             region: 'JP', rtl: false, provider: 'static' },
  { code: 'ko', englishName: 'Korean',     nativeName: '한국어',             region: 'KR', rtl: false, provider: 'static' },
];

/** Reine Code-Liste für Iteration (z. B. Sitemap-Generierung). */
export const SUPPORTED_LANGS: SupportedLang[] = LANGUAGES.map((l) => l.code);

const COOKIE_NAME = 'smyst_lang';
const STORAGE_KEY = 'smyst_lang';

export function isRtl(lang: SupportedLang): boolean {
  return RTL_LANGS.has(lang);
}

export function toSupportedLang(raw: string | null | undefined): SupportedLang {
  if (!raw) return DEFAULT_LANG;
  const norm = raw.toLowerCase().split(/[-_]/)[0] as SupportedLang;
  return SUPPORTED_LANGS.includes(norm) ? norm : DEFAULT_LANG;
}

/** Cookie-Helpers (kein dependency). */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeCookie(name: string, value: string, maxAgeSec = 31536000): void {
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

/**
 * Detection-Priorität (Frontend):
 *   1. URL ?lang=
 *   2. URL Pfad-Prefix /de/, /en/, ...
 *   3. DEFAULT_LANG for unprefixed routes
 */
export function detectInitialLang(): SupportedLang {
  if (typeof window === 'undefined') return DEFAULT_LANG;

  const url = new URL(window.location.href);
  const q = url.searchParams.get('lang');
  if (q) return toSupportedLang(q);

  const pathLang = url.pathname.split('/')[1];
  if (pathLang && SUPPORTED_LANGS.includes(pathLang as SupportedLang)) {
    return pathLang as SupportedLang;
  }

  // The canonical unprefixed routes are German. Do not let a previously stored
  // browser preference put the SPA into another language while the edge worker
  // has served the German document.
  return DEFAULT_LANG;
}

/**
 * Wendet die Sprache auf <html lang="..." dir="..."> an.
 * Zentrale Stelle, damit RTL überall greift.
 */
export function applyLangAttributes(lang: SupportedLang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
}

/**
 * React-Hook: liefert aktuelle Sprache + setLanguage().
 *
 * setLanguage() persistiert in:
 *  - localStorage
 *  - Cookie (damit der Edge-Worker es beim nächsten Request kennt)
 *  - URL (falls subPathRouting=true: /de/foo statt /foo?lang=de)
 *  - <html lang/dir>
 *
 * Anschließend lädt die Seite neu, damit der Edge-Worker die übersetzte
 * Variante ausliefert.
 */
export interface UseLanguageOptions {
  /** Wenn true, wird /:lang/-Sub-Path-Routing verwendet. Default true. */
  subPathRouting?: boolean;
  /** Wenn true, wird nach Sprachwechsel reloadet. Default true. */
  reloadOnChange?: boolean;
}

export function useLanguage(opts: UseLanguageOptions = {}) {
  const { subPathRouting = true, reloadOnChange = true } = opts;
  const [lang, setLangState] = useState<SupportedLang>(() => detectInitialLang());

  useEffect(() => {
    applyLangAttributes(lang);
  }, [lang]);

  const setLanguage = useCallback(
    (next: SupportedLang) => {
      if (next === lang) return;

      // Persistieren
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      writeCookie(COOKIE_NAME, next);
      applyLangAttributes(next);
      setLangState(next);

      if (typeof window === 'undefined') return;

      const url = new URL(window.location.href);

      if (subPathRouting) {
        // Strip alten Lang-Prefix
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0 && SUPPORTED_LANGS.includes(parts[0] as SupportedLang)) {
          parts.shift();
        }
        // Default-Sprache OHNE Prefix (klarere URLs für DE)
        const newPath =
          next === DEFAULT_LANG
            ? '/' + parts.join('/')
            : `/${next}/` + parts.join('/');
        url.pathname = newPath.replace(/\/+$/, '') || '/';
        url.searchParams.delete('lang');
      } else {
        url.searchParams.set('lang', next);
      }

      if (reloadOnChange) {
        window.location.href = url.toString();
      } else {
        window.history.replaceState(null, '', url.toString());
      }
    },
    [lang, subPathRouting, reloadOnChange],
  );

  return { lang, setLanguage, isRtl: isRtl(lang) };
}
