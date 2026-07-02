const BOARD_SIZE = 5;
const KOMI = 2.5;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const MAX_MOVES = 24;
const letters = ["A", "B", "C", "D", "E"];
const API_BASE = "http://127.0.0.1:8000";

const boardEl = document.getElementById("board");
const moveCounterEl = document.getElementById("moveCounter");
const turnTextEl = document.getElementById("turnText");
const sidebarTurnEl = document.getElementById("sidebarTurn");
const lastMoveEl = document.getElementById("lastMove");
const resultTextEl = document.getElementById("resultText");
const logTextEl = document.getElementById("logText");
const capturedBlackEl = document.getElementById("capturedBlack");
const capturedWhiteEl = document.getElementById("capturedWhite");
const undoBtn = document.getElementById("undoBtn");
const resetBtn = document.getElementById("resetBtn");
const startModal = document.getElementById("startModal");
const chooseBlack = document.getElementById("chooseBlack");
const chooseWhite = document.getElementById("chooseWhite");
const chooseSolo = document.getElementById("chooseSolo");
const endModal = document.getElementById("endModal");
const finalTitle = document.getElementById("finalTitle");
const finalSummary = document.getElementById("finalSummary");
const playAgainBtn = document.getElementById("playAgainBtn");
const closeResultBtn = document.getElementById("closeResultBtn");

function makeInitialState() {
    return {
    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY)),
    previousBoard: null,
    currentPlayer: BLACK,
    moveCounter: 0,
    capturedBlack: 0,
    capturedWhite: 0,
    gameOver: false,
    lastMove: "none",
    resultText: "Game not started.",
    mode: "solo",
    humanColor: null,
    aiColor: null,
    history: [],
    blackScore: 0,
    whiteScore: KOMI,
    };
}

let state = makeInitialState();
let gameStarted = false;

function playerName(player) {
    return player === BLACK ? "Black" : "White";
}

function coordName(row, col) {
    return `${letters[col]}${BOARD_SIZE - row}`;
}

function cloneBoard(src) {
    return src.map(row => row.slice());
}

function boardsEqual(a, b) {
    if (!a || !b) return false;
    for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
        if (a[r][c] !== b[r][c]) return false;
    }
    }
    return true;
}

function setMessage(message) {
    logTextEl.textContent = message;
}

function showStartModal(show) {
    startModal.classList.toggle("open", show);
}

function showEndModal(show) {
    endModal.classList.toggle("open", show);
}

function isOnlineMode() {
    return state.mode === "online";
}

function opposite(color) {
    return color === BLACK ? WHITE : BLACK;
}

function inBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function neighbors(row, col) {
    return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
    ].filter(([r, c]) => inBounds(r, c));
}

function getGroup(board, row, col) {
    const color = board[row][col];
    const stack = [[row, col]];
    const visited = new Set();
    const group = [];
    let hasLiberty = false;

    while (stack.length) {
    const [r, c] = stack.pop();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    group.push([r, c]);

    for (const [nr, nc] of neighbors(r, c)) {
        if (board[nr][nc] === EMPTY) {
        hasLiberty = true;
        } else if (board[nr][nc] === color) {
        stack.push([nr, nc]);
        }
    }
    }

    return { group, hasLiberty };
}

function resolveCaptures(board, row, col, playerColor) {
    const oppColor = opposite(playerColor);
    const captured = [];
    const seen = new Set();

    for (const [nr, nc] of neighbors(row, col)) {
    if (board[nr][nc] !== oppColor) continue;
    const key = `${nr},${nc}`;
    if (seen.has(key)) continue;
    const { group, hasLiberty } = getGroup(board, nr, nc);
    for (const [gr, gc] of group) seen.add(`${gr},${gc}`);
    if (!hasLiberty) captured.push(...group);
    }

    return captured;
}

function countCapturedForScore() {
    return {
    blackScore: state.capturedWhite,
    whiteScore: state.capturedBlack + KOMI,
    };
}

