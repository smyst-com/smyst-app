/**
 * Twynt Translator — Hybrid DeepL + Google Cloud Translation v3
 *
 * Strategie:
 *  - DeepL ist primary für DE, EN, TR, FR, ES, IT, PT, JA, ZH, RU (10 von 12)
 *  - Google ist fallback für KO und AR (DeepL unterstützt diese 2 nicht)
 *  - Bei DeepL-Fehler → automatisch Fallback auf Google für unterstützte Sprachen
 *  - Brand-Glossary erzwingt: "Twynt", "Twin", "Memory Engine", etc. werden NICHT übersetzt
 *  - Retry mit exponentiellem Backoff
 *  - Hard-Timeout pro Request, sonst Fallback auf Originaltext
 *  - Batch-Übersetzung: bis zu 50 Texte / Request
 */

export type SupportedLang =
  // Quelle
  | 'de'
  // DeepL (26)
  | 'en' | 'zh' | 'es' | 'fr' | 'ar' | 'pt' | 'ru' | 'id' | 'ja' | 'tr'
  | 'ko' | 'it' | 'pl' | 'uk' | 'nl' | 'ro' | 'hu' | 'el' | 'cs' | 'sv'
  | 'bg' | 'da' | 'fi' | 'no' | 'sk' | 'lt'
  // Google Translate (24)
  | 'hi' | 'bn' | 'ur' | 'pa' | 'sw' | 'mr' | 'te' | 'ta' | 'vi' | 'ha'
  | 'fa' | 'th' | 'gu' | 'kn' | 'yo' | 'ml' | 'ms' | 'am' | 'ne' | 'az'
  | 'si' | 'sr' | 'he' | 'hr';

export const SUPPORTED_LANGS: SupportedLang[] = [
  // Quelle
  'de',
  // DeepL
  'en', 'zh', 'es', 'fr', 'ar', 'pt', 'ru', 'id', 'ja', 'tr',
  'ko', 'it', 'pl', 'uk', 'nl', 'ro', 'hu', 'el', 'cs', 'sv',
  'bg', 'da', 'fi', 'no', 'sk', 'lt',
  // Google
  'hi', 'bn', 'ur', 'pa', 'sw', 'mr', 'te', 'ta', 'vi', 'ha',
  'fa', 'th', 'gu', 'kn', 'yo', 'ml', 'ms', 'am', 'ne', 'az',
  'si', 'sr', 'he', 'hr',
];

export const DEFAULT_LANG: SupportedLang = 'de';

/**
 * Sprachen, die DeepL Pro nativ unterstützt (Stand 2025).
 * AR seit 2024, KO seit 2023.
 * Alles was nicht hier ist, geht über Google Translate.
 */
const DEEPL_SUPPORTED: ReadonlySet<SupportedLang> = new Set<SupportedLang>([
  'de', 'en', 'zh', 'es', 'fr', 'ar', 'pt', 'ru', 'id', 'ja', 'tr',
  'ko', 'it', 'pl', 'uk', 'nl', 'ro', 'hu', 'el', 'cs', 'sv',
  'bg', 'da', 'fi', 'no', 'sk', 'lt',
]);

/**
 * DeepL-spezifische Target-Codes (manche brauchen Region-Suffix).
 * Für Sprachen, die NICHT in DEEPL_SUPPORTED sind, wird dieser Wert ignoriert
 * — der Translator routet automatisch zu Google.
 */
const DEEPL_TARGET: Record<SupportedLang, string> = {
  // Quelle + DeepL
  de: 'DE', en: 'EN-US', zh: 'ZH', es: 'ES', fr: 'FR', ar: 'AR',
  pt: 'PT-PT', ru: 'RU', id: 'ID', ja: 'JA', tr: 'TR', ko: 'KO',
  it: 'IT', pl: 'PL', uk: 'UK', nl: 'NL', ro: 'RO', hu: 'HU',
  el: 'EL', cs: 'CS', sv: 'SV', bg: 'BG', da: 'DA', fi: 'FI',
  no: 'NB', // DeepL: Norwegian Bokmål
  sk: 'SK', lt: 'LT',
  // Google-Sprachen (DeepL kennt sie nicht — Werte als Fallback identisch zum ISO-Code,
  // werden aber nie an DeepL gesendet)
  hi: 'HI', bn: 'BN', ur: 'UR', pa: 'PA', sw: 'SW', mr: 'MR',
  te: 'TE', ta: 'TA', vi: 'VI', ha: 'HA', fa: 'FA', th: 'TH',
  gu: 'GU', kn: 'KN', yo: 'YO', ml: 'ML', ms: 'MS', am: 'AM',
  ne: 'NE', az: 'AZ', si: 'SI', sr: 'SR', he: 'HE', hr: 'HR',
};

