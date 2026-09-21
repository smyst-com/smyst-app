const CACHE_VERSION = 'smyst-v18';
const APP_CACHE = `${CACHE_VERSION}:app`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;

const APP_SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/logo.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/screenshots/smyst-mobile.png',
  '/screenshots/smyst-desktop.png',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/ai.txt',
  '/security.txt',
  '/locales/de.json',
  '/locales/en.json',
  '/locales/tr.json',
  '/locales/fr.json',
  '/locales/es.json',
  '/locales/pt.json',
  '/locales/ar.json',
  '/locales/zh.json',
  '/locales/ja.json',
  '/locales/ko.json',
];

const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);
const PRIVATE_PREFIXES = ['/auth/', '/storage/', '/private/'];
const PUBLIC_API_PREFIXES = ['/api/public/twins'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPrivatePath(pathname) {
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  if (pathname.startsWith('/api/')) return true;
  return PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (request.mode === 'navigate') await cache.put('/', response.clone());
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      return (await cache.match(request)) || (await caches.match('/offline.html'));
    }
    return (await cache.match(request)) || (await caches.match('/offline.html'));
  }
}

// Navigationen stale-while-revalidate (Performance 21.09.2026): network-first
// liess JEDEDE Seitenanfrage auf den Netz-Roundtrip warten — Warm-Besuche
// zahlten TTFB ~0,8-1 s (gemessen: domcontentloaded 1.157 ms bei vollem
// Cache). SWR liefert die gecachte Shell SOFORT und frischt sie im
// Hintergrund nach; beim naechsten Besuch steht die neue Version. Frische
// Inhalte gefaehrdet das nicht: slim.json bleibt network-first (neue Profile
// taeglich sichtbar) und Assets sind gehasht. Offline: Cache, sonst
// offline.html. Gespiegelt wird NUR die Start-Shell auf '/' — alte Versionen
// schrieben jede besuchte /t/-Seite auf '/' und zeigten offline dort eine
// falsche Profilseite.
async function navigateStaleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = (await cache.match(request)) || (await cache.match('/'));
  const isRoot = new URL(request.url).pathname === '/';
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
        if (isRoot) void cache.put('/', response.clone());
      }
      return response;
    })
    .catch(() => null);
  const response = cached || (await fresh);
  return response || (await caches.match('/offline.html')) || Response.error();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivatePath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateStaleWhileRevalidate(request));
    return;
  }

  // slim.json (~350 KB, Startseiten-Grid/„Neu"-Reihe) IMMER zuerst aus dem
  // Netz: Der Inhaber (13.09.) sah taeglich keine neuen Profile, weil
  // stale-while-revalidate den Katalog genau einen Besuch hinter dem Stand
  // ausliefert. slim ist klein genug fuer network-first (Cache bleibt
  // Offline-Fallback). Dasselbe gilt fuer catalog.json (Chunk-Manifest,
  // Performance 21.09.2026): es taeglich neue Chunks verzeichnet, darf also
  // keinen Besuch hinterherlaufen. Die Chunks c000.json … bleiben
  // stale-while-revalidate (unveraenderlich, per Prefix-Regel unten).
  if (url.pathname === '/api/public/twins/slim.json' || url.pathname === '/api/public/twins/catalog.json') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    CACHEABLE_DESTINATIONS.has(request.destination) ||
    url.pathname === '/api/public/twins' ||
    url.pathname.startsWith('/api/public/twins/') ||
    url.pathname.startsWith('/public/profile-images/') ||
    url.pathname.startsWith('/locales/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.xml') ||
    url.pathname.endsWith('.txt')
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
