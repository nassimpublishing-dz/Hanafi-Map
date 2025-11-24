// Service Worker ULTRA SIMPLE - Ne fait rien
self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('✅ Service Worker installé (mode simple)');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  console.log('✅ Service Worker activé (mode simple)');
});

// NE RIEN INTERCEPTER - Laisser passer toutes les requêtes
self.addEventListener('fetch', (event) => {
  // Laisser toutes les requêtes passer normalement
  return;
});
