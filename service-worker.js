const CACHE_NAME = "hanafi-cache-v3";

const URLS_TO_CACHE = [
  "/Hanafi-Map/",
  "/Hanafi-Map/index.html",
  "/Hanafi-Map/app.js",
  "/Hanafi-Map/manifest.json",
  "/Hanafi-Map/icons/icon-192.png",
  "/Hanafi-Map/icons/icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", (event) => {
  console.log("[SW] Installation du service worker…");
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log("[SW] Mise en cache initiale…");
      for (const url of URLS_TO_CACHE) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            console.log(`[SW] ✅ En cache: ${url}`);
          } else {
            console.warn(`[SW] ⚠️ Impossible de mettre en cache (status ${response.status}): ${url}`);
          }
        } catch (err) {
          console.warn(`[SW] ❌ Erreur de chargement: ${url}`, err);
        }
      }
      console.log("[SW] Installé et cache initial chargé ✅");
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  console.log("[SW] Activation terminée 🧹");
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => caches.match("/Hanafi-Map/index.html"))
  );
});
