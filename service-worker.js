// service-worker.js - Version STABLE et SIMPLE
const CACHE_NAME = 'hanafi-map-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  
  // Chemins de base
  '/Hanafi-Map/',
  '/Hanafi-Map/index.html',
  '/Hanafi-Map/manifest.json',
  
  // Ressources principales
  '/Hanafi-Map/app.js',
  '/Hanafi-Map/styles.css',
  
  // Icones
  '/Hanafi-Map/icon-192.png',
  '/Hanafi-Map/icon-512.png',
  '/Hanafi-Map/favicon.ico',
  '/Hanafi-Map/magasin-delectronique.png',
  '/Hanafi-Map/camion-dexpedition.png'
];

// ===========================================================
// INSTALLATION - Simple et sans erreurs
// ===========================================================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation');
  
  // Prendre le contrôle immédiatement
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Ouverture du cache');
        // Tenter de mettre en cache, mais continuer même en cas d'erreur
        return cache.addAll(urlsToCache).catch(error => {
          console.log('⚠️ Certaines ressources non mises en cache:', error);
          // Continuer même si certaines ressources échouent
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('✅ Installation Service Worker terminée');
      })
  );
});

// ===========================================================
// ACTIVATION - Nettoyage des anciennes versions
// ===========================================================
self.addEventListener('activate', (event) => {
  console.log('✨ Service Worker: Activation');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Supprimer les anciens caches
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Prendre le contrôle de tous les clients
      return self.clients.claim();
    })
  );
});

// ===========================================================
// FETCH - Stratégie réseau d'abord, puis cache
// ===========================================================
self.addEventListener('fetch', (event) => {
  // Ne pas intercepter les requêtes vers GraphHopper
  if (event.request.url.includes('graphhopper.com')) {
    return;
  }
  
  // Ne pas intercepter les requêtes Firebase
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis')) {
    return;
  }
  
  // Pour les autres requêtes : réseau d'abord, puis cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse est valide, la mettre en cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch((error) => {
        // En cas d'erreur réseau, essayer le cache
        console.log('🌐 Erreur réseau, utilisation du cache:', error);
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Fallback pour la navigation
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            
            // Fallback générique
            return new Response('Ressource non disponible hors ligne', {
              status: 408,
              statusText: 'Hors ligne'
            });
          });
      })
  );
});

// ===========================================================
// MESSAGE - Communication avec l'app
// ===========================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ Service Worker chargé - Version stable');
