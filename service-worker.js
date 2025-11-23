const CACHE_NAME = 'hanafi-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  
  // Chemins relatifs de base
  '/Hanafi-Map/',
  '/Hanafi-Map/index.html',
  '/Hanafi-Map/manifest.json',
  
  // CSS et JS - seulement les fichiers existants
  '/Hanafi-Map/styles.css',
  '/Hanafi-Map/app.js',
  
  // Icones - seulement si elles existent
  '/Hanafi-Map/icon-192.png',
  '/Hanafi-Map/icon-512.png',
  '/Hanafi-Map/favicon.ico',
  '/Hanafi-Map/magasin-delectronique.png',
  '/Hanafi-Map/camion-dexpedition.png'
];

// Installation avec gestion d'erreurs
self.addEventListener('install', event => {
  console.log('🔄 Installation nouvelle version du cache');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Ouverture du cache');
        return cache.addAll(urlsToCache)
          .then(() => {
            console.log('✅ Toutes les ressources mises en cache');
          })
          .catch(error => {
            console.warn('⚠️ Certaines ressources non mises en cache:', error);
            // Continuer même si certaines ressources échouent
            return cache.add('/').catch(e => console.error('Même / a échoué:', e));
          });
      })
  );
});

// Fetch avec fallback
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes GraphHopper
  if (event.request.url.includes('graphhopper.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retourne le cache ou fetch réseau
        if (response) {
          return response;
        }
        
        // Cloner la requête car elle ne peut être utilisée qu'une fois
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Vérifier si la réponse est valide
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cloner la réponse pour la mettre en cache
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.warn('🌐 Erreur réseau, retour au cache:', error);
            // Fallback pour la page d'accueil si tout échoue
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
          });
      })
  );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', event => {
  console.log('✨ Service Worker activé');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
