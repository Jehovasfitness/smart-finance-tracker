// ============================================================
// firebase-config.js — Firebase setup
// ============================================================

// Your Firebase project configuration
const firebaseConfig = {
apiKey:            "AIzaSyDOa8G3SM9MRjT_obd7c8mfvhIschenlvM",
  authDomain:        "smart-finance-tracker-3dd7f.firebaseapp.com",
  projectId:         "smart-finance-tracker-3dd7f",
  storageBucket:     "smart-finance-tracker-3dd7f.firebasestorage.app",
  messagingSenderId: "553430061379",
  appId:             "1:553430061379:web:5286e815624f126c895ff6"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Make auth and db available globally
var auth = firebase.auth();
var db   = firebase.firestore();

console.log('Firebase connected successfully');
