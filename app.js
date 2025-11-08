/* ===========================================================
   ✅ app.js — version finale (auth + itinéraire + multi-livreurs)
   =========================================================== */

/* ========== CONFIG MAP ========== */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ========== RÉCUPÉRATION ID LIVREUR ========== */
const urlParams = new URLSearchParams(window.location.search);
const LIVREUR_NUM = urlParams.get("livreur") || "1";
const LIVREUR_ID = "livreur_" + LIVREUR_NUM;

/* ========== AUTH LIVREUR (AUTO-CONNEXION) ========== */
const LIVREUR_EMAILS = {
  1: "livreur1@hanafi.dz",
  2: "livreur2@hanafi.dz",
  3: "livreur3@hanafi.dz",
  4: "livreur4@hanafi.dz",
  5: "livreur5@hanafi.dz",
  6: "livreur6@hanafi.dz",
};

const LIVREUR_PASSWORDS = {
  1: "hanafi001",
  2: "hanafi002",
  3: "hanafi003",
  4: "hanafi004",
  5: "hanafi005",
  6: "hanafi006",
};

async function loginLivreur() {
  const email = LIVREUR_EMAILS[LIVREUR_NUM];
  const password = LIVREUR_PASSWORDS[LIVREUR_NUM];
  if (!email || !password) return alert("Livreur non reconnu.");

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    console.log("✅ Connecté :", email);
  } catch (e) {
    console.error("Erreur login :", e);
    alert("Erreur de connexion Firebase : " + e.message);
  }
}

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    console.log("Connecté en tant que :", user.email);
    listenClients(); // démarre la carte
  } else {
    loginLivreur();
  }
});

/* ========== INIT CARTE ========== */
const map = L.map("map", { center: defaultCenter, zoom: defaultZoom });

const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  maxZoom: 20,
  subdomains: ["mt0", "mt1", "mt2", "mt3"],
});

const labelsLayer = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
  {
    subdomains: ["a", "b", "c", "d"],
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors, © CartoDB",
    opacity: 1.0,
  }
);

/* ========== ICONES ========== */
const clientIcon = L.icon({
  iconUrl: "/Hanafi-Map/magasin-delectronique.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42],
});
const livreurIcon = L.icon({
  iconUrl: "/Hanafi-Map/camion-dexpedition.png",
  iconSize: [50, 50],
  iconAnchor: [25, 50],
});

/* ========== FIREBASE INIT SAFE ========== */
if (!window.firebaseConfig) {
  console.warn("⚠️ Firebase config non trouvée dans index.html");
}
if (typeof firebase !== "undefined") {
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      if (window.firebaseConfig) firebase.initializeApp(window.firebaseConfig);
    }
  } catch (e) {
    console.warn("Erreur init Firebase :", e);
  }
}
if (!window.db) {
  if (typeof firebase !== "undefined" && firebase.apps?.length > 0) {
    window.db = firebase.database();
  }
}
const db = window.db;

/* ========== LAYERS & STATE ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let routePolyline = null;
let satelliteMode = false;
const clientMarkers = [];

/* ========== UTILS ========== */
const $id = (id) => document.getElementById(id);
function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

/* ========== CLIENTS CRUD ========== */
function ajouterClient(lat, lng) {
  const name = prompt("Nom du client ?");
  if (!name) return;
  if (!db) return alert("Base de données non initialisée");
  const ref = db.ref(`clients/${LIVREUR_ID}`).push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}
function supprimerClient(id) {
  if (!confirm("❌ Supprimer ce client ?")) return;
  if (!db) return alert("Base de données non initialisée");
  db.ref(`clients/${LIVREUR_ID}/${id}`).remove();
}
function renommerClient(id, oldName) {
  const n = prompt("Nouveau nom :", oldName);
  if (n && db) db.ref(`clients/${LIVREUR_ID}/${id}/name`).set(n);
}

/* ========== POPUP CLIENTS ========== */
function popupClientHtml(c) {
  const commandeUrl = "https://ton-lien-de-commande.com"; // à modifier plus tard
  return `
    <div style="font-size:13px; max-width:260px;">
      <b>${escapeHtml(c.name || c.nom || "Client")}</b><br>
      ${c.adresse ? `<small style="color:#555">${escapeHtml(c.adresse)}</small><br>` : ""}
      ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
      <div style="margin-top:8px; display:flex; gap:6px; flex-direction:column;">
        <button onclick="window.open('${commandeUrl}','_blank')" style="background:#28a745;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🛒 Passer commande</button>
        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🚗 Itinéraire</button>
        <button onclick="clearItinerary()" style="background:#ff9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🧭 Enlever itinéraire</button>
        <button onclick="renommerClient('${c.id}', '${escapeHtml(c.name || c.nom || "")}')" style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">✏️ Modifier</button>
        <button onclick="supprimerClient('${c.id}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

/* ========== LISTEN CLIENTS ========== */
function listenClients() {
  if (!db) return console.warn("DB non initialisée");
  db.ref(`clients/${LIVREUR_ID}`).on("value", (snap) => {
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if (!data) return;
    Object.entries(data).forEach(([id, c]) => {
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
      c.id = id;
      const m = L.marker([c.lat, c.lng], { icon: clientIcon });
      m.bindPopup(popupClientHtml(c));
      m.clientName = (c.name || c.nom || "").toLowerCase();
      m.clientData = c;
      clientsLayer.addLayer(m);
      clientMarkers.push(m);
    });
  });
}

/* ========== GÉOLOCALISATION ========== */
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else userMarker.setLatLng([lat, lng]);
      try {
        if (db)
          db.ref(`livreurs/${LIVREUR_ID}`).set({ lat, lng, updatedAt: Date.now() });
      } catch (e) {}
    },
    (e) => console.warn("geo err", e),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

/* ========== ROUTE (avec distance + durée) ========== */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path || !path.points?.coordinates) throw new Error("Pas de géométrie");
    const pts = path.points.coordinates.map((p) => [p[1], p[0]]);
    const distanceKm = (path.distance / 1000).toFixed(2);
    const dureeMin = Math.round(path.time / 60000);
    routeLayer.clearLayers();
    routePolyline = L.polyline(pts, { color: "#0074FF", weight: 5, opacity: 0.95 }).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(), { padding: [60, 60], maxZoom: 17 });
    const center = routePolyline.getBounds().getCenter();
    const popup = L.popup().setLatLng(center).setContent(`<b>Distance :</b> ${distanceKm} km<br><b>Durée :</b> ${dureeMin} min`).openOn(map);
  } catch (e) {
    console.error("Erreur itinéraire :", e);
    alert("Erreur lors du calcul de l’itinéraire.");
  }
}
function clearItinerary() {
  routeLayer.clearLayers();
  routePolyline = null;
}

/* ========== CONTEXT MENU ========== */
map.on("contextmenu", (e) => ajouterClient(e.latlng.lat, e.latlng.lng));
