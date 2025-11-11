/* ===========================================================
   app.js — VERSION STABILISÉE ADMIN + LIVREURS (Firebase v10)
   =========================================================== */

/* =========================
      🔥 INITIALISATION FIREBASE
========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAtDTNbi_vMSrtHpHigy00quXOLXyGnQ9c",
  authDomain: "hanafi-map.firebaseapp.com",
  databaseURL: "https://hanafi-map-default-rtdb.firebaseio.com",
  projectId: "hanafi-map",
  storageBucket: "hanafi-map.appspot.com",
  messagingSenderId: "463498073487",
  appId: "1:463498073487:web:0eec21e04a94fa342b37e8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/* =========================
      🌍 VARIABLES GLOBALES
========================= */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

let CURRENT_UID = null;
let isAdmin = false;
let map, routeLayer, clientsLayer, userMarker = null;
let geoWatchId = null;
let markers = [];
let clientsRef = null;

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

/* ===========================================================
   🗺️ INITIALISATION DE LA MAP
   =========================================================== */
function initMap() {
  // ✅ éviter le bug "container reused"
  if (map) {
    map.remove();
    map = null;
  }

  map = L.map("map", { zoomControl: true }).setView(defaultCenter, defaultZoom);

  const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20,
  });
  let satelliteMode = false;

  // couches
  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

  // ✅ bouton bas
  createBottomButtons(map, satelliteTiles, normalTiles, satelliteMode);

  // ✅ zone d’infos itinéraire
  if (!document.getElementById("routeInfo")) {
    const infoDiv = document.createElement("div");
    infoDiv.id = "routeInfo";
    infoDiv.style.cssText =
      "position:absolute;bottom:10px;left:10px;background:rgba(255,255,255,0.9);" +
      "padding:6px 10px;border-radius:8px;font-size:13px;box-shadow:0 0 6px rgba(0,0,0,0.2);" +
      "z-index:1500;display:none;";
    document.body.appendChild(infoDiv);
  }

  return map;
}

/* ===========================================================
   🔐 AUTHENTIFICATION
   =========================================================== */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    document.getElementById("loginError").textContent = "Veuillez remplir tous les champs.";
    return;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    CURRENT_UID = cred.user.uid;
    console.log("✅ Connecté :", email);
  } catch (err) {
    document.getElementById("loginError").textContent = "Erreur : " + err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    CURRENT_UID = user.uid;
    isAdmin = user.email === "admin@hanafi.dz";

    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";

    setTimeout(() => initMap(), 400);
    startApp();
  } else {
    cleanup();
  }
});

/* ===========================================================
   🚀 LANCEMENT APP
   =========================================================== */
function startApp() {
  watchPosition();
  listenClients();
  enableSearchClients();
}

/* ===========================================================
   🧹 CLEANUP
   =========================================================== */
function cleanup() {
  CURRENT_UID = null;
  isAdmin = false;
  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
  if (clientsRef) clientsRef.off();
  if (map) map.remove();
  document.getElementById("loginContainer").style.display = "block";
  document.getElementById("map").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("controls").style.display = "none";
}

/* ===========================================================
   📍 GEOLOCALISATION STABILISÉE
   =========================================================== */
function watchPosition() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée");
    return;
  }

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!map) return;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      else userMarker.setLatLng([lat, lng]);

      if (CURRENT_UID) {
        set(ref(db, `livreurs/${CURRENT_UID}`), { lat, lng, updatedAt: Date.now() }).catch(console.error);
      }
    },
    (err) => console.warn("Erreur géoloc :", err),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 60000 }
  );
}

/* ===========================================================
   👥 CLIENTS — AJOUT + ÉCOUTE
   =========================================================== */
function listenClients() {
  if (!CURRENT_UID) return;
  if (clientsRef) clientsRef.off();

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  clientsRef = ref(db, path);
  onValue(clientsRef, (snap) => {
    if (!clientsLayer) return;
    clientsLayer.clearLayers();
    markers = [];

    const data = snap.val();
    if (!data) return;

    if (isAdmin) {
      Object.entries(data).forEach(([uid, list]) =>
        Object.entries(list || {}).forEach(([id, c]) => addClientMarker(uid, id, c))
      );
    } else {
      Object.entries(data).forEach(([id, c]) => addClientMarker(CURRENT_UID, id, c));
    }
  });
}

