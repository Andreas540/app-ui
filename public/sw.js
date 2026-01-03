// public/sw.js
const CACHE = 'app-ui-v2'; // bump to force SW update
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: DO NOT cache API. For employee routes, do not cache navigation HTML.
// Everything else: your original network-first UI caching.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // only same-origin
  if (url.origin !== self.location.origin) return;

  // Never cache backend/API calls
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  const isNav = event.request.mode === 'navigate';
  const isEmployeeNav =
    isNav &&
    (url.pathname === '/time-entry' ||
      url.pathname.startsWith('/time-entry/') ||
      url.pathname === '/time-entry-simple' ||
      url.pathname.startsWith('/time-entry-simple/'));

  // For employee navigations: always hit network (no cache)
  if (isEmployeeNav) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Otherwise: network-first with cache fallback (your original behavior)
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

