/**
 * Smyst Warmup-Worker — Pre-Translation für SEO- und Bot-relevante Seiten
 *
 * Läuft per Cron Trigger (siehe wrangler.toml) ODER per HTTP /warmup-Endpunkt
 * (für manuelle Trigger via Admin-UI).
 *
 * Strategie:
 *  - Liste wichtiger Seiten laden (statisch oder aus KV)
 *  - Pro Seite, pro Sprache: prüfen ob Übersetzung mit aktuellem content_hash existiert
 *  - Wenn fehlt → erzeugen via translatePage() und in KV speichern
 *  - Concurrency-Limit, damit KV- und Worker-Free-Limits eingehalten werden
 *  - Läuft komplett asynchron — beeinflusst Edge-Requests von Nutzern nicht
 */

import {
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  type SupportedLang,
} from './translator';
import { translatePage, type Env as TranslateEnv } from './translate';
import { clientKey, errorResponse, jsonResponse, requireRateLimit, safeHandler } from './_shared';

export interface WarmupEnv extends TranslateEnv {
  /** Optional: KV mit Liste der wichtigen Pfade (Override für SEED_PATHS). */
  WARMUP_CONFIG?: KVNamespace;
}

/**
 * Default-Liste der pre-zu-übersetzenden Seiten.
 *
 * In Produktion idealerweise dynamisch aus Sitemap oder KV.
 */
const SEED_PATHS: string[] = [
  '/',
  '/preise',
  '/welcome',
  '/login',
  '/signup',
  '/dashboard',
  '/twin-builder',
  '/memory',
  '/chat',
  '/legacy',
  '/ethik-charta',
  '/datenschutz',
  '/agb',
  '/impressum',
  '/hilfe',
  '/b2b',
  '/blog',
  // Standortseiten — Beispiele; ergänzbar via WARMUP_CONFIG
  '/orte/berlin',
  '/orte/muenchen',
  '/orte/hamburg',
  '/orte/wien',
  '/orte/zuerich',
];

/** Wieviele Übersetzungs-Jobs gleichzeitig laufen dürfen. */
const MAX_CONCURRENCY = 3;

/** Wieviel Pause zwischen einzelnen Pages, um Free-Plan-Limits zu schonen. */
const PAGE_DELAY_MS = 250;

interface WarmupResult {
  totalChecked: number;
  totalTranslated: number;
  totalCached: number;
  totalErrors: number;
  errors: Array<{ path: string; lang: SupportedLang; error: string }>;
  durationMs: number;
}

