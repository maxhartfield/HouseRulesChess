// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    update,
    remove,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ---- Firebase config (note storageBucket .appspot.com) ----
const firebaseConfig = {
    apiKey: "AIzaSyBSiVslttjTPAHsHpZftH5z-VkIE2v0yls",
    authDomain: "houseruleschess.firebaseapp.com",
    projectId: "houseruleschess",
    storageBucket: "houseruleschess.appspot.com",
    messagingSenderId: "153875021963",
    appId: "1:153875021963:web:621622c998f51420ed948e",
    databaseURL: "https://houseruleschess-default-rtdb.firebaseio.com/",
};

// ---- Init ----
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---- Repo-aware base path (/HouseRulesChess/) ----
const pathParts = window.location.pathname.split("/").filter(Boolean);
const repoName = pathParts.length ? pathParts[0] : ""; // "HouseRulesChess"
const basePath = repoName ? `/${repoName}/` : "/";

// ---- Extract or create game id ----
// --- Determine base path (repo-aware) + extract or create game id ---
const onGitHubPages = location.hostname.endsWith('github.io');

// Repo prefix is "/HouseRulesChess/" on GitHub Pages, "/" in local dev
const repoSegment = onGitHubPages ? location.pathname.split('/').filter(Boolean)[0] : '';
const repoPrefix = onGitHubPages ? `/${repoSegment}/` : '/';

// Robustly extract gameId if present (don’t double-append "game/")
let gameId = null;
if (location.pathname.includes('/game/')) {
    // everything after the first "/game/" segment up to the next slash/hash/query
    const after = location.pathname.split('/game/')[1] || '';
    gameId = after.split(/[/?#]/)[0] || null;
}

// If no gameId in URL, create one and write a clean URL exactly once
if (!gameId) {
    gameId = Math.random().toString(36).slice(2, 8);
    const newUrl = new URL(`${repoPrefix}game/${gameId}`, location.origin);
    // Only replace when we’re not already at that exact path
    if (location.pathname !== newUrl.pathname) {
        history.replaceState({}, '', newUrl.toString());
    }
}

// Share link always uses the canonical repo prefix
const idLabel = document.getElementById('gameId');
const statusDiv = document.getElementById('status');
const link = document.getElementById('shareLink');

idLabel.textContent = `Game ID: ${gameId}`;
const shareURL = new URL(`${repoPrefix}game/${gameId}`, location.origin).toString();
link.innerHTML = `Share this link: <a href="${shareURL}">${shareURL}</a>`;

// ---- Game state ----
const chess = new Chess();
let board = null;
let playerRole = "spectator"; // "white" | "black" | "spectator"
let isUpdatingFromFirebase = false;
// --- Responsive sizing helpers ---
const boardEl = document.getElementById("board");

// Debounce helper (prevents overfiring on resize)
function debounce(fn, ms = 120) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), ms);
    };
}

// Calculate and apply responsive board width
function fitBoard() {
    if (!boardEl) return;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const size = Math.min(520, Math.max(280, Math.floor(vw * 0.92))); // 92% of viewport width
    boardEl.style.width = size + "px";
    if (board) board.resize();
}

// Trigger refit on resize and orientation change
window.addEventListener("resize", debounce(fitBoard, 120));
window.addEventListener("orientationchange", fitBoard);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fitBoard();
});

let lastSyncedFen = null;

// ---- DB refs ----
const gameRef = ref(db, "games/" + gameId);

// ---- Init or join game ----
async function initializeGame() {
    const snap = await get(gameRef);
    const data = snap.val();

    if (!data) {
        // New game: claim white, set initial state, create players
        playerRole = "white";
        sessionStorage.setItem(`player_${gameId}`, playerRole);

        await set(gameRef, {
            fen: chess.fen(),         // starting position
            turn: "w",
            players: { white: true }, // claim white
            created: Date.now(),
            lastActivity: Date.now(),
            status: "active",
        });
    } else {
        // Existing game: load position
        if (data.fen) chess.load(data.fen);

        // Determine/claim role
        const stored = sessionStorage.getItem(`player_${gameId}`);
        const players = data.players || {};

        if (stored === "white" || stored === "black") {
            playerRole = stored;
        } else if (!players.white) {
            playerRole = "white";
            players.white = true;
            await update(gameRef, { players, lastActivity: Date.now() });
        } else if (!players.black) {
            playerRole = "black";
            players.black = true;
            await update(gameRef, { players, lastActivity: Date.now() });
        } else {
            playerRole = "spectator";
        }
        sessionStorage.setItem(`player_${gameId}`, playerRole);
    }

    // Init board UI

    if (typeof Chessboard !== "undefined") {
        board = Chessboard("board", {
            position: chess.fen(),
            orientation: playerRole === "black" ? "black" : "white",
            draggable: playerRole !== "spectator",
            pieceTheme: "https://cdn.jsdelivr.net/gh/oakmac/chessboardjs/website/img/chesspieces/wikipedia/{piece}.png",
            onDragStart,
            onDrop,
            onSnapEnd,
        });
        lastSyncedFen = chess.fen();
    } else {
        console.error("Chessboard library not loaded");
    }

    updateStatus();
}

