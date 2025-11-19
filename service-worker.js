// Version FORCÉE - changez ce numéro
const CACHE_NAME = 'hanafi-map-v4';

// Fichiers à mettre en cache AVEC NOUVEAUX NOMS
const urlsToCache = [
  '/Hanafi-Map/',
  '/Hanafi-Map/index.html',
  '/Hanafi-Map/manifest.json',
  '/Hanafi-Map/service-worker.js',
  '/Hanafi-Map/app.js',
  '/Hanafi-Map/icon-192-new.png',  // NOUVELLE ICÔNE
  '/Hanafi-Map/icon-512-new.png',  // NOUVELLE ICÔNE
  '/Hanafi-Map/favicon-32x32.ico',
  '/Hanafi-Map/apple-icon-180x180.png',
  '/Hanafi-Map/magasin-delectronique.png',
  '/Hanafi-Map/camion-dexpedition.png'
];

// Installation
self.addEventListener('install', event => {
  console.log('🔄 Installation nouvelle version');
  self.skipWaiting(); // FORCE l'activation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activation AGGRESSIVE
self.addEventListener('activate', event => {
  console.log('🔥 Activation forcée');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ Suppression cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // FORCE tous les clients à se mettre à jour
      return self.clients.claim();
    })
  );
});

// Interception
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
