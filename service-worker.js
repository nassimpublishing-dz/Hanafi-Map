// service-worker.js - Version CORRIGÉE pour icônes
const CACHE_NAME = 'hanafi-map-v3-' + new Date().toISOString().split('T')[0];
const urlsToCache = [
  '/Hanafi-Map/',
  '/Hanafi-Map/index.html',
  '/Hanafi-Map/manifest.json',
  '/Hanafi-Map/app.js',
  '/Hanafi-Map/styles.css',
  '/Hanafi-Map/firebase-config.js',
  '/Hanafi-Map/icon-192-new.png',
  '/Hanafi-Map/icon-512-new.png',
  '/Hanafi-Map/apple-touch-icon.png',
  '/Hanafi-Map/favicon.ico',
  '/Hanafi-Map/camion-dexpedition.png',
  '/Hanafi-Map/magasin-delectronique.png',
  '/Hanafi-Map/screenshot-wide.png',
  '/Hanafi-Map/screenshot-narrow.jpg'
];

// ===========================================================
// INSTALLATION
// ===========================================================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation - Version icônes corrigée');
  
  // Prendre le contrôle immédiatement
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Ouverture du cache:', CACHE_NAME);
        console.log('🔄 Mise en cache des ressources avec icônes corrigées');
        return cache.addAll(urlsToCache).catch(error => {
          console.log('⚠️ Certaines ressources non mises en cache:', error);
          // Continuer même en cas d'erreur
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
// ACTIVATION - Nettoyage des anciens caches
// ===========================================================
self.addEventListener('activate', (event) => {
  console.log('✨ Service Worker: Activation');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Supprimer tous les anciens caches
          if (cacheName !== CACHE_NAME && cacheName.startsWith('hanafi-map')) {
            console.log('🗑️ Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Nettoyage des caches terminé');
      // Prendre le contrôle de tous les clients
      return self.clients.claim();
    })
  );
});

// ===========================================================
// FETCH - Stratégie intelligente pour icônes
// ===========================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignorer les requêtes externes (API, CDN)
  if (url.origin !== location.origin) {
    if (url.href.includes('graphhopper.com') || 
        url.href.includes('firebase') || 
        url.href.includes('googleapis') ||
        url.href.includes('gstatic.com') ||
        url.href.includes('unpkg.com') ||
        url.href.includes('via.placeholder.com')) {
      // Laisser passer les requêtes externes
      return;
    }
  }
  
  // Pour les ressources locales de l'app : Cache First
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Si trouvé en cache, retourner la version mise en cache
        if (cachedResponse) {
          console.log('📂 Servi depuis le cache:', event.request.url);
          return cachedResponse;
        }
        
        // Sinon, aller sur le réseau
        console.log('🌐 Fetch réseau:', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Vérifier si la réponse est valide pour la mise en cache
            if (response && response.status === 200) {
              // Mettre en cache la nouvelle ressource (surtout les icônes)
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                  console.log('💾 Nouvelle ressource mise en cache:', event.request.url);
                });
            }
            return response;
          })
          .catch((error) => {
            console.log('❌ Erreur réseau, fallback:', error);
            
            // Fallback pour la page d'accueil
            if (event.request.mode === 'navigate') {
              return caches.match('/Hanafi-Map/index.html')
                     || caches.match('/Hanafi-Map/')
                     || caches.match('./index.html');
            }
            
            // Fallback pour les images (surtout les icônes)
            if (event.request.destination === 'image') {
              // Essayer de servir depuis le cache avec différents chemins
              const iconPaths = [
                '/Hanafi-Map/icon-192-new.png',
                '/Hanafi-Map/icon-512-new.png', 
                '/Hanafi-Map/apple-touch-icon.png',
                'icon-192-new.png',
                'icon-512-new.png'
              ];
              
              for (const path of iconPaths) {
                return caches.match(path)
                  .then(iconResponse => {
                    if (iconResponse) return iconResponse;
                  })
                  .catch(() => null);
              }
            }
            
            // Fallback générique
            return new Response('Ressource non disponible hors ligne', {
              status: 408,
              statusText: 'Hors ligne',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});

console.log('✅ Service Worker CORRIGÉ chargé - Icônes optimisées');
