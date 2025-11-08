/***************************************************************
 * app.js — Version complète et corrigée
 * -------------------------------------------------------------
 * Fonctions :
 *  - Authentifie le livreur selon l’URL (?livreur=1..6)
 *  - Met à jour la position GPS en temps réel dans Firebase
 *  - Affiche les clients sur la carte
 *  - Permet de calculer un itinéraire + distance + durée
 *  - Boutons : vue satellite et ma position
 ***************************************************************/

// === CONFIG LIVREURS ===
const livreurEmails = {
  1: "livreur1@hanafi.dz",
  2: "livreur2@hanafi.dz",
  3: "livreur3@hanafi.dz",
  4: "livreur4@hanafi.dz",
  5: "livreur5@hanafi.dz",
  6: "livreur6@hanafi.dz"
};

const livreurPassword = "hanafi2025"; // Mot de passe commun à tous

// === INITIALISATION FIREBASE ===
if (typeof firebase !== "undefined" && (!firebase.apps || firebase.apps.length === 0)) {
  firebase.initializeApp(window.firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

// === AUTHENTIFICATION AUTOMATIQUE ===
const urlParams = new URLSearchParams(window.location.search);
const livreurId = urlParams.get("livreur");
const email = livreurEmails[livreurId];

if (!email) {
  alert("Aucun identifiant de livreur valide dans l’URL !");
  throw new Error("livreur non défini");
}

// Connexion anonyme (email préconfiguré)
auth
  .signInWithEmailAndPassword(email, livreurPassword)
  .then((userCredential) => {
    console.log("✅ Connecté :", userCredential.user.email);
    initMap(); // lance la carte après connexion
  })
  .catch((error) => {
    console.error("Erreur de connexion :", error.message);
    alert("Erreur de connexion : " + error.message);
  });

// === INITIALISATION DE LA CARTE ===
let map, markerLivreur, routingControl;
let osmLayer, satelliteLayer;

function initMap() {
  map = L.map("map").setView([36.7525, 3.042], 12);

  osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  satelliteLayer = L.tileLayer(
    "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    { attribution: "© Google Satellite" }
  );

  markerLivreur = L.marker([36.7525, 3.042]).addTo(map);
  markerLivreur.bindPopup("📦 Vous êtes ici (Livreur " + livreurId + ")").openPopup();

  trackPosition();
  addUIButtons();
  loadClients();
}

// === TRACKING GPS EN TEMPS RÉEL ===
function trackPosition() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n’est pas supportée sur ce navigateur.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      markerLivreur.setLatLng([latitude, longitude]);
      map.setView([latitude, longitude]);

      // Envoi dans Firebase
      const ref = db.ref("livreurs/livreur_" + livreurId);
      ref.set({
        lat: latitude,
        lng: longitude,
        timestamp: Date.now()
      }).catch(err => console.warn("Erreur Firebase:", err));
    },
    (err) => console.error("Erreur GPS :", err),
    { enableHighAccuracy: true }
  );
}

// === CHARGEMENT DES CLIENTS ===
function loadClients() {
  db.ref("clients").on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    Object.keys(data).forEach((key) => {
      const client = data[key];
      if (!client.lat || !client.lng) return;

      const marker = L.marker([client.lat, client.lng]).addTo(map);
      marker.bindPopup(
        `<b>${client.nom || "Client"}</b><br>
         <button onclick="itineraireVers(${client.lat}, ${client.lng})">Itinéraire</button>`
      );
    });
  });
}

// === ITINÉRAIRE VERS UN CLIENT ===
function itineraireVers(lat, lng) {
  if (routingControl) map.removeControl(routingControl);

  routingControl = L.Routing.control({
    waypoints: [
      markerLivreur.getLatLng(),
      L.latLng(lat, lng)
    ],
    routeWhileDragging: false,
    geocoder: L.Control.Geocoder.nominatim(),
    show: false
  })
    .on("routesfound", function (e) {
      const route = e.routes[0];
      const distanceKm = (route.summary.totalDistance / 1000).toFixed(2);
      const dureeMin = Math.round(route.summary.totalTime / 60);
      showRouteSummary(distanceKm, dureeMin);
    })
    .addTo(map);
}

// === AFFICHAGE DE LA DISTANCE / DURÉE ===
function showRouteSummary(distance, duree) {
  const box = document.getElementById("routeSummary");
  box.style.display = "block";
  box.innerHTML = `🚗 Distance : <b>${distance} km</b> — ⏱️ Durée : <b>${duree} min</b>`;
  setTimeout(() => (box.style.display = "none"), 15000);
}

// === AJOUT DES BOUTONS INTERACTIFS ===
function addUIButtons() {
  // 📍 Ma position
  const myPosBtn = L.control({ position: "bottomright" });
  myPosBtn.onAdd = function () {
    const div = L.DomUtil.create("div", "btn");
    div.textContent = "📍 Ma position";
    div.onclick = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
          () => alert("Impossible d’obtenir la position.")
        );
      }
    };
    return div;
  };
  myPosBtn.addTo(map);

  // 🗺️ Vue satellite
  const satelliteBtn = L.control({ position: "bottomleft" });
  satelliteBtn.onAdd = function () {
    const div = L.DomUtil.create("div", "btn");
    div.textContent = "🗺️ Vue satellite";
    div.onclick = () => {
      if (map.hasLayer(osmLayer)) {
        map.removeLayer(osmLayer);
        map.addLayer(satelliteLayer);
        div.textContent = "🗺️ Vue carte";
      } else {
        map.removeLayer(satelliteLayer);
        map.addLayer(osmLayer);
        div.textContent = "🗺️ Vue satellite";
      }
    };
    return div;
  };
  satelliteBtn.addTo(map);
}
