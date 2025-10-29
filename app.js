// ? js/app.js — Version A (le camion = TA position réelle) + recalcul auto si déviation 

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
  maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3']
});

/* ========== ICONS ========== */
// ?? Icone Client (Store)
const clientIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42]
});

// ?? Icone Livreur (Camion)
const livreurIcon = L.icon({
  iconUrl: "../livraison-map/camion-dexpedition.png",
  iconSize: [50, 50],
  iconAnchor: [25, 50]
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

/* ========== GEO UTILS ========== */
function haversineMeters(aLat, aLng, bLat, bLng){
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const lat1 = toRad(aLat), lat2 = toRad(bLat);
  const sinDlat = Math.sin(dLat/2), sinDlon = Math.sin(dLon/2);
  const aa = sinDlat*sinDlat + Math.cos(lat1)*Math.cos(lat2)*sinDlon*sinDlon;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
}

function pointToSegmentDistanceMeters(ptLat, ptLng, vLat, vLng, wLat, wLng){
  const deg2m = 111320;
  const meanLat = (vLat + wLat + ptLat) / 3 * Math.PI/180;
  const cosLat = Math.cos(meanLat);
  const ax = vLng * cosLat * deg2m, ay = vLat * deg2m;
  const bx = wLng * cosLat * deg2m, by = wLat * deg2m;
  const px = ptLng * cosLat * deg2m, py = ptLat * deg2m;

  const dx = bx - ax, dy = by - ay;
  if(dx === 0 && dy === 0){
    const ddx = px-ax, ddy=py-ay;
    return Math.sqrt(ddx*ddx + ddy*ddy);
  }
  const t = ((px-ax)*dx + (py-ay)*dy)/(dx*dx+dy*dy);
  const tC = Math.max(0,Math.min(1,t));
  const projx = ax+tC*dx, projy=ay+tC*dy;
  const ddx2 = px-projx, ddy2=py-projy;
  return Math.sqrt(ddx2*ddx2 + ddy2*ddy2);
}

function distancePointToPolylineMeters(lat,lng,latlngs){
  if(!latlngs || latlngs.length===0) return Infinity;
  let m = Infinity;
  for(let i=0;i<latlngs.length-1;i++){
    const v=latlngs[i], w=latlngs[i+1];
    const d=pointToSegmentDistanceMeters(lat,lng,v[0],v[1],w[0],w[1]);
    if(d<m) m=d;
  }
  return m;
}

/* ========== CRUD CLIENTS ========== */
function ajouterClient(lat,lng){
  const n = prompt("Nom du client ?");
  if(!n) return;
  const ref = db.ref('clients').push();
  ref.set({ name:n, lat, lng, createdAt:Date.now() });
}
function supprimerClient(id){
  if(!confirm("?? Supprimer ce client ?")) return;
  db.ref(`clients/${id}`).remove();
  clearItinerary();
}
function renommerClient(id, oldName){
  const n = prompt("Nouveau nom :", oldName);
  if(n) db.ref(`clients/${id}/name`).set(n);
}
function popupClientHtml(c){
  return `
    <div style="font-size:13px;">
      <b>${escapeHtml(c.name)}</b><br>
      <small style="color:#555">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br><br>

      <button onclick="calculerItineraire(${c.lat}, ${c.lng})"
        style="width:100%;padding:6px;background:#0074FF;color:#fff;border:none;border-radius:4px">
        Itinéraire
      </button><br><br>

      <button onclick="clearItinerary()" 
        style="width:100%;padding:6px;background:#ff9800;color:#fff;border:none;border-radius:4px">
        ? Enlever l’itinéraire
      </button><br><br>

      <button onclick="renommerClient('${c.id}', '${escapeHtml(c.name)}')"
        style="width:100%;padding:6px;background:#009688;color:#fff;border:none;border-radius:4px">
        ?? Modifier nom
      </button><br><br>

      <button onclick="supprimerClient('${c.id}')"
        style="width:100%;padding:6px;background:#e53935;color:#fff;border:none;border-radius:4px">
        ??? Supprimer
      </button>
    </div>
  `;
}

/* ========== FIREBASE LISTEN ========== */
function listenClients(){
  db.ref('clients').on('value', snap=>{
    clientsLayer.clearLayers();
    const data = snap.val();
    if(!data) return;
    Object.entries(data).forEach(([id,c])=>{
      if(!c.lat || !c.lng) return;
      c.id=id;
      const m = L.marker([c.lat,c.lng],{icon:clientIcon});
      m.bindPopup(popupClientHtml(c));
      clientsLayer.addLayer(m);
    });
  });
}

/* ========== ROUTING ========== */
function parseGraphHopper(data){
  const coords = data.paths?.[0]?.points?.coordinates;
  return coords ? coords.map(p=>[p[1],p[0]]) : null;
}
function extractSummary(d){
  const p = d.paths?.[0];
  return p ? {dist:p.distance,time:p.time} : null;
}

async function calculerItineraire(lat,lng){
  if(!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  currentDestination={lat,lng};
  showRouteSummary("?? Chargement...");

  try{
    const url=`https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${lat},${lng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res=await fetch(url);
    if(!res.ok) throw new Error(res.status);
    const data=await res.json();
    const pts=parseGraphHopper(data);
    if(!pts) throw new Error("no geometry");

    routeLayer.clearLayers();
    routePolyline=L.polyline(pts,{color:'#0074FF',weight:5}).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(),{padding:[60,60],maxZoom:17});

    const s=extractSummary(data)||{};
    showRouteSummary(`?? ${(s.dist/1000).toFixed(2)} km — ? ${Math.max(1,Math.round(s.time/60000))} min`);
    lastRecalcTime=Date.now();

  }catch(e){
    hideRouteSummary();
    if(confirm("Itinéraire indisponible.\n\nOuvrir Google Maps ?")){
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${me.lat},${me.lng}&destination=${lat},${lng}`);
    }
  }
}

/* ========== AUTO RECALC DEVIATION ========== */
function checkDeviationAndRecalc(){
  if(!currentDestination || !routePolyline || !userMarker) return;
  const pos=userMarker.getLatLng();
  const latlngs=routePolyline.getLatLngs().map(ll=>[ll.lat,ll.lng]);
  const dist=distancePointToPolylineMeters(pos.lat,pos.lng,latlngs);
  if(dist>RECALC_THRESHOLD_METERS && Date.now()-lastRecalcTime>RECALL_MIN_INTERVAL_MS){
    lastRecalcTime=Date.now();
    calculerItineraire(currentDestination.lat,currentDestination.lng);
  }
}

/* ========== GEOLOCATION WATCH ========== */
navigator.geolocation.watchPosition(pos=>{
  const lat=pos.coords.latitude,lng=pos.coords.longitude;
  const t=[lat,lng];

  if(!userMarker){
    userMarker=L.marker(t,{icon:livreurIcon}).addTo(map);
    map.setView(t,16);
  }else{
    userMarker.setLatLng(t);
  }
  try{checkDeviationAndRecalc();}catch(e){}
  if(window.db){
    try{db.ref('livreur').set({lat,lng,updatedAt:Date.now()});}catch(e){}
  }
}, e=>console.warn(e), {enableHighAccuracy:true,maximumAge:2000,timeout:10000});

/* ========== UI ========== */
$id('toggleView')?.addEventListener('click',()=>{
  satelliteMode=!satelliteMode;
  satelliteMode?(map.addLayer(satelliteTiles),map.removeLayer(normalTiles))
                :(map.addLayer(normalTiles),map.removeLayer(satelliteTiles));
});
function centrerSurMoi(){
  if(!userMarker) return alert("Localisation en cours…");
  map.setView(userMarker.getLatLng(),16);
}
$id('myPosition')?.addEventListener('click',centrerSurMoi);

map.on('contextmenu',e=>ajouterClient(e.latlng.lat,e.latlng.lng));
listenClients();
map.on('movestart zoomstart',()=>hideRouteSummary());

window.clearItinerary=clearItinerary;
window.ajouterClient=ajouterClient;
window.supprimerClient=supprimerClient;
window.renommerClient=renommerClient;
window.centrerSurMoi=centrerSurMoi;

