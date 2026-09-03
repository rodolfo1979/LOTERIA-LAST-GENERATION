const CACHE_NAME = 'vendedor-v24';
const ARCHIVOS = ['index.html', 'app.js', 'ui.js', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Solo cachea el shell de la app; las llamadas a /api siempre van a la red.
  if (event.request.url.includes('/api/')) return;

  if (
    event.request.mode === 'navigate' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.url.includes('index.html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});
