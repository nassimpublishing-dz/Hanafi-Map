/* ===========================================================
   app.js — Version finale (Firebase v8) — stable & robuste
   Ajout : Barre de recherche avec bouton (X) effacer
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

/* ---------- Sécurité : vérifie que Firebase est chargé ---------- */
if (typeof firebase === "undefined") {
  console.error("Firebase non chargé — vérifie l'inclusion du SDK dans index.html");
}

/* ---------- LOGIN / LOGOUT ---------- */
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

/* ---------- SURVEILLER AUTH ---------- */
firebase.auth().onAuthStateChanged(async user => {
  try {
    if (user) {
      currentUser = user;
      console.log("✅ Connecté :", user.email);
      if (loginContainer) loginContainer.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (mapDiv) mapDiv.style.display = "block";
      if (controls) controls.style.display = "flex";
      initMap();
      startGeolocAndListen();
      setupClientSearch(); // <== active la recherche ici
    } else {
      console.log("❌ Déconnecté");
      currentUser = null;
      cleanupAfterLogout();
    }
  } catch (e) {
    console.error("onAuthStateChanged error:", e);
  }
});

/* =================== INITIALISATION MAP =================== */
function initMap() {
  try {
    if (map) {
      map.remove();
      map = null;
    }
  } catch (_) {
    map = null;
  }

  map = L.map("map", { center: defaultCenter, zoom: defaultZoom });

  const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20
  });

  routeLayer = L.layerGroup().addTo(map);
  clientsLayer = L.layerGroup().addTo(map);

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

  setTimeout(() => { try { map.invalidateSize(); } catch(_){} }, 250);
  createBottomButtons(normalTiles, satelliteTiles);
}

/* =================== GEOLOCALISATION + CLIENTS =================== */
function startGeolocAndListen() {
  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch (_) {}
    geoWatchId = null;
  }
  if (clientsRef) {
    try { clientsRef.off(); } catch (_) {}
    clientsRef = null;
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat, lng], 15);
    }, err => {
      console.warn("Erreur géoloc initiale :", err);
      map.setView(defaultCenter, defaultZoom);
    });

    geoWatchId = navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
        map.setView([lat, lng], 15);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      if (currentUser && currentUser.uid) {
        const path = `livreurs/${currentUser.uid}`;
        firebase.database().ref(path).set({ lat, lng, updatedAt: Date.now() })
          .catch(e => console.warn("Firebase write err:", e));
      }
    }, err => console.warn("geo watch error", err));
  }

  if (!currentUser || !currentUser.uid) return;
  const path = `clients/${currentUser.uid}`;
  clientsRef = firebase.database().ref(path);
  clientsRef.on("value", snap => {
    clientsLayer.clearLayers();
    markers = [];
    const data = snap.val();
    if (!data) return;
    Object.entries(data).forEach(([id, c]) => {
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
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

/* =================== POPUP CLIENT =================== */
function popupClientHtml(livreurUid, id, c) {
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
                     <button onclick="supprimerClient('${safeId}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🗑️ Supprimer</button>` : ""}
      </div>
    </div>
  `;
}

/* =================== BARRE DE RECHERCHE CLIENTS =================== */
function setupClientSearch() {
  const searchArea = document.getElementById("searchArea") || controls;
  if (!searchArea) return;

  const searchContainer = document.createElement('div');
  searchContainer.style.position = 'relative';
  searchContainer.style.display = 'inline-block';
  searchContainer.style.width = '250px';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '🔍 Rechercher un client...';
  searchInput.id = 'searchClient';
  searchInput.style.width = '100%';
  searchInput.style.padding = '8px 28px 8px 8px';
  searchInput.style.borderRadius = '8px';
  searchInput.style.border = '1px solid #ccc';
  searchInput.style.outline = 'none';

  const clearButton = document.createElement('span');
  clearButton.textContent = '✖';
  clearButton.style.position = 'absolute';
  clearButton.style.right = '8px';
  clearButton.style.top = '50%';
  clearButton.style.transform = 'translateY(-50%)';
  clearButton.style.cursor = 'pointer';
  clearButton.style.color = '#888';
  clearButton.style.fontSize = '14px';
  clearButton.style.display = 'none';

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.style.display = 'none';
    filterMarkers('');
  });

  searchInput.addEventListener('input', () => {
    clearButton.style.display = searchInput.value.length > 0 ? 'block' : 'none';
    filterMarkers(searchInput.value.toLowerCase());
  });

  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(clearButton);
  searchArea.appendChild(searchContainer);
}

/* =================== FILTRE MARKERS =================== */
function filterMarkers(query) {
  markers.forEach(m => {
    const name = (m.clientName || "").toLowerCase();
    const match = query === "" || name.includes(query);
    if (match) {
      if (!clientsLayer.hasLayer(m)) clientsLayer.addLayer(m);
    } else {
      try { clientsLayer.removeLayer(m); } catch (_) {}
    }
  });
}

/* =================== AUTRES FONCTIONS EXISTANTES =================== */
function escapeHtml(s) {
  return (s||"").toString().replace(/[&<>"']/g,m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function cleanupAfterLogout() {
  if (loginContainer) loginContainer.style.display = "block";
  if (mapDiv) mapDiv.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (controls) controls.style.display = "none";
  if (geoWatchId !== null) { try { navigator.geolocation.clearWatch(geoWatchId); } catch(_) {} geoWatchId = null; }
  if (clientsRef) { try { clientsRef.off(); } catch(_) {} clientsRef = null; }
  try { if (routeLayer) routeLayer.clearLayers(); if (clientsLayer) clientsLayer.clearLayers(); if (map) { map.remove(); map = null; } } catch(_) {}
  if (routeSummary) { routeSummary.style.display = "none"; routeSummary.textContent = ""; }
  markers = [];
  userMarker = null;
  routePolyline = null;
  currentUser = null;
}
