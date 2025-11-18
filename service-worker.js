// Nom du cache
const CACHE_NAME = 'hanafi-map-v2';

// Fichiers à mettre en cache (CHEMINS CORRIGÉS)
const urlsToCache = [
  '/Hanafi-Map/',
  '/Hanafi-Map/index.html',
  '/Hanafi-Map/manifest.json',
  '/Hanafi-Map/service-worker.js',
  '/Hanafi-Map/app.js',
  '/Hanafi-Map/icon-192.png',
  '/Hanafi-Map/icon-512.png',
  '/Hanafi-Map/magasin-delectronique.png',
  '/Hanafi-Map/camion-dexpedition.png'
];

// Installation AVEC GESTION D'ERREUR
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert, ajout des fichiers...');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.log('Erreur cache:', error);
      })
  );
});

// Activation (reste identique)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Interception des requêtes (reste identique)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
