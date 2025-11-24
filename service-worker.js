const CACHE_NAME = 'hanafi-' + Date.now();

self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('🚀 Installation nouvelle version');
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