async function loadPaths(env: WarmupEnv): Promise<string[]> {
  if (!env.WARMUP_CONFIG) return SEED_PATHS;
  try {
    const json = await env.WARMUP_CONFIG.get('paths', 'json');
    if (Array.isArray(json) && json.length > 0) {
      return json.filter((p): p is string => typeof p === 'string');
    }
  } catch (err) {
    console.warn('Failed loading WARMUP_CONFIG, falling back to SEED_PATHS', err);
  }
  return SEED_PATHS;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function cacheKey(path: string, lang: SupportedLang, contentHash: string): string {
  return `t:${path}:${lang}:${contentHash}`;
}

/**
 * Holt Origin-HTML für Hash-Check und Translation, ohne Cookies/Sprache zu beeinflussen.
 */
async function fetchOriginHtml(env: WarmupEnv, path: string): Promise<{ html: string; hash: string } | null> {
  const url = new URL(env.ORIGIN_URL);
  url.pathname = path;
  url.search = '';
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'text/html', 'User-Agent': 'SmystWarmupBot/1.0' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const hash = await sha256Hex(html);
  return { html, hash };
}

async function processPair(
  env: WarmupEnv,
  path: string,
  lang: SupportedLang,
  contentHash: string,
  result: WarmupResult,
): Promise<void> {
  // Skip identity (DEFAULT_LANG)
  if (lang === DEFAULT_LANG) return;

  const key = cacheKey(path, lang, contentHash);
  const existing = await env.TRANSLATIONS.get(key);
  result.totalChecked++;
  if (existing !== null) {
    result.totalCached++;
    return;
  }

  // Synthetischer Request für translatePage: echte Nutzer-Header sind hier nicht nötig.
  const syntheticReq = new Request(`${env.ORIGIN_URL}${path}`, {
    headers: { 'Accept': 'text/html', 'User-Agent': 'SmystWarmupBot/1.0' },
  });
  const canonicalHost = env.CANONICAL_HOST ?? new URL(env.ORIGIN_URL).origin;

  try {
    const translated = await translatePage(env, path, lang, syntheticReq, canonicalHost);
    if (translated && translated.provider !== 'identity' && translated.contentHash === contentHash) {
      await env.TRANSLATIONS.put(
        key,
        JSON.stringify({
          html: translated.html,
          provider: translated.provider,
          contentHash: translated.contentHash,
          createdAt: Date.now(),
        }),
        { expirationTtl: 60 * 60 * 24 * 90 },
      );
      result.totalTranslated++;
    } else if (translated && translated.contentHash !== contentHash) {
      // Content hat sich zwischen Hash-Check und Translation geändert — überspringen,
      // nächster Lauf fängt es ein.
      result.totalErrors++;
      result.errors.push({ path, lang, error: 'content_hash drift during warmup' });
    } else {
      result.totalErrors++;
      result.errors.push({ path, lang, error: 'translation returned identity' });
    }
  } catch (err) {
    result.totalErrors++;
    result.errors.push({ path, lang, error: String(err) });
  }
}

/**
 * Verarbeitet eine Seite: Lädt Origin, prüft alle Sprachen, übersetzt fehlende.
 */
async function processPath(env: WarmupEnv, path: string, result: WarmupResult): Promise<void> {
  const origin = await fetchOriginHtml(env, path);
  if (!origin) {
    result.totalErrors++;
    result.errors.push({ path, lang: 'de' as SupportedLang, error: 'origin fetch failed' });
    return;
  }

  // Iteriere über alle Zielsprachen außer DEFAULT_LANG
  for (const lang of SUPPORTED_LANGS) {
    if (lang === DEFAULT_LANG) continue;
    await processPair(env, path, lang, origin.hash, result);
    // kleine Pause zwischen Sprach-Calls, um Free-Plan-Limits zu schonen
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Concurrent-Limited Worker-Pool, damit nicht alle Seiten gleichzeitig KV/Origin belasten.
 */
async function runWarmup(env: WarmupEnv): Promise<WarmupResult> {
  const startedAt = Date.now();
  const paths = await loadPaths(env);
  const result: WarmupResult = {
    totalChecked: 0,
    totalTranslated: 0,
    totalCached: 0,
    totalErrors: 0,
    errors: [],
    durationMs: 0,
  };

  // Einfacher Concurrency-Pool
  const queue = [...paths];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < MAX_CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          try {
            await processPath(env, next, result);
          } catch (err) {
            result.totalErrors++;
            result.errors.push({ path: next, lang: 'de' as SupportedLang, error: String(err) });
          }
          await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        }
      })(),
    );
  }

  await Promise.all(workers);
  result.durationMs = Date.now() - startedAt;
  return result;
}

// ---------- Worker Entry ----------

export default {
  /**
   * Cron Trigger Handler. Configured in wrangler.toml.
   */
  async scheduled(event: ScheduledEvent, env: WarmupEnv, ctx: ExecutionContext): Promise<void> {
    console.log('Warmup cron triggered', { cron: event.cron });
    ctx.waitUntil(
      (async () => {
        const result = await runWarmup(env);
        console.log('Warmup completed', result);
      })(),
    );
  },

  /**
   * HTTP Handler — manueller Trigger via /warmup oder Admin-UI.
   * Auth via Bearer Token aus env.ADMIN_TOKEN.
   */
  async fetch(request: Request, env: WarmupEnv & { ADMIN_TOKEN?: string }): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);
      if (url.pathname !== '/warmup') return errorResponse('not_found', 'Not found', 404);

      const limited = await requireRateLimit(env.WARMUP_CONFIG ?? env.TRANSLATIONS, {
        key: clientKey(request, 'warmup:manual'),
        limit: 5,
        windowSeconds: 60,
      });
      if (limited) return limited;

      const auth = request.headers.get('Authorization');
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return errorResponse('unauthorized', 'Unauthorized', 401);
      }

      const result = await runWarmup(env);
      return jsonResponse(result);
    }, request);
  },
};

// ---------- Type-Stubs ----------

declare global {
  interface ScheduledEvent {
    scheduledTime: number;
    cron: string;
  }
}
