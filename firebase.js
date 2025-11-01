// firebase.js
import { initializeApp } from "firebase/app";
import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    update,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// === Replace this with your own Firebase project config ===
const firebaseConfig = {
    apiKey: "AIzaSyBSiVslttjTPAHsHpZftH5z-VkIE2v0yls",
    authDomain: "houseruleschess.firebaseapp.com",
    projectId: "houseruleschess",
    storageBucket: "houseruleschess.firebasestorage.app",
    messagingSenderId: "153875021963",
    appId: "1:153875021963:web:621622c998f51420ed948e"
};

// ==========================================================

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Utility: Generate or read game ID ---
let gameId = window.location.pathname.split("/game/")[1];
if (!gameId) {
    // No gameId → create one and redirect
    gameId = Math.random().toString(36).slice(2, 8);
    window.history.replaceState({}, "", `/game/${gameId}`);
}

// DOM references
const p1Span = document.getElementById("p1Count");
const p2Span = document.getElementById("p2Count");
const btn = document.getElementById("clickBtn");
const link = document.getElementById("shareLink");
const idLabel = document.getElementById("gameId");

idLabel.textContent = `Game ID: ${gameId}`;
link.textContent = `Share this link: ${window.location.href}`;

// --- Player assignment (simple heuristic) ---
let player;
if (!sessionStorage.getItem("player")) {
    // randomly assign first visitor as Player 1
    player = Math.random() < 0.5 ? "p1" : "p2";
    sessionStorage.setItem("player", player);
} else {
    player = sessionStorage.getItem("player");
}
btn.textContent = `I'm ${player.toUpperCase()} — Click Me`;

// --- Database references ---
const gameRef = ref(db, "games/" + gameId);

// Create game if not exists
get(gameRef).then((snapshot) => {
    if (!snapshot.exists()) {
        set(gameRef, { p1: 0, p2: 0 });
    }
});

// --- Listen for changes ---
onValue(gameRef, (snap) => {
    const data = snap.val() || { p1: 0, p2: 0 };
    p1Span.textContent = data.p1;
    p2Span.textContent = data.p2;
});

// --- Button click handler ---
btn.addEventListener("click", async () => {
    const snapshot = await get(gameRef);
    const data = snapshot.val() || { p1: 0, p2: 0 };
    data[player] += 1;
    await update(gameRef, data);
});
