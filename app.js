// === INITIALISATION FIREBASE ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// === CONFIG FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXX",
  authDomain: "hanafi-dz.firebaseapp.com",
  projectId: "hanafi-dz",
  storageBucket: "hanafi-dz.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === VARIABLES GLOBALES ===
let map;
let markers = [];
let routeControl;
let currentPositionMarker;

// === INITIALISATION MAP ===
function initMap() {
  // ✅ Corrige l’erreur "Map container is being reused"
  if (window.map !== undefined && window.map !== null) {
    window.map.remove();
  }

  map = L.map("map").setView([36.75, 3.06], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  // ✅ Géolocalisation livreur
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(pos => {
      const { latitude, longitude } = pos.coords;
      if (currentPositionMarker) currentPositionMarker.setLatLng([latitude, longitude]);
      else currentPositionMarker = L.marker([latitude, longitude], { icon: blueIcon }).addTo(map);
    });
  }
}

// === ICONES ===
const blueIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
  iconSize: [35, 35],
});
const redIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149060.png",
  iconSize: [35, 35],
});

// === CHARGER LES CLIENTS ===
function listenClients() {
  const colRef = collection(db, "clients");
  onSnapshot(colRef, (snapshot) => {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.lat || !data.lng) return;

      const marker = L.marker([data.lat, data.lng], { icon: redIcon }).addTo(map);
      marker.bindPopup(createPopupContent(docSnap.id, data));
      markers.push(marker);
    });
  });
}

// === CRÉATION POPUP CLIENT ===
function createPopupContent(id, data) {
  return `
    <b>${data.nom}</b><br>
    <button class="btn-action" onclick="commander('${id}')">🛍️ Commander</button><br>
    <button class="btn-action" onclick="itineraire(${data.lat}, ${data.lng})">🚗 Itinéraire</button><br>
    <button class="btn-action" onclick="supprimerItineraire()">❌ Supprimer itinéraire</button><br>
    <button class="btn-action" onclick="modifierClient('${id}', '${data.nom}')">✏️ Modifier</button><br>
    <button class="btn-action" onclick="supprimerClient('${id}')">🗑️ Supprimer</button>
  `;
}

// === ITINÉRAIRE ===
function itineraire(lat, lng) {
  if (!currentPositionMarker) {
    alert("Position du livreur inconnue !");
    return;
  }
  const start = currentPositionMarker.getLatLng();

  if (routeControl) map.removeControl(routeControl);

  routeControl = L.Routing.control({
    waypoints: [L.latLng(start.lat, start.lng), L.latLng(lat, lng)],
    routeWhileDragging: false,
    lineOptions: { styles: [{ color: "blue", weight: 4 }] },
    createMarker: () => null
  })
    .on("routesfound", e => {
      const summary = e.routes[0].summary;
      const dist = (summary.totalDistance / 1000).toFixed(2);
      const time = Math.round(summary.totalTime / 60);
      alert(`🚗 Distance: ${dist} km\n⏱️ Durée: ${time} min`);
    })
    .addTo(map);
}

function supprimerItineraire() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
}

// === COMMANDER ===
function commander(id) {
  alert(`🛒 Commande pour le client ${id}`);
}

// === MODIFIER CLIENT ===
async function modifierClient(id, ancienNom) {
  const nouveauNom = prompt("Modifier le nom du client :", ancienNom);
  if (!nouveauNom) return;
  await updateDoc(doc(db, "clients", id), { nom: nouveauNom });
  alert("✅ Nom du client mis à jour !");
}

// === SUPPRIMER CLIENT ===
async function supprimerClient(id) {
  if (!confirm("Supprimer ce client ?")) return;
  await deleteDoc(doc(db, "clients", id));
  alert("🗑️ Client supprimé !");
}

// === BARRE DE RECHERCHE ===
const searchInput = document.getElementById("searchClient");
const clearBtn = document.getElementById("clearSearch");

searchInput.addEventListener("input", () => {
  const value = searchInput.value.toLowerCase();
  markers.forEach(marker => {
    const name = marker.getPopup().getContent().toLowerCase();
    const match = name.includes(value);
    marker.setOpacity(match ? 1 : 0.3);
  });
  highlightMatches(value);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  markers.forEach(marker => marker.setOpacity(1));
  removeHighlights();
});

// === SURBRILLANCE DES CORRESPONDANCES ===
function highlightMatches(query) {
  if (!query) return removeHighlights();
  document.querySelectorAll(".leaflet-popup-content b").forEach(el => {
    const text = el.textContent;
    const regex = new RegExp(`(${query})`, "gi");
    el.innerHTML = text.replace(regex, '<mark>$1</mark>');
  });
}

function removeHighlights() {
  document.querySelectorAll(".leaflet-popup-content b").forEach(el => {
    el.innerHTML = el.textContent;
  });
}

// === AUTHENTIFICATION ===
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("✅ Connecté :", user.email);
    initMap();
    listenClients();
  } else {
    console.log("❌ Déconnecté");
    signOut(auth);
  }
});
