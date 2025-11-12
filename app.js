/* ===========================================================
   app.js — Version finale (Firebase v8) — stable & robuste
   Compatible avec l'index.html que tu as fourni
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ---------- SÉLECTEURS (sûrs) ---------- */
const loginContainer = document.getElementById("loginContainer");
const mapDiv = document.getElementById("map");
const logoutBtn = document.getElementById("logoutBtn");
const controls = document.getElementById("controls");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const routeSummary = document.getElementById("routeSummary");

/* ---------- ETAT GLOBAL ---------- */
let map = null;
let userMarker = null;
let routeLayer = null;      // L.layerGroup pour polyline
let routePolyline = null;   // polyline actuelle
let clientsLayer = null;    // L.layerGroup pour clients
let markers = [];           // tableau des marqueurs clients
let geoWatchId = null;
let clientsRef = null;      // ref firebase pour off()
let currentUser = null;

/* ---------- ICONES ---------- */
const clientIcon = L.icon({ iconUrl: "/Hanafi-Map/magasin-delectronique.png", iconSize: [42,42], iconAnchor:[21,42] });
const livreurIcon = L.icon({ iconUrl: "/Hanafi-Map/camion-dexpedition.png", iconSize: [48,48], iconAnchor:[24,48] });

/* ---------- Sécurité : vérifie que Firebase est chargé ---------- */
if (typeof firebase === "undefined") {
  console.error("Firebase non chargé — vérifie l'inclusion du SDK dans index.html");
}

/* ---------- BOUTONS LOGIN / LOGOUT (protection si absent) ---------- */
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const email = (emailInput?.value || "").trim();
    const password = (passwordInput?.value || "");
    if (!email || !password) {
      if (loginError) loginError.textContent = "Veuillez entrer vos identifiants.";
      return;
    }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      if (loginError) loginError.textContent = "";
    } catch (e) {
      console.error("Auth failed:", e);
      if (loginError) loginError.textContent = "Identifiants incorrects.";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await firebase.auth().signOut();
    } catch (e) {
      console.warn("Erreur logout :", e);
    }
  });
}

/* ---------- Surveiller l'état d'authentification ---------- */
firebase.auth().onAuthStateChanged(async user => {
  try {
    if (user) {
      currentUser = user;
      console.log("✅ Connecté :", user.email);
      if (loginContainer) loginContainer.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (mapDiv) mapDiv.style.display = "block";
      if (controls) controls.style.display = "flex";

      // initialise / réinitialise la carte
      initMap();

      // démarre géoloc + écoute clients
      startGeolocAndListen();
    } else {
      console.log("❌ Déconnecté");
      currentUser = null;
      cleanupAfterLogout();
    }
  } catch (e) {
    console.error("onAuthStateChanged error:", e);
  }
});

/* =================== MAP INIT (évite reuse error) =================== */
function initMap() {
  // retire map précédente proprement (évite "Map container is being reused")
  try {
    if (map) {
      map.remove();
      map = null;
    }
  } catch (e) {
    console.warn("Erreur lors de la suppression de la map existante :", e);
    map = null;
  }

  // crée la nouvelle map
  map = L.map("map", { center: defaultCenter, zoom: defaultZoom });

  // couches
  const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20
  });

  // layers pour route et clients
  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

  // crée le résumé d'itinéraire si absent
  if (routeSummary) {
    // nothing
  } else if (routeSummary === null && document.getElementById("routeSummary")) {
    // exists in DOM, ok
  }

  // clic droit: ajouter client pour utilisateur courant (admin peut modifier code)
  map.on("contextmenu", e => {
    if (!currentUser) return alert("Connecte-toi pour ajouter un client.");
    const nom = prompt("Nom du client :");
    if (!nom) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const path = `clients/${currentUser.uid}`;
    try {
      firebase.database().ref(path).push({ name: nom, lat, lng, createdAt: Date.now() });
    } catch (err) {
      console.warn("Firebase write err", err);
      alert("Impossible d'ajouter le client (droits Firebase?).");
    }
  });

  // évite problème d'affichage initial quand map était cachée
  setTimeout(() => { try { map.invalidateSize(); } catch(_){} }, 250);

  // ajoute boutons flottants
  createBottomButtons(normalTiles, satelliteTiles);
}

