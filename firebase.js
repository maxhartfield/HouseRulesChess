// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    update,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// --- your Firebase config ---
const firebaseConfig = {
    apiKey: "AIzaSyBSiVslttjTPAHsHpZftH5z-VkIE2v0yls",
    authDomain: "houseruleschess.firebaseapp.com",
    projectId: "houseruleschess",
    storageBucket: "houseruleschess.firebasestorage.app",
    messagingSenderId: "153875021963",
    appId: "1:153875021963:web:621622c998f51420ed948e",
    databaseURL: "https://houseruleschess-default-rtdb.firebaseio.com/",
};

// --- Init ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Determine base path (repo-aware) ---
const pathParts = window.location.pathname.split("/").filter(Boolean);
const repoName = pathParts.length ? pathParts[0] : ""; // "HouseRulesChess"
const basePath = repoName ? `/${repoName}/` : "/";

// --- Extract or create game id ---
let gameId = null;
const gameIdx = window.location.pathname.indexOf(`${basePath}game/`);
if (gameIdx !== -1) {
    gameId = window.location.pathname.slice(
        gameIdx + `${basePath}game/`.length
    );
}
if (!gameId) {
    gameId = Math.random().toString(36).slice(2, 8);
    const newUrl = new URL(`${basePath}game/${gameId}`, window.location.origin);
    window.history.replaceState({}, "", newUrl.toString());
}

// --- DOM elements ---
const p1Span = document.getElementById("p1Count");
const p2Span = document.getElementById("p2Count");
const btn = document.getElementById("clickBtn");
const link = document.getElementById("shareLink");
const idLabel = document.getElementById("gameId");

idLabel.textContent = `Game ID: ${gameId}`;
const shareURL = new URL(`${basePath}game/${gameId}`, window.location.origin).toString();
link.innerHTML = `Share this link: <a href="${shareURL}">${shareURL}</a>`;

// --- Assign player per browser tab ---
let player = sessionStorage.getItem("player");
if (!player) {
    player = Math.random() < 0.5 ? "p1" : "p2";
    sessionStorage.setItem("player", player);
}
btn.textContent = `I'm ${player.toUpperCase()} — Click Me`;

// --- Database ref ---
const gameRef = ref(db, "games/" + gameId);

// create entry if new
get(gameRef).then((snap) => {
    if (!snap.exists()) set(gameRef, { p1: 0, p2: 0 });
});

// sync updates
onValue(gameRef, (snap) => {
    const data = snap.val() || { p1: 0, p2: 0 };
    p1Span.textContent = data.p1;
    p2Span.textContent = data.p2;
});

// button handler
btn.addEventListener("click", async () => {
    const snap = await get(gameRef);
    const data = snap.val() || { p1: 0, p2: 0 };
    data[player] += 1;
    await update(gameRef, data);
});
