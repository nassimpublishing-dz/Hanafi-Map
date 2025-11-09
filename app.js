/* ===========================================================
   app.js — Version finale avec login Firebase v8, ADMIN/LIVREUR
   et géolocalisation corrigée pour éviter les timeout
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 15;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

let userMarker = null;
let routeLayer = L.layerGroup().addTo(map);
let clientsLayer = L.layerGroup().addTo(map);
let isAdmin = false;
let CURRENT_UID = null;
let satelliteMode = false;

/* ---------- MAP ---------- */
const map = L.map("map").setView(defaultCenter, defaultZoom);
const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20
});

/* ---------- ICONES ---------- */
const clientIcon = L.icon({ iconUrl: "/Hanafi-Map/magasin-delectronique.png", iconSize: [42,42], iconAnchor:[21,42] });
const livreurIcon = L.icon({ iconUrl: "/Hanafi-Map/camion-dexpedition.png", iconSize: [48,48], iconAnchor:[24,48] });

/* ---------- LOGIN / AUTH ---------- */
document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(() => { document.getElementById("loginError").textContent = ""; })
    .catch(err => { document.getElementById("loginError").textContent = err.message; });
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  firebase.auth().signOut();
});

/* ---------- AUTH STATE ---------- */
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    CURRENT_UID = user.uid;
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";

    try {
      const adminSnap = await firebase.database().ref("admins/" + CURRENT_UID).get();
      isAdmin = adminSnap.exists();
    } catch(e) { console.warn("Erreur récupération admin :", e); }

    startApp();
  } else {
    CURRENT_UID = null;
    document.getElementById("loginContainer").style.display = "block";
    document.getElementById("map").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
    document.getElementById("controls").style.display = "none";
  }
});

/* ===========================================================
   APP PRINCIPALE
   =========================================================== */
function startApp() {
  createBottomButtons();
  watchPosition();
  listenClients();
  if (isAdmin) enableAdminTools();
}

/* ---------- GEOLOCALISATION ---------- */
function watchPosition() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else userMarker.setLatLng([lat, lng]);

      if (CURRENT_UID) {
        firebase.database().ref("livreurs/" + CURRENT_UID)
          .set({ lat, lng, updatedAt: Date.now() })
          .catch(e => console.warn("Firebase write err:", e));
      }
    },
    (err) => {
      console.warn("Erreur géoloc", err);
      // Si timeout ou erreur, utiliser la position par défaut
      if (!userMarker) map.setView(defaultCenter, defaultZoom);
    },
    {
      enableHighAccuracy: false,  // désactive le GPS haute précision pour éviter les timeout
      maximumAge: 5000,           // accepte une position jusqu'à 5s
      timeout: 20000              // 20s pour obtenir la position
    }
  );
}

/* ---------- CLIENTS ---------- */
function listenClients() {
  if (!firebase.database() || !CURRENT_UID) return;

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  firebase.database().ref(path).on("value", (snap) => {
    clientsLayer.clearLayers();
    const data = snap.val();
    if (!data) return;

    if (isAdmin) {
      Object.entries(data).forEach(([livreurUid, clients]) => {
        Object.entries(clients).forEach(([id, c]) => addClientMarker(livreurUid, id, c));
      });
    } else {
      Object.entries(data).forEach(([id, c]) => addClientMarker(CURRENT_UID, id, c));
    }
  });
}

function addClientMarker(livreurUid, id, c) {
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
  const marker = L.marker([c.lat, c.lng], { icon: clientIcon }).addTo(clientsLayer);
  marker.bindPopup(`<b>${c.name || "Client"}</b>`);
}

/* ---------- OUTILS ADMIN ---------- */
function enableAdminTools() {
  map.on("contextmenu", (e) => {
    const livreurUid = prompt("UID du livreur pour ce client :");
    if (!livreurUid) return;
    const nom = prompt("Nom du client :");
    if (!nom) return;
    firebase.database().ref(`clients/${livreurUid}`).push({ name: nom, lat: e.latlng.lat, lng: e.latlng.lng, createdAt: Date.now() });
  });
}

/* ---------- BOUTONS FLOTTANTS ---------- */
function createBottomButtons() {
  const c = document.createElement("div");
  c.style.position = "absolute";
  c.style.bottom = "20px";
  c.style.right = "20px";
  c.style.display = "flex";
  c.style.flexDirection = "column";
  c.style.gap = "10px";
  c.style.zIndex = "2000";

  const btn = (txt) => {
    const b = document.createElement("button");
    b.textContent = txt;
    b.style.cssText = `background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;`;
    return b;
  };

  const btnSat = btn("🛰️ Vue satellite");
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

  const btnPos = btn("📍 Ma position");
  btnPos.onclick = () => userMarker && map.setView(userMarker.getLatLng(), 15);

  c.append(btnSat, btnPos);
  document.body.appendChild(c);
}
