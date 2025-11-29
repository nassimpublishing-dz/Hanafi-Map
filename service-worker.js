// service-worker.js - Version CORRIGÉE pour PWA Builder
const CACHE_NAME = 'hanafi-map-v1-' + new Date().toISOString().split('T')[0];
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './styles.css',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico'
];

// ===========================================================
// INSTALLATION
// ===========================================================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation');
  
  // Prendre le contrôle immédiatement
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Ouverture du cache:', CACHE_NAME);
        return cache.addAll(urlsToCache).catch(error => {
          console.log('⚠️ Certaines ressources non mises en cache:', error);
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('✅ Installation Service Worker terminée');
        return self.skipWaiting();
      })
  );
});

// ===========================================================
// ACTIVATION
// ===========================================================
self.addEventListener('activate', (event) => {
  console.log('✨ Service Worker: Activation');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Activation terminée');
      return self.clients.claim();
    })
  );
});

// ===========================================================
// FETCH - Stratégie Cache First pour les ressources locales
// ===========================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignorer les requêtes externes
  if (url.origin !== location.origin) {
    // GraphHopper, Firebase, etc.
    if (url.href.includes('graphhopper.com') || 
        url.href.includes('firebase') || 
        url.href.includes('googleapis') ||
        url.href.includes('gstatic.com') ||
        url.href.includes('unpkg.com')) {
      return;
    }
  }
  
  // Pour les ressources locales : Cache First
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si pas en cache, aller sur le réseau
        return fetch(event.request)
          .then((response) => {
            // Vérifier si la réponse est valide
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Mettre en cache la nouvelle ressource
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
              
            return response;
          })
          .catch(() => {
            // Fallback pour la navigation
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            
            return new Response('Ressource non disponible hors ligne', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// ===========================================================
// MESSAGE
// ===========================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ Service Worker chargé - Version PWA Builder');
