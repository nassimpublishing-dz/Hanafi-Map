/* ===========================================================
   app.js — VERSION FINALE CORRIGÉE - Hanafi Livraison
   =========================================================== */

console.log("🚀 Hanafi Livraison - Application chargée");

/* ---------------------------------------------------------
   🔥 1 — CONFIGURATION FIREBASE UNIQUE - EXÉCUTION IMMÉDIATE
--------------------------------------------------------- */
const firebaseConfig = {
    apiKey: "AIzaSyC0XcVxZ6v9v8q8Q6b6r9K5jM8wXx7vF8d",
    authDomain: "hanafi-livraison.firebaseapp.com",
    databaseURL: "https://hanafi-livraison-default-rtdb.firebaseio.com",
    projectId: "hanafi-livraison",
    storageBucket: "hanafi-livraison.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxx"
};

// Initialisation Firebase IMMÉDIATE
let auth, db;
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("🎉 Firebase initialisé !");
    } else {
        console.log("✅ Firebase déjà initialisé");
    }
    auth = firebase.auth();
    db = firebase.database();
} else {
    console.error("❌ Firebase non chargé !");
}

/* ---------------------------------------------------------
   ⏳ 2 — DÉCONNEXION AUTOMATIQUE APRÈS 10H
--------------------------------------------------------- */
const AUTO_LOGOUT_DELAY = 10 * 60 * 60 * 1000;

function startAutoLogout() {
    const expire = Date.now() + AUTO_LOGOUT_DELAY;
    localStorage.setItem("session_expires", expire);
}

setInterval(() => {
    const expire = localStorage.getItem("session_expires");
    if (expire && Date.now() > expire) {
        if (auth) auth.signOut();
        alert("⏳ Session expirée — reconnectez-vous.");
        location.reload();
    }
}, 10000);

/* ---------------------------------------------------------
   🔐 3 — CONNEXION - AVEC VÉRIFICATION FIREBASE
--------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM chargé, initialisation...');
    
    const loginBtn = document.getElementById("loginBtn");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginError = document.getElementById("loginError");

    if (loginBtn && auth) {
        loginBtn.addEventListener("click", () => {
            const email = emailInput.value.trim();
            const pass = passwordInput.value.trim();

            if (!email || !pass) {
                if (loginError) loginError.textContent = "Veuillez entrer email et mot de passe";
                return;
            }

            console.log('🔐 Tentative de connexion:', email);

            auth.signInWithEmailAndPassword(email, pass)
                .then((userCredential) => {
                    console.log("🟢 Connecté:", userCredential.user.email);
                    startAutoLogout();
                    if (loginError) loginError.textContent = '';
                    showTempNotification("✅ Connexion réussie!", 2000);
                })
                .catch(err => {
                    console.log("Auth failed:", err);
                    if (loginError) loginError.textContent = "Identifiants incorrects.";
                    showTempNotification("❌ Identifiants incorrects", 3000);
                });
        });
    } else {
        console.error("❌ Firebase Auth non disponible");
    }
    
    // CONTINUER AVEC LE RESTE DE VOTRE CODE
    initializeApp();
});

/* ===========================================================
   INITIALISATION DE L'APPLICATION
   =========================================================== */
function initializeApp() {
    // Vérifier que Firebase est disponible
    if (typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error('❌ Firebase non disponible dans initializeApp');
        showTempNotification("Erreur: Firebase non initialisé", 5000);
        return;
    }

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
        return;
    }

    /* ---------- LOGOUT ---------- */
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await auth.signOut();
                showTempNotification("👋 Déconnexion réussie", 2000);
            } catch (e) {
                console.warn("Erreur logout :", e);
            }
        });
    }

    /* ===========================================================
       SURVEILLANCE AUTH + AUTO-LOGOUT 10h
       =========================================================== */
    auth.onAuthStateChanged(async user => {
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
                            auth.signOut();
                        }, 36000000);
                    } else {
                        auth.signOut();
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
            
            db.ref(`clients/${currentUser.uid}`).push({
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

    // ... LE RESTE DE VOS FONCTIONS IDENTIQUES ...
    // (gardez toutes vos fonctions existantes comme avant)
    
    /* ===========================================================
       NOTIFICATION TEMPORAIRE
       =========================================================== */
    function showTempNotification(message, duration = 3000) {
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

        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    // ... TOUTES VOS AUTRES FONCTIONS EXISTANTES ...

    /* ===========================================================
       INITIALISATION
       =========================================================== */

    // Démarrer la recherche
    enableSearch();

    // Message de bienvenue
    console.log('🎯 Hanafi Livraison - Prêt !');

    // Export des fonctions globales pour les popups
    window.calculerItineraire = calculerItineraire;
    window.supprimerItineraire = supprimerItineraire;
    window.commanderClient = commanderClient;
    window.renommerClient = renommerClient;
    window.supprimerClient = supprimerClient;
}

console.log("🎯 Hanafi Livraison - Initialisé !");
