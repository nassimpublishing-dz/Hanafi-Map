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

/* ---------- Déconnexion automatique après 10h ---------- */
let autoLogoutTimer = null;

firebase.auth().onAuthStateChanged(async user => {
  try {
    if (user) {
      currentUser = user;
      console.log("✅ Connecté :", user.email);
      if (loginContainer) loginContainer.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "block";
      if (mapDiv) mapDiv.style.display = "block";
      if (controls) controls.style.display = "flex";

      // --- DÉMARRAGE DU TIMER DE DÉCONNEXION AUTOMATIQUE ---
      if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
      autoLogoutTimer = setTimeout(async () => {
        console.warn("⏰ Session expirée — déconnexion automatique");
        alert("Votre session a expiré après 10h d’utilisation.\nVous allez être déconnecté.");
        try { await firebase.auth().signOut(); } catch(e) { console.warn(e); }
      }, 10 * 60 * 60 * 1000); // 10 heures = 36 000 000 ms

      // initialise / réinitialise la carte
      initMap();

      // démarre géoloc + écoute clients
      startGeolocAndListen();
    } else {
      console.log("❌ Déconnecté");
      currentUser = null;
      cleanupAfterLogout();

      // Stop le timer s’il existe
      if (autoLogoutTimer) {
        clearTimeout(autoLogoutTimer);
        autoLogoutTimer = null;
      }
    }
  } catch (e) {
    console.error("onAuthStateChanged error:", e);
  }
});

/* =================== MAP INIT (évite reuse error) =================== */
function initMap() {
  try {
    if (map) {
      map.remove();
      map = null;
    }
  } catch (e) {
    console.warn("Erreur lors de la suppression de la map existante :", e);
    map = null;
  }

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

/* =================== GEOLOCALISATION + ECOUTE CLIENTS =================== */
function startGeolocAndListen() {
  if (geoWatchId !== null) {
    try { navigator.geolocation.clearWatch(geoWatchId); } catch(_) {}
    geoWatchId = null;
  }
  if (clientsRef) {
    try { clientsRef.off(); } catch(_) {}
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
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000 });

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
    if (!data) return;
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
  const nom = escapeHtml(c.name || "Client");
  const safeLivreur = encodeURIComponent(livreurUid);
  const safeId = encodeURIComponent(id);
  const canEdit = (currentUser && currentUser.uid === livreurUid);

  return `
    <div style="font-size:13px;max-width:260px;">
      <b>${nom}</b><br>
      ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
      <div style="margin-top:8px;display:flex;gap:6px;flex-direction:column;">
        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🧭 Itinéraire</button>
        <button onclick="supprimerItineraire()" style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">❌ Enlever itinéraire</button>
        <button onclick="commanderClient('${safeLivreur}','${safeId}')" style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🛒 Passer commande</button>
        ${canEdit ? `<button onclick="renommerClient('${safeId}')" style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">✏️ Modifier</button>
                     <button onclick="supprimerClient('${safeId}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">🗑️ Supprimer</button>` : `<div style="font-size:12px;color:#777;padding-top:4px;">(Modification réservée)</div>`}
      </div>
    </div>
  `;
}
