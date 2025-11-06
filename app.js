/* ===========================================================
   ✅ HANAfi MAP — Version multi-livreurs + bouton commande
   =========================================================== */

/* ========== CONFIG ========== */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 14;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ========== IDENTIFIANT DU LIVREUR (depuis URL) ========== */
// Exemple : https://nassimpublishing-dz.github.io/Hanafi-Map/?livreur=2
const urlParams = new URLSearchParams(window.location.search);
const LIVREUR_ID = "livreur_" + (urlParams.get("livreur") || "1");

/* ========== MAP INIT ========== */
const map = L.map("map", { center: defaultCenter, zoom: defaultZoom });

const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  maxZoom: 20,
  subdomains: ["mt0", "mt1", "mt2", "mt3"]
});

const labelsLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png", {
  subdomains: ["a","b","c","d"],
  maxZoom: 20,
  attribution: "© OpenStreetMap contributors, © CartoDB",
  opacity: 1.0
});
labelsLayer.on("tileload", e => {
  try { e.tile.style.filter = "contrast(180%) brightness(80%)"; } catch (err) {}
});

/* ========== ICONES ========== */
const clientIcon = L.icon({
  iconUrl: "icons/magasin-delectronique.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42]
});
const livreurIcon = L.icon({
  iconUrl: "icons/camion-dexpedition.png",
  iconSize: [50, 50],
  iconAnchor: [25, 50]
});

/* ========== FIREBASE ========== */
const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "hanafi-livraison.firebaseapp.com",
  databaseURL: "https://hanafi-livraison-default-rtdb.firebaseio.com/",
  projectId: "hanafi-livraison",
  storageBucket: "hanafi-livraison.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXX:web:XXXXXXXXXXXXXX"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ========== VARIABLES ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let routePolyline = null;
let satelliteMode = false;
const clientMarkers = [];

/* ========== UTILS ========== */
const $id = id => document.getElementById(id);
function escapeHtml(s) {
  return (s||"").toString().replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

/* ========== CLIENTS ========== */
function ajouterClient(lat, lng) {
  const name = prompt("Nom du client ?");
  if (!name) return;
  const ref = db.ref(`clients/${LIVREUR_ID}`).push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}
function supprimerClient(id) {
  if (!confirm("❌ Supprimer ce client ?")) return;
  db.ref(`clients/${LIVREUR_ID}/${id}`).remove();
}
function renommerClient(id, oldName) {
  const n = prompt("Nouveau nom :", oldName);
  if (n) db.ref(`clients/${LIVREUR_ID}/${id}/name`).set(n);
}

/* ========== POPUP CLIENT ========== */
function popupClientHtml(c) {
  const commandeUrl = "https://ton-lien-de-commande.com"; // 🛒 à remplacer plus tard
  return `
    <div style="font-size:13px;">
      <b>${escapeHtml(c.name)}</b><br>
      <small style="color:#555">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br><br>

      <button onclick="window.open('${commandeUrl}','_blank')"
        style="width:100%;padding:6px;background:#28a745;color:#fff;border:none;border-radius:4px;margin-bottom:6px;">
        🛒 Passer commande
      </button><br>

      <button onclick="calculerItineraire(${c.lat},${c.lng})"
        style="width:100%;padding:6px;background:#0074FF;color:#fff;border:none;border-radius:4px;margin-bottom:6px;">
        🚗 Itinéraire
      </button><br>

      <button onclick="clearItinerary()"
        style="width:100%;padding:6px;background:#ff9800;color:#fff;border:none;border-radius:4px;margin-bottom:6px;">
        🧭 Enlever l’itinéraire
      </button><br>

      <button onclick="renommerClient('${c.id}','${escapeHtml(c.name)}')"
        style="width:100%;padding:6px;background:#009688;color:#fff;border:none;border-radius:4px;margin-bottom:6px;">
        ✏️ Modifier nom
      </button><br>

      <button onclick="supprimerClient('${c.id}')"
        style="width:100%;padding:6px;background:#e53935;color:#fff;border:none;border-radius:4px;">
        🗑️ Supprimer
      </button>
    </div>
  `;
}

/* ========== SYNCHRO FIREBASE ========== */
function listenClients() {
  db.ref(`clients/${LIVREUR_ID}`).on("value", snap => {
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if (!data) return;

    Object.entries(data).forEach(([id, c]) => {
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
      c.id = id;
      const m = L.marker([c.lat, c.lng], { icon: clientIcon });
      m.bindPopup(popupClientHtml(c));
      m.clientName = (c.name || "").toLowerCase();
      m.clientData = c;
      clientsLayer.addLayer(m);
      clientMarkers.push(m);
    });
  });
}

/* ========== GÉOLOCALISATION ========== */
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (!userMarker) {
      userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    } else userMarker.setLatLng([lat, lng]);
    try { db.ref(`livreurs/${LIVREUR_ID}`).set({ lat, lng, updatedAt: Date.now() }); } catch(e) {}
  }, e => console.warn("geo err", e), { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
}

/* ========== ITINÉRAIRE ========== */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const pts = data.paths?.[0]?.points?.coordinates?.map(p => [p[1], p[0]]);
    if (!pts) throw new Error("no geometry");
    routeLayer.clearLayers();
    routePolyline = L.polyline(pts, { color: "#0074FF", weight: 5, opacity: 0.95 }).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(), { padding: [60, 60], maxZoom: 17 });
  } catch (e) { alert("Erreur itinéraire"); }
}
function clearItinerary() {
  routeLayer.clearLayers();
  routePolyline = null;
}

/* ========== BOUTONS EN BAS ========== */
function createBottomButtons() {
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

createBottomButtons();

/* clic droit = ajout client */
map.on("contextmenu", e => ajouterClient(e.latlng.lat, e.latlng.lng));

/* Écoute Firebase */
listenClients();
