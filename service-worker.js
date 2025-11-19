// Nom du cache AVEC VERSION - changez le numéro de version
const CACHE_NAME = 'hanafi-map-v3'; // ← Changez v2 en v3

// Installation
self.addEventListener('install', event => {
  console.log('🔄 Service Worker installé - version NOUVELLE');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Mise en cache des nouvelles ressources');
        return cache.addAll([
          '/Hanafi-Map/',
          '/Hanafi-Map/index.html',
          '/Hanafi-Map/manifest.json',
          '/Hanafi-Map/service-worker.js',
          '/Hanafi-Map/app.js',
          '/Hanafi-Map/icon-192-new.png',
          '/Hanafi-Map/icon-512-new.png',
          '/Hanafi-Map/favicon-32x32.ico',
          '/Hanafi-Map/apple-icon-180x180.png',
          '/Hanafi-Map/magasin-delectronique.png',
          '/Hanafi-Map/camion-dexpedition.png'
        ]);
      })
      .catch(error => {
        console.log('❌ Erreur cache:', error);
      })
  );
});

// Activation - SUPPRIME LES ANCIENS CACHES
self.addEventListener('activate', event => {
  console.log('🔥 Activation - suppression anciens caches');
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
    })
  );
});

