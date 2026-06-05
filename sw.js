// Service Worker — Proyecto Árbol UNAM 475
// Estrategia: app shell cacheada + queue offline para mediciones
//
// ⚠ IMPORTANTE: cuando agregues nuevos archivos JS o cambies HTML,
// SUBE EL NÚMERO DE VERSIÓN (v1 → v2 → v3 ...) para forzar invalidación
// del cache en los navegadores de los usuarios.
const CACHE_NAME = 'arbol-unam-v189';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/utils.js',
  './js/auth.js',
  './js/navigation.js',
  './js/mi-arbol.js',
  './js/mi-portafolio.js',
  './js/pumai.js',
  './js/ar-height.js',
  './js/admin.js',
  './js/offline-queue.js',
  './js/tree-models.js',
  './js/dashboard-tree-3d.js',
  './js/campus-bounds.js',
  './js/dashboard-vis.js',
  './js/iztacala-sculpture.js',
  './js/iztacala-letras.js',
  './js/iztacala-ahuehuete475.js',
  './js/iztacala-mariposas.js',
  './js/iztacala-juanficus-special.js',
  './js/iztacala-calibrator.js',
  './js/splash-video.js',
  './js/session-timeout.js',
  './js/map-loader.js',
  './js/dashboard-iztacala.js',
  './js/dashboard-campus.js',
  './js/dashboard-walkthrough.js',
  './js/co2.js',
  './js/species-cards.js',
  './js/timelapse.js',
  './js/social-poster.js',
  './js/bitacora.js',
  './forest-theme.css',
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

// Estrategia diferenciada:
//   • Supabase → siempre red (sin cache nunca)
//   • HTML (navegación) → network-first, cache solo como fallback offline
//   • JS / CSS / fonts / etc. → network-first, cache como fallback
//   • La cache se actualiza siempre que haya red para evitar pegado
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.host.includes('supabase.co') || url.host.includes('supabase.in')) return;
  if (event.request.method !== 'GET') return;

  const isHtml = event.request.mode === 'navigate'
    || (event.request.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    fetch(event.request, isHtml ? { cache: 'no-store' } : undefined)
      .then((res) => {
        // Actualizar cache con la respuesta fresca
        if (res.ok && (url.origin === self.location.origin || url.host.includes('cdn'))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // CRÍTICO: solo devolver index.html como fallback si era request de HTML.
        // Para imágenes, JSON, GLB, JS, etc. devolver error real (Response 404)
        // para NO confundir al parser/loader con el contenido HTML.
        if (isHtml) return caches.match('./index.html');
        return new Response('Offline and not cached', { status: 503, statusText: 'Offline' });
      }))
  );
});

// Handle messages from page (for queued sync trigger)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