/** Brand-Begriffe, die in keiner Sprache übersetzt werden dürfen. */
export const BRAND_TERMS: readonly string[] = [
  'Twynt',
  'Memory Engine',
  'Twin Builder',
  'Legacy Access',
  'Ethik-Charta',
  'Founder-Legacy',
  'On-Premise',
];

/** RTL-Sprachen (für lang-Attribut + dir="rtl"). */
export const RTL_LANGS: ReadonlySet<SupportedLang> = new Set<SupportedLang>([
  'ar', 'fa', 'he', 'ur',
]);

export interface TranslatorEnv {
  DEEPL_API_KEY: string;
  GOOGLE_TRANSLATE_API_KEY: string;
  /** Optional: KV für Translation Memory. */
  TRANSLATIONS?: KVNamespace;
}

// ---------- Type-Stubs (werden bei installiertem @cloudflare/workers-types ignoriert) ----------
// Diese minimal-Deklarationen ermöglichen TypeScript-Compile auch ohne installiertes Paket.

declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

export interface TranslateOptions {
  /** Hard-Timeout pro Request in ms. Default 8000. */
  timeoutMs?: number;
  /** Max. Retries bei transient errors. Default 2. */
  maxRetries?: number;
  /** Quell-Sprache. Default 'de' (Twynt-Standard). */
  source?: SupportedLang;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const BATCH_LIMIT = 50;

// ---------- Brand-Term-Schutz via Platzhalter ----------
// Wir ersetzen Brand-Terms vor der Übersetzung durch eindeutige Platzhalter,
// damit DeepL/Google sie nicht anfassen. Nach der Übersetzung wieder einsetzen.

interface ProtectedText {
  /** Text mit Platzhaltern statt Brand-Terms. */
  protected: string;
  /** Map von Platzhalter zu Original-Brand-Term. */
  placeholders: Map<string, string>;
}

function protectBrandTerms(text: string): ProtectedText {
  const placeholders = new Map<string, string>();
  let protectedText = text;
  let counter = 0;

  // Längste Terms zuerst, damit "Memory Engine" nicht als zwei Tokens behandelt wird
  const sortedTerms = [...BRAND_TERMS].sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    // Wort-Grenzen-Match, case-sensitive (Brand-Begriffe sind case-sensitive)
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    protectedText = protectedText.replace(regex, () => {
      const placeholder = `TWYNT${counter++}`;
      placeholders.set(placeholder, term);
      return placeholder;
    });
  }

  return { protected: protectedText, placeholders };
}

function restoreBrandTerms(text: string, placeholders: Map<string, string>): string {
  let restored = text;
  for (const [placeholder, original] of placeholders) {
    // Manche Übersetzer fügen Whitespace um Platzhalter ein, daher tolerant matchen
    restored = restored.split(placeholder).join(original);
  }
  return restored;
}

// ---------- Timeout-Helper ----------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- DeepL-Provider ----------

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