// ---- Drag rules ----
function onDragStart(source, piece) {
    // Block spectators and game-over cases
    if (playerRole === "spectator" || chess.game_over() || isUpdatingFromFirebase) return false;

    const myColor = playerRole === "white" ? "w" : "b";
    const pieceColor = piece[0]; // "w" | "b"
    const turn = chess.turn();

    // Only your pieces, only on your turn
    if (pieceColor !== myColor || turn !== myColor) return false;

    return true;
}

function onDrop(source, target) {
    if (isUpdatingFromFirebase) return "snapback";

    const move = chess.move({ from: source, to: target, promotion: "q" });
    if (move === null) return "snapback";

    updateGameState(); // push to Firebase
    // Let the UI stay; RTDB listener will confirm/realign
}

function onSnapEnd() {
    // UI is driven by RTDB listener; nothing here
}

// ---- Push state to Firebase ----
async function updateGameState() {
    const gameStatus = chess.game_over()
        ? (chess.in_checkmate() ? "checkmate" : (chess.in_draw() ? "draw" : "gameover"))
        : "active";

    await update(gameRef, {
        fen: chess.fen(),
        turn: chess.turn(),
        lastActivity: Date.now(),
        status: gameStatus,
    });
}

// ---- Status UI ----
function updateStatus() {
    if (!statusDiv) return;

    const over = chess.game_over();
    const turn = chess.turn(); // "w" or "b"
    const myTurn = (playerRole === "white" && turn === "w") || (playerRole === "black" && turn === "b");

    statusDiv.className = "status";

    if (playerRole === "spectator") {
        statusDiv.textContent = "You are observing";
        return;
    }

    if (over) {
        statusDiv.classList.add("game-over");
        if (chess.in_checkmate()) {
            const winner = turn === "w" ? "Black" : "White";
            statusDiv.textContent = `Checkmate! ${winner} wins.`;
        } else if (chess.in_draw()) {
            statusDiv.textContent = "Game ended in a draw.";
        } else {
            statusDiv.textContent = "Game over.";
        }
        return;
    }

    if (myTurn) {
        statusDiv.classList.add("your-turn");
        statusDiv.textContent = `Your turn (${playerRole}).`;
    } else {
        statusDiv.classList.add("opponent-turn");
        statusDiv.textContent = `Waiting for opponent… (${playerRole}).`;
    }
}

// ---- RTDB listener (sync board) ----
onValue(gameRef, (snap) => {
    const data = snap.val();
    if (!data || !data.fen) return;

    if (data.fen === lastSyncedFen) return; // ignore no-op
    isUpdatingFromFirebase = true;

    chess.load(data.fen);
    if (board) board.position(chess.fen());

    lastSyncedFen = data.fen;
    updateStatus();
    isUpdatingFromFirebase = false;
});

// ---- Light cleanup of stale games (optional) ----
async function cleanupOldGames(maxAgeHours = 24) {
    try {
        const gamesRef = ref(db, "games");
        const snapshot = await get(gamesRef);
        if (!snapshot.exists()) return;

        const now = Date.now();
        const maxAge = maxAgeHours * 60 * 60 * 1000;
        const games = snapshot.val();
        let deleted = 0;

        for (const id in games) {
            if (id === gameId) continue;
            const g = games[id];
            const last = g.lastActivity || g.created || 0;
            if (now - last > maxAge) {
                await remove(ref(db, `games/${id}`));
                deleted++;
            }
        }
        if (deleted) console.log(`Cleaned ${deleted} old game(s).`);
    } catch (e) {
        console.error("Cleanup error:", e);
    }
}
setTimeout(() => cleanupOldGames(24), 2000);
setInterval(() => cleanupOldGames(24), 60 * 60 * 1000);

// ---- Go ----
initializeGame();
