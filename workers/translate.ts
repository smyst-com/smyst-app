/**
 * Smyst Translate Worker — Hybrid Translation Edge-Service
 *
 * Verantwortlich für:
 *  1. Spracherkennung pro Request (Query > Cookie > Accept-Language > Default)
 *  2. content_hash-basiertes Caching in KV
 *  3. Sofortige Auslieferung übersetzter HTML aus KV (Cache-Hit < 50ms Edge)
 *  4. Bei Cache-Miss: Originalseite SOFORT ausliefern, Übersetzung im Hintergrund (ctx.waitUntil)
 *  5. HTMLRewriter-basierte Textextraktion (kein DOM-Parsing) — streamfähig & schnell
 *  6. lang-Attribut, dir="rtl" für AR, hreflang & canonical werden korrekt gesetzt
 *  7. X-Translation-Cache Header (HIT / MISS / WARMING)
 *
 * Performance-Ziele:
 *  - Cache-Hit Edge-Antwort < 50ms
 *  - Cache-Miss Edge-Antwort: O(Origin-Latenz), Nutzer wartet NIE auf Übersetzung
 *  - Hintergrund-Übersetzung blockiert nie den Haupt-Request
 */

import {
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  isRtl,
  toSupportedLang,
  translateBatch,
  type SupportedLang,
  type TranslatorEnv,
} from './translator';
import { clientKey, errorResponse, requireRateLimit, safeHandler, withSecurity } from './_shared';

export interface Env extends TranslatorEnv {
  TRANSLATIONS: KVNamespace;
  /** Origin URL der nicht-übersetzten Seite. */
  ORIGIN_URL: string;
  /** Optional: separater Domain-Fix für canonical (z. B. https://smyst.com). */
  CANONICAL_HOST?: string;
}

const COOKIE_NAME = 'smyst_lang';
const CACHE_HEADER = 'X-Translation-Cache';
const HASH_HEADER = 'X-Content-Hash';
const PROVIDER_HEADER = 'X-Translation-Provider';

// KV-TTL für Übersetzungen — lang, weil content_hash bereits Invalidation regelt.
const KV_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 Tage

const STATIC_PASSTHROUGH_PATHS = new Set([
  '/manifest.webmanifest',
  '/sw.js',
  '/logo.svg',
  '/og-image.png',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/ai.txt',
  '/apple-touch-icon.png',
  '/offline.html',
  '/.well-known/security.txt',
]);

function isStaticPassthroughPath(pathname: string): boolean {
  return (
    STATIC_PASSTHROUGH_PATHS.has(pathname) ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/screenshots/') ||
    pathname.startsWith('/locales/') ||
    /\.(js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?|map|json|xml|txt|webmanifest)$/i.test(pathname)
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function historicalSitemap(canonicalHost: string): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const staticUrls = [
    { loc: `${canonicalHost}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${canonicalHost}/de/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${canonicalHost}/en/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${canonicalHost}/tr/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/fr/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/es/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/pt/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/ar/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/zh/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/ja/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${canonicalHost}/ko/`, priority: '0.8', changefreq: 'weekly' },
  ];

  const urls = staticUrls
    .map(
      (entry) => `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// ---------- Spracherkennung ----------

function detectLang(request: Request, url: URL): SupportedLang {
  // 1. Query-Parameter
  const q = url.searchParams.get('lang');
  if (q) return toSupportedLang(q);

  // 2. Sub-Path (/de/, /en/, /tr/ ...)
  const pathLang = url.pathname.split('/')[1];
  if (pathLang && SUPPORTED_LANGS.includes(pathLang as SupportedLang)) {
    return pathLang as SupportedLang;
  }

  // 3. Cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-zA-Z-]+)`));
  if (m) return toSupportedLang(m[1]);

  // 4. Accept-Language
  const accept = request.headers.get('Accept-Language');
  if (accept) {
    // Parse z.B. "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
    const langs = accept
      .split(',')
      .map((part) => {
        const [tag, qStr] = part.trim().split(';q=');
        return { tag: tag.trim().toLowerCase(), q: qStr ? parseFloat(qStr) : 1.0 };
      })
      .sort((a, b) => b.q - a.q);
    for (const l of langs) {
      const cand = toSupportedLang(l.tag);
      if (SUPPORTED_LANGS.includes(cand) && cand !== DEFAULT_LANG) return cand;
      if (cand === DEFAULT_LANG && l.tag.startsWith('de')) return DEFAULT_LANG;
    }
  }

  // 5. Default
  return DEFAULT_LANG;
}

