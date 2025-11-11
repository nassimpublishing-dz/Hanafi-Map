/* ===========================================================
   app.js — Version ADMIN + LIVREURS (Firebase v8) Optimisée
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
let map, routeLayer = L.layerGroup(), clientsLayer = L.layerGroup();
let userMarker = null, geoWatchId = null, clientsRef = null;
let isAdmin = false, CURRENT_UID = null;
let routeControl = null;
let markers = [];

/* ---------- TILES ---------- */
const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20
});
let satelliteMode = false;

/* ---------- INIT MAP ---------- */
function initMap() {
  if (!map) {
    map = L.map("map").setView(defaultCenter, defaultZoom);
    normalTiles.addTo(map);
    routeLayer.addTo(map);
    clientsLayer.addTo(map);

    const infoDiv = document.createElement("div");
    infoDiv.id = "itineraireInfo";
    infoDiv.style.cssText =
      "position:absolute;bottom:10px;left:10px;background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:8px;font-size:13px;box-shadow:0 0 6px rgba(0,0,0,0.2);z-index:1500;";
    infoDiv.textContent = "🚗 Aucune route tracée";
    document.body.appendChild(infoDiv);
  }
  return map;
}

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
      .catch(err => document.getElementById("loginError").textContent = err.message);
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async user => {
  if (user) {
    CURRENT_UID = user.uid;
    try {
      const snap = await db.ref("admins/" + CURRENT_UID).once("value");
      isAdmin = snap.exists() && snap.val() === true;
    } catch { isAdmin = false; }

    document.getElementById("loginContainer").style.display = "none";
    document.getElementById("map").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    document.getElementById("controls").style.display = "flex";

    setTimeout(() => initMap()?.invalidateSize(), 300);
    startApp();
  } else {
    CURRENT_UID = null; isAdmin = false; cleanup();
  }
});

/* ===========================================================
   🚀 START APP
   =========================================================== */
function startApp() {
  initMap();
  createBottomButtons();
  watchPosition();
  listenClients();
  enableSearchClients();
}

/* ---------- CLEANUP ---------- */
function cleanup() {
  document.getElementById("loginContainer").style.display = "block";
  document.getElementById("map").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("controls").style.display = "none";

  if (geoWatchId !== null) { try { navigator.geolocation.clearWatch(geoWatchId); } catch{} geoWatchId = null; }
  if (clientsRef) { clientsRef.off(); clientsRef = null; }
  routeLayer.clearLayers();
  clientsLayer.clearLayers();
  markers = [];
  if (userMarker && map) map.removeLayer(userMarker);
  userMarker = null;

  const info = document.getElementById("itineraireInfo");
  if (info) info.textContent = "🚗 Aucune route tracée";
  if (routeControl && map) { map.removeControl(routeControl); routeControl = null; }
}

/* ===========================================================
   📍 GEOLOCALISATION
   =========================================================== */
function watchPosition() {
  if (!navigator.geolocation) { map.setView(defaultCenter, defaultZoom); return; }

  geoWatchId = navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (!userMarker && map) userMarker = L.marker([lat,lng], { icon: livreurIcon }).addTo(map);
    else userMarker?.setLatLng([lat,lng]);
    if (map) map.setView([lat,lng], 15);

    if (CURRENT_UID) {
      db.ref("livreurs/" + CURRENT_UID).set({ lat,lng, updatedAt: Date.now() }).catch(()=>{});
    }
  }, ()=>{}, { enableHighAccuracy:false, maximumAge:8000, timeout:30000 });
}

/* ===========================================================
   👥 CLIENTS
   =========================================================== */
function listenClients() {
  if (!db || !CURRENT_UID) return;
  if (clientsRef) clientsRef.off();
  const path = isAdmin ? "clients" : `clients/${CURRENT_UID}`;
  clientsRef = db.ref(path);

  clientsRef.on("value", snap => {
    clientsLayer.clearLayers();
    markers = [];
    const data = snap.val(); if (!data) return;

    if (isAdmin) {
      Object.entries(data).forEach(([uid,list]) => Object.entries(list||{}).forEach(([id,c]) => addClientMarker(uid,id,c)));
    } else {
      Object.entries(data).forEach(([id,c]) => addClientMarker(CURRENT_UID,id,c));
    }
  });
}

function addClientMarker(livreurUid, id, c) {
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
  const marker = L.marker([c.lat, c.lng], { icon: clientIcon });
  marker.nom = c.name || "Client";
  marker.bindPopup(popupClientHtml(livreurUid,id,c));
  marker.addTo(clientsLayer);
  markers.push(marker);
}

/* ===========================================================
   🔹 POPUP CLIENT
   =========================================================== */
function popupClientHtml(livreurUid,id,c) {
  const nom = c.name||"Client";
  const canEdit = isAdmin || livreurUid===CURRENT_UID;
  const safeNom = encodeURIComponent(nom);
  const safeId = encodeURIComponent(id);
  const safeLivreur = encodeURIComponent(livreurUid);

  return `
  <div style="font-size:13px;max-width:230px;display:flex;flex-direction:column;gap:6px;">
    <b>${nom}</b>
    <div style="margin-top:4px;display:flex;flex-direction:column;gap:5px;">
      <button onclick="calculerItineraire(${c.lat},${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">🚗 Itinéraire</button>
      <button onclick="supprimerItineraire()" style="background:#555;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">❌ Supprimer itinéraire</button>
      <button onclick="commanderClient('${safeLivreur}','${safeId}','${safeNom}')" style="background:#FF9800;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">🧾 Commander</button>
      ${canEdit?`
      <button onclick="renommerClient('${safeLivreur}','${safeId}','${safeNom}')" style="background:#009688;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">✏️ Modifier nom</button>
      <button onclick="supprimerClient('${safeLivreur}','${safeId}')" style="background:#e53935;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">🗑️ Supprimer client</button>`:""}
    </div>
  </div>`;
}

