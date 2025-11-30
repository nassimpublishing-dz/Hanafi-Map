/* ===========================================================
   app.js — Version FINALE CORRIGÉE - Hanafi Livraison
   Navigation libre + Recalcul auto + Installation APK
   =========================================================== */

console.log('🚀 Hanafi Livraison - Application chargée');

// Attendre que la page soit complètement chargée
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM chargé, initialisation...');
    
    // Vérifier que Firebase est disponible
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase non disponible');
        return;
    }

    // CODE DE CONNEXION CORRIGÉ
    const loginBtn = document.getElementById('loginBtn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            const email = emailInput.value;
            const password = passwordInput.value;
            
            console.log('🔐 Tentative de connexion:', email);
            
            // VÉRIFIER QUE FIREBASE EST INITIALISÉ
            if (!firebase.apps.length) {
                loginError.textContent = 'Erreur: Firebase non initialisé';
                return;
            }
            
            // UTILISEZ LES BONS IDENTIFIANTS DE TEST
            firebase.auth().signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    console.log('✅ Connexion réussie');
                    loginError.textContent = '';
                    // Votre code de succès...
                })
                .catch((error) => {
                    console.error('❌ Erreur connexion:', error);
                    loginError.textContent = 'Email ou mot de passe incorrect';
                });
        });
    }
    
    // CONTINUER AVEC LE RESTE DE VOTRE CODE
    initializeApp();
});

/* ===========================================================
   INITIALISATION DE L'APPLICATION
   =========================================================== */
