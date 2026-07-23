const CACHE_VERSION = 'smyst-v9';
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
