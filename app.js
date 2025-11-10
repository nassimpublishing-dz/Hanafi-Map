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
function initMap() {
  if (map) return map;
  map = L.map("map").setView(defaultCenter, defaultZoom);
  normalTiles.addTo(map);
  routeLayer.addTo(map);
  clientsLayer.addTo(map);
  return map;
}

const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
const satelliteTiles = L.tileLayer(
  "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20 }
);
let satelliteMode = false;

let routeLayer = L.layerGroup();
let clientsLayer = L.layerGroup();

let userMarker = null;
let geoWatchId = null;
let clientsRef = null;
let isAdmin = false;
let CURRENT_UID = null;

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
  auth
    .signInWithEmailAndPassword(email, password)
    .then(() => console.log("✅ Connexion réussie"))
    .catch((err) => {
      document.getElementById("loginError").textContent = err.message;
    });
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
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
  enableAddClient();
  if (isAdmin) enableAdminTools();
}

/* ---------- CLEANUP ---------- */
function cleanup() {
  document.getElementById("loginContainer").style.display = "block";
  document.getElementById("map").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("controls").style.display = "none";

  if (geoWatchId !== null) {
    try {
      navigator.geolocation.clearWatch(geoWatchId);
    } catch (_) {}
    geoWatchId = null;
  }
  if (clientsRef) {
    clientsRef.off();
    clientsRef = null;
  }
  if (routeLayer) routeLayer.clearLayers();
  if (clientsLayer) clientsLayer.clearLayers();
  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }
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
    try {
      navigator.geolocation.clearWatch(geoWatchId);
    } catch (_) {}
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    },
    (err) => {
      console.warn("Erreur géoloc initiale :", err);
      map.setView(defaultCenter, defaultZoom);
    }
  );

  geoWatchId = navigator.geolocation.watchPosition(
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
          .catch((e) => console.warn("Firebase write err:", e));
      }
    },
    (err) => console.warn("Erreur géoloc watch :", err),
    { enableHighAccuracy: false, maximumAge: 8000, timeout: 30000 }
  );
}

/* ===========================================================
   👥 CLIENTS
   =========================================================== */
