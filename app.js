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

/* ========== LAYERS & STATE ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let satelliteMode = false;
let routePolyline = null;
const clientMarkers = [];

/* ========== UTILS ========== */
const $id = id => document.getElementById(id);
function escapeHtml(s){return (s||"").toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

/* ========== CLIENT CRUD ========== */
function ajouterClient(lat,lng){
  const name = prompt("Nom du client ?");
  if(!name) return;
  const ref = db.ref('clients').push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}
function supprimerClient(id){
  if(!confirm("❌ Supprimer ce client ?")) return;
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
        🚗 Itinéraire
      </button><br><br>
      <button onclick="clearItinerary()" 
        style="width:100%;padding:6px;background:#ff9800;color:#fff;border:none;border-radius:4px">
        🧭 Enlever l’itinéraire
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

/* ========== FIREBASE LISTENER ========== */
function listenClients(){
  db.ref('clients').on('value', snap=>{
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if(!data) return;

    Object.entries(data).forEach(([id,c])=>{
      if(!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
      c.id = id;
      const m = L.marker([c.lat, c.lng], { icon: clientIcon });
      m.bindPopup(popupClientHtml(c));
      m.clientName = (c.name || "").toLowerCase();
      m.clientId = id;
      m.clientData = c;
      clientsLayer.addLayer(m);
      clientMarkers.push(m);
    });
  });
}

/* ========== GEOLOCATION ========== */
if('geolocation' in navigator){
  navigator.geolocation.watchPosition(pos=>{
    const {latitude:lat, longitude:lng} = pos.coords;
    if(!userMarker){
      userMarker = L.marker([lat,lng], { icon: livreurIcon }).addTo(map);
      map.setView([lat,lng], 15);
    } else {
      userMarker.setLatLng([lat,lng]);
    }
    db.ref('livreur').set({ lat, lng, updatedAt: Date.now() });
  });
}

/* ========== RECHERCHE + BOUTON RESET ========== */
(function initSearch(){
  const input = document.getElementById("searchInput");
  if(!input) return;

  const resultsBox = document.createElement("div");
  resultsBox.id = "searchResults";
  resultsBox.style.position = "absolute";
  resultsBox.style.top = "45px";
  resultsBox.style.left = "10px";
  resultsBox.style.zIndex = "2000";
  resultsBox.style.background = "white";
  resultsBox.style.border = "1px solid #ccc";
  resultsBox.style.borderRadius = "6px";
  resultsBox.style.maxHeight = "180px";
  resultsBox.style.overflowY = "auto";
  resultsBox.style.width = "200px";
  resultsBox.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
  document.body.appendChild(resultsBox);

  const clearBtn = document.createElement("span");
  clearBtn.textContent = "✕";
  clearBtn.style.position = "absolute";
  clearBtn.style.right = "15px";
  clearBtn.style.top = "10px";
  clearBtn.style.cursor = "pointer";
  clearBtn.style.fontSize = "18px";
  clearBtn.style.color = "#777";
  clearBtn.style.fontWeight = "bold";
  clearBtn.addEventListener("click", ()=>{
    input.value = "";
    resultsBox.innerHTML = "";
    window.showAllClients();
  });
  document.body.appendChild(clearBtn);

  function clearResults(){ resultsBox.innerHTML = ""; }

  input.addEventListener("input", ()=>{
    const txt = input.value.trim().toLowerCase();
    clearResults();
    if(txt.length < 1){ window.showAllClients(); return; }

    const matches = clientMarkers.filter(m => m.clientName.startsWith(txt));
    if(matches.length === 0){
      resultsBox.innerHTML = "<div style='padding:6px;color:#666;'>Aucun client</div>";
      return;
    }

    clientMarkers.forEach(m => map.removeLayer(m));
    matches.forEach(m => m.addTo(map));

    matches.forEach(m => {
      const d = document.createElement("div");
      d.textContent = m.clientData.name;
      d.style.padding = "6px 8px";
      d.style.cursor = "pointer";
      d.style.borderBottom = "1px solid #eee";
      d.addEventListener("mouseover",()=>d.style.background="#f2f2f2");
      d.addEventListener("mouseout",()=>d.style.background="#fff");
      d.addEventListener("click", ()=> m.openPopup());
      resultsBox.appendChild(d);
    });
  });

  document.addEventListener("click", e=>{
    if(e.target !== input && !resultsBox.contains(e.target)){
      clearResults();
    }
  });
})();

/* ========== ITINÉRAIRE ========== */
async function calculerItineraire(destLat, destLng){
  if(!userMarker) return alert("Localisation en attente...");
  const me = userMarker.getLatLng();
  try {
    const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('GraphHopper ' + res.status);
    const data = await res.json();
    const pts = data.paths?.[0]?.points?.coordinates?.map(p=>[p[1],p[0]]);
    if(!pts) throw new Error('no geometry');
    routeLayer.clearLayers();
    routePolyline = L.polyline(pts, { color:'#0074FF', weight:5, opacity:0.95 }).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(), { padding:[60,60], maxZoom:17 });
  } catch (e) { alert("Erreur itinéraire"); }
}
function clearItinerary(){
  routeLayer.clearLayers();
  routePolyline = null;
}
window.showAllClients = ()=> clientMarkers.forEach(m => m.addTo(map));

/* ========== BOUTONS EN BAS (fixe) + masquage anciens ========== */
function createBottomButtonsAndHideOriginals(){
  document.addEventListener('DOMContentLoaded', () => {
    const origToggle = document.getElementById('toggleView');
    const origPos = document.getElementById('myPosition');
    if(origToggle) origToggle.style.display = 'none';
    if(origPos) origPos.style.display = 'none';
  });

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "2000";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "10px";
  container.style.alignItems = "stretch";

  const btnBase = {
    background: '#007bff',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  };

  function applyStyle(el, styleObj){
    Object.entries(styleObj).forEach(([k,v]) => el.style[k] = v);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.innerText = '🛰️ Vue satellite';
  applyStyle(toggleBtn, btnBase);
  toggleBtn.addEventListener('click', () => {
    satelliteMode = !satelliteMode;
    if (satelliteMode){
      map.addLayer(satelliteTiles);
      map.removeLayer(normalTiles);
      toggleBtn.innerText = '🗺️ Vue normale';
    } else {
      map.addLayer(normalTiles);
      map.removeLayer(satelliteTiles);
      toggleBtn.innerText = '🛰️ Vue satellite';
    }
  });

  const posBtn = document.createElement('button');
  posBtn.innerText = '📍 Ma position';
  applyStyle(posBtn, btnBase);
  posBtn.addEventListener('click', () => {
    if (userMarker) map.setView(userMarker.getLatLng(), 15);
    else alert("Localisation en cours...");
  });

  container.appendChild(toggleBtn);
  container.appendChild(posBtn);
  document.body.appendChild(container);
}

createBottomButtonsAndHideOriginals();

/* clic droit -> ajout client */
map.on('contextmenu', e => ajouterClient(e.latlng.lat, e.latlng.lng));

listenClients();