// ---------- Path-Normalisierung ----------

function stripLangFromPath(pathname: string): string {
  const parts = pathname.split('/');
  if (parts.length >= 2 && SUPPORTED_LANGS.includes(parts[1] as SupportedLang)) {
    return '/' + parts.slice(2).join('/');
  }
  return pathname;
}

// ---------- content_hash ----------

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // 16 Zeichen reichen für Cache-Key-Eindeutigkeit
}

function cacheKey(pathPath: string, lang: SupportedLang, contentHash: string): string {
  return `t:${pathPath}:${lang}:${contentHash}`;
}

// ---------- Origin-Fetch ----------

async function fetchOrigin(env: Env, normalizedPath: string, request: Request): Promise<Response> {
  const originUrl = new URL(env.ORIGIN_URL);
  originUrl.pathname = normalizedPath;
  originUrl.search = '';

  // Originale Headers durchreichen (außer Host und Cookie für Origin)
  const fwdHeaders = new Headers();
  for (const [k, v] of request.headers) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'cookie' || lk.startsWith('cf-')) continue;
    fwdHeaders.set(k, v);
  }
  fwdHeaders.set('Accept', 'text/html');
  fwdHeaders.set('Cache-Control', 'no-cache');
  fwdHeaders.set('Pragma', 'no-cache');

  return fetch(originUrl.toString(), {
    method: 'GET',
    headers: fwdHeaders,
    redirect: 'follow',
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });
}

// ---------- HTMLRewriter-basierte Text-Extraktion + Wieder-Einfügen ----------

/**
 * Skip-Liste: Tags, deren Inhalt NIE übersetzt werden darf.
 * Plus alle Elemente mit data-no-translate Attribut.
 */
const SKIP_TAGS = new Set([
  'script', 'style', 'code', 'pre', 'kbd', 'samp', 'var',
  'noscript', 'template', 'svg', 'math',
]);

/**
 * Stage 1: Sammle alle übersetzbaren Textknoten + ihren Pfad.
 * Wir nummerieren sie und speichern eine Liste — die zweite Stage rendert
 * die übersetzte HTML.
 */
class TextCollector implements HTMLRewriterTypes.ElementHandler {
  texts: string[] = [];
  private skipDepth = 0;

  element(element: HTMLRewriterTypes.Element): void {
    const tag = element.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag) || element.getAttribute('data-no-translate') !== null) {
      this.skipDepth++;
      element.onEndTag(() => {
        this.skipDepth--;
      });
    }

    // Übersetzbare Attribute: alt, title, placeholder, aria-label, content (für meta description)
    if (this.skipDepth === 0) {
      const translatableAttrs = ['alt', 'title', 'placeholder', 'aria-label'];
      for (const attr of translatableAttrs) {
        const val = element.getAttribute(attr);
        if (val && val.trim()) this.texts.push(val);
      }
      // <meta name="description" content="..."> übersetzen
      if (tag === 'meta') {
        const name = element.getAttribute('name')?.toLowerCase();
        if (name === 'description' || name === 'twitter:description' || name === 'twitter:title') {
          const c = element.getAttribute('content');
          if (c && c.trim()) this.texts.push(c);
        }
        // og: prefix (property statt name)
        const property = element.getAttribute('property')?.toLowerCase();
        if (property === 'og:description' || property === 'og:title' || property === 'og:site_name') {
          const c = element.getAttribute('content');
          if (c && c.trim()) this.texts.push(c);
        }
      }
      if (tag === 'title') {
        // Inhalt wird in text() gesammelt
      }
    }
  }

  text(text: HTMLRewriterTypes.Text): void {
    if (this.skipDepth > 0) return;
    const t = text.text;
    // Nur sichtbare Texte mit nicht-leeren Inhalten
    if (t.trim().length === 0) return;
    // Entferne reine Whitespace-Knoten zwischen Tags, behalte aber eingebetteten Text
    this.texts.push(t);
  }
}

interface RewriteOptions {
  lang: SupportedLang;
  /** Map: Original-Text → Übersetzung (für Lookup beim Re-Write). */
  translations: Map<string, string>;
  /** URL ohne lang-Prefix für hreflang-Generierung. */
  canonicalPath: string;
  canonicalHost: string;
}

