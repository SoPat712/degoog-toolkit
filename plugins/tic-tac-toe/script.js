(function () {
  "use strict";

  var currentWidget = null;

  function getT(key) {
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    var el = currentWidget || document.querySelector(".ttt-card");
    return (el && el.getAttribute(attrName)) || key;
  }

  var state = {
    board: Array(9).fill(null),
    currentPlayer: "X",
    playerSymbol: "X",
    aiSymbol: "O",
    difficulty: "impossible",
    scores: {
      X: 0,
      O: 0,
      ties: 0
    },
    gameOver: false,
    isAiThinking: false
  };

  var SVG_X = '<svg class="ttt-symbol ttt-symbol-x" viewBox="0 0 100 100"><line x1="20" y1="20" x2="80" y2="80" stroke="currentColor" stroke-width="12" stroke-linecap="round" /><line x1="80" y1="20" x2="20" y2="80" stroke="currentColor" stroke-width="12" stroke-linecap="round" /></svg>';
  var SVG_O = '<svg class="ttt-symbol ttt-symbol-o" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" stroke="currentColor" stroke-width="12" fill="none" stroke-linecap="round" /></svg>';

  var WIN_PATTERNS = [
    { indices: [0, 1, 2], name: "row-0" },
    { indices: [3, 4, 5], name: "row-1" },
    { indices: [6, 7, 8], name: "row-2" },
    { indices: [0, 3, 6], name: "col-0" },
    { indices: [1, 4, 7], name: "col-1" },
    { indices: [2, 5, 8], name: "col-2" },
    { indices: [0, 4, 8], name: "diag-0" },
    { indices: [2, 4, 6], name: "diag-1" }
  ];

  function widget() {
    return document.querySelector(".ttt-card");
  }

  function qs(selector) {
    return currentWidget ? currentWidget.querySelector(selector) : null;
  }

  function loadScores() {
    var key = "degoog-ttt-scores-" + state.difficulty;
    try {
      var saved = localStorage.getItem(key);
      if (saved) {
        state.scores = JSON.parse(saved);
      } else {
        state.scores = { X: 0, O: 0, ties: 0 };
      }
    } catch (e) {
      state.scores = { X: 0, O: 0, ties: 0 };
    }
  }

  function saveScores() {
    var key = "degoog-ttt-scores-" + state.difficulty;
    try {
      localStorage.setItem(key, JSON.stringify(state.scores));
    } catch (e) {}
  }

  function updateSymbolButtons() {
    var btnX = qs("#ttt-btn-symbol-x");
    var btnO = qs("#ttt-btn-symbol-o");
    if (!btnX || !btnO) return;

    if (state.difficulty === "pvp") {
      btnX.style.display = "none";
      btnO.style.display = "none";
    } else {
      btnX.style.display = "";
      btnO.style.display = "";
      if (state.playerSymbol === "X") {
        btnX.classList.add("ttt-btn-active");
        btnO.classList.remove("ttt-btn-active");
      } else {
        btnO.classList.add("ttt-btn-active");
        btnX.classList.remove("ttt-btn-active");
      }
    }
  }

  function updateScoreUI() {
    var valX = qs("#ttt-score-val-x");
    var valO = qs("#ttt-score-val-o");
    var valTies = qs("#ttt-score-val-draws");
    var labelP1 = qs("#ttt-score-p1 .ttt-score-label");
    var labelP2 = qs("#ttt-score-p2 .ttt-score-label");

    if (valX) valX.textContent = state.scores.X;
    if (valO) valO.textContent = state.scores.O;
    if (valTies) valTies.textContent = state.scores.ties;

    if (labelP1 && labelP2) {
      if (state.difficulty === "pvp") {
        labelP1.textContent = getT("player1X");
        labelP2.textContent = getT("player2O");
      } else {
        if (state.playerSymbol === "X") {
          labelP1.textContent = getT("xYou");
          labelP2.textContent = getT("oAi");
        } else {
          labelP1.textContent = getT("xAi");
          labelP2.textContent = getT("oYou");
        }
      }
    }
  }

  function updateStatus() {
    if (state.gameOver) return;

    var statusEl = qs("#ttt-status");
    if (!statusEl) return;

    if (state.isAiThinking) {
      statusEl.textContent = getT("aiThinking");
      return;
    }

    if (state.difficulty === "pvp") {
      statusEl.textContent = state.currentPlayer === "X" ? getT("player1Turn") : getT("player2Turn");
    } else {
      if (state.currentPlayer === state.playerSymbol) {
        statusEl.textContent = getT("yourTurn");
      } else {
        statusEl.textContent = getT("aiThinking");
      }
    }
  }

  function resetBoard() {
    state.board = Array(9).fill(null);
    state.currentPlayer = "X";
    state.gameOver = false;
    state.isAiThinking = false;

    if (currentWidget) {
      var cells = currentWidget.querySelectorAll(".ttt-cell");
      cells.forEach(function (cell) {
        cell.innerHTML = "";
        cell.removeAttribute("disabled");
        cell.classList.remove("ttt-cell-x", "ttt-cell-o");
      });

      var winLine = qs("#ttt-win-line");
      if (winLine) {
        winLine.className = "ttt-win-line";
      }

      var diffSelect = qs("#ttt-difficulty-select");
      if (diffSelect) {
        diffSelect.value = state.difficulty;
      }

      updateSymbolButtons();
      updateScoreUI();
    }

    updateStatus();

    if (state.difficulty !== "pvp" && state.aiSymbol === "X") {
      triggerAiMove();
    }
  }

  function initFromWidget(w) {
    currentWidget = w;

    var defaultDifficulty = w.getAttribute("data-default-difficulty") || "impossible";
    var defaultSymbol = w.getAttribute("data-default-symbol") || "X";

    state.difficulty = defaultDifficulty;
    state.playerSymbol = defaultSymbol;
    state.aiSymbol = defaultSymbol === "X" ? "O" : "X";

    loadScores();
    resetBoard();
  }

  function checkWinner(board) {
    for (var i = 0; i < WIN_PATTERNS.length; i++) {
      var pattern = WIN_PATTERNS[i];
      var a = pattern.indices[0];
      var b = pattern.indices[1];
      var c = pattern.indices[2];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], pattern: pattern };
      }
    }
    if (board.every(function (cell) { return cell !== null; })) {
      return { winner: "tie" };
    }
    return null;
  }

  function handleGameOver(result) {
    state.gameOver = true;

    if (currentWidget) {
      var cells = currentWidget.querySelectorAll(".ttt-cell:not([disabled])");
      cells.forEach(function (cell) {
        cell.setAttribute("disabled", "true");
      });
    }

    var statusText = "";
    if (result.winner === "tie") {
      state.scores.ties++;
      statusText = getT("drawResult");
    } else {
      state.scores[result.winner]++;

      if (state.difficulty === "pvp") {
        statusText = result.winner === "X" ? getT("player1Wins") : getT("player2Wins");
      } else {
        if (result.winner === state.playerSymbol) {
          statusText = getT("youWin");
        } else {
          statusText = getT("aiWins");
        }
      }

      if (currentWidget && result.pattern) {
        var winLine = qs("#ttt-win-line");
        if (winLine) {
          winLine.className = "ttt-win-line ttt-win-" + result.pattern.name;
        }
      }
    }

    saveScores();
    updateScoreUI();

    var statusEl = qs("#ttt-status");
    if (statusEl) {
      statusEl.textContent = statusText;
    }
  }

  function triggerAiMove() {
    state.isAiThinking = true;
    updateStatus();

    setTimeout(function () {
      if (state.gameOver || !currentWidget) {
        state.isAiThinking = false;
        return;
      }

      var bestMove = calculateAiMove();
      state.isAiThinking = false;
      if (bestMove !== null) {
        makeMove(bestMove);
      }
    }, 450);
  }

  function calculateAiMove() {
    var available = [];
    for (var i = 0; i < 9; i++) {
      if (state.board[i] === null) {
        available.push(i);
      }
    }
    if (available.length === 0) return null;

    if (state.difficulty === "easy") {
      return available[Math.floor(Math.random() * available.length)];
    }

    if (state.difficulty === "medium") {
      if (Math.random() < 0.5) {
        return available[Math.floor(Math.random() * available.length)];
      }
      return getBestMinimaxMove();
    }

    if (state.difficulty === "hard") {
      if (Math.random() < 0.15) {
        return available[Math.floor(Math.random() * available.length)];
      }
      return getBestMinimaxMove();
    }

    return getBestMinimaxMove();
  }

  function getBestMinimaxMove() {
    var board = state.board.slice();
    var aiSymbol = state.aiSymbol;
    var humanSymbol = state.playerSymbol;

    var emptyCount = board.filter(function (c) { return c === null; }).length;
    if (emptyCount === 9) {
      var starters = [0, 2, 4, 6, 8];
      return starters[Math.floor(Math.random() * starters.length)];
    }

    var bestScore = -Infinity;
    var move = null;

    for (var i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = aiSymbol;
        var score = minimaxScore(board, 0, false, aiSymbol, humanSymbol);
        board[i] = null;
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }
    return move;
  }

  function minimaxScore(board, depth, isMaximizing, aiSymbol, humanSymbol) {
    var result = checkWinner(board);
    if (result) {
      if (result.winner === aiSymbol) return 10 - depth;
      if (result.winner === humanSymbol) return depth - 10;
      return 0;
    }

    if (isMaximizing) {
      var bestScore = -Infinity;
      for (var i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = aiSymbol;
          var score = minimaxScore(board, depth + 1, false, aiSymbol, humanSymbol);
          board[i] = null;
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      var bestScore = Infinity;
      for (var i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = humanSymbol;
          var score = minimaxScore(board, depth + 1, true, aiSymbol, humanSymbol);
          board[i] = null;
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  }

  function makeMove(index) {
    if (state.gameOver || state.isAiThinking || state.board[index] !== null) {
      return false;
    }

    var symbol = state.currentPlayer;
    state.board[index] = symbol;

    if (currentWidget) {
      var cell = currentWidget.querySelector('.ttt-cell[data-index="' + index + '"]');
      if (cell) {
        cell.innerHTML = symbol === "X" ? SVG_X : SVG_O;
        cell.classList.add(symbol === "X" ? "ttt-cell-x" : "ttt-cell-o");
        cell.setAttribute("disabled", "true");
      }
    }

    var result = checkWinner(state.board);
    if (result) {
      handleGameOver(result);
      return true;
    }

    state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
    updateStatus();

    if (state.difficulty !== "pvp" && state.currentPlayer === state.aiSymbol) {
      triggerAiMove();
    }

    return true;
  }

  function handleCellClick(cell) {
    if (state.gameOver || state.isAiThinking) return;

    var index = parseInt(cell.getAttribute("data-index"), 10);
    if (isNaN(index) || state.board[index] !== null) return;

    makeMove(index);
  }

  function handleDifficultyChange(value) {
    if (value === state.difficulty) return;
    state.difficulty = value;
    loadScores();
    resetBoard();
  }

  function handleSymbolChange(symbol) {
    if (state.difficulty === "pvp") return;
    if (state.playerSymbol === symbol) return;

    state.playerSymbol = symbol;
    state.aiSymbol = symbol === "X" ? "O" : "X";
    resetBoard();
  }

  function handleClick(event) {
    var w = event.target.closest(".ttt-card");
    if (!w) return;
    if (w !== currentWidget) initFromWidget(w);

    var cell = event.target.closest(".ttt-cell");
    if (cell && w.contains(cell)) {
      handleCellClick(cell);
      return;
    }

    var symbolBtn = event.target.closest("[data-symbol]");
    if (symbolBtn && w.contains(symbolBtn)) {
      handleSymbolChange(symbolBtn.getAttribute("data-symbol"));
      return;
    }

    var resetBtn = event.target.closest("#ttt-btn-reset-board");
    if (resetBtn && w.contains(resetBtn)) {
      resetBoard();
      return;
    }

    var resetScoresBtn = event.target.closest("#ttt-btn-reset-scores");
    if (resetScoresBtn && w.contains(resetScoresBtn)) {
      state.scores = { X: 0, O: 0, ties: 0 };
      saveScores();
      updateScoreUI();
      return;
    }
  }

  function handleSelectChange(event) {
    var w = event.target.closest(".ttt-card");
    if (!w) return;
    if (w !== currentWidget) initFromWidget(w);

    if (event.target.id === "ttt-difficulty-select") {
      handleDifficultyChange(event.target.value);
    }
  }

  function checkWidget() {
    var w = widget();
    if (!w) {
      if (currentWidget && !currentWidget.isConnected) {
        currentWidget = null;
      }
      return;
    }
    if (w !== currentWidget) initFromWidget(w);
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleSelectChange);

  var observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
