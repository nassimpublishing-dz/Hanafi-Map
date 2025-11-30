// js/firebase-config.js
// >>> REMPLACE LES VALEURS CI-DESSOUS PAR CELLES DE TA FENETRE "CONFIG" DANS FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAtDTNbi_vMSrtHpHigy00quXOLXyGnQ9c",
  authDomain: "hanafi-livraison.firebaseapp.com",
  databaseURL: "https://hanafi-livraison-default-rtdb.firebaseio.com",
  projectId: "hanafi-livraison",
  storageBucket: "hanafi-livraison.appspot.com",
  messagingSenderId: "106630001469",
  appId: "1:106630001469:web:6669587f13f8a0eb5b0b54"
};

let firebaseApp = null;

try {
    firebaseApp = firebase.app();
    console.log("⚠️ Firebase déjà initialisé, instance existante utilisée.");
} catch (e) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase initialisé !");
}

export { firebaseApp };