/**
 * Stage 2: Wende die fertigen Übersetzungen an. Streamt die HTML.
 */
function applyTranslations(response: Response, opts: RewriteOptions): Response {
  const { lang, translations, canonicalPath, canonicalHost } = opts;
  let skipDepth = 0;
  let inHtmlTag = false;

  const lookup = (s: string): string => {
    const trimmed = s.trim();
    if (trimmed.length === 0) return s;
    const t = translations.get(trimmed);
    if (t === undefined) return s;
    // Whitespace vor/nach erhalten
    const leading = s.match(/^\s*/)?.[0] ?? '';
    const trailing = s.match(/\s*$/)?.[0] ?? '';
    return leading + t + trailing;
  };

  return new HTMLRewriter()
    // <html lang="..." dir="...">
    .on('html', {
      element(el) {
        inHtmlTag = true;
        el.setAttribute('lang', lang);
        if (isRtl(lang)) el.setAttribute('dir', 'rtl');
        else el.removeAttribute('dir');
      },
    })
    // <head> — hreflang & canonical injecten
    .on('head', {
      element(el) {
        const linkTags: string[] = [];
        for (const l of SUPPORTED_LANGS) {
          const href = `${canonicalHost}/${l}${canonicalPath === '/' ? '' : canonicalPath}`;
          linkTags.push(`<link rel="alternate" hreflang="${l}" href="${href}">`);
        }
        // x-default → Default-Sprache
        linkTags.push(
          `<link rel="alternate" hreflang="x-default" href="${canonicalHost}${canonicalPath}">`,
        );
        const canonicalHref = `${canonicalHost}/${lang}${canonicalPath === '/' ? '' : canonicalPath}`;
        linkTags.push(`<link rel="canonical" href="${canonicalHref}">`);
        el.append(linkTags.join('\n'), { html: true });
      },
    })
    // Skip-Tag-Handling
    .on('script, style, code, pre, kbd, samp, var, noscript, template, svg, math', {
      element(el) {
        skipDepth++;
        el.onEndTag(() => {
          skipDepth--;
        });
      },
    })
    .on('[data-no-translate]', {
      element(el) {
        skipDepth++;
        el.onEndTag(() => {
          skipDepth--;
        });
      },
    })
    // Übersetzbare Attribute
    .on('*', {
      element(el) {
        if (skipDepth > 0) return;
        for (const attr of ['alt', 'title', 'placeholder', 'aria-label']) {
          const v = el.getAttribute(attr);
          if (v && v.trim()) el.setAttribute(attr, lookup(v));
        }
        const tag = el.tagName.toLowerCase();
        if (tag === 'meta') {
          const name = el.getAttribute('name')?.toLowerCase();
          const property = el.getAttribute('property')?.toLowerCase();
          if (
            name === 'description' || name === 'twitter:description' || name === 'twitter:title' ||
            property === 'og:description' || property === 'og:title' || property === 'og:site_name'
          ) {
            const c = el.getAttribute('content');
            if (c && c.trim()) el.setAttribute('content', lookup(c));
          }
        }
      },
      text(text) {
        if (skipDepth > 0) return;
        if (text.text.trim().length === 0) return;
        text.replace(lookup(text.text));
      },
    })
    .transform(response);
}

// ---------- Cache-Workflow ----------

interface CachedTranslation {
  html: string;
  provider: 'static' | 'identity';
  contentHash: string;
  createdAt: number;
}

async function readCache(
  env: Env,
  path: string,
  lang: SupportedLang,
  contentHash: string,
): Promise<CachedTranslation | null> {
  const key = cacheKey(path, lang, contentHash);
  const value = await env.TRANSLATIONS.get(key, 'json');
  return value as CachedTranslation | null;
}

async function writeCache(
  env: Env,
  path: string,
  lang: SupportedLang,
  contentHash: string,
  data: CachedTranslation,
): Promise<void> {
  const key = cacheKey(path, lang, contentHash);
  await env.TRANSLATIONS.put(key, JSON.stringify(data), { expirationTtl: KV_TTL_SECONDS });
}

// ---------- Translation-Pipeline ----------