function addClientMarker(livreurUid, id, c) {
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
  const marker = L.marker([c.lat, c.lng], { icon: clientIcon, nom: c.name || "Client" }).addTo(clientsLayer);
  marker.bindPopup(popupClientHtml(livreurUid, id, c));
  markers.push(marker);
}

/* ===========================================================
   📦 AJOUT MANUEL D'UN CLIENT (pour livreur)
   =========================================================== */
window.ajouterClient = async function () {
  if (!userMarker) return alert("⚠️ Activez votre géolocalisation d'abord !");
  const nom = prompt("Nom du nouveau client :");
  if (!nom) return;

  const pos = userMarker.getLatLng();
  const clientData = { name: nom.trim(), lat: pos.lat, lng: pos.lng, createdAt: Date.now() };

  const path = isAdmin ? "clients/admin" : `clients/${CURRENT_UID}`;
  await push(ref(db, path), clientData);
  alert("✅ Nouveau client ajouté !");
};

/* ===========================================================
   🚗 ITINÉRAIRE — DISTANCE & TEMPS
   =========================================================== */
async function calculerItineraire(lat, lng) {
  if (!userMarker) return alert("⚠️ Position non disponible !");
  const start = userMarker.getLatLng();
  const infoDiv = document.getElementById("routeInfo");
  routeLayer.clearLayers();

  try {
    const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lng}&point=${lat},${lng}&vehicle=car&locale=fr&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.paths || !data.paths.length) throw new Error("Aucun itinéraire trouvé");

    const path = data.paths[0];
    const distanceKm = (path.distance / 1000).toFixed(2);
    const dureeMin = Math.round(path.time / 60000);

    infoDiv.innerHTML = `🚗 <b>${distanceKm} km</b> — ⏱️ <b>${dureeMin} min</b>`;
    infoDiv.style.display = "block";

    const coords = path.points.coordinates.map((c) => [c[1], c[0]]);
    L.polyline(coords, { color: "#0074FF", weight: 4 }).addTo(routeLayer);
    map.fitBounds(L.polyline(coords).getBounds(), { padding: [40, 40] });
  } catch (err) {
    console.error(err);
    alert("❌ Erreur itinéraire");
  }
}

function supprimerItineraire() {
  routeLayer.clearLayers();
  document.getElementById("routeInfo").style.display = "none";
}

/* ===========================================================
   🔍 RECHERCHE CLIENTS
   =========================================================== */
function enableSearchClients() {
  const input = document.getElementById("searchClient");
  if (!input) return;
  input.addEventListener("input", (e) => filtrerClients(e.target.value.trim().toLowerCase()));
}

function filtrerClients(query) {
  markers.forEach((m) => {
    const nom = m.options.nom?.toLowerCase() || "";
    const visible = nom.includes(query);
    if (visible) map.addLayer(m);
    else map.removeLayer(m);
  });
}

/* ===========================================================
   🧭 BOUTONS FLOTTANTS
   =========================================================== */
function createBottomButtons(map, sat, normal, mode) {
  if (document.getElementById("mapButtons")) return;

  const box = document.createElement("div");
  box.id = "mapButtons";
  box.style = "position:absolute;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:2000";

  const btnSat = document.createElement("button");
  btnSat.textContent = "🛰️ Vue satellite";
  btnSat.onclick = () => {
    mode = !mode;
    if (mode) {
      map.addLayer(sat);
      map.removeLayer(normal);
      btnSat.textContent = "🗺️ Vue normale";
    } else {
      map.addLayer(normal);
      map.removeLayer(sat);
      btnSat.textContent = "🛰️ Vue satellite";
    }
  };
  btnSat.style.cssText = "background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;";

  const btnPos = document.createElement("button");
  btnPos.textContent = "📍 Ma position";
  btnPos.onclick = () => userMarker && map.setView(userMarker.getLatLng(), 16);
  btnPos.style.cssText = btnSat.style.cssText;

  const btnAdd = document.createElement("button");
  btnAdd.textContent = "➕ Ajouter client";
  btnAdd.onclick = () => ajouterClient();
  btnAdd.style.cssText = "background:#28a745;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;";

  box.append(btnSat, btnPos, btnAdd);
  document.body.appendChild(box);
}

/* ===========================================================
   EXPORTS HTML
   =========================================================== */
window.calculerItineraire = calculerItineraire;
window.supprimerItineraire = supprimerItineraire;
