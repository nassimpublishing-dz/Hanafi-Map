/* ===========================================================
   app.js — Version avec AUTH, ADMIN et gestion clients/livreurs
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ---------- PARAMS ---------- */
const urlParams = new URLSearchParams(window.location.search);
const LIVREUR_INDEX = urlParams.get("livreur") || "1";
const LIVREUR_ID = "livreur_" + LIVREUR_INDEX;

/* ---------- CONFIG FIREBASE ---------- */
if (typeof firebase !== "undefined") {
  if (!firebase.apps.length && window.firebaseConfig) {
    firebase.initializeApp(window.firebaseConfig);
  }
}

const db = firebase.database();
const auth = firebase.auth();

/* ---------- LISTE DES UTILISATEURS ---------- */
const livreurEmails = {
  1: "livreur1@hanafi.dz",
  2: "livreur2@hanafi.dz",
  3: "livreur3@hanafi.dz",
  4: "livreur4@hanafi.dz",
  5: "livreur5@hanafi.dz",
  6: "livreur6@hanafi.dz",
  admin: "admin@hanafi.dz",
};
const livreurPasswords = {
  1: "hanafi001",
  2: "hanafi002",
  3: "hanafi003",
  4: "hanafi004",
  5: "hanafi005",
  6: "hanafi006",
  admin: "adminhanafi",
};

/* ---------- ICONES ---------- */
const clientIcon = L.icon({ iconUrl: "/Hanafi-Map/magasin-delectronique.png", iconSize: [42,42], iconAnchor:[21,42] });
const livreurIcon = L.icon({ iconUrl: "/Hanafi-Map/camion-dexpedition.png", iconSize: [48,48], iconAnchor:[24,48] });

/* ---------- MAP ---------- */
const map = L.map("map").setView(defaultCenter, defaultZoom);
const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20
});
let satelliteMode = false;

let userMarker = null;
let routeLayer = L.layerGroup().addTo(map);
let clientsLayer = L.layerGroup().addTo(map);
let isAdmin = false;

/* ===========================================================
   🔐 AUTH — Suivi d’état Firebase
   =========================================================== */

let CURRENT_UID = null;

if (typeof firebase !== "undefined" && typeof firebase.auth === "function") {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      CURRENT_UID = user.uid;
      console.log("✅ Connecté :", user.email, "uid:", CURRENT_UID);
      if (user.email === livreurEmails.admin) {
        isAdmin = true;
        console.log("👑 Mode ADMIN activé");
      }
      startApp(); // démarre l'app
    } else {
      CURRENT_UID = null;
      console.log("❌ Déconnecté");
    }
  });
} else {
  // Pas d’auth disponible (SDK manquant)
  startApp();
}

/* ===========================================================
   🚀 FONCTIONS PRINCIPALES
   =========================================================== */

function startApp() {
  createBottomButtons();
  watchPosition();
  listenClients();
  if (isAdmin) enableAdminTools();
}

/* ---------- GEOLOC : push position sous /livreurs/<uid> ---------- */
function watchPosition() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else userMarker.setLatLng([lat, lng]);

      try {
        if (db) {
          const targetPath = CURRENT_UID ? `livreurs/${CURRENT_UID}` : `livreurs/${LIVREUR_ID}`;
          db.ref(targetPath).set({ lat, lng, updatedAt: Date.now() })
            .catch(e => console.warn("Firebase write err:", e));
        }
      } catch(e){
        console.warn("Firebase write err", e);
      }
    },
    (err) => console.warn("Erreur géoloc", err),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

/* ---------- CLIENTS : écoute sous /clients/<uid> ---------- */
function listenClients() {
  if (!db) {
    console.warn("DB non initialisée — impossible d'écouter les clients");
    return;
  }

  const path = () => (isAdmin ? "clients" : (CURRENT_UID ? `clients/${CURRENT_UID}` : `clients/${LIVREUR_ID}`));

  try { db.ref().off(); } catch(e){}

  db.ref(path()).on("value", (snap) => {
    clientsLayer.clearLayers();
    const data = snap.val();
    if (!data) return;

    if (isAdmin) {
      Object.entries(data).forEach(([livreurId, clients]) => {
        Object.entries(clients).forEach(([id, c]) => addClientMarker(livreurId, id, c));
      });
    } else {
      Object.entries(data).forEach(([id, c]) => addClientMarker(LIVREUR_ID, id, c));
    }
  });
}

/* ---------- Ajout des marqueurs clients ---------- */
function addClientMarker(livreurId, id, c) {
  if (!c || !c.lat || !c.lng) return;
  const marker = L.marker([c.lat, c.lng], { icon: clientIcon }).addTo(clientsLayer);
  marker.bindPopup(popupClientHtml(livreurId, id, c));
}

/* ---------- POPUP CLIENT ---------- */
function popupClientHtml(livreurId, id, c) {
  const nom = c.name || c.nom || "Client";
  return `
    <div style="font-size:13px;max-width:220px">
      <b>${nom}</b><br>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">
        <button onclick="calculerItineraire(${c.lat},${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:6px;border-radius:5px;">🚗 Itinéraire</button>
        ${isAdmin ? `
        <button onclick="renommerClient('${livreurId}','${id}','${nom}')" style="background:#009688;color:#fff;border:none;padding:6px;border-radius:5px;">✏️ Modifier</button>
        <button onclick="supprimerClient('${livreurId}','${id}')" style="background:#e53935;color:#fff;border:none;padding:6px;border-radius:5px;">🗑️ Supprimer</button>` : ""}
      </div>
    </div>`;
}

/* ---------- GESTION CLIENTS ---------- */
function ajouterClient(livreurId, lat, lng) {
  const nom = prompt("Nom du client :");
  if (!nom) return;
  const ref = db.ref(`clients/${livreurId}`).push();
  ref.set({ name: nom, lat, lng, createdAt: Date.now() });
}
function renommerClient(livreurId, id, oldName) {
  const nouveau = prompt("Nouveau nom :", oldName);
  if (!nouveau) return;
  db.ref(`clients/${livreurId}/${id}/name`).set(nouveau);
}
function supprimerClient(livreurId, id) {
  if (!confirm("Supprimer ce client ?")) return;
  db.ref(`clients/${livreurId}/${id}`).remove();
}

/* ---------- ADMIN TOOLS ---------- */
function enableAdminTools() {
  map.on("contextmenu", (e) => {
    const livreurTarget = prompt("Ajouter pour quel livreur ? (ex: 1, 2, 3...)");
    if (!livreurTarget) return;
    const livreurId = "livreur_" + livreurTarget;
    ajouterClient(livreurId, e.latlng.lat, e.latlng.lng);
  });
}

/* ---------- ITINÉRAIRE ---------- */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const path = data.paths?.[0];
  if (!path) return alert("Aucun itinéraire trouvé.");
  const pts = path.points.coordinates.map(p => [p[1], p[0]]);
  routeLayer.clearLayers();
  L.polyline(pts, { color: "#0074FF", weight: 5 }).addTo(routeLayer);
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
