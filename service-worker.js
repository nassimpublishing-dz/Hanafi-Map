// === Hanafi Map - Service Worker corrigé ===
// Version : 3.0 (2025-11-01)
// Ce SW évite le cache excessif de GitHub Pages pour Leaflet & index.html

const CACHE_NAME = "hanafi-map-v3";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/Hanafi-Map/icons/icon-192.png",
  "/Hanafi-Map/icons/icon-512.png"
];

// ✅ Installation : met en cache uniquement les fichiers critiques
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  console.log("[SW] Installé et cache initial chargé ✅");
});

// ✅ Activation : nettoie les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          console.log("[SW] Suppression ancien cache:", key);
          return caches.delete(key);
        }
      }))
    )
  );
  return self.clients.claim();
});

// ✅ Fetch : on évite de servir une vieille version de index.html
// et on ne met PAS Leaflet, Firebase ni API en cache (toujours en ligne)
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Pas de cache pour Leaflet, Firebase ou Nominatim
  if (
    url.includes("unpkg.com/leaflet") ||
    url.includes("firebase") ||
    url.includes("nominatim") ||
    url.endsWith(".js") && !url.includes("/Hanafi-Map/") ||
    url.endsWith(".css") && !url.includes("/Hanafi-Map/")
  ) {
    return event.respondWith(fetch(event.request));
  }

  // Cache-first pour icônes / images
  if (url.match(/\.(png|jpg|jpeg|svg|gif|webp)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
        );
      })
    );
    return;
  }

  // Network-first pour index.html
  if (url.endsWith("/") || url.endsWith("index.html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
  }
});