/* ===========================================================
   🚗 ITINÉRAIRE
   =========================================================== */
function calculerItineraire(lat,lng){
  if (!map) return;
  if (routeControl) map.removeControl(routeControl);

  const info = document.getElementById("itineraireInfo");
  if (info) info.textContent = "⏳ Calcul de l'itinéraire...";

  navigator.geolocation.getCurrentPosition(pos=>{
    const start=[pos.coords.latitude,pos.coords.longitude];
    const end=[lat,lng];

    routeControl = L.Routing.control({
      waypoints:[L.latLng(start[0],start[1]),L.latLng(end[0],end[1])],
      lineOptions:{styles:[{color:'#0074FF',weight:4}]},
      routeWhileDragging:false,
      showAlternatives:false,
      createMarker:()=>null
    }).on('routesfound',e=>{
      const route=e.routes[0];
      const distance=(route.summary.totalDistance/1000).toFixed(2);
      const duree=Math.round(route.summary.totalTime/60);
      if(info) info.textContent=`🚗 Distance : ${distance} km — ⏱️ Durée : ${duree} min`;
    }).addTo(map);
  });
}

function supprimerItineraire(){ if(routeControl && map){ map.removeControl(routeControl); routeControl=null; const info=document.getElementById("itineraireInfo"); if(info) info.textContent="🚗 Aucune route tracée"; } }

/* ===========================================================
   🧾 COMMANDES & MODIFS CLIENTS
   =========================================================== */
function commanderClient(livreurUid, clientId, nomClient){
  const produit=prompt("Quel produit souhaite commander "+decodeURIComponent(nomClient)+" ?");
  if(!produit) return;
  const commande={produit:produit.trim(), date:new Date().toISOString(), status:"en attente", par:CURRENT_UID};
  db.ref(`commandes/${livreurUid}/${clientId}`).push(commande).catch(()=>{});
}

function renommerClient(livreurUid,id,oldName){
  const nouveau=prompt("Nouveau nom :",decodeURIComponent(oldName));
  if(!nouveau) return;
  db.ref(`clients/${livreurUid}/${id}/name`).set(nouveau).catch(()=>{});
}

function supprimerClient(livreurUid,id){
  if(!confirm("Supprimer définitivement ce client ?")) return;
  db.ref(`clients/${livreurUid}/${id}`).remove().catch(()=>{});
}

/* ===========================================================
   🔍 RECHERCHE CLIENTS
   =========================================================== */
function enableSearchClients(){
  const searchInput=document.getElementById("searchClient");
  const clearBtn=document.getElementById("clearSearch");
  if(!searchInput||!clearBtn) return;

  searchInput.addEventListener("input",e=>filtrerClients(e.target.value.trim().toLowerCase()));
  clearBtn.addEventListener("click",()=>{ searchInput.value=""; filtrerClients(""); });
}

function filtrerClients(query){
  markers.forEach(m=>{
    const nom=m.nom?.toLowerCase()||"";
    const match=nom.includes(query);
    if(query.length && match){
      const regex=new RegExp(`(${query})`,"gi");
      const highlighted=m.nom.replace(regex,'<mark>$1</mark>');
      m.bindPopup(`<b>${highlighted}</b>`);
      m.getElement()?.classList.add("highlight");
    }else{ m.getElement()?.classList.remove("highlight"); }
    query===""||match?map.addLayer(m):map.removeLayer(m);
  });
}

const style=document.createElement("style");
style.textContent=`
  .highlight{filter:drop-shadow(0 0 6px yellow);z-index:9999!important;}
  mark{background:yellow;color:black;padding:0 2px;}
`;
document.head.appendChild(style);

/* ===========================================================
   🧭 BOUTONS FLOTTANTS
   =========================================================== */
function createBottomButtons(){
  if(document.getElementById("mapButtons")) return;
  const c=document.createElement("div"); c.id="mapButtons";
  c.style="position:absolute;bottom:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:2000";

  const makeBtn=txt=>{ const b=document.createElement("button"); b.textContent=txt; b.style.cssText="background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;"; return b; };

  const btnSat=makeBtn("🛰️ Vue satellite");
  btnSat.onclick=()=>{
    satelliteMode=!satelliteMode;
    if(satelliteMode){ map.addLayer(satelliteTiles); map.removeLayer(normalTiles); btnSat.textContent="🗺️ Vue normale"; }
    else{ map.addLayer(normalTiles); map.removeLayer(satelliteTiles); btnSat.textContent="🛰️ Vue satellite"; }
  };

  const btnPos=makeBtn("📍 Ma position");
  btnPos.onclick=()=> userMarker && map.setView(userMarker.getLatLng(),15);

  c.append(btnSat,btnPos); document.body.appendChild(c);
}
