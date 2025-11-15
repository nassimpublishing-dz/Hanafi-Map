/* ===========================================================
   app.js — Version finale (Firebase v8) — stable & robuste
   Compatible avec l'index.html fourni
   =========================================================== */

const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 17;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ---------- SÉLECTEURS ---------- */
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
let routeLayer = null;
let routePolyline = null;
let clientsLayer = null;
let markers = [];
let geoWatchId = null;
let clientsRef = null;
let currentUser = null;

/* ---------- AJOUT : TIMER DÉCONNEXION AUTO ---------- */
let autoLogoutTimer = null;

/* ---------- ICONES ---------- */
const clientIcon = L.icon({ iconUrl: "/Hanafi-Map/magasin-delectronique.png", iconSize: [42,42], iconAnchor:[21,42] });
const livreurIcon = L.icon({ iconUrl: "/Hanafi-Map/camion-dexpedition.png", iconSize: [48,48], iconAnchor:[24,48] });

/* ---------- Vérifie Firebase ---------- */
if (typeof firebase === "undefined") {
  console.error("Firebase non chargé — vérifie l'inclusion du SDK dans index.html");
}

/* ---------- LOGIN ---------- */
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

/* ---------- LOGOUT ---------- */
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await firebase.auth().signOut();
    } catch (e) {
      console.warn("Erreur logout :", e);
    }
  });
}

/* ===========================================================
   SURVEILLANCE AUTH + AUTO-LOGOUT 10h
   =========================================================== */
firebase.auth().onAuthStateChanged(async user => {
  try {
    if (user) {
      currentUser = user;
      console.log("🔵 Connecté :", user.email);

      /* ---------- AUTO LOGOUT APRÈS 10H ---------- */
      if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
      autoLogoutTimer = setTimeout(() => {
        alert("⏳ Votre session a expiré après 10 heures. Déconnexion automatique.");
        firebase.auth().signOut();
      }, 36000000); // 10 heures
      /* ------------------------------------------ */

      if (loginContainer) loginContainer.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (mapDiv) mapDiv.style.display = "block";
      if (controls) controls.style.display = "flex";

      initMap();
      startGeolocAndListen();
    } else {
      console.log("🔴 Déconnecté");

      /* ---------- STOP TIMER ---------- */
      if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
      autoLogoutTimer = null;
      /* -------------------------------- */

      currentUser = null;
      cleanupAfterLogout();
    }
  } catch (e) {
    console.error("onAuthStateChanged error:", e);
  }
});

/* ===========================================================
   INIT MAP
   =========================================================== */
function initMap() {
  try {
    if (map) {
      map.remove();
      map = null;
    }
  } catch (_) {}

  map = L.map("map", { center: defaultCenter, zoom: defaultZoom });

  const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20
  });

  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

  map.on("contextmenu", e => {
    if (!currentUser) return alert("Connecte-toi pour ajouter un client.");
    const nom = prompt("Nom du client :");
    if (!nom) return;
    firebase.database().ref(`clients/${currentUser.uid}`).push({
      name: nom, lat: e.latlng.lat, lng: e.latlng.lng, createdAt: Date.now()
    });
  });

  setTimeout(() => map.invalidateSize(), 250);

  createBottomButtons(normalTiles, satelliteTiles);
}

/* ===========================================================
   GÉOLOCALISATION + CLIENTS
   =========================================================== */
function startGeolocAndListen() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  if (clientsRef) {
    clientsRef.off();
    clientsRef = null;
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    });

    geoWatchId = navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;

      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      else userMarker.setLatLng([lat, lng]);

      if (currentUser)
        firebase.database().ref(`livreurs/${currentUser.uid}`).set({ lat, lng, updatedAt: Date.now() });
    });
  }

  clientsRef = firebase.database().ref(`clients/${currentUser.uid}`);
  clientsRef.on("value", snap => {
    clientsLayer.clearLayers();
    markers = [];
    const data = snap.val();
    if (!data) return;

    Object.entries(data).forEach(([id, c]) => {
      const marker = L.marker([c.lat, c.lng], { icon: clientIcon });
      marker.bindPopup(popupClientHtml(currentUser.uid, id, c));
      marker.clientName = (c.name || "").toLowerCase();
      marker.clientData = c;
      marker.clientDataId = id;
      clientsLayer.addLayer(marker);
      markers.push(marker);
    });
  });
}

/* ===========================================================
   POPUP CLIENT
   =========================================================== */
