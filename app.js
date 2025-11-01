// ✅ app.js — version stable + bouton "🛒 Passer commande" intégré

/* ========== CONFIG ========== */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 14;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ========== MAP INIT ========== */
const map = L.map('map', { center: defaultCenter, zoom: defaultZoom });

const normalTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// 🛰️ Vue satellite Google
const satelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  maxZoom: 20,
  subdomains: ['mt0','mt1','mt2','mt3']
});

// 🗺️ Labels CartoDB (stables et légers)
const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
  subdomains: ['a','b','c','d'],
  maxZoom: 20,
  attribution: '© OpenStreetMap contributors, © CartoDB',
  opacity: 1.0
});

// 🔧 améliore le contraste pour simuler du “gras foncé”
labelsLayer.on('tileload', e => {
  try { e.tile.style.filter = "contrast(180%) brightness(80%)"; }
  catch(err) { /* ignore */ }
});

/* ========== ICONES ========== */
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

/* ========== LAYERS & VARIABLES ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let satelliteMode = false;
let routePolyline = null;
const clientMarkers = [];

/* ========== UTILS ========== */
const $id = id => document.getElementById(id);
function escapeHtml(s){return (s||"").toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

/* ========== CLIENTS FIREBASE ========== */
function ajouterClient(lat,lng){
  const name = prompt("Nom du client ?");
  if(!name) return;
  const ref = db.ref('clients').push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}
function supprimerClient(id){
  if(!confirm("❌ Supprimer ce client ?")) return;
  db.ref(`clients/${id}`).remove();
}
function renommerClient(id, oldName){
  const n = prompt("Nouveau nom :", oldName);
  if(n) db.ref(`clients/${id}/name`).set(n);
}

/* ========== POPUP CLIENT (ROBUSTE + PASSER COMMANDE) ========== */
function popupClientHtml(c){
  const displayName = escapeHtml(c.name || c.nom || "Client");
  const createdAt = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";
  const baseCommandeUrl = "https://exemple.com/commande"; // 🔗 Remplace par ton vrai lien
  const params = new URLSearchParams({
    clientId: c.id || "",
    clientName: displayName
  }).toString();
  const commandeLink = baseCommandeUrl + "?" + params;

  return `
    <div style="font-size:13px; max-width:240px;">
      <b>${displayName}</b><br>
      ${c.adresse ? `<small style="color:#555">${escapeHtml(c.adresse)}</small><br>` : ""}
      ${createdAt ? `<small style="color:#777">Ajouté : ${createdAt}</small><br>` : ""}
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <button onclick="window.open('${commandeLink}', '_blank')" style="
          background:#28a745;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;
          font-weight:600;">
          🛒 Passer commande
        </button>

        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="
          background:#0074FF;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;
          font-weight:600;">
          🚗 Itinéraire
        </button>

        <button onclick="clearItinerary()" style="
          background:#ff9800;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;
          font-weight:600;">
          🧭 Enlever itinéraire
        </button>

        <button onclick="renommerClient('${c.id}', '${escapeHtml(c.name || c.nom || "")}')" style="
          background:#009688;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;
          font-weight:600;">
          ✏️ Modifier
        </button>

        <button onclick="supprimerClient('${c.id}')" style="
          background:#e53935;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;
          font-weight:600;">
          🗑️ Supprimer
        </button>
      </div>
    </div>
  `;
}

/* ========== ÉCOUTE FIREBASE (ROBUSTE) ========== */
function listenClients(){
  db.ref('clients').on('value', snap=>{
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if(!data) return;

    Object.entries(data).forEach(([id,c])=>{
      if(!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
      c.id = id;
      const m = L.marker([c.lat,c.lng], { icon: clientIcon });
      m.bindPopup(popupClientHtml(c));
      m.clientName = (c.name || c.nom || "").toLowerCase();
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
    } else userMarker.setLatLng([lat,lng]);
    try { db.ref('livreur').set({ lat, lng, updatedAt: Date.now() }); } catch(e){}
  }, e=>console.warn('geo err',e), {enableHighAccuracy:true, maximumAge:2000, timeout:10000});
}

/* ========== RECHERCHE + CLEAR ========== */
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
  resultsBox.style.maxHeight = "220px";
  resultsBox.style.overflowY = "auto";
  resultsBox.style.width = "240px";
  resultsBox.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
  document.body.appendChild(resultsBox);

  const clearBtn = document.createElement("span");
  clearBtn.textContent = "✕";
  clearBtn.style.position = "absolute";
  clearBtn.style.right = "18px";
  clearBtn.style.top = "14px";
  clearBtn.style.cursor = "pointer";
  clearBtn.style.fontSize = "16px";
  clearBtn.style.color = "#777";
  clearBtn.style.fontWeight = "bold";
  clearBtn.style.display = "none";
  clearBtn.style.zIndex = 2001;
  document.body.appendChild(clearBtn);

  clearBtn.addEventListener("click", ()=>{
    input.value = "";
    resultsBox.innerHTML = "";
    clientMarkers.forEach(m => m.addTo(map));
    clearBtn.style.display = 'none';
  });

  input.addEventListener("input", ()=>{
    const txt = input.value.trim().toLowerCase();
    resultsBox.innerHTML = "";
    clearBtn.style.display = input.value ? 'block' : 'none';
    if(txt.length < 1){ clientMarkers.forEach(m=>m.addTo(map)); return; }

    const matches = clientMarkers.filter(m => m.clientName.startsWith(txt));
    if(matches.length === 0){
      resultsBox.innerHTML = "<div style='padding:8px;color:#666;'>Aucun client</div>";
      clientMarkers.forEach(m=>map.removeLayer(m));
      return;
    }
    clientMarkers.forEach(m=>map.removeLayer(m));
    matches.forEach(m=>m.addTo(map));

    matches.forEach(m=>{
      const d=document.createElement("div");
      d.textContent=m.clientData.name || m.clientData.nom;
      d.style.padding="8px 10px";
      d.style.cursor="pointer";
      d.style.borderBottom="1px solid #eee";
      d.onmouseover=()=>d.style.background="#f2f2f2";
      d.onmouseout=()=>d.style.background="#fff";
      d.onclick=()=>m.openPopup();
      resultsBox.appendChild(d);
    });
  });
})();

/* ========== ROUTE ========== */
async function calculerItineraire(destLat,destLng){
  if(!userMarker) return alert("Localisation en attente...");
  const me=userMarker.getLatLng();
  try{
    const url=`https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
    const res=await fetch(url);
    if(!res.ok) throw new Error(res.status);
    const data=await res.json();
    const pts=data.paths?.[0]?.points?.coordinates?.map(p=>[p[1],p[0]]);
    if(!pts) throw new Error("no geometry");
    routeLayer.clearLayers();
    routePolyline=L.polyline(pts,{color:"#0074FF",weight:5,opacity:0.95}).addTo(routeLayer);
    map.fitBounds(routePolyline.getBounds(),{padding:[60,60],maxZoom:17});
  }catch(e){alert("Erreur itinéraire");}
}
function clearItinerary(){
  routeLayer.clearLayers();
  routePolyline=null;
}

/* ========== BOUTONS EN BAS ========== */
function createBottomButtons(){
  const container=document.createElement("div");
  container.style.position="absolute";
  container.style.bottom="20px";
  container.style.right="20px";
  container.style.zIndex="2000";
  container.style.display="flex";
  container.style.flexDirection="column";
  container.style.gap="10px";

  const btnStyle=`background:#007bff;color:white;border:none;padding:8px 12px;border-radius:6px;
    cursor:pointer;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.2);`;

  const toggleBtn=document.createElement("button");
  toggleBtn.innerText="🛰️ Vue satellite";
  toggleBtn.style.cssText=btnStyle;

  const posBtn=document.createElement("button");
  posBtn.innerText="📍 Ma position";
  posBtn.style.cssText=btnStyle;

  toggleBtn.addEventListener("click",()=>{
    satelliteMode=!satelliteMode;
    if(satelliteMode){
      map.addLayer(satelliteTiles);
      map.addLayer(labelsLayer);
      map.removeLayer(normalTiles);
      toggleBtn.innerText="🗺️ Vue normale";
    }else{
      map.addLayer(normalTiles);
      map.removeLayer(satelliteTiles);
      if(map.hasLayer(labelsLayer)) map.removeLayer(labelsLayer);
      toggleBtn.innerText="🛰️ Vue satellite";
    }
  });

  posBtn.addEventListener("click",()=>{
    if(userMarker) map.setView(userMarker.getLatLng(),15);
    else alert("Localisation en cours...");
  });

  container.appendChild(toggleBtn);
  container.appendChild(posBtn);
  document.body.appendChild(container);

  const origToggle=$id('toggleView');
  const origPos=$id('myPosition');
  if(origToggle) origToggle.style.display='none';
  if(origPos) origPos.style.display='none';
}

createBottomButtons();

/* clic droit = ajout client */
map.on('contextmenu', e=>ajouterClient(e.latlng.lat,e.latlng.lng));

listenClients();
