// service-worker.js simple
self.addEventListener('install', evt => self.skipWaiting());
self.addEventListener('activate', evt => self.clients.claim());
self.addEventListener('fetch', evt => {
  evt.respondWith(fetch(evt.request).catch(() => caches.match(evt.request)));
});
