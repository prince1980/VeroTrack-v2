/* Bump CACHE when you change CSS/JS so phones pick up updates. */
const CACHE = 'verotrack-v2026-04-05-4';

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

const PRECACHE_PATHS = [
  'index.html',
  'css/styles.css',
  'js/auth.js',
  'js/login-ui.js',
  'js/supabase-config.js',
  'js/storage.js',
  'js/burn.js',
  'js/gamify.js',
  'js/tips.js',
  'js/app.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/build.html',
  'health.txt',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(PRECACHE_PATHS.map((p) => cache.add(scopeUrl(p))))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(scopeUrl('index.html')));
    })
  );
});
