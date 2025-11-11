/* ===========================================================
   app.js — Version ADMIN + LIVREURS (Firebase v8)
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ---------- CONFIG FIREBASE ---------- */
const db = firebase.database();
const auth = firebase.auth();

/* ---------- ICONES ---------- */
const clientIcon = L.icon({
  iconUrl: "/Hanafi-Map/magasin-delectronique.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42],
});
const livreurIcon = L.icon({
  iconUrl: "/Hanafi-Map/camion-dexpedition.png",
  iconSize: [48, 48],
  iconAnchor: [24, 48],
});

/* ---------- MAP ---------- */
let map;
let routeLayer = L.layerGroup();
let clientsLayer = L.layerGroup();
let userMarker = null;
let geoWatchId = null;
let clientsRef = null;
let isAdmin = false;
let CURRENT_UID = null;

function initMap() {
  if (map) return map;
  map = L.map("map").setView(defaultCenter, defaultZoom);
  normalTiles.addTo(map);
  routeLayer.addTo(map);
  clientsLayer.addTo(map);

  // ✅ Conteneur info distance/durée
  const infoDiv = document.createElement("div");
  infoDiv.id = "routeInfo";
  infoDiv.style.cssText = `
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 14px;
    padding: 8px 14px;
    border-radius: 8px;
    z-index: 1500;
    display: none;
  `;
  document.body.appendChild(infoDiv);

  return map;
}

const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
const satelliteTiles = L.tileLayer(
  "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20 }
);
let satelliteMode = false;

/* ===========================================================
   🔐 AUTHENTIFICATION
   =========================================================== */
document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    document.getElementById("loginError").textContent = "Veuillez remplir tous les champs";
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .then(() => console.log("✅ Connexion réussie"))
    .catch(err => {
      document.getElementById("loginError").textContent = err.message;
    });
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async user => {
  if (user) {
    CURRENT_UID = user.uid;
    console.log("✅ Connecté :", user.email);
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";

    setTimeout(() => {
      try {
        initMap().invalidateSize();
      } catch (e) {}
    }, 300);

    try {
      const snap = await db.ref("admins/" + CURRENT_UID).once("value");
      isAdmin = snap.exists() && snap.val() === true;
      if (isAdmin) console.log("👑 Mode ADMIN activé");
    } catch (e) {
      console.warn("Erreur récupération admin :", e);
      isAdmin = false;
    }

    startApp();
  } else {
    console.log("❌ Déconnecté");
    CURRENT_UID = null;
    isAdmin = false;
    cleanup();
  }
});

/* ===========================================================
   🚀 INITIALISATION APP
   =========================================================== */
function startApp() {
  initMap();
  createBottomButtons();
  watchPosition();
  listenClients();
  enableSearchClients();
  if (isAdmin) enableAdminTools?.();
}

/* ---------- CLEANUP ---------- */
function cleanup() {
  document.getElementById("loginContainer").style.display = "block";
  document.getElementById("map").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("controls").style.display = "none";

  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch (_) {}
    geoWatchId = null;
  }
  if (clientsRef) clientsRef.off();
  if (routeLayer) routeLayer.clearLayers();
  if (clientsLayer) clientsLayer.clearLayers();
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
}

/* ===========================================================
   📍 GEOLOCALISATION
   =========================================================== */
function watchPosition() {
  if (!("geolocation" in navigator)) {
    console.warn("Géolocalisation non supportée");
    map.setView(defaultCenter, defaultZoom);
    return;
  }

  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch (_) {}
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    },
    err => {
      console.warn("Erreur géoloc initiale :", err);
      map.setView(defaultCenter, defaultZoom);
    }
  );

  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      if (CURRENT_UID) {
        db.ref("livreurs/" + CURRENT_UID)
          .set({ lat, lng, updatedAt: Date.now() })
          .catch(e => console.warn("Firebase write err:", e));
      }
    },
    err => console.warn("Erreur géoloc watch :", err),
    { enableHighAccuracy: false, maximumAge: 8000, timeout: 30000 }
  );
}