/**
 * Holt Origin-HTML, extrahiert übersetzbaren Text, übersetzt, und rendert die übersetzte HTML.
 * Wird sowohl im Lazy-Path als auch im Warmup-Path benutzt.
 */
export async function translatePage(
  env: Env,
  normalizedPath: string,
  lang: SupportedLang,
  request: Request,
  canonicalHost: string,
): Promise<{ html: string; contentHash: string; provider: 'static' | 'identity' } | null> {
  const originResp = await fetchOrigin(env, normalizedPath, request);
  if (!originResp.ok) {
    console.error('Origin fetch failed', { path: normalizedPath, status: originResp.status });
    return null;
  }
  const originHtml = await originResp.text();
  const contentHash = await sha256Hex(originHtml);

  // 1. Sammle Texte
  const collector = new TextCollector();
  await new HTMLRewriter()
    .on('*', collector)
    .transform(new Response(originHtml))
    .text();

  // De-dupe: gleicher Text nur einmal übersetzen
  const uniqueTexts = Array.from(new Set(collector.texts.map((s) => s.trim()).filter(Boolean)));

  if (uniqueTexts.length === 0) {
    return { html: originHtml, contentHash, provider: 'identity' };
  }

  // 2. Übersetze
  const { translations, provider, ok } = await translateBatch(uniqueTexts, lang, env, {
    source: DEFAULT_LANG,
  });

  // Wenn Übersetzung fehlerhaft war: nicht cachen, Original ausliefern
  if (!ok) {
    return { html: originHtml, contentHash, provider: 'identity' };
  }

  const tMap = new Map<string, string>();
  for (let i = 0; i < uniqueTexts.length; i++) {
    tMap.set(uniqueTexts[i], translations[i]);
  }

  // 3. Wende Übersetzungen an
  const rewritten = applyTranslations(new Response(originHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }), {
    lang,
    translations: tMap,
    canonicalPath: normalizedPath,
    canonicalHost,
  });

  const finalHtml = await rewritten.text();
  return { html: finalHtml, contentHash, provider: provider === 'identity' ? 'identity' : 'static' };
}

// ---------- Worker Entry ----------

