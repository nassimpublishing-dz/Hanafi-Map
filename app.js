/* ===========================================================
   app.js — version fusionnée, stable et complète
   - Authentification Firebase via formulaire
   - Isolation par livreur (clients/{uid})
   - Itinéraire GraphHopper (distance + durée)
   - Boutons flottants : Vue satellite / Ma position
   - Gestion CRUD clients (ajout / modif / suppression)
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 14;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ===== Sélecteurs HTML ===== */
const loginContainer = document.getElementById("loginContainer");
const mapDiv = document.getElementById("map");
const logoutBtn = document.getElementById("logoutBtn");
const controls = document.getElementById("controls");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

/* ===== Variables globales ===== */
let map;
let userMarker = null;
let routeLayer = null;
let clientsLayer = null;
let routePolyline = null;
let satelliteMode = false;
let currentUser = null;
let clientMarkers = [];

/* ===== Login / Logout ===== */
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    loginError.textContent = "Veuillez entrer vos identifiants.";
    return;
  }
  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    loginError.textContent = "";
  } catch (e) {
    console.error("Auth failed:", e);
    loginError.textContent = "Identifiants incorrects.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await firebase.auth().signOut();
});

/* ===== Surveille l’état de connexion ===== */
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log("✅ Connecté :", user.email);
    currentUser = user;
    loginContainer.style.display = "none";
    logoutBtn.style.display = "block";
    mapDiv.style.display = "block";
    controls.style.display = "flex";
    initMap();
  } else {
    console.log("❌ Déconnecté");
    currentUser = null;
    loginContainer.style.display = "block";
    logoutBtn.style.display = "none";
    mapDiv.style.display = "none";
    controls.style.display = "none";
    if (map) map.remove();
  }
});

/* ===== Initialisation de la carte ===== */
function initMap() {
  if (map) map.remove();
  map = L.map("map").setView(defaultCenter, defaultZoom);

  const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
  });

  const labelsLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    { subdomains: ["a","b","c","d"], maxZoom: 20, opacity: 1.0 }
  );
  labelsLayer.on("tileload", (e) => { try { e.tile.style.filter = "contrast(180%) brightness(80%)"; } catch(_){} });

  const clientIcon = L.icon({
    iconUrl: "/Hanafi-Map/magasin-delectronique.png",
    iconSize: [42,42],
    iconAnchor:[21,42]
  });
  const livreurIcon = L.icon({
    iconUrl: "/Hanafi-Map/camion-dexpedition.png",
    iconSize: [50,50],
    iconAnchor:[25,50]
  });

  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

  // Localisation en direct
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition((pos) => {
      const { latitude:lat, longitude:lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat,lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat,lng], 15);
      } else userMarker.setLatLng([lat,lng]);
      try {
        firebase.database().ref(`livreurs/${currentUser.uid}`).set({ lat, lng, updatedAt: Date.now() });
      } catch (e) { console.warn("Firebase write err", e); }
    }, (e) => console.warn("geo err", e), { enableHighAccuracy:true });
  }

  // Clic droit pour ajouter client
  map.on("contextmenu", e => ajouterClient(e.latlng.lat, e.latlng.lng, clientIcon));

  // Boutons bas droite
  createBottomButtons(map, normalTiles, satelliteTiles, labelsLayer);

  // Charger clients
  listenClients(clientIcon);
}

/* ===== Gestion des clients ===== */
function ajouterClient(lat, lng, icon) {
  const name = prompt("Nom du client ?");
  if (!name) return;
  const ref = firebase.database().ref(`clients/${currentUser.uid}`).push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}

function supprimerClient(id) {
  if (!confirm("❌ Supprimer ce client ?")) return;
  firebase.database().ref(`clients/${currentUser.uid}/${id}`).remove();
}

function renommerClient(id, oldName) {
  const n = prompt("Nouveau nom :", oldName);
  if (n) firebase.database().ref(`clients/${currentUser.uid}/${id}/name`).set(n);
}

/* ===== Charger clients du livreur connecté ===== */
function listenClients(clientIcon) {
  const ref = firebase.database().ref(`clients/${currentUser.uid}`);
  ref.on("value", (snap) => {
    clientsLayer.clearLayers();
    clientMarkers = [];
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

/* ===== Popups clients ===== */
function popupClientHtml(c) {
  const commandeUrl = "https://ton-lien-de-commande.com";
  return `
    <div style="font-size:13px; max-width:260px;">
      <b>${escapeHtml(c.name || c.nom || "Client")}</b><br>
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

/* ===== Itinéraire ===== */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path?.points?.coordinates) throw new Error("Pas de géométrie");
    const pts = path.points.coordinates.map(p => [p[1], p[0]]);
    const distanceKm = (path.distance / 1000).toFixed(2);
    const dureeMin = Math.round(path.time / 60000);
    routeLayer.clearLayers();
    routePolyline = L.polyline(pts, { color:"#0074FF", weight:5, opacity:0.95 }).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(), { padding:[60,60], maxZoom:17 });
    const center = routePolyline.getBounds().getCenter();
    L.popup().setLatLng(center).setContent(`<b>Distance :</b> ${distanceKm} km<br><b>Durée :</b> ${dureeMin} min`).openOn(map);
  } catch (e) {
    console.error("Erreur itinéraire :", e);
    alert("Erreur lors du calcul de l’itinéraire.");
  }
}
function clearItinerary() { routeLayer.clearLayers(); routePolyline = null; }

/* ===== Boutons flottants ===== */
function createBottomButtons(map, normalTiles, satelliteTiles, labelsLayer) {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "2000";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "10px";

  const btnStyle = `background:#007bff;color:white;border:none;padding:8px 12px;border-radius:6px;
    cursor:pointer;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.2);`;

  const toggleBtn = document.createElement("button");
  toggleBtn.innerText = "🛰️ Vue satellite";
  toggleBtn.style.cssText = btnStyle;

  const posBtn = document.createElement("button");
  posBtn.innerText = "📍 Ma position";
  posBtn.style.cssText = btnStyle;

  toggleBtn.addEventListener("click", () => {
    satelliteMode = !satelliteMode;
    if (satelliteMode) {
      map.addLayer(satelliteTiles);
      map.addLayer(labelsLayer);
      map.removeLayer(normalTiles);
      toggleBtn.innerText = "🗺️ Vue normale";
    } else {
      map.addLayer(normalTiles);
      map.removeLayer(satelliteTiles);
      if (map.hasLayer(labelsLayer)) map.removeLayer(labelsLayer);
      toggleBtn.innerText = "🛰️ Vue satellite";
    }
  });

  posBtn.addEventListener("click", () => {
    if (userMarker) map.setView(userMarker.getLatLng(), 15);
    else alert("Localisation en cours...");
  });

  container.appendChild(toggleBtn);
  container.appendChild(posBtn);
  document.body.appendChild(container);
}

/* ===== Utilitaires ===== */
function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