function finishGame() {
    const { blackScore, whiteScore } = countCapturedForScore();
    state.blackScore = blackScore;
    state.whiteScore = whiteScore;
    state.gameOver = true;

    const diff = Math.abs(blackScore - whiteScore).toFixed(1);
    if (blackScore > whiteScore) {
    state.resultText = `Game over. Black wins ${blackScore.toFixed(1)} to ${whiteScore.toFixed(1)} by ${diff}.`;
    } else if (whiteScore > blackScore) {
    state.resultText = `Game over. White wins ${whiteScore.toFixed(1)} to ${blackScore.toFixed(1)} by ${diff}.`;
    } else {
    state.resultText = `Game over. The game is a tie at ${blackScore.toFixed(1)}.`;
    }

    finalTitle.textContent = 'Game Over';
    finalSummary.textContent = `${state.resultText} Captures only, with White komi included.`;
    showEndModal(true);
    updateUI();
}

function updateUI() {
    moveCounterEl.textContent = state.gameOver ? `Move Counter: ${state.moveCounter} (final)` : `Move Counter: ${state.moveCounter}`;
    turnTextEl.textContent = state.gameOver ? "Game over" : (gameStarted ? `${playerName(state.currentPlayer)} to move` : "Waiting to start");
    sidebarTurnEl.textContent = state.gameOver ? "Ended" : (gameStarted ? playerName(state.currentPlayer) : "Not started");
    lastMoveEl.textContent = `Last move: ${state.lastMove || "none"}`;
    capturedBlackEl.textContent = state.capturedBlack ?? 0;
    capturedWhiteEl.textContent = state.capturedWhite ?? 0;
    resultTextEl.textContent = state.gameOver ? state.resultText : (gameStarted ? state.resultText : "Game not started.");
    undoBtn.disabled = !gameStarted;
    resetBtn.disabled = !gameStarted;

    boardEl.innerHTML = "";

    for (let i = 0; i < BOARD_SIZE; i++) {
    const lineH = document.createElement("div");
    lineH.className = "grid-line h";
    lineH.style.top = `${10 + i * 20}%`;
    boardEl.appendChild(lineH);

    const lineV = document.createElement("div");
    lineV.className = "grid-line v";
    lineV.style.left = `${10 + i * 20}%`;
    boardEl.appendChild(lineV);
    }

    for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
        const left = `${10 + col * 20}%`;
        const top = `${10 + row * 20}%`;

        const mark = document.createElement("div");
        mark.className = "intersection-mark";
        mark.style.left = left;
        mark.style.top = top;
        boardEl.appendChild(mark);

        const point = document.createElement("button");
        point.className = "point";
        point.type = "button";
        point.setAttribute("aria-label", `Play at ${coordName(row, col)}`);
        point.style.left = left;
        point.style.top = top;
        point.disabled = !gameStarted || state.gameOver || state.board[row][col] !== EMPTY || (isOnlineMode() && state.currentPlayer !== state.humanColor);
        point.addEventListener("click", () => sendMove(row, col));
        boardEl.appendChild(point);

        if (state.board[row][col] !== EMPTY) {
        const stone = document.createElement("div");
        stone.className = `stone ${state.board[row][col] === BLACK ? "black" : "white"}`;
        stone.style.left = left;
        stone.style.top = top;
        boardEl.appendChild(stone);
        }
    }
    }
}

function applyLocalMove(row, col) {
    if (!gameStarted || state.gameOver) return { error: "The game is over." };
    if (state.board[row][col] !== EMPTY) return { error: "That intersection is already occupied." };

    const player = state.currentPlayer;
    const nextBoard = cloneBoard(state.board);
    const boardBefore = cloneBoard(state.board);
    nextBoard[row][col] = player;

    const captured = resolveCaptures(nextBoard, row, col, player);
    for (const [cr, cc] of captured) {
    nextBoard[cr][cc] = EMPTY;
    }

    const { group, hasLiberty } = getGroup(nextBoard, row, col);
    if (!hasLiberty) {
    return { error: "Illegal move: suicide is not allowed." };
    }

    if (state.previousBoard && boardsEqual(nextBoard, state.previousBoard)) {
    return { error: "Illegal move: ko rule violation." };
    }

    const nextState = {
    ...state,
    history: [
        ...state.history,
        {
        board: boardBefore,
        previousBoard: state.previousBoard ? cloneBoard(state.previousBoard) : null,
        currentPlayer: state.currentPlayer,
        moveCounter: state.moveCounter,
        capturedBlack: state.capturedBlack,
        capturedWhite: state.capturedWhite,
        gameOver: state.gameOver,
        lastMove: state.lastMove,
        resultText: state.resultText,
        blackScore: state.blackScore,
        whiteScore: state.whiteScore,
        },
    ],
    previousBoard: boardBefore,
    board: nextBoard,
    currentPlayer: opposite(player),
    moveCounter: state.moveCounter + 1,
    lastMove: `${playerName(player)} at ${coordName(row, col)}`,
    resultText: `${playerName(player)} played ${coordName(row, col)}${captured.length ? ` and captured ${captured.length}` : ""}.`,
    };

    if (player === BLACK) {
    nextState.capturedWhite += captured.length;
    } else {
    nextState.capturedBlack += captured.length;
    }

    state = nextState;

    if (state.moveCounter >= MAX_MOVES) {
    finishGame();
    }

    return { ok: true };
}