function initializeApp() {
    const APP_VERSION = 'v5.0-final-' + new Date().getTime();
    console.log('🚀 ' + APP_VERSION + ' - Hanafi Livraison');

    const defaultCenter = [36.7119, 4.0459];
    const defaultZoom = 17;
    const GRAPHHOPPER_KEY = "2d4407fe-6ae8-4008-a2c7-c1ec034c8f10";

    /* ---------- SÉLECTEURS ---------- */
    const loginContainer = document.getElementById("loginContainer");
    const mapDiv = document.getElementById("map");
    const logoutBtn = document.getElementById("logoutBtn");
    const controls = document.getElementById("controls");
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearch");
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
    let destination = null;
    let lastRouteUpdate = 0;
    let routeRecalculationInterval = null;

    /* ---------- CONSTANTES DE RECALCUL ---------- */
    const ROUTE_UPDATE_DISTANCE_THRESHOLD = 50;
    const ROUTE_UPDATE_TIME_THRESHOLD = 30000;

    /* ---------- AJOUT : TIMER DÉCONNEXION AUTO ---------- */
    let autoLogoutTimer = null;

    /* ---------- ICONES ---------- */
    const clientIcon = L.icon({ 
        iconUrl: "/Hanafi-Map/magasin-delectronique.png", 
        iconSize: [42,42], 
        iconAnchor: [21,42] 
    });

    const livreurIcon = L.icon({ 
        iconUrl: "/Hanafi-Map/camion-dexpedition.png", 
        iconSize: [48,48], 
        iconAnchor: [24,48] 
    });

    /* ===========================================================
       INITIALISATION ET SÉCURITÉ
       =========================================================== */

    // Vérification Leaflet
    if (typeof L === "undefined") {
        console.error("❌ Leaflet non chargé");
        showTempNotification("Erreur: Carte non chargée", 5000);
    }

    /* ---------- LOGOUT ---------- */
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await firebase.auth().signOut();
                showTempNotification("👋 Déconnexion réussie", 2000);
            } catch (e) {
                console.warn("Erreur logout :", e);
            }
        });
    }

    /* ===========================================================
       SURVEILLANCE AUTH + AUTO-LOGOUT 10h
       =========================================================== */
    firebase.auth().onAuthStateChanged(async user => {
        try {
            if (user) {
                currentUser = user;
                console.log("🔵 Connecté :", user.email);
                showTempNotification("✅ Connecté en tant que " + user.email, 2000);

                /* ---------- AUTO LOGOUT APRÈS 10H ---------- */
                if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
                autoLogoutTimer = setTimeout(() => {
                    if (confirm("⏳ Votre session a expiré après 10 heures. Voulez-vous rester connecté ?")) {
                        // Redémarrer le timer
                        autoLogoutTimer = setTimeout(() => {
                            firebase.auth().signOut();
                        }, 36000000);
                    } else {
                        firebase.auth().signOut();
                    }
                }, 36000000);
                /* ------------------------------------------ */

                if (loginContainer) loginContainer.style.display = "none";
                if (logoutBtn) logoutBtn.style.display = "block";
                if (mapDiv) mapDiv.style.display = "block";
                if (controls) controls.style.display = "flex";

                initMap();
                startGeolocAndListen();
                
            } else {
                console.log("🔴 Déconnecté");

                /* ---------- STOP TIMER ---------- */
                if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
                autoLogoutTimer = null;
                /* -------------------------------- */

                currentUser = null;
                cleanupAfterLogout();
            }
        } catch (e) {
            console.error("onAuthStateChanged error:", e);
            showTempNotification("❌ Erreur de connexion", 3000);
        }
    });

    /* ===========================================================
       INIT MAP
       =========================================================== */
    function initMap() {
        try {
            if (map) {
                map.remove();
                map = null;
            }
        } catch (_) {}

        map = L.map("map", { 
            center: defaultCenter, 
            zoom: defaultZoom,
            zoomControl: false
        });

        // Contrôle de zoom personnalisé
        L.control.zoom({
            position: 'topright'
        }).addTo(map);

        const normalTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 19
        }).addTo(map);

        const satelliteTiles = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
            subdomains: ["mt0","mt1","mt2","mt3"], 
            maxZoom: 20,
            attribution: "© Google Satellite"
        });

        routeLayer = L.layerGroup().addTo(map);
        clientsLayer = L.layerGroup().addTo(map);

        // Ajout de clients par clic droit
        map.on("contextmenu", e => {
            if (!currentUser) {
                showTempNotification("🔒 Connectez-vous pour ajouter un client", 3000);
                return;
            }
            
            const nom = prompt("Nom du client :");
            if (!nom) return;
            
            firebase.database().ref(`clients/${currentUser.uid}`).push({
                name: nom, 
                lat: e.latlng.lat, 
                lng: e.latlng.lng, 
                createdAt: Date.now()
            });
            
            showTempNotification("✅ Client " + nom + " ajouté", 2000);
        });

        // Redimensionnement
        setTimeout(() => {
            map.invalidateSize();
            showTempNotification("🗺️ Carte initialisée", 1500);
        }, 500);

        createBottomButtons(normalTiles, satelliteTiles);
    }

    /* ===========================================================
       GÉOLOCALISATION + CLIENTS - NAVIGATION LIBRE
       =========================================================== */
    function startGeolocAndListen() {
        // Nettoyage précédent
        if (geoWatchId !== null) {
            navigator.geolocation.clearWatch(geoWatchId);
            geoWatchId = null;
        }
        if (clientsRef) {
            clientsRef.off();
            clientsRef = null;
        }

        if ("geolocation" in navigator) {
            // Position initiale
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude: lat, longitude: lng } = pos.coords;
                if (!userMarker) {
                    userMarker = L.marker([lat, lng], { icon: livreurIcon }).addTo(map);
                }
                map.setView([lat, lng], 15);
                showTempNotification("📍 Position GPS activée", 2000);
            }, errorHandler, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });

            // Surveillance en temps réel
            geoWatchId = navigator.geolocation.watchPosition(
                pos => {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    updateUserPosition(lat, lng);
                    
                    if (currentUser) {
                        firebase.database().ref(`livreurs/${currentUser.uid}`).set({ 
                            lat, 
                            lng, 
                            updatedAt: Date.now(),
                            name: currentUser.email
                        });
                    }
                },
                errorHandler,
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        } else {
            showTempNotification("❌ Géolocalisation non supportée", 3000);
        }

        // Écoute des clients
        clientsRef = firebase.database().ref(`clients/${currentUser.uid}`);
        clientsRef.on("value", snap => {
            clientsLayer.clearLayers();
            markers = [];
            const data = snap.val();
            
            if (!data) {
                console.log("📝 Aucun client trouvé");
                return;
            }

            Object.entries(data).forEach(([id, c]) => {
                const marker = L.marker([c.lat, c.lng], { icon: clientIcon });
                marker.bindPopup(popupClientHtml(currentUser.uid, id, c));
                marker.clientName = (c.name || "").toLowerCase();
                marker.clientData = c;
                marker.clientDataId = id;
                clientsLayer.addLayer(marker);
                markers.push(marker);
            });
            
            console.log("👥 " + Object.keys(data).length + " clients chargés");
        });
    }

    /* ===========================================================
       FONCTION DE MISE À JOUR POSITION - SANS RECENTRAGE
       =========================================================== */
    function updateUserPosition(lat, lng) {
        if (!userMarker) {
            userMarker = L.marker([lat, lng], { icon: livreurIcon })
                .addTo(map)
                .bindPopup("📍 Votre position actuelle")
                .openPopup();
        } else {
            userMarker.setLatLng([lat, lng]);
        }

        // Vérifier si on s'est éloigné de l'itinéraire
        if (destination && routePolyline) {
            checkRouteDeviation([lat, lng]);
        }

        // ✅ AUCUN RECENTRAGE AUTOMATIQUE - NAVIGATION 100% LIBRE
    }

    /* ===========================================================
       DÉTECTION DE DÉVIATION DE L'ITINÉRAIRE
       =========================================================== */
    function checkRouteDeviation(currentPosition) {
        if (!routePolyline || !destination) return;

        const routeLatLngs = routePolyline.getLatLngs();
        let minDistance = Infinity;

        // Optimisation : vérifier seulement quelques points
        const step = Math.max(1, Math.floor(routeLatLngs.length / 8));
        
        for (let i = 0; i < routeLatLngs.length - 1; i += step) {
            const segmentStart = routeLatLngs[i];
            const segmentEnd = routeLatLngs[Math.min(i + 1, routeLatLngs.length - 1)];
            const distance = distanceToSegment(currentPosition, segmentStart, segmentEnd);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        const timeSinceLastUpdate = Date.now() - lastRouteUpdate;

        const shouldRecalculate = 
            minDistance > ROUTE_UPDATE_DISTANCE_THRESHOLD && 
            timeSinceLastUpdate > ROUTE_UPDATE_TIME_THRESHOLD;

        if (shouldRecalculate) {
            console.log(`🔄 Déviation détectée: ${minDistance.toFixed(1)}m - Recalcul...`);
            showTempNotification("🔄 Adaptation de l'itinéraire...", 2000);
            recalculateRoute(currentPosition, destination);
        }
    }

    /* ===========================================================
       CALCUL DISTANCE À UN SEGMENT
       =========================================================== */
    function distanceToSegment(point, segmentStart, segmentEnd) {
        const A = point[0] - segmentStart.lat;
        const B = point[1] - segmentStart.lng;
        const C = segmentEnd.lat - segmentStart.lat;
        const D = segmentEnd.lng - segmentStart.lng;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = segmentStart.lat;
            yy = segmentStart.lng;
        } else if (param > 1) {
            xx = segmentEnd.lat;
            yy = segmentEnd.lng;
        } else {
            xx = segmentStart.lat + param * C;
            yy = segmentStart.lng + param * D;
        }

        const dx = point[0] - xx;
        const dy = point[1] - yy;
        
        return Math.sqrt(dx * dx + dy * dy) * 111319.9;
    }

    /* ===========================================================
       RECALCUL AUTOMATIQUE DE L'ITINÉRAIRE - SANS RECENTRAGE
       =========================================================== */
    async function recalculateRoute(start, end) {
        if (!start || !end) return;

        lastRouteUpdate = Date.now();
        
        const infoDiv = document.getElementById("routeSummary");
        const originalContent = infoDiv.innerHTML;
        
        infoDiv.innerHTML = "🔄 <b>Adaptation de l'itinéraire...</b>";

        try {
            const url = `https://graphhopper.com/api/1/route?point=${start[0]},${start[1]}&point=${end[0]},${end[1]}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
            const res = await fetch(url, { timeout: 10000 });
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            const path = data.paths?.[0];
            
            if (!path) throw new Error("Aucun itinéraire trouvé");

            // Mettre à jour la polyligne SANS RECENTRER
            const coords = path.points.coordinates.map(p => [p[1], p[0]]);
            routePolyline.setLatLngs(coords);

            // Mettre à jour les informations
            const km = (path.distance / 1000).toFixed(2);
            const min = Math.round(path.time / 60000);

            infoDiv.innerHTML = `🚗 <b>Distance</b>: ${km} km — ⏱️ <b>Durée</b>: ${min} min — 🔄 <b>Itinéraire adapté</b>`;

            showTempNotification("✅ Itinéraire recalculé !", 2000);
            
        } catch (error) {
            console.error("Erreur recalcul itinéraire:", error);
            infoDiv.innerHTML = originalContent;
            showTempNotification("❌ Erreur de recalcul", 2000);
        }
    }

    /* ===========================================================
       NOTIFICATION TEMPORAIRE
       =========================================================== */
    function showTempNotification(message, duration = 3000) {
        // Éviter les doublons
        const existing = document.getElementById('tempNotification');
        if (existing) existing.remove();

        const notification = document.createElement("div");
        notification.id = 'tempNotification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #007bff;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease-out;
            text-align: center;
            max-width: 90%;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);

        // Styles d'animation
        if (!document.getElementById('notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                @keyframes slideDown {
                    from { top: -50px; opacity: 0; }
                    to { top: 20px; opacity: 1; }
                }
                @keyframes slideUp {
                    from { top: 20px; opacity: 1; }
                    to { top: -50px; opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        // Auto-suppression
        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    /* ===========================================================
       GESTION DES ERREURS GPS
       =========================================================== */
    function errorHandler(error) {
        console.warn('Erreur GPS:', error);
        switch(error.code) {
            case error.PERMISSION_DENIED:
                showTempNotification("❌ GPS refusé. Activez la localisation", 5000);
                break;
            case error.POSITION_UNAVAILABLE:
                showTempNotification("📡 Position indisponible", 3000);
                break;
            case error.TIMEOUT:
                showTempNotification("⏰ Timeout GPS", 3000);
                break;
            default:
                console.log("Erreur GPS inconnue:", error.message);
        }
    }

    /* ===========================================================
       POPUP CLIENT
       =========================================================== */
    function popupClientHtml(uid, id, c) {
        const nom = escapeHtml(c.name || "Client");
        const safeUid = encodeURIComponent(uid);
        const safeId = encodeURIComponent(id);
        
        return `
            <div style="font-size:13px;max-width:260px;">
                <b>${nom}</b><br>
                ${c.createdAt ? `<small style="color:#777">Ajouté: ${new Date(c.createdAt).toLocaleString()}</small><br>` : ""}
                <div style="margin-top:8px;display:flex;gap:6px;flex-direction:column;">
                    <button onclick="calculerItineraire(${c.lat}, ${c.lng})" 
                            style="background:#0074FF;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">
                        🧭 Itinéraire
                    </button>
                    <button onclick="supprimerItineraire()" 
                            style="background:#6c757d;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">
                        ❌ Enlever itinéraire
                    </button>
                    <button onclick="commanderClient('${safeUid}','${safeId}')" 
                            style="background:#FF9800;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">
                        📦 Passer commande
                    </button>
                    <button onclick="renommerClient('${safeId}')" 
                            style="background:#009688;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">
                        ✏️ Modifier
                    </button>
                    <button onclick="supprimerClient('${safeId}')" 
                            style="background:#e53935;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }

    /* ===========================================================
       ITINÉRAIRES - NAVIGATION 100% LIBRE
       =========================================================== */
    async function calculerItineraire(destLat, destLng) {
        routeLayer.clearLayers();
        if (!userMarker) {
            showTempNotification("📍 Attente de la localisation...", 3000);
            return;
        }

        const me = userMarker.getLatLng();
        destination = [destLat, destLng];
        lastRouteUpdate = Date.now();
        
        const infoDiv = document.getElementById("routeSummary");
        infoDiv.style.display = "block";
        infoDiv.textContent = "⏳ Calcul en cours...";

        try {
            const url = `https://graphhopper.com/api/1/route?point=${me.lat},${me.lng}&point=${destLat},${destLng}&vehicle=car&locale=fr&points_encoded=false&key=${GRAPHHOPPER_KEY}`;
            const res = await fetch(url, { timeout: 15000 });
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            const path = data.paths?.[0];
            if (!path) throw new Error("Aucun itinéraire trouvé");

            const coords = path.points.coordinates.map(p => [p[1], p[0]]);
            routePolyline = L.polyline(coords, { 
                color: "#0074FF", 
                weight: 5,
                opacity: 0.7
            }).addTo(routeLayer);

            // Point de destination
            L.marker([destLat, destLng], { icon: clientIcon })
                .addTo(routeLayer)
                .bindPopup("🎯 Destination")
                .openPopup();

            // ✅ SUPPRIMÉ TOUT RECENTRAGE - Navigation libre

            const km = (path.distance / 1000).toFixed(2);
            const min = Math.round(path.time / 60000);

            infoDiv.innerHTML = `🚗 <b>Distance</b>: ${km} km — ⏱️ <b>Durée</b>: ${min} min — 📍 <b>Navigation active</b>`;

            showTempNotification("🧭 Itinéraire calculé - Navigation libre activée", 3000);

            // Démarrer la surveillance
            startRouteMonitoring();

        } catch (error) {
            console.error("Erreur itinéraire:", error);
            infoDiv.textContent = "❌ Impossible de calculer l'itinéraire";
            showTempNotification("❌ Erreur calcul itinéraire", 3000);
        }
    }

    /* ===========================================================
       SURVEILLANCE DE L'ITINÉRAIRE
       =========================================================== */
    function startRouteMonitoring() {
        if (routeRecalculationInterval) {
            clearInterval(routeRecalculationInterval);
        }
        
        routeRecalculationInterval = setInterval(() => {
            if (userMarker && destination) {
                const currentPos = userMarker.getLatLng();
                checkRouteDeviation([currentPos.lat, currentPos.lng]);
            }
        }, 15000);
    }

    function supprimerItineraire() {
        if (routeLayer) routeLayer.clearLayers();
        routePolyline = null;
        destination = null;
        
        if (routeRecalculationInterval) {
            clearInterval(routeRecalculationInterval);
            routeRecalculationInterval = null;
        }
        
        routeSummary.style.display = "none";
        routeSummary.textContent = "";
        showTempNotification("🧭 Itinéraire supprimé", 2000);
    }

    /* ===========================================================
       COMMANDES / CRUD
       =========================================================== */
    function commanderClient(uidEnc, idEnc) {
        const uid = decodeURIComponent(uidEnc);
        const id = decodeURIComponent(idEnc);
        const produit = prompt("Quel produit ?");
        if (!produit) return;
        
        firebase.database().ref(`commandes/${uid}/${id}`).push({
            produit: produit.trim(),
            date: new Date().toISOString(),
            status: "en attente",
            par: currentUser ? currentUser.uid : "anonymous"
        });
        
        showTempNotification("📦 Commande enregistrée pour " + produit, 3000);
    }

    function renommerClient(idEnc) {
        const id = decodeURIComponent(idEnc);
        const n = prompt("Nouveau nom :");
        if (!n) return;
        
        firebase.database().ref(`clients/${currentUser.uid}/${id}/name`).set(n);
        showTempNotification("✏️ Client renommé", 2000);
    }

    function supprimerClient(idEnc) {
        const id = decodeURIComponent(idEnc);
        if (!confirm("Supprimer définitivement ce client ?")) return;
        
        firebase.database().ref(`clients/${currentUser.uid}/${id}`).remove();
        showTempNotification("🗑️ Client supprimé", 2000);
    }

    /* ===========================================================
       RECHERCHE CLIENTS
       =========================================================== */
    function enableSearch() {
        if (!searchInput || !clearSearchBtn) return;
        
        function toggleBtn() {
            clearSearchBtn.style.display = searchInput.value ? "block" : "none";
        }
        
        searchInput.addEventListener("input", e => {
            const q = e.target.value.toLowerCase();
            filterMarkers(q);
            toggleBtn();
        });
        
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            filterMarkers("");
            toggleBtn();
        });
        
        toggleBtn();
    }

    function filterMarkers(query) {
        markers.forEach(m => {
            const match = !query || m.clientName.includes(query);
            if (match) {
                clientsLayer.addLayer(m);
            } else {
                clientsLayer.removeLayer(m);
            }
        });
    }

    function escapeHtml(s){
        return (s||"").toString().replace(/[&<>"']/g, m => 
            ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
    }

    /* ===========================================================
       BOUTONS FLOTTANTS
       =========================================================== */
    function createBottomButtons(normalTiles, satelliteTiles) {
        if (!map || document.getElementById("mapButtons")) return;
        
        const container = document.createElement("div");
        container.id = "mapButtons";
        container.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

        const btnStyle = `
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.3s;
        `;

        const toggleBtn = document.createElement("button");
        toggleBtn.innerText = "🛰️ Satellite";
        toggleBtn.style.cssText = btnStyle;

        const posBtn = document.createElement("button");
        posBtn.innerText = "📍 Ma position";
        posBtn.style.cssText = btnStyle;

        // Événements
        toggleBtn.addEventListener("click", () => {
            if (map.hasLayer(satelliteTiles)) {
                map.removeLayer(satelliteTiles);
                toggleBtn.innerText = "🛰️ Satellite";
                showTempNotification("🗺️ Vue normale", 1500);
            } else {
                satelliteTiles.addTo(map);
                toggleBtn.innerText = "🗺️ Carte";
                showTempNotification("🛰️ Vue satellite", 1500);
            }
        });

        posBtn.addEventListener("click", () => {
            if (userMarker) {
                map.setView(userMarker.getLatLng(), 16);
                showTempNotification("📍 Recentrage sur votre position", 1500);
            } else {
                showTempNotification("📍 Localisation en cours...", 2000);
            }
        });

        // Effets hover
        [toggleBtn, posBtn].forEach(btn => {
            btn.addEventListener('mouseover', () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.background = '#0056b3';
            });
            btn.addEventListener('mouseout', () => {
                btn.style.transform = 'scale(1)';
                btn.style.background = '#007bff';
            });
        });

        container.appendChild(toggleBtn);
        container.appendChild(posBtn);
        document.body.appendChild(container);
    }

    /* ===========================================================
       CLEANUP
       =========================================================== */
    function cleanupAfterLogout() {
        if (loginContainer) loginContainer.style.display = "block";
        if (mapDiv) mapDiv.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (controls) controls.style.display = "none";

        if (geoWatchId !== null) {
            navigator.geolocation.clearWatch(geoWatchId);
            geoWatchId = null;
        }

        if (clientsRef) {
            clientsRef.off();
            clientsRef = null;
        }

        if (routeRecalculationInterval) {
            clearInterval(routeRecalculationInterval);
            routeRecalculationInterval = null;
        }

        if (routeLayer) routeLayer.clearLayers();
        if (clientsLayer) clientsLayer.clearLayers();

        if (map) { 
            map.remove(); 
            map = null; 
        }

        markers = [];
        userMarker = null;
        routePolyline = null;
        destination = null;

        routeSummary.style.display = "none";
        routeSummary.textContent = "";

        // Reset des champs de login
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('loginError');
        
        if (emailInput) emailInput.value = "";
        if (passwordInput) passwordInput.value = "";
        if (loginError) loginError.textContent = "";
    }

    /* ===========================================================
       INITIALISATION
       =========================================================== */

    // Démarrer la recherche
    enableSearch();

    // Message de bienvenue
    console.log('🎯 Hanafi Livraison - Prêt !');
    console.log('📍 Fonctionnalités: Navigation libre, Recalcul auto, Installation APK');

    // Export des fonctions globales pour les popups
    window.calculerItineraire = calculerItineraire;
    window.supprimerItineraire = supprimerItineraire;
    window.commanderClient = commanderClient;
    window.renommerClient = renommerClient;
    window.supprimerClient = supprimerClient;
}
