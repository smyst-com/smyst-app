#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = process.cwd();
const webBaseUrl = (process.env.WEB_BASE_URL || '').replace(/\/$/, '');
const totalBudgetMs = Number(process.env.SMYST_LIVE_TOTAL_BUDGET_MS || 2500);
const ttfbBudgetMs = Number(process.env.SMYST_LIVE_TTFB_BUDGET_MS || 1200);
const abortMs = Number(process.env.SMYST_LIVE_FETCH_ABORT_MS || 8000);

const checks = [];
const live = [];

function filePath(file) {
  return path.join(root, file);
}

function exists(file) {
  return fs.existsSync(filePath(file));
}

function read(file) {
  return fs.readFileSync(filePath(file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireFile(file, minBytes = 1) {
  const ok = exists(file) && fs.statSync(filePath(file)).size >= minBytes;
  check(`file:${file}`, ok, ok ? '' : `Missing or empty: ${file}`);
}

function headerBlock(headers, route) {
  const lines = headers.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === route);
  if (start === -1) return '';
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().length === 0) continue;
    if (!/^\s/.test(line)) break;
    block.push(line.trim());
  }
  return block.join('\n');
}

async function timedFetch(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), abortMs);
  const url = `${webBaseUrl}${pathname}`;
  const start = performance.now();
  let firstByteMs = null;
  let bytes = 0;
  let body = '';

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'smyst.com-readiness-audit/1.0',
        accept: '*/*',
      },
    });
    firstByteMs = performance.now() - start;
    body = await response.text();
    bytes = Buffer.byteLength(body);
    return {
      url,
      pathname,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      xRobotsTag: response.headers.get('x-robots-tag') || '',
      ttfbMs: Number(firstByteMs.toFixed(1)),
      totalMs: Number((performance.now() - start).toFixed(1)),
      bytes,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasManifestIcon(manifest, sizes, purpose) {
  return Array.isArray(manifest.icons) && manifest.icons.some((icon) => (
    icon.sizes === sizes && icon.type === 'image/png' && (!purpose || icon.purpose === purpose)
  ));
}

async function runLiveAudit() {
  if (!webBaseUrl) {
    check('live_audit_skipped_without_WEB_BASE_URL', true);
    return;
  }

  const routes = [
    { path: '/', type: 'text/html', needs: ['id="root"', 'manifest.webmanifest'] },
    { path: '/t/sokrates/', type: 'text/html', needs: ['application/ld+json', 'https://smyst.com/t/sokrates'] },
    { path: '/privacy/', type: 'text/html', needs: ['id="root"', 'smyst.com'] },
    { path: '/manifest.webmanifest', type: 'application/manifest+json', needs: ['"name": "smyst.com"', '"short_name": "smyst.com"'] },
    { path: '/sw.js', type: 'application/javascript', needs: ['PRIVATE_PREFIXES', 'PUBLIC_API_PREFIXES'] },
    { path: '/robots.txt', type: 'text/plain', needs: ['Sitemap: https://smyst.com/sitemap.xml'] },
    { path: '/sitemap.xml', type: 'application/xml', needs: ['https://smyst.com/t/sokrates/'] },
    { path: '/llms.txt', type: 'text/plain', needs: ['smyst.com'] },
    { path: '/ai.txt', type: 'text/plain', needs: ['Public and Private Policy'] },
  ];

  for (const route of routes) {
    const result = await timedFetch(route.path);
    live.push({
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      xRobotsTag: result.xRobotsTag,
      ttfbMs: result.ttfbMs,
      totalMs: result.totalMs,
      bytes: result.bytes,
    });
    check(`live_status:${route.path}`, result.status === 200, `${result.status} ${result.url}`);
    check(`live_content_type:${route.path}`, result.contentType.includes(route.type), result.contentType);
    check(`live_ttfb_budget:${route.path}`, result.ttfbMs <= ttfbBudgetMs, `${result.ttfbMs}ms > ${ttfbBudgetMs}ms`);
    check(`live_total_budget:${route.path}`, result.totalMs <= totalBudgetMs, `${result.totalMs}ms > ${totalBudgetMs}ms`);
    for (const needed of route.needs) {
      check(`live_body:${route.path}:${needed}`, result.body.includes(needed), `Missing ${needed}`);
    }
    if (route.path !== '/privacy/') {
      check(`live_public_not_noindex:${route.path}`, !/noindex/i.test(result.xRobotsTag), result.xRobotsTag);
    }
    check(`live_no_adsense_without_consent:${route.path}`, !result.body.includes('pagead2.googlesyndication.com'));
  }
}

const index = read('index.html');
const manifest = readJson('public/manifest.webmanifest');
const sw = read('public/sw.js');
const headers = read('public/_headers');

check('brand_manifest_name', manifest.name === 'smyst.com', manifest.name);
check('brand_manifest_short_name', manifest.short_name === 'smyst.com', manifest.short_name);
check('index_has_viewport_fit_cover', index.includes('viewport-fit=cover'));
check('index_has_manifest_link', index.includes('rel="manifest"') && index.includes('/manifest.webmanifest'));
check('index_has_theme_color', index.includes('name="theme-color"') && index.includes('#0b1c44'));
check('index_has_ios_pwa_meta', index.includes('apple-mobile-web-app-capable') && index.includes('apple-mobile-web-app-title'));
check('index_has_base_schema', index.includes('application/ld+json') && index.includes('"@type": "SoftwareApplication"'));
check('index_has_ai_readable_links', index.includes('/llms.txt') && index.includes('/ai.txt') && index.includes('/sitemap.xml'));
check('index_no_base_adsense_script', !index.includes('pagead2.googlesyndication.com'));

check('manifest_display_standalone', manifest.display === 'standalone', manifest.display);
check('manifest_start_scope_root', manifest.start_url === '/' && manifest.scope === '/' && manifest.id === '/');
check('manifest_has_192_icon', hasManifestIcon(manifest, '192x192', 'any'));
check('manifest_has_512_icon', hasManifestIcon(manifest, '512x512', 'any'));
check('manifest_has_maskable_icon', hasManifestIcon(manifest, '512x512', 'maskable'));
check('manifest_has_screenshots', Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2);
check('manifest_has_shortcuts', Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);

[
  'public/manifest.webmanifest',
  'public/sw.js',
  'public/offline.html',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/llms.txt',
  'public/ai.txt',
  'public/.well-known/security.txt',
  'public/logo.svg',
  'public/og-image.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/maskable-512.png',
  'public/apple-touch-icon.png',
  'public/screenshots/smyst-mobile.png',
  'public/screenshots/smyst-desktop.png',
].forEach((file) => requireFile(file));

check('sw_private_api_not_cached', sw.includes("if (pathname.startsWith('/api/')) return true"));
check('sw_private_prefixes_present', sw.includes("'/auth/'") && sw.includes("'/storage/'") && sw.includes("'/private/'"));
check('sw_public_profile_api_cache_allowed', sw.includes("'/api/public/twins'"));
check('sw_offline_shell_present', sw.includes("'/offline.html'") && sw.includes('APP_SHELL'));

check('headers_has_csp', headers.includes('Content-Security-Policy') && headers.includes("frame-ancestors 'none'"));
check('headers_private_no_store', headerBlock(headers, '/private/*').includes('Cache-Control: no-store'));
check('headers_api_no_store', headerBlock(headers, '/api/*').includes('Cache-Control: no-store'));
check('headers_public_profile_api_indexable', headerBlock(headers, '/api/public/twins/*').includes('X-Robots-Tag: index, follow'));
check('headers_sw_no_store', headerBlock(headers, '/sw.js').includes('no-store'));
check('headers_manifest_type', headerBlock(headers, '/manifest.webmanifest').includes('application/manifest+json'));
check('headers_no_google_ads_csp_until_approval', !headers.includes('pagead2.googlesyndication.com'));

await runLiveAudit();

const failed = checks.filter((item) => !item.ok);
const result = {
  ok: failed.length === 0,
  budgets: { totalBudgetMs, ttfbBudgetMs, abortMs },
  liveBaseUrl: webBaseUrl || null,
  checks,
  failed,
  live,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