function popupClientHtml(uid, id, c) {
  const nom = escapeHtml(c.name || "Client");
  const safeUid = encodeURIComponent(uid);
  const safeId = encodeURIComponent(id);
  return `
    <div style="font-size:13px;max-width:260px;">
      <b>${nom}</b><br>
      ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
      <div style="margin-top:8px;display:flex;gap:6px;flex-direction:column;">
        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🧭 Itinéraire</button>
        <button onclick="supprimerItineraire()" style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">❌ Enlever itinéraire</button>
        <button onclick="commanderClient('${safeUid}','${safeId}')" style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">📦 Passer commande</button>
        <button onclick="renommerClient('${safeId}')" style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">✏️ Modifier</button>
        <button onclick="supprimerClient('${safeId}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

/* ===========================================================
   ITINÉRAIRES
   =========================================================== */
async function calculerItineraire(destLat, destLng) {
  routeLayer.clearLayers();
  if (!userMarker) return alert("Localisation en attente...");

  const me = userMarker.getLatLng();
  const infoDiv = document.getElementById("routeSummary");
  infoDiv.style.display = "block";
  infoDiv.textContent = "⏳ Calcul en cours...";

  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const path = data.paths?.[0];
    if (!path) throw new Error();

    const coords = path.points.coordinates.map(p => [p[1], p[0]]);
    routePolyline = L.polyline(coords, { color: "#0074FF", weight: 5 }).addTo(routeLayer);

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50], maxZoom: 17 });

    const km = (path.distance / 1000).toFixed(2);
    const min = Math.round(path.time / 60000);

    infoDiv.innerHTML = `🚗 <b>Distance</b>: ${km} km — ⏱️ <b>Durée</b>: ${min} min`;
  } catch {
    infoDiv.textContent = "❌ Impossible de calculer l'itinéraire.";
  }
}

function supprimerItineraire() {
  if (routeLayer) routeLayer.clearLayers();
  routePolyline = null;
  routeSummary.style.display = "none";
  routeSummary.textContent = "";
}

/* ===========================================================
   COMMANDES / CRUD
   =========================================================== */
function commanderClient(uidEnc, idEnc) {
  const uid = decodeURIComponent(uidEnc);
  const id = decodeURIComponent(idEnc);
  const produit = prompt("Quel produit ?");
  if (!produit) return;
  firebase.database().ref(`commandes/${uid}/${id}`).push({
    produit: produit.trim(),
    date: new Date().toISOString(),
    status: "en attente",
    par: currentUser ? currentUser.uid : "anonymous"
  });
  alert("📦 Commande enregistrée");
}

function renommerClient(idEnc) {
  const id = decodeURIComponent(idEnc);
  const n = prompt("Nouveau nom :");
  if (!n) return;
  firebase.database().ref(`clients/${currentUser.uid}/${id}/name`).set(n);
}

function supprimerClient(idEnc) {
  const id = decodeURIComponent(idEnc);
  if (!confirm("Supprimer ce client ?")) return;
  firebase.database().ref(`clients/${currentUser.uid}/${id}`).remove();
}

/* ===========================================================
   RECHERCHE CLIENTS
   =========================================================== */
function enableSearch() {
  if (!searchInput || !clearSearchBtn) return;
  function toggleBtn() {
    clearSearchBtn.style.display = searchInput.value ? "block" : "none";
  }
  searchInput.addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    filterMarkers(q);
    toggleBtn();
  });
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    filterMarkers("");
    toggleBtn();
  });
  toggleBtn();
}

function filterMarkers(query) {
  markers.forEach(m => {
    const match = !query || m.clientName.includes(query);
    if (match) clientsLayer.addLayer(m);
    else clientsLayer.removeLayer(m);
  });
}

function escapeHtml(s){
  return (s||"").toString().replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/* ===========================================================
   BOUTONS FLOTTANTS
   =========================================================== */
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

  const btnStyle = `background:#007bff;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:14px;`;

  const toggleBtn = document.createElement("button");
  toggleBtn.innerText = "🛰️ Vue satellite";
  toggleBtn.style.cssText = btnStyle;

  const posBtn = document.createElement("button");
  posBtn.innerText = "📍 Ma position";
  posBtn.style.cssText = btnStyle;

  toggleBtn.addEventListener("click", () => {
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

/* ===========================================================
   CLEANUP
   =========================================================== */
function cleanupAfterLogout() {
  if (loginContainer) loginContainer.style.display = "block";
  if (mapDiv) mapDiv.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (controls) controls.style.display = "none";

  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId = null;

  if (clientsRef) clientsRef.off();
  clientsRef = null;

  if (routeLayer) routeLayer.clearLayers();
  if (clientsLayer) clientsLayer.clearLayers();

  if (map) { map.remove(); map = null; }

  markers = [];
  userMarker = null;
  routePolyline = null;

  routeSummary.style.display = "none";
  routeSummary.textContent = "";
}

/* ===========================================================
   INIT
   =========================================================== */
enableSearch();