/* =================== GEOLOCALISATION + ECOUTE CLIENTS =================== */
function startGeolocAndListen() {
  // stop anciens watchers/listeners si existants
  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch(_) {}
    geoWatchId = null;
  }
  if (clientsRef) {
    try { clientsRef.off(); } catch(_) {}
    clientsRef = null;
  }

  // première position rapide
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    }, err => {
      console.warn("Erreur géoloc initiale :", err);
      map.setView(defaultCenter, defaultZoom);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000 });

    // watch en continu
    geoWatchId = navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else {
        userMarker.setLatLng([lat, lng]);
      }

      // n'écrit dans Firebase que si currentUser existe
      if (currentUser && currentUser.uid) {
        const path = `livreurs/${currentUser.uid}`;
        try {
          firebase.database().ref(path).set({ lat, lng, updatedAt: Date.now() })
            .catch(e => console.warn("Firebase write err:", e));
        } catch (e) {
          console.warn("Firebase write exception:", e);
        }
      }
    }, err => console.warn("geo watch error", err), { enableHighAccuracy: false, maximumAge: 8000, timeout: 30000 });
  } else {
    console.warn("Géolocalisation non disponible");
  }

  // écoute clients (clients/<uid>)
  if (!currentUser || !currentUser.uid) {
    console.warn("Utilisateur non défini — impossible d'écouter clients.");
    return;
  }
  const path = `clients/${currentUser.uid}`;
  clientsRef = firebase.database().ref(path);
  clientsRef.on("value", snap => {
    clientsLayer.clearLayers();
    markers = [];
    const data = snap.val();
    if (!data) {
      // nothing
      return;
    }
    Object.entries(data).forEach(([id, c]) => {
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
      const marker = L.marker([c.lat, c.lng], { icon: clientIcon });
      marker.bindPopup(popupClientHtml(currentUser.uid, id, c));
      marker.clientName = (c.name || "").toLowerCase();
      marker.clientData = c;
      clientsLayer.addLayer(marker);
      markers.push(marker);
    });
  });
}

