/* ===========================================================
   app.js — Version stable avec AUTH, ADMIN, clients et règles Firebase
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ---------- CONFIG FIREBASE ---------- */
const db = firebase.database();
const auth = firebase.auth();

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
let CURRENT_UID = null;

/* ===========================================================
   🔐 AUTH — Gestion du login/logout
   =========================================================== */
document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return document.getElementById("loginError").textContent = "Veuillez remplir tous les champs";

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      document.getElementById("loginError").textContent = "";
    })
    .catch(err => {
      document.getElementById("loginError").textContent = err.message;
    });
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

/* ---------- Affichage map après login ---------- */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    CURRENT_UID = user.uid;
    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";

    try {
      const adminSnap = await db.ref("admins/" + CURRENT_UID).get();
      isAdmin = adminSnap.exists();
      if (isAdmin) console.log("👑 Mode ADMIN activé");
    } catch(e) {
      console.warn("Erreur récupération admin :", e);
    }

    startApp();
  } else {
    CURRENT_UID = null;
    isAdmin = false;
    document.getElementById("loginContainer").style.display = "block";
    document.getElementById("map").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
    document.getElementById("controls").style.display = "none";
  }
});

/* ===========================================================
   🚀 APP PRINCIPALE
   =========================================================== */
function startApp() {
  createBottomButtons();
  watchPosition();
  listenClients();
  if (isAdmin) enableAdminTools();
}

/* ---------- GEOLOCALISATION ---------- */
function watchPosition() {
  if (!("geolocation" in navigator)) {
    console.warn("Géolocalisation non supportée");
    map.setView(defaultCenter, defaultZoom);
    return;
  }

  // 1️⃣ Première position rapide
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      }
      map.setView([lat, lng], 15);
    },
    (err) => {
      console.warn("Erreur géoloc initiale :", err);
      map.setView(defaultCenter, defaultZoom);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
  );

  // 2️⃣ Watch position en temps réel
  navigator.geolocation.watchPosition(
    (pos) => {
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
    (err) => {
      console.warn("Erreur géoloc watch :", err);
      // Timeout non bloquant
    },
    { enableHighAccuracy: false, maximumAge: 5000, timeout: 20000 }
  );
}

/* ---------- CLIENTS ---------- */
function listenClients() {
  if (!db || !CURRENT_UID) return;

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  db.ref(path).on("value", (snap) => {
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
  marker.bindPopup(popupClientHtml(livreurUid, id, c));
}

/* ---------- POPUP CLIENT ---------- */
function popupClientHtml(livreurUid, id, c) {
  const nom = c.name || c.nom || "Client";
  const safeNom = encodeURIComponent(nom);
  const safeLivreur = encodeURIComponent(livreurUid);
  const safeId = encodeURIComponent(id);

  return `
    <div style="font-size:13px;max-width:220px">
      <b>${nom}</b><br>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">
        <button onclick="calculerItineraire(${c.lat},${c.lng})"
          style="background:#0074FF;color:#fff;border:none;padding:6px;border-radius:5px;">🚗 Itinéraire</button>
        ${isAdmin ? `
        <button onclick="renommerClient('${safeLivreur}','${safeId}','${safeNom}')"
          style="background:#009688;color:#fff;border:none;padding:6px;border-radius:5px;">✏️ Modifier</button>
        <button onclick="supprimerClient('${safeLivreur}','${safeId}')"
          style="background:#e53935;color:#fff;border:none;padding:6px;border-radius:5px;">🗑️ Supprimer</button>` : ""}
      </div>
    </div>`;
}

/* ---------- GESTION CLIENTS ---------- */
function ajouterClient(livreurUid, lat, lng) {
  const nom = prompt("Nom du client :");
  if (!nom) return;
  db.ref(`clients/${livreurUid}`).push({ name: nom, lat, lng, createdAt: Date.now() });
}

function renommerClient(livreurUid, id, oldName) {
  const nouveau = prompt("Nouveau nom :", decodeURIComponent(oldName));
  if (!nouveau) return;
  db.ref(`clients/${livreurUid}/${id}/name`).set(nouveau);
}

function supprimerClient(livreurUid, id) {
  if (!confirm("Supprimer ce client ?")) return;
  db.ref(`clients/${livreurUid}/${id}`).remove();
}

/* ---------- OUTILS ADMIN ---------- */
function enableAdminTools() {
  map.on("contextmenu", (e) => {
    const livreurUid = prompt("UID du livreur pour ce client :");
    if (!livreurUid) return;
    ajouterClient(livreurUid, e.latlng.lat, e.latlng.lng);
  });
}

/* ---------- ITINÉRAIRE ---------- */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path) return alert("Aucun itinéraire trouvé.");
    const pts = path.points.coordinates.map(p => [p[1], p[0]]);
    routeLayer.clearLayers();
    L.polyline(pts, { color: "#0074FF", weight: 5 }).addTo(routeLayer);
  } catch(e) {
    console.error("Erreur itinéraire :", e);
    alert("Impossible de récupérer l’itinéraire.");
  }
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
