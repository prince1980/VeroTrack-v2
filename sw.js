const CACHE_NAME = 'verotrack-v2-cache-2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './css/engine.css',
  './css/premium.css',
  './js/app.js',
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

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
       // Stale-while-revalidate strategy: return cached immediately, update in background
       if (cachedResponse) {
          event.waitUntil(
             fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                   caches.open(CACHE_NAME).then((cache) => {
                      cache.put(event.request, networkResponse.clone());
                   });
                }
             }).catch(() => {}) // Ignore background update failures if offline
          );
          return cachedResponse;
       }

       // Fetch from network if not cached
       return fetch(event.request).then((networkResponse) => {
           if (networkResponse && networkResponse.status === 200) {
               const responseClone = networkResponse.clone();
               caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseClone);
               });
           }
           return networkResponse;
       }).catch(() => {
           // Offline fallback for HTML pages
           if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
           }
       });
    })
  );
});
