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
const idLabel = document.getElementById("gameId");
const statusDiv = document.getElementById("status");
const link = document.getElementById("shareLink");

idLabel.textContent = `Game ID: ${gameId}`;
const shareURL = new URL(`${basePath}game/${gameId}`, window.location.origin).toString();
link.innerHTML = `Share this link: <a href="${shareURL}">${shareURL}</a>`;

// --- Assign player per browser tab ---
let playerColor = sessionStorage.getItem(`player_${gameId}`);
if (!playerColor) {
    // First player to join becomes white, second becomes black
    playerColor = "white"; // Will be determined by checking existing game state
    sessionStorage.setItem(`player_${gameId}`, playerColor);
}

// --- Initialize Chess.js ---
const chess = new Chess();

// --- Initialize Chessboard.js ---
let board = null;
let isUpdatingFromFirebase = false;

// --- Database ref ---
const gameRef = ref(db, "games/" + gameId);

// --- Initialize or load game state ---
async function initializeGame() {
    const snap = await get(gameRef);
    const data = snap.val();

    if (!data || !data.fen) {
        // New game - initialize with starting position
        const initialFen = chess.fen();
        playerColor = "white"; // First player is white
        sessionStorage.setItem(`player_${gameId}`, playerColor);

        await set(gameRef, {
            fen: initialFen,
            turn: "w",
            created: Date.now(),
            lastActivity: Date.now(),
        });
    } else {
        // Existing game - load state
        chess.load(data.fen);

        // Determine player color based on who's already playing
        const existingPlayers = data.players || {};
        if (existingPlayers.white && existingPlayers.black) {
            // Both players assigned, assign randomly to new viewer
            playerColor = Math.random() < 0.5 ? "white" : "black";
        } else if (existingPlayers.white) {
            playerColor = "black";
        } else {
            playerColor = "white";
        }
        sessionStorage.setItem(`player_${gameId}`, playerColor);

        // Update players list
        const players = { ...existingPlayers, [playerColor]: true };
        await update(gameRef, { players, lastActivity: Date.now() });
    }

    // Initialize board (wait for library to be ready)
    if (typeof Chessboard !== 'undefined') {
        board = Chessboard("board", {
            position: chess.fen(),
            draggable: true,
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
        });

        // Set initial synced FEN
        lastSyncedFen = chess.fen();
    } else {
        console.error("Chessboard library not loaded");
    }

    updateStatus();
}

// --- Handle drag start ---
function onDragStart(source, piece, position, orientation) {
    // Prevent moving if not your turn or game is over
    const currentTurn = chess.turn();
    const isGameOver = chess.game_over();

    if (isGameOver || isUpdatingFromFirebase) {
        return false;
    }

    // Only allow moving your pieces
    const pieceColor = piece.charAt(0) === "w" ? "w" : "b";
    if (pieceColor !== currentTurn || pieceColor !== (playerColor === "white" ? "w" : "b")) {
        return false;
    }

    return true;
}

// --- Handle drop ---
function onDrop(source, target) {
    if (isUpdatingFromFirebase) {
        return "snapback";
    }

    // Make the move
    const move = chess.move({
        from: source,
        to: target,
        promotion: "q", // Always promote to queen for simplicity
    });

    // Invalid move
    if (move === null) {
        return "snapback";
    }

    // Update Firebase with new game state
    updateGameState();

    // Don't snapback - let the move stay, Firebase will sync it back
    // This prevents flickering and makes the UI more responsive
}

// --- Handle snap end ---
function onSnapEnd() {
    // Board will be updated from Firebase listener
}

// --- Update game state in Firebase ---
async function updateGameState() {
    const gameStatus = chess.game_over()
        ? chess.in_checkmate()
            ? "checkmate"
            : chess.in_draw()
                ? "draw"
                : "gameover"
        : "active";

    await update(gameRef, {
        fen: chess.fen(),
        turn: chess.turn(),
        lastActivity: Date.now(),
        status: gameStatus,
    });
}

// --- Update status display ---
function updateStatus() {
    if (!chess || !statusDiv) return;

    const isGameOver = chess.game_over();
    const currentTurn = chess.turn();
    const myTurn = (playerColor === "white" && currentTurn === "w") ||
        (playerColor === "black" && currentTurn === "b");

    statusDiv.className = "status";

    if (isGameOver) {
        statusDiv.className += " game-over";
        if (chess.in_checkmate()) {
            const winner = chess.turn() === "w" ? "Black" : "White";
            statusDiv.textContent = `Checkmate! ${winner} wins!`;
        } else if (chess.in_draw()) {
            statusDiv.textContent = "Game ended in a draw!";
        } else {
            statusDiv.textContent = "Game over!";
        }
    } else if (myTurn) {
        statusDiv.className += " your-turn";
        statusDiv.textContent = `Your turn (${playerColor})`;
    } else {
        statusDiv.className += " opponent-turn";
        statusDiv.textContent = `Waiting for opponent... (${playerColor})`;
    }
}

// --- Sync updates from Firebase ---
let lastSyncedFen = null;

onValue(gameRef, (snap) => {
    const data = snap.val();
    if (!data || !data.fen) return;

    // Only update if FEN actually changed (avoid unnecessary updates from own moves)
    if (data.fen === lastSyncedFen) {
        return;
    }

    lastSyncedFen = data.fen;
    isUpdatingFromFirebase = true;

    // Load the FEN position
    chess.load(data.fen);

    // Update board position
    if (board) {
        board.position(chess.fen());
    }

    // Update status
    updateStatus();

    isUpdatingFromFirebase = false;
});

// --- Cleanup old games (runs automatically) ---
async function cleanupOldGames(maxAgeHours = 24) {
    try {
        const gamesRef = ref(db, "games");
        const snapshot = await get(gamesRef);

        if (!snapshot.exists()) {
            return; // No games to clean up
        }

        const now = Date.now();
        const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
        const games = snapshot.val();
        let deletedCount = 0;

        // Clean up old games (but skip the current game)
        for (const gameIdToCheck in games) {
            if (gameIdToCheck === gameId) continue; // Don't delete current game

            const game = games[gameIdToCheck];
            const lastActivity = game.lastActivity || game.created || 0;

            if (now - lastActivity > maxAge) {
                const gameRefToDelete = ref(db, `games/${gameIdToCheck}`);
                await remove(gameRefToDelete);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`Automatically cleaned up ${deletedCount} old game(s).`);
        }
    } catch (error) {
        console.error("Cleanup error:", error);
    }
}

// --- Run cleanup automatically on app start (with delay to not slow down initialization) ---
setTimeout(() => {
    cleanupOldGames(24);
}, 2000); // Wait 2 seconds after page load

// --- Also run cleanup periodically (every hour) ---
setInterval(() => {
    cleanupOldGames(24);
}, 60 * 60 * 1000); // Every hour

// --- Initialize game ---
initializeGame();