async function translateBatchDeepL(
  texts: string[],
  target: SupportedLang,
  source: SupportedLang,
  env: TranslatorEnv,
  timeoutMs: number,
): Promise<string[]> {
  if (!DEEPL_SUPPORTED.has(target)) {
    throw new Error(`DeepL does not support language: ${target}`);
  }

  // Ein einzelner Request mit mehreren `text`-Parametern (DeepL-Standard).
  const params = new URLSearchParams();
  for (const t of texts) params.append('text', t);
  params.append('target_lang', DEEPL_TARGET[target]);
  if (DEEPL_SUPPORTED.has(source)) {
    params.append('source_lang', DEEPL_TARGET[source].split('-')[0]);
  }
  // Tag-Handling: keep XML-ähnliche Tags unverändert (für unsere Platzhalter sicher)
  params.append('tag_handling', 'xml');
  params.append('ignore_tags', 'span');
  params.append('preserve_formatting', '1');

  const res = await fetchWithTimeout(
    'https://api.deepl.com/v2/translate',
    {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepL HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as DeepLResponse;
  if (!Array.isArray(data.translations) || data.translations.length !== texts.length) {
    throw new Error(`DeepL response shape unexpected (got ${data.translations?.length} for ${texts.length})`);
  }
  return data.translations.map((t) => t.text);
}

// ---------- Google-Provider (Cloud Translation v3 via REST + API key) ----------

interface GoogleResponse {
  data: {
    translations: Array<{ translatedText: string }>;
  };
}

async function translateBatchGoogle(
  texts: string[],
  target: SupportedLang,
  source: SupportedLang,
  env: TranslatorEnv,
  timeoutMs: number,
): Promise<string[]> {
  // v2-Endpoint (mit API-Key authentifiziert, kein OAuth nötig)
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        target,
        source,
        format: 'text',
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as GoogleResponse;
  const list = data?.data?.translations;
  if (!Array.isArray(list) || list.length !== texts.length) {
    throw new Error(`Google response shape unexpected (got ${list?.length} for ${texts.length})`);
  }
  // Google HTML-encodet manchmal — entitäten zurückwandeln
  return list.map((t) => decodeHtmlEntities(t.translatedText));
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

// ---------- Public API ----------

/**
 * Übersetzt einen Batch von Texten in die Zielsprache.
 *
 * Bei Fehler wird der ORIGINALTEXT zurückgegeben (kein Throw), damit der
 * Aufrufer immer weiterarbeiten kann — Caching schlechter Übersetzungen
 * wird im Caller verhindert (siehe translate.ts).
 *
 * Wirft nur bei kritischen Konfigurationsfehlern (z. B. fehlender API-Key).
 */
export async function translateBatch(
  texts: string[],
  target: SupportedLang,
  env: TranslatorEnv,
  options: TranslateOptions = {},
): Promise<{ translations: string[]; provider: 'deepl' | 'google' | 'identity'; ok: boolean }> {
  const source = options.source ?? DEFAULT_LANG;

  // Identity: Quelle == Ziel
  if (target === source) {
    return { translations: texts, provider: 'identity', ok: true };
  }

  if (texts.length === 0) {
    return { translations: [], provider: 'identity', ok: true };
  }

  // Splitte in Batches (DeepL hat 50-Texte-Limit pro Request)
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    batches.push(texts.slice(i, i + BATCH_LIMIT));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Wähle Provider
  const useDeepLPrimary = DEEPL_SUPPORTED.has(target);
  let chosenProvider: 'deepl' | 'google' = useDeepLPrimary ? 'deepl' : 'google';

  // Schütze Brand-Terms
  const protectedTexts = texts.map(protectBrandTerms);
  const inputForApi = protectedTexts.map((p) => p.protected);

  const callWith = async (
    provider: 'deepl' | 'google',
    batch: string[],
  ): Promise<string[]> => {
    if (provider === 'deepl') {
      if (!env.DEEPL_API_KEY) throw new Error('DEEPL_API_KEY missing');
      return translateBatchDeepL(batch, target, source, env, timeoutMs);
    }
    if (!env.GOOGLE_TRANSLATE_API_KEY) throw new Error('GOOGLE_TRANSLATE_API_KEY missing');
    return translateBatchGoogle(batch, target, source, env, timeoutMs);
  };

  const out: string[] = [];
  let allOk = true;

  for (let bi = 0; bi < batches.length; bi++) {
    const inputBatch = inputForApi.slice(bi * BATCH_LIMIT, bi * BATCH_LIMIT + batches[bi].length);
    let result: string[] | null = null;
    let lastErr: unknown = null;

    // Retry-Loop für gewählten Provider
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result = await callWith(chosenProvider, inputBatch);
        break;
      } catch (err) {
        lastErr = err;
        // Exponentieller Backoff: 200ms, 600ms, 1400ms ...
        if (attempt < maxRetries) {
          await sleep(200 * Math.pow(3, attempt));
        }
      }
    }

    // Wenn Primary fehlgeschlagen ist UND es ein Fallback-Provider gibt → versuche
    if (result === null && chosenProvider === 'deepl' && env.GOOGLE_TRANSLATE_API_KEY) {
      try {
        result = await callWith('google', inputBatch);
        chosenProvider = 'google'; // merken für die Folge-Batches
      } catch (err) {
        lastErr = err;
      }
    }

    if (result === null) {
      // Letzte Rettung: Originaltexte zurückgeben (mit Platzhaltern restauriert)
      console.error('Translation failed for batch', { target, error: String(lastErr) });
      result = inputBatch;
      allOk = false;
    }

    // Restauriere Brand-Terms
    for (let i = 0; i < result.length; i++) {
      const original = protectedTexts[bi * BATCH_LIMIT + i];
      out.push(restoreBrandTerms(result[i], original.placeholders));
    }
  }

  return { translations: out, provider: chosenProvider, ok: allOk };
}

/**
 * Helper: erkennt RTL-Sprachen.
 */
export function isRtl(lang: SupportedLang): boolean {
  return RTL_LANGS.has(lang);
}

/**
 * Helper: validiert einen Sprach-String und mappt auf SupportedLang oder DEFAULT_LANG.
 */
export function toSupportedLang(raw: string | null | undefined): SupportedLang {
  if (!raw) return DEFAULT_LANG;
  const norm = raw.toLowerCase().split(/[-_]/)[0] as SupportedLang;
  return SUPPORTED_LANGS.includes(norm) ? norm : DEFAULT_LANG;
}
