// === Geotrack Livreurs - Version avec recherche multi-résultats ===

/* ========== CONFIG ========== */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 14;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ========== MAP INIT ========== */
const map = L.map('map', { center: defaultCenter, zoom: defaultZoom });

const normalTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const satelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  maxZoom: 20,
  subdomains: ['mt0','mt1','mt2','mt3']
});

/* ========== ICONS ========== */
const clientIcon = L.icon({
  iconUrl: "/Hanafi-Map/magasin-delectronique.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42]
});

const livreurIcon = L.icon({
  iconUrl: "/Hanafi-Map/camion-dexpedition.png",
  iconSize: [50, 50],
  iconAnchor: [25, 50]
});

const highlightIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/190/190411.png", // icône jaune de surbrillance
  iconSize: [48, 48],
  iconAnchor: [24, 48]
});

/* ========== STATE ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let satelliteMode = false;
let currentDestination = null;
let routePolyline = null;
let lastRecalcTime = 0;
const RECALL_MIN_INTERVAL_MS = 5000;
const RECALC_THRESHOLD_METERS = 45;
const routeSummaryEl = document.getElementById('routeSummary');

const clientMarkers = []; // tableau de tous les marqueurs clients

/* ========== HELPERS ========== */
const $id = id => document.getElementById(id);
function escapeHtml(s){
  return (s||"").toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function showRouteSummary(txt){
  if(routeSummaryEl){ routeSummaryEl.style.display='flex'; routeSummaryEl.innerHTML = txt; }
}
function hideRouteSummary(){
  if(routeSummaryEl){ routeSummaryEl.style.display='none'; routeSummaryEl.innerHTML = ''; }
}
function clearItinerary(){
  routeLayer.clearLayers();
  routePolyline = null;
  hideRouteSummary();
  currentDestination = null;
}

/* ========== CRUD CLIENTS ========== */
function popupClientHtml(c){
  return `
    <div style="font-size:13px;">
      <b>${escapeHtml(c.name)}</b><br>
      <small style="color:#555">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br><br>

      <button onclick="calculerItineraire(${c.lat}, ${c.lng})"
        style="width:100%;padding:6px;background:#0074FF;color:#fff;border:none;border-radius:4px">
        🚗 Itinéraire
      </button><br><br>

      <button onclick="clearItinerary()" 
        style="width:100%;padding:6px;background:#ff9800;color:#fff;border:none;border-radius:4px">
        ❌ Enlever
      </button><br><br>

      <button onclick="renommerClient('${c.id}', '${escapeHtml(c.name)}')"
        style="width:100%;padding:6px;background:#009688;color:#fff;border:none;border-radius:4px">
        ✏️ Modifier nom
      </button><br><br>

      <button onclick="supprimerClient('${c.id}')"
        style="width:100%;padding:6px;background:#e53935;color:#fff;border:none;border-radius:4px">
        🗑️ Supprimer
      </button>
    </div>
  `;
}

function listenClients(){
  db.ref('clients').on('value', snap=>{
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if(!data) return;

    Object.entries(data).forEach(([id,c])=>{
      if(!c.lat || !c.lng) return;
      c.id=id;
      const marker = L.marker([c.lat,c.lng],{icon:clientIcon})
        .bindPopup(popupClientHtml(c))
        .addTo(clientsLayer);
      marker.clientName = (c.name || "").toLowerCase();
      clientMarkers.push(marker);
    });
  });
}

/* ========== ROUTING + GEO ========== */
// (idem ton ancienne version)
async function calculerItineraire(lat,lng){
  if(!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  currentDestination={lat,lng};
  showRouteSummary("⏳ Calcul de l'itinéraire...");

  try{
    const url=`https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${lat},${lng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res=await fetch(url);
    if(!res.ok) throw new Error(res.status);
    const data=await res.json();
    const pts=data.paths?.[0]?.points?.coordinates?.map(p=>[p[1],p[0]]);
    routeLayer.clearLayers();
    routePolyline=L.polyline(pts,{color:'#0074FF',weight:5}).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(),{padding:[60,60],maxZoom:17});
    const s=data.paths?.[0];
    showRouteSummary(`📏 ${(s.distance/1000).toFixed(2)} km — ⏱️ ${Math.max(1,Math.round(s.time/60000))} min`);
    lastRecalcTime=Date.now();
  }catch(e){
    hideRouteSummary();
    alert("Itinéraire non disponible.");
  }
}

navigator.geolocation.watchPosition(pos=>{
  const lat=pos.coords.latitude,lng=pos.coords.longitude;
  const t=[lat,lng];
  if(!userMarker){
    userMarker=L.marker(t,{icon:livreurIcon}).addTo(map);
    map.setView(t,16);
  }else userMarker.setLatLng(t);
  if(window.db) db.ref('livreur').set({lat,lng,updatedAt:Date.now()});
}, e=>console.warn(e), {enableHighAccuracy:true,maximumAge:2000,timeout:10000});

/* ========== RECHERCHE CLIENTS (multi-résultats) ========== */
const searchInput = document.getElementById("searchInput");

searchInput.addEventListener("input", function () {
  const searchText = this.value.toLowerCase().trim();
  clientMarkers.forEach(m => {
    const match = m.clientName.includes(searchText) && searchText !== "";
    m.setOpacity(match || searchText === "" ? 1 : 0.3);
    if (match) {
      m.setIcon(highlightIcon);
      m.openPopup();
    } else {
      m.setIcon(clientIcon);
      m.closePopup();
    }
  });
});

/* ========== UI ========== */
$id('toggleView')?.addEventListener('click',()=>{
  satelliteMode=!satelliteMode;
  satelliteMode?(map.addLayer(satelliteTiles),map.removeLayer(normalTiles))
                :(map.addLayer(normalTiles),map.removeLayer(satelliteTiles));
});
$id('myPosition')?.addEventListener('click',()=>{
  if(!userMarker) return alert("Localisation en cours…");
  map.setView(userMarker.getLatLng(),16);
});

map.on('contextmenu',e=>{
  const n=prompt("Nom du client ?");
  if(!n) return;
  db.ref('clients').push({ name:n, lat:e.latlng.lat, lng:e.latlng.lng, createdAt:Date.now() });
});

listenClients();
