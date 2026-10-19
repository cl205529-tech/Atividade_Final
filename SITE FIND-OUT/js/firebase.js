import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCiVC05696RIh1jl-_MKM7hAjG_RLTQZ5Y",
  authDomain: "findout-6c19f.firebaseapp.com",
  databaseURL: "https://findout-6c19f-default-rtdb.firebaseio.com",
  projectId: "findout-6c19f",
  storageBucket: "findout-6c19f.firebasestorage.app",
  messagingSenderId: "250142903940",
  appId: "1:250142903940:web:acf9e73242ddb4d1a03cd1",
  measurementId: "G-BW6DPBNWKG"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics é opcional */ }
export const auth = getAuth(app);
export const db = getDatabase(app);
