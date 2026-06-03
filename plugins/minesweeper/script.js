(function () {
  "use strict";
  
  function getTranslation(key, fallback) {
    const el = widgetEl || document.querySelector("[data-ms-widget]");
    const attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    return (el && el.getAttribute(attrName)) || fallback;
  }

  // Difficulty configurations
  const CONFIGS = {
    easy: { rows: 8, cols: 8, mines: 10 },
    medium: { rows: 12, cols: 12, mines: 20 },
    hard: { rows: 15, cols: 15, mines: 40 }
  };

  let currentDifficulty = "easy";
  let rows = CONFIGS.easy.rows;
  let cols = CONFIGS.easy.cols;
  let mineCount = CONFIGS.easy.mines;

  let board = []; // 2D array of cell objects: { row, col, isMine, isRevealed, isFlagged, neighborMines }
  let gameOver = false;
  let gameWon = false;
  let firstClick = true;
  let flaggingMode = false; // Mobile flag toggle
  
  let timerVal = 0;
  let timerInterval = null;

  let widgetEl = null;

  let audioCtx = null;
  let soundEnabled = true;
  try {
    const saved = localStorage.getItem("ms-sound-enabled");
    if (saved !== null) {
      soundEnabled = saved === "true";
    }
  } catch (e) {}

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playRevealSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch (e) {}
  }

  function playFlagSound(isFlagged) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const startFreq = isFlagged ? 380 : 280;
      const endFreq = isFlagged ? 480 : 200;
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  }

  function playExplosionSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(100, ctx.currentTime);
      osc1.frequency.linearRampToValueAtTime(10, ctx.currentTime + 0.5);
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(70, ctx.currentTime);
      osc2.frequency.linearRampToValueAtTime(5, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  function playWinSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.06, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.25);
      });
    } catch (e) {}
  }

  function playLoseSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const delay = 0.15;
      const notes = [392.00, 311.13, 261.63]; // G4, Eb4, C4
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + delay + idx * 0.15);
        gain.gain.setValueAtTime(0.08, now + delay + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + idx * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay + idx * 0.15);
        osc.stop(now + delay + idx * 0.15 + 0.3);
      });
    } catch (e) {}
  }

  function updateSoundButtonUI() {
    const soundBtn = qs('[data-ms-action="toggle-sound"]');
    if (soundBtn) {
      const iconEl = soundBtn.querySelector(".ms-sound-icon");
      const textEl = soundBtn.querySelector(".ms-sound-text");
      if (soundEnabled) {
        soundBtn.classList.remove("ms-muted");
        if (iconEl) iconEl.textContent = "🔊";
        if (textEl) textEl.textContent = getTranslation("soundOn", "Sound: On");
      } else {
        soundBtn.classList.add("ms-muted");
        if (iconEl) iconEl.textContent = "🔇";
        if (textEl) textEl.textContent = getTranslation("soundOff", "Sound: Off");
      }
    }
  }

  function qs(selector) {
    return widgetEl ? widgetEl.querySelector(selector) : null;
  }

  function getFaceEmoji() {
    if (gameOver) return "😵";
    if (gameWon) return "😎";
    return "🙂";
  }

  function formatThreeDigits(num) {
    if (num < 0) return "000";
    if (num > 999) return "999";
    return String(num).padStart(3, "0");
  }

  function updateDashboard() {
    const mineDisplay = qs("[data-ms-mines-display]");
    const timerDisplay = qs("[data-ms-timer-display]");
    const faceBtn = qs("[data-ms-face]");

    if (mineDisplay) {
      const flaggedCount = board.flat().filter(c => c.isFlagged).length;
      mineDisplay.textContent = formatThreeDigits(mineCount - flaggedCount);
    }
    if (timerDisplay) {
      timerDisplay.textContent = formatThreeDigits(timerVal);
    }
    if (faceBtn) {
      faceBtn.textContent = getFaceEmoji();
    }
  }

  // Timer functions
  function startTimer() {
    stopTimer();
    timerVal = 0;
    updateDashboard();
    timerInterval = setInterval(() => {
      timerVal++;
      if (timerVal > 999) timerVal = 999;
      updateDashboard();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Game Initialization
  function initGame(diff = currentDifficulty) {
    stopTimer();
    currentDifficulty = diff;
    rows = CONFIGS[diff].rows;
    cols = CONFIGS[diff].cols;
    mineCount = CONFIGS[diff].mines;

    gameOver = false;
    gameWon = false;
    firstClick = true;
    timerVal = 0;
    
    // Reset flagging mode on difficulty change
    flaggingMode = false;
    updateFlagButtonUI();
    updateSoundButtonUI();

    // Create board grid
    board = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          row: r,
          col: c,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          neighborMines: 0
        });
      }
      board.push(row);
    }

    renderBoardGrid();
    updateDashboard();
  }

  function updateFlagButtonUI() {
    const flagBtn = qs('[data-ms-action="toggle-flag"]');
    if (flagBtn) {
      const textEl = flagBtn.querySelector(".ms-flag-mode-text");
      if (flaggingMode) {
        flagBtn.classList.add("ms-flagging");
        if (textEl) textEl.textContent = getTranslation("flagMode", "Flag Mode");
      } else {
        flagBtn.classList.remove("ms-flagging");
        if (textEl) textEl.textContent = getTranslation("revealMode", "Reveal Mode");
      }
    }
  }

  function renderBoardGrid() {
    const gridEl = qs("[data-ms-grid]");
    if (!gridEl) return;

    gridEl.style.setProperty("--ms-cols", cols);
    gridEl.style.setProperty("--ms-rows", rows);
    gridEl.innerHTML = "";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        const cellEl = document.createElement("div");
        cellEl.className = "ms-cell ms-unrevealed";
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;
        
        gridEl.appendChild(cellEl);
      }
    }
  }

  // Place mines ensuring the first clicked cell and its neighbors are safe
  function placeMines(startRow, startCol) {
    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);

      // Do not place a mine on the first clicked cell or its immediate 8 neighbors
      const isStartArea = Math.abs(r - startRow) <= 1 && Math.abs(c - startCol) <= 1;

      if (!board[r][c].isMine && !isStartArea) {
        board[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbors
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c].isMine) {
          board[r][c].neighborMines = countNeighborMines(r, c);
        }
      }
    }
  }

  function countNeighborMines(row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (board[nr][nc].isMine) count++;
        }
      }
    }
    return count;
  }

  // Reveal Cell logic
  function revealCell(row, col) {
    if (gameOver || gameWon) return;

    const cell = board[row]?.[col];
    if (!cell || cell.isRevealed || cell.isFlagged) return;

    if (firstClick) {
      firstClick = false;
      placeMines(row, col);
      startTimer();
    }

    cell.isRevealed = true;
    const cellEl = qs(`.ms-cell[data-row="${row}"][data-col="${col}"]`);
    if (!cellEl) return;
    
    if (cell.isMine) {
      cellEl.className = "ms-cell ms-exploded";
      handleGameOver(row, col);
      return;
    }

    cellEl.className = "ms-cell ms-revealed";
    if (cell.neighborMines > 0) {
      cellEl.textContent = cell.neighborMines;
      cellEl.classList.add(`ms-num-${cell.neighborMines}`);
    } else {
      // Reveal neighbors recursively for empty cells
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            revealCell(nr, nc);
          }
        }
      }
    }

    checkWinCondition();
  }

  // Toggle Flag logic
  function toggleFlag(row, col) {
    if (gameOver || gameWon) return;

    const cell = board[row]?.[col];
    if (!cell || cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    playFlagSound(cell.isFlagged);
    const cellEl = qs(`.ms-cell[data-row="${row}"][data-col="${col}"]`);
    if (!cellEl) return;
    
    if (cell.isFlagged) {
      cellEl.classList.add("ms-flagged");
    } else {
      cellEl.classList.remove("ms-flagged");
    }

    updateDashboard();
  }

  function handleGameOver(explodedRow, explodedCol) {
    gameOver = true;
    stopTimer();
    playExplosionSound();
    playLoseSound();

    // Reveal all mines
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        const cellEl = qs(`.ms-cell[data-row="${r}"][data-col="${c}"]`);
        if (!cellEl) continue;
        
        if (cell.isMine) {
          if (!cell.isRevealed && (r !== explodedRow || c !== explodedCol)) {
            cellEl.className = "ms-cell ms-mine";
          }
        } else if (cell.isFlagged) {
          cellEl.textContent = "❌";
        }
      }
    }

    updateDashboard();
  }

  function checkWinCondition() {
    let won = true;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (!cell.isMine && !cell.isRevealed) {
          won = false;
          break;
        }
      }
    }

    if (won) {
      gameWon = true;
      stopTimer();
      playWinSound();
      // Flag all remaining mines
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = board[r][c];
          if (cell.isMine && !cell.isFlagged) {
            cell.isFlagged = true;
            const cellEl = qs(`.ms-cell[data-row="${r}"][data-col="${c}"]`);
            if (cellEl) cellEl.classList.add("ms-flagged");
          }
        }
      }
      updateDashboard();
    }
  }

  // Click handling
  function handleCellClick(row, col) {
    if (flaggingMode) {
      toggleFlag(row, col);
    } else {
      const cell = board[row]?.[col];
      if (cell && !cell.isRevealed && !cell.isFlagged && !cell.isMine) {
        playRevealSound();
      }
      revealCell(row, col);
    }
  }

  // Set up event listeners
  function initListeners() {
    document.addEventListener("click", (event) => {
      const w = event.target.closest("[data-ms-widget]");
      if (!w) return;
      if (w !== widgetEl) {
        widgetEl = w;
      }

      // Difficulty Selector
      const diffBtn = event.target.closest(".ms-diff-btn");
      if (diffBtn && w.contains(diffBtn)) {
        getAudioContext();
        const diff = diffBtn.dataset.difficulty;
        w.querySelectorAll(".ms-diff-btn").forEach(btn => btn.classList.remove("ms-active"));
        diffBtn.classList.add("ms-active");
        initGame(diff);
        return;
      }

      // Face Button (Restart)
      const faceBtn = event.target.closest("[data-ms-face]");
      if (faceBtn && w.contains(faceBtn)) {
        getAudioContext();
        initGame(currentDifficulty);
        return;
      }

      // Cell interaction
      const cellEl = event.target.closest(".ms-cell");
      if (cellEl && w.contains(cellEl)) {
        getAudioContext();
        const r = parseInt(cellEl.dataset.row, 10);
        const c = parseInt(cellEl.dataset.col, 10);
        handleCellClick(r, c);
        return;
      }

      // Control Buttons
      const actionBtn = event.target.closest("[data-ms-action]");
      if (actionBtn && w.contains(actionBtn)) {
        getAudioContext();
        const action = actionBtn.dataset.msAction;
        if (action === "toggle-flag") {
          flaggingMode = !flaggingMode;
          updateFlagButtonUI();
        } else if (action === "toggle-sound") {
          soundEnabled = !soundEnabled;
          try {
            localStorage.setItem("ms-sound-enabled", soundEnabled);
          } catch (e) {}
          updateSoundButtonUI();
          if (soundEnabled) {
            playRevealSound();
          }
        } else if (action === "reset") {
          initGame(currentDifficulty);
        }
      }
    });

    // Right click to flag
    document.addEventListener("contextmenu", (event) => {
      const w = event.target.closest("[data-ms-widget]");
      if (!w) return;

      const cellEl = event.target.closest(".ms-cell");
      if (cellEl && w.contains(cellEl)) {
        event.preventDefault();
        getAudioContext();
        const r = parseInt(cellEl.dataset.row, 10);
        const c = parseInt(cellEl.dataset.col, 10);
        toggleFlag(r, c);
      }
    });

    // Mouse down / up for 😮 emoji transition
    document.addEventListener("mousedown", (event) => {
      const w = event.target.closest("[data-ms-widget]");
      if (!w) return;
      if (w !== widgetEl) {
        widgetEl = w;
      }

      const cellEl = event.target.closest(".ms-cell");
      if (cellEl && w.contains(cellEl) && !gameOver && !gameWon) {
        const r = parseInt(cellEl.dataset.row, 10);
        const c = parseInt(cellEl.dataset.col, 10);
        const cell = board[r]?.[c];
        if (cell && !cell.isRevealed && !cell.isFlagged) {
          const faceBtn = qs("[data-ms-face]");
          if (faceBtn) faceBtn.textContent = "😮";
        }
      }
    });

    document.addEventListener("mouseup", (event) => {
      const w = document.querySelector("[data-ms-widget]");
      if (!w) return;
      if (w !== widgetEl) {
        widgetEl = w;
      }
      
      const faceBtn = qs("[data-ms-face]");
      if (faceBtn && !gameOver && !gameWon) {
        faceBtn.textContent = getFaceEmoji();
      }
    });
  }

  function checkWidget() {
    const w = document.querySelector("[data-ms-widget]");
    if (!w) {
      if (widgetEl) {
        stopTimer();
        widgetEl = null;
      }
      return;
    }
    if (w !== widgetEl) {
      widgetEl = w;
      const activeDiffEl = w.querySelector(".ms-diff-btn.ms-active");
      const diff = activeDiffEl ? activeDiffEl.dataset.difficulty : "easy";
      initGame(diff);
    }
  }

  initListeners();

  const observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