function applyEdgeHeaders(headers: Headers, options: { stripOriginNoindex?: boolean } = {}): Headers {
  if (options.stripOriginNoindex) {
    headers.set('X-Robots-Tag', 'index, follow');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return headers;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);

      // API/Auth/Storage muessen von spezifischen Workers bedient werden. Wenn
      // dieser Catch-all-Worker sie sieht, ist die Route nicht korrekt aktiv.
      if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/auth/') ||
        url.pathname.startsWith('/storage/')
      ) {
        return withSecurity(errorResponse('route_not_deployed', 'Specific API worker route is not active', 503));
      }

      const canonicalHost =
        env.CANONICAL_HOST ?? `${url.protocol}//${url.host}`;

      if (url.pathname === '/sitemap.xml') {
        const headers = applyEdgeHeaders(new Headers({
          'content-type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'X-Robots-Tag': 'index, follow',
        }));
        return new Response(historicalSitemap(canonicalHost), { status: 200, headers });
      }

      // Nicht-HTML-Pfade direkt durchreichen (Assets und SEO/PWA-Dateien).
      if (isStaticPassthroughPath(url.pathname)) {
        return fetch(env.ORIGIN_URL + url.pathname + url.search);
      }

      const limited = await requireRateLimit(env.TRANSLATIONS, {
        key: clientKey(request, 'translate:html'),
        limit: 300,
        windowSeconds: 60,
      });
      if (limited) return limited;

      const lang = detectLang(request, url);
      const normalizedPath = stripLangFromPath(url.pathname) || '/';
      const indexableHtmlRoute = normalizedPath === '/' || normalizedPath.startsWith('/t/');

      // Wenn Sprache == Default UND Pfad keine Sprach-Prefix hat → einfach Origin durchreichen
      // (Quelltext ist bereits in DEFAULT_LANG)
      if (lang === DEFAULT_LANG && !SUPPORTED_LANGS.includes(url.pathname.split('/')[1] as SupportedLang)) {
        const passthrough = await fetchOrigin(env, normalizedPath, request);
        const respHeaders = applyEdgeHeaders(new Headers(passthrough.headers), {
          stripOriginNoindex: indexableHtmlRoute,
        });
        respHeaders.set(CACHE_HEADER, 'BYPASS');
        respHeaders.set('Content-Language', DEFAULT_LANG);
        // Cookie setzen, falls noch nicht gesetzt
        if (!request.headers.get('Cookie')?.includes(`${COOKIE_NAME}=`)) {
          respHeaders.append('Set-Cookie',
            `${COOKIE_NAME}=${DEFAULT_LANG}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
        }
        return new Response(passthrough.body, {
          status: passthrough.status,
          headers: respHeaders,
        });
      }

      // Hole Origin-HTML, um content_hash zu bestimmen.
      const originResp = await fetchOrigin(env, normalizedPath, request);
      if (!originResp.ok) {
        return withSecurity(errorResponse('origin_error', 'Origin error', 502));
      }
      const originHtml = await originResp.text();
      const contentHash = await sha256Hex(originHtml);

      // Cache-Lookup
      const cached = await readCache(env, normalizedPath, lang, contentHash);
      if (cached) {
        const headers = applyEdgeHeaders(new Headers({
          'content-type': 'text/html; charset=utf-8',
          'Content-Language': lang,
          [CACHE_HEADER]: 'HIT',
          [HASH_HEADER]: contentHash,
          [PROVIDER_HEADER]: cached.provider,
          // Edge-Cache 5min, lokale Browser-Cache 60s; Stale-While-Revalidate aktiviert
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
          'Vary': 'Accept-Language, Cookie',
        }), { stripOriginNoindex: indexableHtmlRoute });
        headers.append('Set-Cookie',
          `${COOKIE_NAME}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
        return new Response(cached.html, { status: 200, headers });
      }

      // CACHE-MISS: Origin SOFORT ausliefern, Background-Translation triggern
      const headers = applyEdgeHeaders(new Headers({
        'content-type': 'text/html; charset=utf-8',
        'Content-Language': lang,
        [CACHE_HEADER]: 'MISS',
        [HASH_HEADER]: contentHash,
        // Bewusst kürzere Cache-Zeit für MISS, damit nächster Request idealerweise HIT bekommt
        'Cache-Control': 'public, max-age=10, s-maxage=10',
        'Vary': 'Accept-Language, Cookie',
      }), { stripOriginNoindex: indexableHtmlRoute });
      headers.append('Set-Cookie',
        `${COOKIE_NAME}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);

      // Hintergrund-Übersetzung mit ctx.waitUntil — blockiert nicht den User-Response
      ctx.waitUntil(
        (async () => {
          try {
            const result = await translatePage(env, normalizedPath, lang, request, canonicalHost);
            if (result && result.provider !== 'identity') {
              await writeCache(env, normalizedPath, lang, result.contentHash, {
                html: result.html,
                provider: result.provider,
                contentHash: result.contentHash,
                createdAt: Date.now(),
              });
              console.log('Lazy translation cached', { path: normalizedPath, lang, provider: result.provider });
            }
          } catch (err) {
            console.error('Lazy translation failed', { path: normalizedPath, lang, error: String(err) });
          }
        })(),
      );

      return new Response(originHtml, { status: 200, headers });
    }, request);
  },
};

// ---------- Type-Stubs für Cloudflare Workers ----------
// Diese Typen werden von @cloudflare/workers-types bereitgestellt — wir deklarieren sie
// hier nur als minimal-Stubs, damit die Datei auch ohne installiertes Paket parse-bar ist.

declare global {
  interface KVNamespace {
    get(key: string, type?: 'text'): Promise<string | null>;
    get(key: string, type: 'json'): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
  // Minimal HTMLRewriter shape
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace HTMLRewriterTypes {
    interface Element {
      tagName: string;
      getAttribute(name: string): string | null;
      setAttribute(name: string, value: string): void;
      removeAttribute(name: string): void;
      append(content: string, opts?: { html: boolean }): void;
      onEndTag(handler: () => void | Promise<void>): void;
      removeAndKeepContent: () => void;
    }
    interface Text {
      text: string;
      replace(content: string): void;
    }
    interface ElementHandler {
      element?(element: Element): void | Promise<void>;
      text?(text: Text): void | Promise<void>;
    }
  }
  class HTMLRewriter {
    on(selector: string, handler: HTMLRewriterTypes.ElementHandler): HTMLRewriter;
    transform(response: Response): Response;
  }
}
