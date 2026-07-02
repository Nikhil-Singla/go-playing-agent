from __future__ import annotations

import importlib.util
import json
import os
import threading
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, "main.html")
AI_FILE = os.path.join(BASE_DIR, "ai_agent.py")

BOARD_SIZE = 5
EMPTY = 0
BLACK = 1
WHITE = 2
KOMI = 2.5
MAX_MOVES = 25

DIRECTIONS = [(0, 1), (0, -1), (1, 0), (-1, 0)]


def load_ai_module():
    spec = importlib.util.spec_from_file_location("ai_agent", AI_FILE)
    if spec is None or spec.loader is None:
      raise RuntimeError("Unable to load ai_agent.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


AI = load_ai_module()
OPENING_HEURISTICS = deepcopy(AI.positionalHeuristics)
MIDGAME_HEURISTICS = deepcopy(AI.midgameHeuristics)
ENDGAME_HEURISTICS = deepcopy(AI.endgameHeuristics)


def empty_board() -> List[List[int]]:
    return [[EMPTY for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]


def clone_board(board: List[List[int]]) -> List[List[int]]:
    return [row[:] for row in board]


def player_name(player: int) -> str:
    return "Black" if player == BLACK else "White"


def opponent_of(player: int) -> int:
    return WHITE if player == BLACK else BLACK


def coord_name(row: int, col: int) -> str:
    return f"{chr(ord('A') + col)}{BOARD_SIZE - row}"


def get_neighbors(row: int, col: int) -> List[Tuple[int, int]]:
    out = []
    for dr, dc in DIRECTIONS:
        nr, nc = row + dr, col + dc
        if 0 <= nr < BOARD_SIZE and 0 <= nc < BOARD_SIZE:
            out.append((nr, nc))
    return out


def get_group(board: List[List[int]], start_row: int, start_col: int) -> List[Tuple[int, int]]:
    color = board[start_row][start_col]
    if color == EMPTY:
        return []
    stack = [(start_row, start_col)]
    seen = set()
    group = []
    while stack:
        row, col = stack.pop()
        key = (row, col)
        if key in seen:
            continue
        seen.add(key)
        group.append(key)
        for nr, nc in get_neighbors(row, col):
            if board[nr][nc] == color and (nr, nc) not in seen:
                stack.append((nr, nc))
    return group


def has_liberty(board: List[List[int]], group: List[Tuple[int, int]]) -> bool:
    for row, col in group:
        for nr, nc in get_neighbors(row, col):
            if board[nr][nc] == EMPTY:
                return True
    return False


def remove_captured_groups(board: List[List[int]], row: int, col: int, player: int) -> int:
    opponent = opponent_of(player)
    captured = 0
    seen = set()
    for nr, nc in get_neighbors(row, col):
        if board[nr][nc] != opponent or (nr, nc) in seen:
            continue
        group = get_group(board, nr, nc)
        seen.update(group)
        if not has_liberty(board, group):
            for gr, gc in group:
                board[gr][gc] = EMPTY
            captured += len(group)
    return captured


def boards_equal(a: List[List[int]], b: List[List[int]]) -> bool:
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            if a[r][c] != b[r][c]:
                return False
    return True


def final_scores(state: Dict[str, Any]) -> Tuple[float, float]:
    black_score = float(state["captured_white"])
    white_score = float(state["captured_black"]) + KOMI
    return black_score, white_score


def result_text(state: Dict[str, Any]) -> str:
    black_score, white_score = final_scores(state)
    if black_score > white_score:
        return f"Black wins {black_score:.1f} to {white_score:.1f}."
    if white_score > black_score:
        return f"White wins {white_score:.1f} to {black_score:.1f}."
    return f"Tie game at {black_score:.1f} each."


def make_state(human_color: int = BLACK) -> Dict[str, Any]:
    ai_color = opponent_of(human_color)
    return {
        "board": empty_board(),
        "previous_board": empty_board(),
        "history": [],
        "human_color": human_color,
        "ai_color": ai_color,
        "current_player": BLACK,
        "move_count": 0,
        "captured_black": 0,
        "captured_white": 0,
        "game_over": False,
        "last_move": "none",
        "result": "Game in progress.",
        "started": True,
        "pass_streak": 0,
    }


STATE = make_state(BLACK)
STATE_LOCK = threading.Lock()


def snapshot_state() -> Dict[str, Any]:
    return {
        "board": clone_board(STATE["board"]),
        "previous_board": clone_board(STATE["previous_board"]),
        "current_player": STATE["current_player"],
        "move_count": STATE["move_count"],
        "captured_black": STATE["captured_black"],
        "captured_white": STATE["captured_white"],
        "game_over": STATE["game_over"],
        "last_move": STATE["last_move"],
        "result": STATE["result"],
        "human_color": STATE["human_color"],
        "ai_color": STATE["ai_color"],
        "pass_streak": STATE["pass_streak"],
    }


def restore_snapshot(snapshot: Dict[str, Any]) -> None:
    STATE["board"] = clone_board(snapshot["board"])
    STATE["previous_board"] = clone_board(snapshot["previous_board"])
    STATE["current_player"] = snapshot["current_player"]
    STATE["move_count"] = snapshot["move_count"]
    STATE["captured_black"] = snapshot["captured_black"]
    STATE["captured_white"] = snapshot["captured_white"]
    STATE["game_over"] = snapshot["game_over"]
    STATE["last_move"] = snapshot["last_move"]
    STATE["result"] = snapshot["result"]
    STATE["human_color"] = snapshot["human_color"]
    STATE["ai_color"] = snapshot["ai_color"]
    STATE["pass_streak"] = snapshot["pass_streak"]


def serialize_state() -> Dict[str, Any]:
    black_score, white_score = final_scores(STATE)
    return {
        "board": clone_board(STATE["board"]),
        "currentPlayer": STATE["current_player"],
        "moveCounter": STATE["move_count"],
        "capturedBlack": STATE["captured_black"],
        "capturedWhite": STATE["captured_white"],
        "gameOver": STATE["game_over"],
        "lastMove": STATE["last_move"],
        "resultText": STATE["result"],
        "humanColor": STATE["human_color"],
        "aiColor": STATE["ai_color"],
        "blackScore": black_score,
        "whiteScore": white_score,
        "turnLabel": "Game over" if STATE["game_over"] else player_name(STATE["current_player"]),
        "nextPlayerLabel": "Ended" if STATE["game_over"] else player_name(STATE["current_player"]),
    }


def finish_game() -> None:
    STATE["game_over"] = True
    STATE["result"] = result_text(STATE)


def apply_move(row: int, col: int, player: int) -> Tuple[bool, str]:
    if STATE["game_over"]:
        return False, "The game is already over."
    if STATE["current_player"] != player:
        return False, "It is not that player's turn."
    if STATE["board"][row][col] != EMPTY:
        return False, "That intersection is already occupied."

    next_board = clone_board(STATE["board"])
    next_board[row][col] = player
    captured = remove_captured_groups(next_board, row, col, player)
    placed_group = get_group(next_board, row, col)

    if not has_liberty(next_board, placed_group):
        return False, "Illegal move: suicide is not allowed."

    if boards_equal(next_board, STATE["previous_board"]):
        return False, "Illegal move: ko rule violation."

    STATE["history"].append(snapshot_state())
    STATE["previous_board"] = clone_board(STATE["board"])
    STATE["board"] = next_board
    STATE["move_count"] += 1
    STATE["pass_streak"] = 0

    if captured > 0:
        if player == BLACK:
            STATE["captured_white"] += captured
        else:
            STATE["captured_black"] += captured

    STATE["last_move"] = f"{player_name(player)} at {coord_name(row, col)}" + (
        f" (captured {captured} stone{'s' if captured != 1 else ''})" if captured else ""
    )
    STATE["result"] = "Game in progress."

    if STATE["move_count"] >= MAX_MOVES:
        finish_game()
    else:
        STATE["current_player"] = opponent_of(player)

    return True, ""


def apply_pass(player: int) -> None:
    STATE["history"].append(snapshot_state())
    STATE["previous_board"] = clone_board(STATE["board"])
    STATE["current_player"] = opponent_of(player)
    STATE["pass_streak"] += 1
    STATE["last_move"] = f"{player_name(player)} passed"
    if STATE["pass_streak"] >= 2:
        finish_game()


def choose_ai_move(previous_board: List[List[int]], board: List[List[int]], player_color: int, move_count: int):
    step = move_count + 1
    AI.step = step
    AI.minimaxDepth = 3
    AI.friendlyPieceVal = 1
    AI.opposingPieceVal = 1

    if step >= AI.endGameStep:
        AI.positionalHeuristics = deepcopy(ENDGAME_HEURISTICS)
        AI.minimaxDepth = max(1, AI.maxStepNumber - step)
    elif step >= AI.midGameStep:
        AI.positionalHeuristics = deepcopy(MIDGAME_HEURISTICS)
    else:
        AI.positionalHeuristics = deepcopy(OPENING_HEURISTICS)

    if player_color == BLACK and step < AI.endGameStep:
        AI.opposingPieceVal = 1.25
    else:
        AI.friendlyPieceVal = 1.5

    if step <= 2:
        if board[2][2] == EMPTY:
            return (2, 2)
        return (2, 1)

    move = AI.minimaxSelection(previous_board, board, player_color)
    return move


def run_ai_turn() -> None:
    while not STATE["game_over"] and STATE["current_player"] == STATE["ai_color"]:
        move = choose_ai_move(
            clone_board(STATE["previous_board"]),
            clone_board(STATE["board"]),
            STATE["ai_color"],
            STATE["move_count"],
        )
        if move == "PASS":
            apply_pass(STATE["ai_color"])
        else:
            ok, message = apply_move(move[0], move[1], STATE["ai_color"])
            if not ok:
                apply_pass(STATE["ai_color"])
        if STATE["current_player"] == STATE["human_color"] or STATE["game_over"]:
            break


def start_game(human_color: int) -> Dict[str, Any]:
    global STATE
    STATE = make_state(human_color)
    if STATE["ai_color"] == BLACK:
        run_ai_turn()
    return serialize_state()


def handle_move(row: int, col: int) -> Dict[str, Any]:
    if STATE["game_over"]:
        return serialize_state()
    ok, msg = apply_move(row, col, STATE["human_color"])
    if not ok:
        return {"error": msg, **serialize_state()}
    if not STATE["game_over"] and STATE["current_player"] == STATE["ai_color"]:
        run_ai_turn()
    return serialize_state()


def handle_undo() -> Dict[str, Any]:
    if not STATE["history"]:
        return serialize_state()
    snapshot = STATE["history"].pop()
    restore_snapshot(snapshot)
    return serialize_state()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_html(self) -> None:
        with open(HTML_FILE, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._send_html()
            return
        if self.path == "/api/state":
            with STATE_LOCK:
                self._send_json(serialize_state())
            return
        self.send_error(404, "Not found")

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        with STATE_LOCK:
            if self.path == "/api/start":
                human_color = int(payload.get("humanColor", BLACK))
                if human_color not in (BLACK, WHITE):
                    human_color = BLACK
                self._send_json(start_game(human_color))
                return

            if self.path == "/api/move":
                try:
                    row = int(payload["row"])
                    col = int(payload["col"])
                except Exception:
                    self.send_error(400, "Missing row or col")
                    return
                if not (0 <= row < BOARD_SIZE and 0 <= col < BOARD_SIZE):
                    self.send_error(400, "Out of bounds")
                    return
                self._send_json(handle_move(row, col))
                return

            if self.path == "/api/undo":
                self._send_json(handle_undo())
                return

            if self.path == "/api/reset":
                self._send_json(start_game(int(STATE["human_color"])))
                return

        self.send_error(404, "Not found")

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = HTTPServer(("127.0.0.1", 8000), Handler)
    print("Mini-Go server running on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
