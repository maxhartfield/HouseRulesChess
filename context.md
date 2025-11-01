# Context — House Rules Chess Website

## Current State (as of now)

### Infrastructure
- Hosting: Deployed successfully via GitHub Pages under  
  https://maxhartfield.github.io/HouseRulesChess/
- Codebase: Static site (HTML + JS) — no frameworks required.
- Realtime backend: Connected to Firebase Realtime Database (test mode).
- Firebase config: Working with  
  https://houseruleschess-default-rtdb.firebaseio.com/
- Client imports: Using hosted ES modules from  
  https://www.gstatic.com/firebasejs/11.0.1/...
- Routing: Working single-page application (SPA) setup with index.html and 404.html both loading the same logic, enabling /HouseRulesChess/game/:id routes.
- Verification: The “Realtime Sync Test” app functions properly — when two users visit the same game link (for example /game/abcd12), clicking the button updates both browsers instantly via Firebase.

### Known working functionality
- Firebase connection verified (read/write working)
- Dynamic game ID generation and shareable link creation
- Sync updates between devices
- SPA routing functional on GitHub Pages (404.html fallback)
- Project structure clean and minimal (index.html, 404.html, firebase.js)
- .gitignore excludes node_modules

---

## Next Objective — From Counter Demo to Chess Game

### Goal
Build a two-player chess game that works via the same Firebase-based link system:
- Player 1 creates a new game and gets a unique link  
- Player 2 opens that link on a different device or browser  
- Both see the same chessboard and moves update live

### Core Requirements
1. Board setup and rendering  
   - Use a JS chess library such as chessboard.js, chess.js, or chessground  
   - Show a standard 8×8 board with pieces in starting position  
   - Allow only legal moves (validate with chess.js)

2. Realtime sync  
   - Store and update game state (FEN string and turn) in Firebase  
   - Subscribed clients update immediately when Firebase changes

3. Turn control  
   - Only the current player (white/black) can move  
   - The other player sees moves appear in real time

4. Persistence  
   - Game state (FEN, move list, current turn) stored under /games/:id  
   - If a player refreshes, the board restores from Firebase

5. UI  
   - Board display  
   - Current turn indicator  

---

## Next Step (Phase 1 of Chess Build)

Implement the basic playable chessboard synced via Firebase:

- Add a chessboard UI (for example chessboard.js or a lightweight canvas)
- Initialize board using chess.js (for move legality and FEN)
- On move: update local chess state, then push FEN and turn to Firebase
- On Firebase update: load FEN and redraw board to reflect the new state

Success criterion:  
Two players can move pieces alternately on different devices, and the game state stays synced.