async function fetchJson(url, payload) {
    const response = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    });
    return await response.json();
}

function applyState(nextState) {
    state = {
    ...state,
    ...nextState,
    };
    gameStarted = true;
    updateUI();
}

function startSoloGame() {
    state = makeInitialState();
    state.mode = "solo";
    state.resultText = "Solo mode started. Black to move.";
    gameStarted = true;
    showEndModal(false);
    showStartModal(false);
    setMessage("Solo mode started. Play both colors locally in the browser.");
    updateUI();
}

async function startAIGame(humanColor) {
    try {
    state = makeInitialState();
    const nextState = await fetchJson("/api/start", { humanColor });
    state.mode = "online";
    state.humanColor = humanColor;
    state.aiColor = humanColor === BLACK ? WHITE : BLACK;
    applyState(nextState);
    state.mode = "online";
    state.humanColor = humanColor;
    state.aiColor = humanColor === BLACK ? WHITE : BLACK;
    showEndModal(false);
    showStartModal(false);
    setMessage(humanColor === BLACK ? "You are Black. Make your first move." : "You are White. The AI has opened the game.");
    updateUI();
    } catch (error) {
    setMessage("Could not start the AI game. Try Solo mode, or start the Python server.");
    }
}

async function sendMove(row, col) {
    if (!gameStarted) return;

    if (isOnlineMode()) {
    try {
        const nextState = await fetchJson("/api/move", { row, col });
        if (nextState.error) {
        setMessage(nextState.error);
        } else {
        setMessage(nextState.lastMove ? `${nextState.lastMove}.` : "Move applied.");
        }
        applyState(nextState);
    } catch (error) {
        setMessage("Move request failed. Check that the Python backend is running.");
    }
    return;
    }

    const result = applyLocalMove(row, col);
    if (result.error) {
    setMessage(result.error);
    } else {
    setMessage(state.resultText);
    updateUI();
    }
}

async function undoMove() {
    if (!gameStarted) return;

    if (isOnlineMode()) {
    try {
        const nextState = await fetchJson("/api/undo", {});
        applyState(nextState);
        setMessage("Undid the last move.");
    } catch (error) {
        setMessage("Undo failed.");
    }
    return;
    }

    const prev = state.history.pop();
    if (!prev) {
    setMessage("Nothing to undo.");
    updateUI();
    return;
    }

    state = {
    ...state,
    ...prev,
    history: state.history,
    };
    gameStarted = true;
    setMessage("Undid the last move.");
    updateUI();
}

async function resetGame() {
    if (!gameStarted) return;

    if (isOnlineMode()) {
    try {
        const nextState = await fetchJson("/api/reset", {});
        applyState(nextState);
        setMessage("Game reset.");
    } catch (error) {
        setMessage("Reset failed.");
    }
    return;
    }

    const mode = state.mode;
    const humanColor = state.humanColor;
    state = makeInitialState();
    state.mode = mode;
    state.humanColor = humanColor;
    state.aiColor = null;
    state.resultText = mode === "solo" ? "Solo mode reset. Black to move." : "Game reset.";
    gameStarted = true;
    showEndModal(false);
    setMessage(mode === "solo" ? "Solo mode reset." : "Game reset.");
    updateUI();
}

function restartWithModeChoice() {
    showEndModal(false);
    state = makeInitialState();
    gameStarted = false;
    updateUI();
    showStartModal(true);
    setMessage("Choose a mode to begin.");
}

chooseBlack.addEventListener("click", () => startAIGame(BLACK));
chooseWhite.addEventListener("click", () => startAIGame(WHITE));
chooseSolo.addEventListener("click", startSoloGame);
undoBtn.addEventListener("click", undoMove);
resetBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", restartWithModeChoice);
closeResultBtn.addEventListener("click", () => showEndModal(false));

updateUI();
