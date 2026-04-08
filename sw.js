/* VeroTrack service worker is intentionally disabled to prevent stale-login cache loops. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('verotrack-')).map((k) => caches.delete(k)));
      } catch {
        // ignore cache cleanup failures
      }

      try {
        await self.registration.unregister();
      } catch {
        // ignore unregister failures
      }

      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        clients.forEach((client) => {
          client.postMessage({ type: 'vt-sw-disabled' });
        });
      } catch {
        // ignore client messaging failures
      }
    })()
  );
});