function listenClients() {
  if (!db || !CURRENT_UID) return;
  if (clientsRef) clientsRef.off();

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  clientsRef = db.ref(path);
  clientsRef.on("value", (snap) => {
    clientsLayer.clearLayers();
    const data = snap.val();
    if (!data) return;
    if (isAdmin) {
      Object.entries(data).forEach(([uid, list]) => {
        Object.entries(list || {}).forEach(([id, c]) => addClientMarker(uid, id, c));
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

/* ===========================================================
   🔹 POPUP CLIENT COMPLET + actions associées
   =========================================================== */
function popupClientHtml(livreurUid, id, c) {
  const nom = c.name || "Client";
  const safeNom = encodeURIComponent(nom);
  const safeLivreur = encodeURIComponent(livreurUid);
  const safeId = encodeURIComponent(id);
  const canEdit =
    (typeof isAdmin !== "undefined" && isAdmin) ||
    (typeof CURRENT_UID !== "undefined" && livreurUid === CURRENT_UID);

  return `
    <div style="font-size:13px;max-width:260px;display:flex;flex-direction:column;gap:8px;">
      <b>${nom}</b>
      <div style="color:#555;font-size:12px;">${c.adresse ? escapeHtml(c.adresse) : ""}</div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <button onclick="calculerItineraire(${c.lat},${c.lng})"
          style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;">
          🚗 Itinéraire
        </button>

        <button onclick="supprimerItineraire()"
          style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;">
          ❌ Supprimer itinéraire
        </button>

        <button onclick="commanderClient('${safeLivreur}','${safeId}','${safeNom}')"
          style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;">
          🧾 Passer commande
        </button>

        ${
          canEdit
            ? `
          <button onclick="renommerClient('${safeLivreur}','${safeId}','${safeNom}')"
            style="background:#009688;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;">
            ✏️ Modifier nom
          </button>

          <button onclick="supprimerClient('${safeLivreur}','${safeId}')"
            style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer;">
            🗑️ Supprimer client
          </button>
        `
            : `<div style="font-size:12px;color:#777;padding-top:4px;">(Actions de modification réservées)</div>`
        }
      </div>
    </div>
  `;
}

/* ---------- SUPPRIMER L’ITINÉRAIRE ACTIF ---------- */
function supprimerItineraire() {
  try {
    if (routeLayer && routeLayer.clearLayers) {
      routeLayer.clearLayers();
      if (typeof routePolyline !== "undefined" && routePolyline) routePolyline = null;
      alert("🗑️ Itinéraire supprimé.");
    } else {
      alert("⚠️ Aucun itinéraire actif à supprimer.");
    }
  } catch (e) {
    console.error("Erreur suppression itinéraire:", e);
    alert("❌ Erreur lors de la suppression de l'itinéraire.");
  }
}

/* ---------- PASSER UNE COMMANDE ---------- */
function commanderClient(livreurUid, clientId, nomClient) {
  const nameDecoded = decodeURIComponent(nomClient || "");
  const produit = prompt(`Quel produit souhaite commander ${nameDecoded} ?`);
  if (!produit) return;

  const commande = {
    produit: produit.trim(),
    date: new Date().toISOString(),
    status: "en attente",
    par: CURRENT_UID || "anonymous",
  };

  db.ref(`commandes/${decodeURIComponent(livreurUid)}/${decodeURIComponent(clientId)}`)
    .push(commande)
    .then(() => alert("✅ Commande enregistrée avec succès !"))
    .catch((err) => {
      console.error("Erreur commande:", err);
      alert("❌ Erreur lors de l'enregistrement de la commande : " + (err.message || err));
    });
}

/* ---------- RENOMMER CLIENT ---------- */
function renommerClient(livreurUid, id, oldNameEncoded) {
  const oldName = decodeURIComponent(oldNameEncoded || "");
  const nouveau = prompt("Nouveau nom :", oldName);
  if (!nouveau) return;
  try {
    const path = `clients/${decodeURIComponent(livreurUid)}/${decodeURIComponent(id)}/name`;
    db.ref(path)
      .set(nouveau)
      .then(() => alert("✅ Nom mis à jour."))
      .catch((err) => {
        console.error("Erreur renommage:", err);
        alert("❌ Erreur lors du renommage : " + (err.message || err));
      });
  } catch (e) {
    console.error("Erreur construction path renommage:", e);
    alert("❌ Erreur inattendue lors du renommage.");
  }
}

/* ---------- SUPPRIMER CLIENT ---------- */
function supprimerClient(livreurUid, id) {
  if (!confirm("Supprimer définitivement ce client ?")) return;
  const livreurDecoded = decodeURIComponent(livreurUid);
  const idDecoded = decodeURIComponent(id);
  const path = `clients/${livreurDecoded}/${idDecoded}`;
  db.ref(path)
    .remove()
    .then(() => alert("✅ Client supprimé."))
    .catch((err) => {
      console.error("Erreur suppression client:", err);
      alert("❌ Erreur lors de la suppression : " + (err.message || err));
    });
}

/* ---------- ESCAPE HTML ---------- */
function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

/* ===========================================================
   🚗 ITINÉRAIRE
   =========================================================== */
async function calculerItineraire(destLat, destLng) {
  if (!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path) return alert("Aucun itinéraire trouvé.");
    const pts = path.points.coordinates.map((p) => [p[1], p[0]]);
    routeLayer.clearLayers();
    L.polyline(pts, { color: "#0074FF", weight: 5 }).addTo(routeLayer);
  } catch (e) {
    console.error("Erreur itinéraire :", e);
    alert("Impossible de récupérer l’itinéraire.");
  }
}

/* ===========================================================
   🧭 BOUTONS FLOTTANTS
   =========================================================== */
function createBottomButtons() {
  if (document.getElementById("mapButtons")) return;
  const c = document.createElement("div");
  c.id = "mapButtons";
  c.style =
    "position:absolute;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:2000";

  const makeBtn = (txt) => {
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
