/* ===========================================================
   ✅ app.js — version fixe (évite double déclaration firebaseConfig)
   - NE DÉCLARE PAS `firebaseConfig` / `db` au niveau global.
   - Utilise window.firebaseConfig / window.db si disponibles.
   - Initialise firebase seulement si nécessaire.
   =========================================================== */

/* ========== CONFIG MAP ========== */
const defaultCenter = [36.7119, 4.0459];
const defaultZoom = 14;
const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

/* ========== RÉCUPÉRATION ID LIVREUR DE L'URL ========== */
const urlParams = new URLSearchParams(window.location.search);
const LIVREUR_ID = "livreur_" + (urlParams.get("livreur") || "1");

/* ========== INIT CARTE ========== */
const map = L.map('map', { center: defaultCenter, zoom: defaultZoom });

const normalTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const satelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  maxZoom: 20,
  subdomains: ['mt0','mt1','mt2','mt3']
});

const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
  subdomains: ['a','b','c','d'],
  maxZoom: 20,
  attribution: '© OpenStreetMap contributors, © CartoDB',
  opacity: 1.0
});
labelsLayer.on('tileload', e => { try { e.tile.style.filter = "contrast(180%) brightness(80%)"; } catch(e){} });

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

/* ========== FIREBASE — SAFE INIT (AUCUNE DÉCLARATION GLOBALE) ========== */
/*
  Comportement :
  - Si tu as déjà mis une configuration dans index.html (ex: const firebaseConfig = {...}),
    elle risque de ne PAS être accessible via window.firebaseConfig (car const/let ne créent pas window props).
  - Pour éviter toute collision, on lit d'abord window.firebaseConfig (si tu l'as placé explicitement),
    sinon on n'impose rien et on tente d'utiliser firebase si le script a déjà été initialisé.
  - Si tu veux fournir une config *depuis index.html* accessible ici, mets-la sur window.firebaseConfig
    (ex: window.firebaseConfig = {...}) au lieu de `const firebaseConfig = ...`.
*/

// Si tu veux une config par défaut (optionnel) — REMPLACE les valeurs si nécessaire.
// ATTENTION : ne met pas ceci si tu veux forcer la config depuis index.html.
// Ici on ne crée PAS une variable globale nommée `firebaseConfig`.
if (!window.firebaseConfig) {
  // Ne pas écrire ceci si tu fournis la config dans index.html explicitement.
  // window.firebaseConfig = {
  //   apiKey: "...",
  //   authDomain: "...",
  //   databaseURL: "...",
  //   projectId: "...",
  //   storageBucket: "...",
  //   messagingSenderId: "...",
  //   appId: "..."
  // };
}

// Initialise firebase seulement si l'objet firebase existe et aucune app n'est initialisée
if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      if (window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
      } else {
        // Si aucun config n'est disponible, on ne fait rien et on loggue.
        console.warn("Aucune configuration firebase trouvée dans window.firebaseConfig — Firebase non initialisé ici.");
      }
    } else {
      // déjà initialisé — ok
    }
  } catch (e) {
    console.warn("Erreur lors de l'initialisation Firebase (ignorée) : ", e);
  }
} else {
  console.warn("Le script firebase n'est pas chargé avant app.js — vérifie l'ordre des <script> dans index.html");
}

// Référence DB : réutilise window.db si elle existe, sinon tente d'utiliser firebase.database()
if (!window.db) {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
    try { window.db = firebase.database(); } catch(e) { console.warn("Impossible de créer window.db :", e); }
  } else {
    // window.db reste undefined
  }
}
const db = window.db;

/* ========== LAYERS & STATE ========== */
const clientsLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let routePolyline = null;
let satelliteMode = false;
const clientMarkers = [];

/* ========== UTILS ========== */
const $id = id => document.getElementById(id);
function escapeHtml(s){return (s||"").toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

/* ========== CLIENTS CRUD (stockés par livreur) ========== */
function ajouterClient(lat,lng){
  const name = prompt("Nom du client ?");
  if(!name) return;
  if (!db) return alert("Base de données non initialisée");
  const ref = db.ref(`clients/${LIVREUR_ID}`).push();
  ref.set({ name, lat, lng, createdAt: Date.now() });
}
function supprimerClient(id){
  if(!confirm("❌ Supprimer ce client ?")) return;
  if (!db) return alert("Base de données non initialisée");
  db.ref(`clients/${LIVREUR_ID}/${id}`).remove();
}
function renommerClient(id, oldName){
  const n = prompt("Nouveau nom :", oldName);
  if(n && db) db.ref(`clients/${LIVREUR_ID}/${id}/name`).set(n);
}

/* ========== POPUP HTML (avec bouton Passer commande) ========== */
function popupClientHtml(c){
  const commandeUrl = "https://ton-lien-de-commande.com"; // ← remplace quand tu as ton URL
  return `
    <div style="font-size:13px; max-width:260px;">
      <b>${escapeHtml(c.name || c.nom || "Client")}</b><br>
      ${c.adresse ? `<small style="color:#555">${escapeHtml(c.adresse)}</small><br>` : ''}
      ${c.createdAt ? `<small style="color:#777">Ajouté : ${new Date(c.createdAt).toLocaleString()}</small><br>` : ''}
      <div style="margin-top:8px; display:flex; gap:6px; flex-direction:column;">
        <button onclick="window.open('${commandeUrl}','_blank')" style="background:#28a745;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🛒 Passer commande</button>
        <button onclick="calculerItineraire(${c.lat}, ${c.lng})" style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🚗 Itinéraire</button>
        <button onclick="clearItinerary()" style="background:#ff9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🧭 Enlever itinéraire</button>
        <button onclick="renommerClient('${c.id}', '${escapeHtml(c.name || c.nom || "")}')" style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">✏️ Modifier</button>
        <button onclick="supprimerClient('${c.id}')" style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

/* ========== LISTEN CLIENTS ========== */
function listenClients(){
  if (!db) { console.warn("DB non initialisée — listenClients abandonné"); return; }
  db.ref(`clients/${LIVREUR_ID}`).on('value', snap=>{
    clientsLayer.clearLayers();
    clientMarkers.length = 0;
    const data = snap.val();
    if(!data) return;
    Object.entries(data).forEach(([id,c])=>{
      if(!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
      c.id = id;
      const m = L.marker([c.lat, c.lng], { icon: clientIcon });
      m.bindPopup(popupClientHtml(c));
      m.clientName = (c.name||c.nom||"").toLowerCase();
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
    try { if (db) db.ref(`livreurs/${LIVREUR_ID}`).set({ lat, lng, updatedAt: Date.now() }); } catch(e){}
  }, e=>console.warn('geo err',e), {enableHighAccuracy:true, maximumAge:2000, timeout:10000});
}

/* ========== RECHERCHE CLIENTS ========== */
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
      d.textContent = m.clientData.name || m.clientData.nom || "";
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

/* ========== ITINERAIRE ========== */
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
function clearItinerary(){ routeLayer.clearLayers(); routePolyline=null; }

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

/* ========== CONTEXTMENU ========== */
map.on('contextmenu', e=>ajouterClient(e.latlng.lat,e.latlng.lng));

/* ========== START ========== */
listenClients();