/* ===========================================================
   🚗 ITINÉRAIRE
   =========================================================== */
let routeControl = null;
function calculerItineraire(lat, lng) {
  if (routeControl) map.removeControl(routeControl);

  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas supportée sur cet appareil.");
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const start = [pos.coords.latitude, pos.coords.longitude];
    const end = [lat, lng];
    const infoDiv = document.getElementById("routeInfo");

    routeControl = L.Routing.control({
      waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
      lineOptions: { styles: [{ color: '#0074FF', weight: 4 }] },
      routeWhileDragging: false,
      showAlternatives: false,
      createMarker: () => null
    })
    .on('routesfound', e => {
      const route = e.routes[0];
      const distance = (route.summary.totalDistance / 1000).toFixed(2);
      const duree = Math.round(route.summary.totalTime / 60);
      infoDiv.innerHTML = `🚗 <b>Distance :</b> ${distance} km — ⏱️ <b>Durée :</b> ${duree} min`;
      infoDiv.style.display = "block";
    })
    .addTo(map);
  });
}

function supprimerItineraire() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
    const infoDiv = document.getElementById("routeInfo");
    if (infoDiv) infoDiv.style.display = "none";
  } else {
    alert("⚠️ Aucun itinéraire actif.");
  }
}

/* ===========================================================
   🔍 BARRE DE RECHERCHE CLIENTS
   =========================================================== */
let markers = [];
function enableSearchClients() {
  const searchInput = document.getElementById("searchClient");
  const clearBtn = document.getElementById("clearSearch");
  if (!searchInput || !clearBtn) return;

  searchInput.addEventListener("input", e => {
    const query = e.target.value.trim().toLowerCase();
    filtrerClients(query);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    filtrerClients("");
  });
}

function filtrerClients(query) {
  markers.forEach(m => {
    const nom = m.options.nom?.toLowerCase() || "";
    const match = nom.includes(query);
    if (match && query.length > 0) {
      const regex = new RegExp(`(${query})`, "gi");
      const highlighted = m.options.nom.replace(regex, '<mark>$1</mark>');
      m.bindPopup(`<b>${highlighted}</b>`);
      m.getElement()?.classList.add("highlight");
    } else {
      m.getElement()?.classList.remove("highlight");
    }
    if (query === "" || match) map.addLayer(m);
    else map.removeLayer(m);
  });
}

const style = document.createElement("style");
style.textContent = `
  .highlight { filter: drop-shadow(0 0 6px yellow); z-index: 9999 !important; }
  mark { background: yellow; color: black; padding: 0 2px; }
`;
document.head.appendChild(style);

/* ===========================================================
   🧭 BOUTONS FLOTTANTS
   =========================================================== */
function createBottomButtons() {
  if (document.getElementById("mapButtons")) return;
  const c = document.createElement("div");
  c.id = "mapButtons";
  c.style =
    "position:absolute;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:2000";

  const makeBtn = txt => {
    const b = document.createElement("button");
    b.textContent = txt;
    b.style.cssText =
      "background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;";
    return b;
  };

  const btnSat = makeBtn("🛰️ Vue satellite");
  btnSat.onclick = () => {
    satelliteMode = !satelliteMode;
    if (satelliteMode) {
      map.addLayer(satelliteTiles);
      map.removeLayer(normalTiles);
      btnSat.textContent = "🗺️ Vue normale";
    } else {
      map.addLayer(normalTiles);
      map.removeLayer(satelliteTiles);
      btnSat.textContent = "🛰️ Vue satellite";
    }
  };

  const btnPos = makeBtn("📍 Ma position");
  btnPos.onclick = () => userMarker && map.setView(userMarker.getLatLng(), 15);

  c.append(btnSat, btnPos);
  document.body.appendChild(c);
}
