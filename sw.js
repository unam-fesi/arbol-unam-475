// Service Worker — Proyecto Árbol UNAM 475
// Estrategia: app shell cacheada + queue offline para mediciones
const CACHE_NAME = 'arbol-unam-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/utils.js',
  './js/auth.js',
  './js/navigation.js',
  './js/mi-arbol.js',
  './js/pumai.js',
  './js/ar-height.js',
  './js/admin.js',
  './js/offline-queue.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch((e) => console.warn('SW precache failed:', e))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for HTML/JS, cache fallback. Bypass for Supabase (always network).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Supabase API calls
  if (url.host.includes('supabase.co') || url.host.includes('supabase.in')) {
    return; // let browser handle
  }

  if (event.request.method !== 'GET') return;

  // Network-first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache same-origin and CDN responses
        if (res.ok && (url.origin === self.location.origin || url.host.includes('cdn'))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

// Handle messages from page (for queued sync trigger)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
