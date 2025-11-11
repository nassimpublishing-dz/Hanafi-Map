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

  // ✅ zone d’infos itinéraire
  const infoDiv = document.createElement("div");
  infoDiv.id = "routeInfo";
  infoDiv.style.cssText =
    "position:absolute;bottom:10px;left:10px;background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:8px;font-size:13px;box-shadow:0 0 6px rgba(0,0,0,0.2);z-index:1500;display:none;";
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

  const info = document.getElementById("routeInfo");
  if (info) info.style.display = "none";
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
   👥 CLIENTS
   =========================================================== */
let markers = [];

function listenClients() {
  if (!db || !CURRENT_UID) return;
  if (clientsRef) clientsRef.off();

  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  clientsRef = db.ref(path);
  clientsRef.on("value", snap => {
    clientsLayer.clearLayers();
    markers = [];
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
  const marker = L.marker([c.lat, c.lng], { icon: clientIcon, nom: c.name || "Client" }).addTo(clientsLayer);
  marker.bindPopup(popupClientHtml(livreurUid, id, c));
  markers.push(marker);
}

/* ===========================================================
   🔹 POPUP CLIENT COMPLET
   =========================================================== */
function popupClientHtml(livreurUid, id, c) {
  const nom = c.name || "Client";
  const safeNom = encodeURIComponent(nom);
  const safeLivreur = encodeURIComponent(livreurUid);
  const safeId = encodeURIComponent(id);
  const canEdit = isAdmin || livreurUid === CURRENT_UID;

  return `
    <div style="font-size:13px;max-width:230px;display:flex;flex-direction:column;gap:6px;">
      <b>${nom}</b>
      <div style="margin-top:4px;display:flex;flex-direction:column;gap:5px;">
        <button onclick="calculerItineraire(${c.lat},${c.lng})"
          style="background:#0074FF;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">
          🚗 Itinéraire
        </button>

        <button onclick="supprimerItineraire()"
          style="background:#555;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">
          ❌ Supprimer itinéraire
        </button>

        <button onclick="commanderClient('${safeLivreur}','${safeId}','${safeNom}')"
          style="background:#FF9800;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">
          🧾 Commander
        </button>

        ${canEdit ? `
          <button onclick="renommerClient('${safeLivreur}','${safeId}','${safeNom}')"
            style="background:#009688;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">
            ✏️ Modifier nom
          </button>

          <button onclick="supprimerClient('${safeLivreur}','${safeId}')"
            style="background:#e53935;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">
            🗑️ Supprimer client
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

/* ===========================================================
   🚗 ITINÉRAIRE (Optimisé via GraphHopper)
   =========================================================== */
let routeControl = null;

async function calculerItineraire(lat, lng) {
  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas supportée sur cet appareil.");
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    const start = [pos.coords.latitude, pos.coords.longitude];
    const end = [lat, lng];
    const infoDiv = document.getElementById("routeInfo");

    // Supprimer itinéraire précédent
    routeLayer.clearLayers();

    try {
      const url = `https://graphhopper.com/api/1/route?point=${start[0]},${start[1]}&point=${end[0]},${end[1]}&vehicle=car&locale=fr&key=${GRAPHHOPPER_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.paths || !data.paths.length) throw new Error("Aucun itinéraire trouvé");

      const path = data.paths[0];
      const distanceKm = (path.distance / 1000).toFixed(2);
      const dureeMin = Math.round(path.time / 60000);

      // Affichage infos sous la carte
      infoDiv.innerHTML = `🚗 <b>Distance :</b> ${distanceKm} km — ⏱️ <b>Durée :</b> ${dureeMin} min`;
      infoDiv.style.display = "block";

      // Tracé sur la carte
      const coords = path.points.coordinates.map(c => [c[1], c[0]]);
      const polyline = L.polyline(coords, { color: "#0074FF", weight: 4 }).addTo(routeLayer);

      // Centrer la carte sur l’itinéraire
      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });

    } catch (err) {
      console.error("Erreur itinéraire :", err);
      alert("❌ Impossible de calculer l'itinéraire.");
    }
  });
}

function supprimerItineraire() {
  routeLayer.clearLayers();
  const infoDiv = document.getElementById("routeInfo");
  if (infoDiv) infoDiv.style.display = "none";
}

/* ===========================================================
   🧾 COMMANDES + MODIFS CLIENTS
   =========================================================== */
function commanderClient(livreurUid, clientId, nomClient) {
  const produit = prompt("Quel produit souhaite commander " + decodeURIComponent(nomClient) + " ?");
  if (!produit) return;

  const commande = {
    produit: produit.trim(),
    date: new Date().toISOString(),
    status: "en attente",
    par: CURRENT_UID
  };

  db.ref(`commandes/${livreurUid}/${clientId}`).push(commande)
    .then(() => alert("✅ Commande enregistrée avec succès !"))
    .catch(err => alert("❌ Erreur : " + err.message));
}

function renommerClient(livreurUid, id, oldName) {
  const nouveau = prompt("Nouveau nom :", decodeURIComponent(oldName));
  if (!nouveau) return;
  db.ref(`clients/${livreurUid}/${id}/name`).set(nouveau)
    .then(() => alert("✅ Nom mis à jour."))
    .catch(err => alert("❌ Erreur : " + err.message));
}

function supprimerClient(livreurUid, id) {
  if (!confirm("Supprimer définitivement ce client ?")) return;
  db.ref(`clients/${livreurUid}/${id}`).remove()
    .then(() => alert("✅ Client supprimé."))
    .catch(err => alert("❌ Erreur : " + err.message));
}

/* ===========================================================
   🔍 RECHERCHE CLIENTS (avec bouton ❌ et surbrillance)
   =========================================================== */
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

    if (query === "" || match) {
      map.addLayer(m);
    } else {
      map.removeLayer(m);
    }
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
