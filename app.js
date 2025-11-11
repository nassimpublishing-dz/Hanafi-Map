/* ===========================================================
   app.js — Version ADMIN + LIVREURS (Firebase v10 Modulaire)
   =========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

/* ---------- CONFIG FIREBASE ---------- */
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

/* ---------- VARIABLES ---------- */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 15;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

let map, userMarker, routeLayer, clientsLayer;
let geoWatchId = null;
let CURRENT_UID = null;
let isAdmin = false;
let clientsRef = null;

/* ---------- ICONES ---------- */
const clientIcon = L.icon({
  iconUrl: "/Hanafi-Map/magasin-delectronique.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42]
});
const livreurIcon = L.icon({
  iconUrl: "/Hanafi-Map/camion-dexpedition.png",
  iconSize: [48, 48],
  iconAnchor: [24, 48]
});

/* ===========================================================
   🔐 AUTHENTIFICATION
   =========================================================== */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    document.getElementById("loginError").textContent = "Veuillez remplir tous les champs";
    return;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    CURRENT_UID = cred.user.uid;
    console.log("✅ Connecté :", email);
    isAdmin = email.includes("admin"); // simple règle pour reconnaître admin
  } catch (err) {
    document.getElementById("loginError").textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth);
  cleanup();
});

/* ---------- SURVEILLER L'ÉTAT ---------- */
onAuthStateChanged(auth, user => {
  if (user) {
    CURRENT_UID = user.uid;
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";
    initMap();
    watchPosition();
    listenClients();
  } else {
    cleanup();
  }
});

/* ===========================================================
   🗺️ INITIALISATION DE LA CARTE
   =========================================================== */
function initMap() {
  if (map) {
    map.off();
    map.remove();
  }

  map = L.map("map").setView(defaultCenter, defaultZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
  }).addTo(map);

  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

  // Ajouter bouton "➕ Client"
  createMapButtons();

  // Ajouter client par clic sur la carte
  map.on("click", e => {
    if (!CURRENT_UID) return alert("Veuillez vous connecter !");
    const nom = prompt("Nom du client ?");
    if (!nom) return;
    const { lat, lng } = e.latlng;
    const newClient = { name: nom, lat, lng, createdAt: Date.now() };
    const path = isAdmin ? `clients/admin` : `clients/${CURRENT_UID}`;
    push(ref(db, path), newClient)
      .then(() => alert("✅ Client ajouté"))
      .catch(err => alert("Erreur ajout client : " + err.message));
  });
}

/* ===========================================================
   📍 GEOLOCALISATION
   =========================================================== */
function watchPosition() {
  if (!navigator.geolocation) {
    alert("Géolocalisation non supportée");
    return;
  }

  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);

  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], defaultZoom);
      } else userMarker.setLatLng([lat, lng]);

      if (CURRENT_UID)
        set(ref(db, "livreurs/" + CURRENT_UID), { lat, lng, updatedAt: Date.now() });
    },
    err => {
      console.warn("Erreur géoloc :", err.message);
      map.setView(defaultCenter, defaultZoom);
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 8000 }
  );
}

/* ===========================================================
   👥 CLIENTS (écoute en temps réel)
   =========================================================== */
function listenClients() {
  if (!CURRENT_UID) return;
  if (clientsRef) clientsRef.off();

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  clientsRef = ref(db, path);

  onValue(clientsRef, snap => {
    clientsLayer.clearLayers();
    const data = snap.val();
    if (!data) return;
    Object.entries(data).forEach(([uid, val]) => {
      // pour admin : structure différente
      if (isAdmin && typeof val === "object") {
        Object.entries(val).forEach(([id, c]) => addClientMarker(id, c));
      } else {
        addClientMarker(uid, val);
      }
    });
  });
}

function addClientMarker(id, c) {
  if (!c.lat || !c.lng) return;
  const m = L.marker([c.lat, c.lng], { icon: clientIcon }).addTo(clientsLayer);
  m.bindPopup(`
    <b>${c.name || "Client"}</b><br>
    <button onclick="calculerItineraire(${c.lat},${c.lng})">🚗 Itinéraire</button>
    <button onclick="supprimerItineraire()">❌ Supprimer</button>
  `);
}

/* ===========================================================
   🚗 ITINÉRAIRE AVEC GRAPHHOPPER
   =========================================================== */
async function calculerItineraire(lat, lng) {
  if (!navigator.geolocation) return alert("Géolocalisation non supportée");
  navigator.geolocation.getCurrentPosition(async pos => {
    const start = [pos.coords.latitude, pos.coords.longitude];
    const end = [lat, lng];
    routeLayer.clearLayers();

    try {
      const url = `https://graphhopper.com/api/1/route?point=${start[0]},${start[1]}&point=${end[0]},${end[1]}&vehicle=car&locale=fr&key=${GRAPHHOPPER_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const path = data.paths?.[0];
      if (!path) throw new Error("Aucun itinéraire trouvé");

      const distanceKm = (path.distance / 1000).toFixed(2);
      const dureeMin = Math.round(path.time / 60000);

      // Tracé
      const coords = path.points.coordinates.map(c => [c[1], c[0]]);
      const line = L.polyline(coords, { color: "#0074FF", weight: 5 }).addTo(routeLayer);
      map.fitBounds(line.getBounds(), { padding: [40, 40] });

      alert(`🚗 Distance : ${distanceKm} km — ⏱️ Durée : ${dureeMin} min`);
    } catch (err) {
      alert("Erreur calcul itinéraire : " + err.message);
    }
  });
}

function supprimerItineraire() {
  routeLayer.clearLayers();
}

/* ===========================================================
   🧭 BOUTONS FLOTTANTS
   =========================================================== */
function createMapButtons() {
  if (document.getElementById("mapButtons")) return;

  const div = document.createElement("div");
  div.id = "mapButtons";
  div.style = "position:absolute;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:2000";

  const btnPos = document.createElement("button");
  btnPos.textContent = "📍 Ma position";
  btnPos.onclick = () => {
    if (userMarker) map.setView(userMarker.getLatLng(), 16);
  };

  div.appendChild(btnPos);
  document.body.appendChild(div);
}

/* ===========================================================
   🧹 CLEANUP
   =========================================================== */
function cleanup() {
  CURRENT_UID = null;
  isAdmin = false;
  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId = null;

  if (map) { map.off(); map.remove(); map = null; }

  document.getElementById("loginContainer").style.display = "block";
  document.getElementById("map").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("controls").style.display = "none";
}

/* ===========================================================
   EXPORTS
   =========================================================== */
window.calculerItineraire = calculerItineraire;
window.supprimerItineraire = supprimerItineraire;
