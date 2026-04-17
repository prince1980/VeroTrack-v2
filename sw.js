const CACHE_NAME = 'verotrack-v2-cache-21';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './css/engine.css',
  './css/premium.css',
  './js/app.js',
  './js/quick-log.js',
  './js/session.js',
  './js/insights.js',
  './js/storage.js',
  './js/auth.js',
  './js/gemini.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
         console.warn('One or more assets failed to cache on install, but continuing.', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Clean up old caches that don't match the current CACHE_NAME
      return Promise.all(
        keys.filter((key) => key.startsWith('verotrack-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests and external API calls directly (e.g. Supabase, Gemini)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Only cache same-origin resources to prevent polluting storage with untrusted data
  if (url.origin !== location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  const isCoreAsset = /\.(?:html|css|js)$/i.test(url.pathname);

  // Network-first for navigation and core assets to avoid stale UI/JS mismatches.
  if (isNavigation || isCoreAsset) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (isNavigation) return caches.match('./index.html');
          return undefined;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Cache-first for non-core static assets.
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (isNavigation) {
          return caches.match('./index.html');
        }
        return undefined;
      });
    })
  );
});