/* =================== POPUP CLIENT (complet) =================== */
function popupClientHtml(livreurUid, id, c) {
  // safe values
  const nom = escapeHtml(c.name || "Client");
  const safeLivreur = encodeURIComponent(livreurUid);
  const safeId = encodeURIComponent(id);
  const canEdit = (currentUser && currentUser.uid === livreurUid);

  return `
    <div style="font-size:13px;max-width:260px;">
      <b>${nom}</b><br>
      ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
      <div style="margin-top:8px;display:flex;gap:6px;flex-direction:column;">
        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🚗 Itinéraire</button>
        <button onclick="supprimerItineraire()" style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">❌ Enlever itinéraire</button>
        <button onclick="commanderClient('${safeLivreur}','${safeId}')" style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🧾 Passer commande</button>
        ${canEdit ? `<button onclick="renommerClient('${safeId}')" style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">✏️ Modifier</button>
                     <button onclick="supprimerClient('${safeId}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🗑️ Supprimer</button>` : `<div style="font-size:12px;color:#777;padding-top:4px;">(Modification réservée)</div>`}
      </div>
    </div>
  `;
}

/* =================== Itinéraire via GraphHopper (affiche résumé sous la carte) =================== */
async function calculerItineraire(destLat, destLng) {
  // clear previous
  try { routeLayer.clearLayers(); } catch(_) {}
  if (!userMarker) return alert("Localisation en attente...");

  const me = userMarker.getLatLng();
  const infoDiv = document.getElementById("routeSummary");
  if (infoDiv) {
    infoDiv.style.display = "block";
    infoDiv.textContent = "⏳ Calcul en cours...";
  }

  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path) throw new Error("Aucun trajet trouvé");

    // draw
    const coords = (path.points && path.points.coordinates)
      ? path.points.coordinates.map(p => [p[1], p[0]])
      : [];

    if (coords.length) {
      routePolyline = L.polyline(coords, { color: "#0074FF", weight: 5, opacity: 0.95 }).addTo(routeLayer);
      map.fitBounds(routePolyline.getBounds(), { padding: [60,60], maxZoom: 17 });
    }

    const distanceKm = (path.distance / 1000).toFixed(2);
    const dureeMin = Math.round(path.time / 60000);
    if (infoDiv) infoDiv.innerHTML = `🚗 <b>Distance</b> : ${distanceKm} km — ⏱️ <b>Durée</b> : ${dureeMin} min`;
  } catch (e) {
    console.error("Erreur itinéraire :", e);
    if (infoDiv) infoDiv.textContent = "❌ Impossible de calculer l'itinéraire.";
    alert("Impossible de calculer l'itinéraire.");
  }
}

function supprimerItineraire() {
  try {
    if (routeLayer) routeLayer.clearLayers();
    if (routePolyline) routePolyline = null;
    const infoDiv = document.getElementById("routeSummary");
    if (infoDiv) { infoDiv.style.display = "none"; infoDiv.textContent = ""; }
  } catch (e) {
    console.warn("Erreur suppression itinéraire :", e);
  }
}

/* =================== Commande / CRUD clients =================== */
function commanderClient(livreurEnc, clientIdEnc) {
  const livreurUid = decodeURIComponent(livreurEnc);
  const clientId = decodeURIComponent(clientIdEnc);
  const produit = prompt("Quel produit commander ?");
  if (!produit) return;
  const path = `commandes/${livreurUid}/${clientId}`;
  try {
    firebase.database().ref(path).push({
      produit: produit.trim(),
      date: new Date().toISOString(),
      status: "en attente",
      par: currentUser ? currentUser.uid : "anonymous"
    });
    alert("✅ Commande enregistrée");
  } catch (e) {
    console.warn("Erreur commande:", e);
    alert("Erreur création commande (droits Firebase?).");
  }
}

function renommerClient(clientIdEnc) {
  const clientId = decodeURIComponent(clientIdEnc);
  const nouveau = prompt("Nouveau nom :");
  if (!nouveau) return;
  if (!currentUser || !currentUser.uid) return alert("Utilisateur non connecté");
  const path = `clients/${currentUser.uid}/${clientId}/name`;
  firebase.database().ref(path).set(nouveau).then(() => alert("✅ Nom mis à jour")).catch(e => { console.warn(e); alert("Erreur (droits?)."); });
}

function supprimerClient(clientIdEnc) {
  const clientId = decodeURIComponent(clientIdEnc);
  if (!confirm("Supprimer définitivement ce client ?")) return;
  if (!currentUser || !currentUser.uid) return alert("Utilisateur non connecté");
  const path = `clients/${currentUser.uid}/${clientId}`;
  firebase.database().ref(path).remove().then(()=> alert("✅ Client supprimé")).catch(e => { console.warn(e); alert("Erreur (droits?)."); });
}

/* =================== Recherche clients (avec bouton clear + surbrillance) =================== */
function enableSearch() {
  if (!searchInput || !clearSearchBtn) return;

  function updateClearVisibility() {
    clearSearchBtn.style.display = (searchInput.value && searchInput.value.trim() !== "") ? "block" : "none";
  }

  searchInput.addEventListener("input", e => {
    const q = (e.target.value || "").trim().toLowerCase();
    updateClearVisibility();
    filterMarkers(q);
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    updateClearVisibility();
    filterMarkers("");
  });

  updateClearVisibility();
}

function filterMarkers(query) {
  markers.forEach(m => {
    const name = (m.clientName || "").toLowerCase();
    const match = query === "" || name.includes(query);
    // toggle layer
    if (match) {
      if (!clientsLayer.hasLayer(m)) clientsLayer.addLayer(m);
    } else {
      try { clientsLayer.removeLayer(m); } catch(_) {}
    }

    // highlight popup content by replacing <mark> in popup only when opened
    const popupContent = m.getPopup()?.getContent?.() || "";
    // We will not mutate popup stored HTML here (keeps original), instead update when opening:
    m.off("popupopen");
    m.on("popupopen", () => {
      if (query && name.includes(query)) {
        const regex = new RegExp(`(${escapeRegExp(query)})`, "ig");
        const rawName = m.clientData?.name || "";
        const highlighted = rawName.replace(regex, "<mark>$1</mark>");
        // rebuild popup (keep same actions)
        const c = m.clientData;
        m.setPopupContent && m.setPopupContent(
          `<div style="font-size:13px;max-width:260px;">
            <b>${escapeHtml(highlighted)}</b><br>
            ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
            <div style="margin-top:8px;display:flex;gap:6px;flex-direction:column;">
              <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🚗 Itinéraire</button>
              <button onclick="supprimerItineraire()" style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">❌ Enlever itinéraire</button>
              <button onclick="commanderClient('${encodeURIComponent(currentUser.uid)}','${encodeURIComponent(m.clientDataId || "")}')" style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🧾 Passer commande</button>
            </div>
          </div>`
        );
      }
    });
  });
  // remove global marks from DOM (if any)
  document.querySelectorAll("mark").forEach(n => n.style.background = "yellow");
}

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* =================== UTIL =================== */
function escapeHtml(s) {
  return (s||"").toString().replace(/[&<>"']/g,m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* =================== BOUTONS FLOTTANTS =================== */
function createBottomButtons(normalTiles, satelliteTiles) {
  if (!map || document.getElementById("mapButtons")) return;
  const container = document.createElement("div");
  container.id = "mapButtons";
  container.style.position = "absolute";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "2000";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "10px";

  const btnStyle = `background:#007bff;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.2);`;

  const toggleBtn = document.createElement("button");
  toggleBtn.innerText = "🛰️ Vue satellite";
  toggleBtn.style.cssText = btnStyle;

  const posBtn = document.createElement("button");
  posBtn.innerText = "📍 Ma position";
  posBtn.style.cssText = btnStyle;

  toggleBtn.addEventListener("click", () => {
    if (!satelliteTiles) return;
    if (map.hasLayer(satelliteTiles)) {
      map.removeLayer(satelliteTiles);
      toggleBtn.innerText = "🛰️ Vue satellite";
    } else {
      satelliteTiles.addTo(map);
      toggleBtn.innerText = "🗺️ Vue normale";
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

/* =================== CLEANUP après logout =================== */
function cleanupAfterLogout() {
  // UI
  if (loginContainer) loginContainer.style.display = "block";
  if (mapDiv) mapDiv.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (controls) controls.style.display = "none";

  // stop geoloc
  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch(_) {}
    geoWatchId = null;
  }

  // stop firebase listeners
  if (clientsRef) {
    try { clientsRef.off(); } catch(_) {}
    clientsRef = null;
  }

  // clear map layers
  try {
    if (routeLayer) routeLayer.clearLayers();
    if (clientsLayer) clientsLayer.clearLayers();
    if (map) { map.remove(); map = null; }
  } catch (e) {
    console.warn("Cleanup map error:", e);
  }

  // hide route summary
  if (routeSummary) { routeSummary.style.display = "none"; routeSummary.textContent = ""; }

  // reset state
  markers = [];
  userMarker = null;
  routePolyline = null;
  currentUser = null;
}

/* =================== DÉMARRAGE : active la recherche si DOM OK =================== */
enableSearch();
