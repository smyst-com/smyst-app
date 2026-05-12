/**
 * twynt.com i18n Helper — Client-Side
 *
 * Gemeinsame Konstanten und Hooks für Spracherkennung im Frontend.
 * Spiegelt die Logik aus workers/translator.ts.
 */

import { useEffect, useState, useCallback } from 'react';

export type SupportedLang =
  // Quelle
  | 'de'
  // DeepL (26)
  | 'en' | 'zh' | 'es' | 'fr' | 'ar' | 'pt' | 'ru' | 'id' | 'ja' | 'tr'
  | 'ko' | 'it' | 'pl' | 'uk' | 'nl' | 'ro' | 'hu' | 'el' | 'cs' | 'sv'
  | 'bg' | 'da' | 'fi' | 'no' | 'sk' | 'lt'
  // Google (24)
  | 'hi' | 'bn' | 'ur' | 'pa' | 'sw' | 'mr' | 'te' | 'ta' | 'vi' | 'ha'
  | 'fa' | 'th' | 'gu' | 'kn' | 'yo' | 'ml' | 'ms' | 'am' | 'ne' | 'az'
  | 'si' | 'sr' | 'he' | 'hr';

export const DEFAULT_LANG: SupportedLang = 'de';

export const RTL_LANGS: Set<SupportedLang> = new Set<SupportedLang>([
  'ar', 'fa', 'he', 'ur',
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
  /** Translation-Provider: 'deepl' | 'google' | 'identity' (für DE). */
  provider: 'deepl' | 'google' | 'identity';
}

/**
 * 50 Sprachen + DE als Quelle = 51.
 * Sortiert nach: Quelle → DeepL (geographisch grob: West→Ost) → Google (geographisch grob).
 * Das bewahrt im Dropdown eine sinnvolle Reihenfolge; mit Such-Filter ist das aber egal.
 */
export const LANGUAGES: LanguageMeta[] = [
  // ---------- Quelle ----------
  { code: 'de', englishName: 'German',     nativeName: 'Deutsch',           region: 'DE', rtl: false, provider: 'identity' },

  // ---------- DeepL ----------
  { code: 'en', englishName: 'English',    nativeName: 'English',           region: 'US', rtl: false, provider: 'deepl' },
  { code: 'es', englishName: 'Spanish',    nativeName: 'Español',           region: 'ES', rtl: false, provider: 'deepl' },
  { code: 'fr', englishName: 'French',     nativeName: 'Français',          region: 'FR', rtl: false, provider: 'deepl' },
  { code: 'it', englishName: 'Italian',    nativeName: 'Italiano',          region: 'IT', rtl: false, provider: 'deepl' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português',         region: 'PT', rtl: false, provider: 'deepl' },
  { code: 'nl', englishName: 'Dutch',      nativeName: 'Nederlands',        region: 'NL', rtl: false, provider: 'deepl' },
  { code: 'sv', englishName: 'Swedish',    nativeName: 'Svenska',           region: 'SE', rtl: false, provider: 'deepl' },
  { code: 'da', englishName: 'Danish',     nativeName: 'Dansk',             region: 'DK', rtl: false, provider: 'deepl' },
  { code: 'no', englishName: 'Norwegian',  nativeName: 'Norsk',             region: 'NO', rtl: false, provider: 'deepl' },
  { code: 'fi', englishName: 'Finnish',    nativeName: 'Suomi',             region: 'FI', rtl: false, provider: 'deepl' },
  { code: 'pl', englishName: 'Polish',     nativeName: 'Polski',            region: 'PL', rtl: false, provider: 'deepl' },
  { code: 'cs', englishName: 'Czech',      nativeName: 'Čeština',           region: 'CZ', rtl: false, provider: 'deepl' },
  { code: 'sk', englishName: 'Slovak',     nativeName: 'Slovenčina',        region: 'SK', rtl: false, provider: 'deepl' },
  { code: 'hu', englishName: 'Hungarian',  nativeName: 'Magyar',            region: 'HU', rtl: false, provider: 'deepl' },
  { code: 'ro', englishName: 'Romanian',   nativeName: 'Română',            region: 'RO', rtl: false, provider: 'deepl' },
  { code: 'bg', englishName: 'Bulgarian',  nativeName: 'Български',         region: 'BG', rtl: false, provider: 'deepl' },
  { code: 'el', englishName: 'Greek',      nativeName: 'Ελληνικά',          region: 'GR', rtl: false, provider: 'deepl' },
  { code: 'lt', englishName: 'Lithuanian', nativeName: 'Lietuvių',          region: 'LT', rtl: false, provider: 'deepl' },
  { code: 'tr', englishName: 'Turkish',    nativeName: 'Türkçe',            region: 'TR', rtl: false, provider: 'deepl' },
  { code: 'ru', englishName: 'Russian',    nativeName: 'Русский',           region: 'RU', rtl: false, provider: 'deepl' },
  { code: 'uk', englishName: 'Ukrainian',  nativeName: 'Українська',        region: 'UA', rtl: false, provider: 'deepl' },
  { code: 'ar', englishName: 'Arabic',     nativeName: 'العربية',           region: 'SA', rtl: true,  provider: 'deepl' },
  { code: 'zh', englishName: 'Chinese',    nativeName: '中文',               region: 'CN', rtl: false, provider: 'deepl' },
  { code: 'ja', englishName: 'Japanese',   nativeName: '日本語',             region: 'JP', rtl: false, provider: 'deepl' },
  { code: 'ko', englishName: 'Korean',     nativeName: '한국어',             region: 'KR', rtl: false, provider: 'deepl' },
  { code: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia',  region: 'ID', rtl: false, provider: 'deepl' },

  // ---------- Google ----------
  { code: 'hr', englishName: 'Croatian',     nativeName: 'Hrvatski',         region: 'HR', rtl: false, provider: 'google' },
  { code: 'sr', englishName: 'Serbian',      nativeName: 'Српски',           region: 'RS', rtl: false, provider: 'google' },
  { code: 'he', englishName: 'Hebrew',       nativeName: 'עברית',            region: 'IL', rtl: true,  provider: 'google' },
  { code: 'fa', englishName: 'Persian',      nativeName: 'فارسی',            region: 'IR', rtl: true,  provider: 'google' },
  { code: 'az', englishName: 'Azerbaijani',  nativeName: 'Azərbaycan dili',  region: 'AZ', rtl: false, provider: 'google' },
  { code: 'hi', englishName: 'Hindi',        nativeName: 'हिन्दी',             region: 'IN', rtl: false, provider: 'google' },
  { code: 'bn', englishName: 'Bengali',      nativeName: 'বাংলা',             region: 'BD', rtl: false, provider: 'google' },
  { code: 'ur', englishName: 'Urdu',         nativeName: 'اردو',             region: 'PK', rtl: true,  provider: 'google' },
  { code: 'pa', englishName: 'Punjabi',      nativeName: 'ਪੰਜਾਬੀ',             region: 'IN', rtl: false, provider: 'google' },
  { code: 'mr', englishName: 'Marathi',      nativeName: 'मराठी',             region: 'IN', rtl: false, provider: 'google' },
  { code: 'gu', englishName: 'Gujarati',     nativeName: 'ગુજરાતી',           region: 'IN', rtl: false, provider: 'google' },
  { code: 'te', englishName: 'Telugu',       nativeName: 'తెలుగు',           region: 'IN', rtl: false, provider: 'google' },
  { code: 'ta', englishName: 'Tamil',        nativeName: 'தமிழ்',             region: 'IN', rtl: false, provider: 'google' },
  { code: 'kn', englishName: 'Kannada',      nativeName: 'ಕನ್ನಡ',             region: 'IN', rtl: false, provider: 'google' },
  { code: 'ml', englishName: 'Malayalam',    nativeName: 'മലയാളം',           region: 'IN', rtl: false, provider: 'google' },
  { code: 'ne', englishName: 'Nepali',       nativeName: 'नेपाली',             region: 'NP', rtl: false, provider: 'google' },
  { code: 'si', englishName: 'Sinhala',      nativeName: 'සිංහල',             region: 'LK', rtl: false, provider: 'google' },
  { code: 'th', englishName: 'Thai',         nativeName: 'ไทย',              region: 'TH', rtl: false, provider: 'google' },
  { code: 'vi', englishName: 'Vietnamese',   nativeName: 'Tiếng Việt',       region: 'VN', rtl: false, provider: 'google' },
  { code: 'ms', englishName: 'Malay',        nativeName: 'Bahasa Melayu',    region: 'MY', rtl: false, provider: 'google' },
  { code: 'sw', englishName: 'Swahili',      nativeName: 'Kiswahili',        region: 'KE', rtl: false, provider: 'google' },
  { code: 'ha', englishName: 'Hausa',        nativeName: 'Hausa',            region: 'NG', rtl: false, provider: 'google' },
  { code: 'yo', englishName: 'Yoruba',       nativeName: 'Yorùbá',           region: 'NG', rtl: false, provider: 'google' },
  { code: 'am', englishName: 'Amharic',      nativeName: 'አማርኛ',             region: 'ET', rtl: false, provider: 'google' },
];

/** Reine Code-Liste für Iteration (z. B. Sitemap-Generierung). */
export const SUPPORTED_LANGS: SupportedLang[] = LANGUAGES.map((l) => l.code);

const COOKIE_NAME = 'twynt_lang';
const STORAGE_KEY = 'twynt_lang';

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
 *   3. localStorage
 *   4. Cookie
 *   5. navigator.language
 *   6. DEFAULT_LANG
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

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return toSupportedLang(stored);
  } catch {
    // localStorage kann in Private-Mode etc. blockiert sein
  }

  const cookieLang = readCookie(COOKIE_NAME);
  if (cookieLang) return toSupportedLang(cookieLang);

  if (navigator.language) return toSupportedLang(navigator.language);

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
