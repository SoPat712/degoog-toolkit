(function () {
  "use strict";

  const SN_LANG_DICT = {
    en: {
      pause: "Pause",
      resume: "Resume",
      newBest: "New best score! Keep it up.",
      bestTip: "Best: {highScore} · Tip: queue turns a little earlier.",
      exitFs: "Exit Fullscreen",
      enterFs: "Full Screen"
    }
  };
  function getSnTranslation(key) {
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    var el = currentWidget || document.querySelector("[data-snake-widget]");
    return (el && el.getAttribute(attrName)) || SN_LANG_DICT["en"][key] || key;
  }

  var currentWidget = null;
  var audioCtx = null;
  var lastTime = 0;

  var BOARD_LAYOUTS = {
    small: { cols: 9, rows: 10 },
    standard: { cols: 15, rows: 17 },
    large: { cols: 21, rows: 24 },
  };

  var state = {
    playing: false,
    paused: false,
    gameOver: false,
    won: false,
    speedMs: 100, // starting speed from data attribute
    soundEnabled: true,
    score: 0,
    highScore: 0,
    rafId: 0,
    
    // Grid configuration (cols × rows from plugin settings)
    gridCols: 15,
    gridRows: 17,
    cellSize: 18,

    // Game state objects
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    directionQueue: [],
    apple: { x: 0, y: 0 },
    particles: [],
    collisionGraceUntil: 0,
    
    // Smooth movement interpolation
    prevSnake: [],
    lastTickTime: 0
  };

  // Lazy initialize AudioContext to comply with autoplay policy
  function getAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function resumeAudioContext() {
    var ctx = getAudioContext();
    if (!ctx) return null;
    if (audioCtx.state === "suspended") {
      var resumePromise = audioCtx.resume();
      if (resumePromise && typeof resumePromise.catch === "function") {
        resumePromise.catch(function () {});
      }
    }
    return audioCtx;
  }

  function primeAudio() {
    if (!state.soundEnabled) return;
    try {
      var ctx = resumeAudioContext();
      if (!ctx || ctx.state !== "running") return;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.005);
    } catch (e) {
      // Audio not supported
    }
  }

  function playEatSound() {
    if (!state.soundEnabled) return;
    try {
      var ctx = resumeAudioContext();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // Audio not supported
    }
  }

  function playGameOverSound() {
    if (!state.soundEnabled) return;
    try {
      var ctx = resumeAudioContext();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // Audio not supported
    }
  }

  function playMoveSound() {
    if (!state.soundEnabled) return;
    try {
      var ctx = resumeAudioContext();
      if (!ctx || ctx.state !== "running") return;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var now = ctx.currentTime;
      osc.type = "square";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.025);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {
      // Audio not supported
    }
  }

  function qs(selector) {
    return currentWidget ? currentWidget.querySelector(selector) : null;
  }

  function cellPxForBoard(cols, rows) {
    return Math.max(
      12,
      Math.min(22, Math.floor(360 / cols), Math.floor(400 / rows)),
    );
  }

  function updateBoardSizeButtons(w) {
    if (!w) return;
    var active = w.getAttribute("data-board-preset") || "standard";
    var locked = state.playing && !state.gameOver;
    var buttons = w.querySelectorAll(".snake-board-size-btn");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var preset = btn.getAttribute("data-board-preset");
      var isActive = preset === active;
      btn.classList.toggle("snake-board-size-btn--active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.disabled = locked;
    }
  }

  function applyBoardPreset(w, preset) {
    var layout = BOARD_LAYOUTS[preset] || BOARD_LAYOUTS.standard;
    var cellPx = cellPxForBoard(layout.cols, layout.rows);
    w.setAttribute("data-board-preset", preset);
    w.setAttribute("data-grid-cols", String(layout.cols));
    w.setAttribute("data-grid-rows", String(layout.rows));
    w.setAttribute("data-cell-px", String(cellPx));
    applyBoardFromWidget(w);
    updateBoardSizeButtons(w);
  }

  function applyBoardFromWidget(w) {
    var cols = parseInt(w.getAttribute("data-grid-cols"), 10);
    var rows = parseInt(w.getAttribute("data-grid-rows"), 10);
    var cellPx = parseInt(w.getAttribute("data-cell-px"), 10);
    state.gridCols = !isNaN(cols) && cols > 0 ? cols : 15;
    state.gridRows = !isNaN(rows) && rows > 0 ? rows : 17;
    state.cellSize = !isNaN(cellPx) && cellPx > 0 ? cellPx : 18;

    var canvas = w.querySelector("#snake-canvas");
    var container = w.querySelector(".snake-game-container");
    var boardW = state.gridCols * state.cellSize;
    var boardH = state.gridRows * state.cellSize;
    if (canvas) {
      canvas.width = boardW;
      canvas.height = boardH;
    }
    if (container) {
      container.style.setProperty("--snake-cols", String(state.gridCols));
      container.style.setProperty("--snake-rows", String(state.gridRows));
      container.style.setProperty("--snake-board-w", boardW + "px");
      container.style.setProperty("--snake-board-h", boardH + "px");
    }
  }

  function initFromWidget(w) {
    currentWidget = w;
    var speedAttr = parseInt(w.getAttribute("data-initial-speed"), 10);
    state.speedMs = isNaN(speedAttr) ? 100 : speedAttr;
    applyBoardFromWidget(w);
    updateBoardSizeButtons(w);

    // Load high score
    try {
      var saved = localStorage.getItem("degoog-snake-highscore");
      state.highScore = saved ? parseInt(saved, 10) : 0;
      if (isNaN(state.highScore)) state.highScore = 0;
    } catch (e) {
      state.highScore = 0;
    }

    resetGame();
    state.prevSnake = state.snake.map(function(s) { return { x: s.x, y: s.y }; });
    state.lastTickTime = performance.now();
    updateUI();
  }

  function resetGame() {
    state.playing = false;
    state.paused = false;
    state.gameOver = false;
    state.won = false;
    state.score = 0;
    
    var cx = Math.floor(state.gridCols / 2);
    var cy = Math.floor(state.gridRows / 2);
    state.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    state.directionQueue = [];
    state.particles = [];
    state.collisionGraceUntil = 0;
    state.prevSnake = state.snake.map(function(s) { return { x: s.x, y: s.y }; });
    state.lastTickTime = performance.now();

    spawnApple();
  }

  function spawnApple() {
    var valid = false;
    var attempts = 0;
    while (!valid && attempts < 100) {
      attempts++;
      var rx = Math.floor(Math.random() * state.gridCols);
      var ry = Math.floor(Math.random() * state.gridRows);
      
      // Check if coordinate is on snake
      var conflict = false;
      for (var i = 0; i < state.snake.length; i++) {
        if (state.snake[i].x === rx && state.snake[i].y === ry) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        state.apple = { x: rx, y: ry };
        valid = true;
      }
    }
    if (!valid) {
      triggerGameWin();
    }
  }

  function spawnParticles(gridX, gridY) {
    var count = 12;
    var px = gridX * state.cellSize + state.cellSize / 2;
    var py = gridY * state.cellSize + state.cellSize / 2;
    
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1 + Math.random() * 3.5;
      state.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * 3
      });
    }
  }

  function updateParticles() {
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  function sameDirection(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function oppositeDirection(a, b) {
    return a && b && a.x + b.x === 0 && a.y + b.y === 0;
  }

  function hideAllOverlays() {
    ["#snake-overlay-start", "#snake-overlay-gameover", "#snake-overlay-win", "#snake-overlay-paused"].forEach(function (sel) {
      var el = qs(sel);
      if (el) el.classList.add("snake-hidden");
    });
  }

  function finishHighScore() {
    if (state.score > state.highScore) {
      state.highScore = state.score;
      try {
        localStorage.setItem("degoog-snake-highscore", String(state.highScore));
      } catch (e) {}
    }
  }

  function endMetaText(score) {
    var newBest = score === state.highScore && score > 0;
    return newBest
      ? getSnTranslation("newBest")
      : getSnTranslation("bestTip").replace("{highScore}", String(state.highScore));
  }

  function setDirection(dir) {
    if (!dir || !state.playing || state.paused || state.gameOver) return;

    var queuedCount = state.directionQueue.length;
    var basis = queuedCount ? state.directionQueue[queuedCount - 1] : state.direction;

    if (queuedCount >= 3) return;
    if (sameDirection(dir, basis) || oppositeDirection(dir, basis)) return;

    state.directionQueue.push({ x: dir.x, y: dir.y });
    state.nextDirection = state.directionQueue[0] || state.direction;
    playMoveSound();
  }

  function startGame() {
    primeAudio();
    resetGame();
    state.playing = true;
    lastTime = performance.now();
    
    hideAllOverlays();
    
    var pauseBtn = qs("#snake-pause-btn");
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = getSnTranslation("pause");
    }

    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
    updateUI();
  }

  function pauseGame() {
    if (!state.playing || state.gameOver) return;
    state.paused = true;
    qs("#snake-overlay-paused").classList.remove("snake-hidden");
    var pauseBtn = qs("#snake-pause-btn");
    if (pauseBtn) toggleOverlayOrText(pauseBtn, "resume");
    updateUI();
  }

  function toggleOverlayOrText(el, key) {
    el.textContent = getSnTranslation(key);
  }

  function resumeGame() {
    if (!state.playing || !state.paused) return;
    state.paused = false;
    qs("#snake-overlay-paused").classList.add("snake-hidden");
    var pauseBtn = qs("#snake-pause-btn");
    if (pauseBtn) pauseBtn.textContent = getSnTranslation("pause");
    lastTime = performance.now();
    updateUI();
  }

  function triggerGameOver() {
    state.playing = false;
    state.gameOver = true;
    state.won = false;
    playGameOverSound();
    finishHighScore();

    var finalScoreSpan = qs("#snake-final-score");
    if (finalScoreSpan) finalScoreSpan.textContent = String(state.score);
    var extra = qs("#snake-gameover-extra");
    if (extra) extra.textContent = endMetaText(state.score);

    hideAllOverlays();
    var overlay = qs("#snake-overlay-gameover");
    if (overlay) overlay.classList.remove("snake-hidden");
    
    var pauseBtn = qs("#snake-pause-btn");
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = getSnTranslation("pause");
    }
    updateUI();
  }

  function triggerGameWin() {
    state.playing = false;
    state.gameOver = true;
    state.won = true;
    playEatSound();
    finishHighScore();

    var winScoreSpan = qs("#snake-win-score");
    if (winScoreSpan) winScoreSpan.textContent = String(state.score);
    var extra = qs("#snake-win-extra");
    if (extra) extra.textContent = endMetaText(state.score);

    hideAllOverlays();
    var overlay = qs("#snake-overlay-win");
    if (overlay) overlay.classList.remove("snake-hidden");

    var pauseBtn = qs("#snake-pause-btn");
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = getSnTranslation("pause");
    }
    updateUI();
  }

  function updateSnake() {
    if (state.paused || state.gameOver) return;

    state.prevSnake = state.snake.map(function(s) { return { x: s.x, y: s.y }; });
    state.lastTickTime = performance.now();

    if (state.directionQueue.length) {
      state.direction = state.directionQueue.shift();
    }
    state.nextDirection = state.directionQueue[0] || state.direction;

    var head = state.snake[0];
    var nextHead = {
      x: head.x + state.direction.x,
      y: head.y + state.direction.y
    };

    // Collision detection with a short "mercy" window (~half a frame) to allow
    // a just-in-time input like Nintendo-style leniency.
    var collision =
      nextHead.x < 0 ||
      nextHead.x >= state.gridCols ||
      nextHead.y < 0 ||
      nextHead.y >= state.gridRows;
    if (!collision) {
      for (var i = 0; i < state.snake.length; i++) {
        if (state.snake[i].x === nextHead.x && state.snake[i].y === nextHead.y) {
          collision = true;
          break;
        }
      }
    }
    if (collision) {
      var now = performance.now();
      if (state.collisionGraceUntil === 0) {
        state.collisionGraceUntil = now + Math.max(28, state.speedMs * 0.5);
        return;
      }
      if (now < state.collisionGraceUntil) {
        return;
      }
      triggerGameOver();
      return;
    }
    state.collisionGraceUntil = 0;

    // Move snake head forward
    state.snake.unshift(nextHead);

    // Collision Detection: Apple
    if (nextHead.x === state.apple.x && nextHead.y === state.apple.y) {
      state.score += 10;
      playEatSound();
      spawnParticles(state.apple.x, state.apple.y);
      if (state.snake.length >= state.gridCols * state.gridRows) {
        triggerGameWin();
        return;
      }
      spawnApple();
    } else {
      // Remove tail segment if apple was not eaten
      state.snake.pop();
    }

    // Pad prevSnake to match new length if grew
    if (state.prevSnake) {
      while (state.prevSnake.length < state.snake.length) {
        var last = state.prevSnake[state.prevSnake.length - 1] || nextHead;
        state.prevSnake.push({ x: last.x, y: last.y });
      }
    }
  }

  function tick(timestamp) {
    if (state.gameOver) return;
    
    state.rafId = requestAnimationFrame(tick);
    
    var elapsed = timestamp - lastTime;
    if (state.playing && !state.paused && elapsed >= state.speedMs) {
      lastTime = timestamp - (elapsed % state.speedMs);
      updateSnake();
      updateUI();
    }

    updateParticles();
    drawGame();
  }

  function drawGame() {
    var canvas = qs("#snake-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw alternating checkerboard squares (Google-style but retro dark)
    for (var col = 0; col < state.gridCols; col++) {
      for (var row = 0; row < state.gridRows; row++) {
        if ((col + row) % 2 === 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        } else {
          ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        }
        ctx.fillRect(col * state.cellSize, row * state.cellSize, state.cellSize, state.cellSize);
      }
    }
    
    // Draw background grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (var col = 0; col <= state.gridCols; col++) {
      var x = col * state.cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (var row = 0; row <= state.gridRows; row++) {
      var y = row * state.cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw apple
    if (state.playing || state.gameOver) {
      var ax = state.apple.x * state.cellSize + state.cellSize / 2;
      var ay = state.apple.y * state.cellSize + state.cellSize / 2;
      var radius = state.cellSize / 2 - 2;
      
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#f87171"; // Red-orange neon
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(248, 113, 113, 0.8)";
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    }

    // Draw snake
    var t = 1;
    if (state.playing && !state.paused && !state.gameOver && state.lastTickTime) {
      var now = performance.now();
      t = (now - state.lastTickTime) / state.speedMs;
      if (t > 1) t = 1;
      if (t < 0) t = 0;
    }

    var displaySnake = [];
    for (var i = 0; i < state.snake.length; i++) {
      var segment = state.snake[i];
      var sx = segment.x * state.cellSize;
      var sy = segment.y * state.cellSize;

      if (state.prevSnake && state.prevSnake[i]) {
        var prevSegment = state.prevSnake[i];
        var interpX = prevSegment.x + (segment.x - prevSegment.x) * t;
        var interpY = prevSegment.y + (segment.y - prevSegment.y) * t;
        sx = interpX * state.cellSize;
        sy = interpY * state.cellSize;
      }
      displaySnake.push({
        x: sx + state.cellSize / 2,
        y: sy + state.cellSize / 2
      });
    }

    if (displaySnake.length) {
      var bodyRadius = state.cellSize * 0.42;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (displaySnake.length > 1) {
        ctx.beginPath();
        ctx.moveTo(displaySnake[0].x, displaySnake[0].y);
        for (var bodyIndex = 1; bodyIndex < displaySnake.length; bodyIndex++) {
          ctx.lineTo(displaySnake[bodyIndex].x, displaySnake[bodyIndex].y);
        }
        ctx.strokeStyle = "#047857";
        ctx.lineWidth = bodyRadius * 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(5, 150, 105, 0.45)";
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(displaySnake[0].x, displaySnake[0].y);
        for (var highlightIndex = 1; highlightIndex < displaySnake.length; highlightIndex++) {
          ctx.lineTo(displaySnake[highlightIndex].x, displaySnake[highlightIndex].y);
        }
        ctx.strokeStyle = "rgba(110, 231, 183, 0.22)";
        ctx.lineWidth = bodyRadius * 0.9;
        ctx.stroke();
      }

      var head = displaySnake[0];
      ctx.beginPath();
      ctx.arc(head.x, head.y, bodyRadius + 1, 0, Math.PI * 2);
      ctx.fillStyle = "#34d399";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(52, 211, 153, 0.6)";
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#0f172a";
      var eyeSize = 3;
      var eyeForward = bodyRadius * 0.45;
      var eyeSide = bodyRadius * 0.42;
      var facing = state.nextDirection || state.direction;
      var sideX = facing.y;
      var sideY = -facing.x;
      var eyeCenterX = head.x + facing.x * eyeForward;
      var eyeCenterY = head.y + facing.y * eyeForward;
      ctx.fillRect(eyeCenterX + sideX * eyeSide - eyeSize / 2, eyeCenterY + sideY * eyeSide - eyeSize / 2, eyeSize, eyeSize);
      ctx.fillRect(eyeCenterX - sideX * eyeSide - eyeSize / 2, eyeCenterY - sideY * eyeSide - eyeSize / 2, eyeSize, eyeSize);
    }

    // Draw eating particles
    for (var j = 0; j < state.particles.length; j++) {
      var p = state.particles[j];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(248, 113, 113, " + p.alpha + ")";
      ctx.fill();
    }
  }

  function updateUI() {
    var curScoreSpan = qs("#snake-current-score");
    if (curScoreSpan) curScoreSpan.textContent = String(state.score);
    
    var highScoreSpan = qs("#snake-high-score");
    if (highScoreSpan) highScoreSpan.textContent = String(state.highScore);

    var soundBtn = qs("#snake-sound-btn");
    if (soundBtn) {
      var onIcon = soundBtn.querySelector(".snake-sound-on");
      var offIcon = soundBtn.querySelector(".snake-sound-off");
      if (onIcon && offIcon) {
        if (state.soundEnabled) {
          onIcon.classList.remove("snake-hidden");
          offIcon.classList.add("snake-hidden");
        } else {
          onIcon.classList.add("snake-hidden");
          offIcon.classList.remove("snake-hidden");
        }
      }
    }

    updateBoardSizeButtons(currentWidget);
  }

  function handleKeyDown(event) {
    if (!currentWidget) return;
    resumeAudioContext();
    
    // Always intercept spacebar for pause/resume if game is running/playing
    if (event.key === " " && state.playing && !state.gameOver) {
      event.preventDefault();
      if (state.paused) resumeGame();
      else pauseGame();
      return;
    }

    if (!state.playing || state.paused || state.gameOver) return;

    var dir = null;
    switch (event.key) {
      case "ArrowUp":
      case "w":
      case "W":
        dir = { x: 0, y: -1 };
        break;
      case "ArrowDown":
      case "s":
      case "S":
        dir = { x: 0, y: 1 };
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        dir = { x: -1, y: 0 };
        break;
      case "ArrowRight":
      case "d":
      case "D":
        dir = { x: 1, y: 0 };
        break;
    }

    if (dir) {
      event.preventDefault();
      setDirection(dir);
    }
  }

  function getDpadDirection(target) {
    if (!target || typeof target.closest !== "function") return null;
    if (target.closest("#snake-dpad-up")) return { x: 0, y: -1 };
    if (target.closest("#snake-dpad-down")) return { x: 0, y: 1 };
    if (target.closest("#snake-dpad-left")) return { x: -1, y: 0 };
    if (target.closest("#snake-dpad-right")) return { x: 1, y: 0 };
    return null;
  }

  function toggleFullscreen() {
    if (!currentWidget) return;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (currentWidget.requestFullscreen) {
          currentWidget.requestFullscreen();
        } else if (currentWidget.webkitRequestFullscreen) {
          currentWidget.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.warn("Fullscreen toggle failed:", e);
    }
  }

  function handleClick(event) {
    var w = event.target.closest("[data-snake-widget]");
    if (!w) return;
    if (w !== currentWidget) initFromWidget(w);

    var startBtn = event.target.closest("#snake-start-btn");
    var restartBtn = event.target.closest("#snake-restart-btn");
    var winRestartBtn = event.target.closest("#snake-win-restart-btn");
    var resumeBtn = event.target.closest("#snake-resume-btn");
    
    if (startBtn || restartBtn || winRestartBtn) {
      startGame();
      return;
    }

    if (resumeBtn) {
      resumeGame();
      return;
    }

    var pauseBtn = event.target.closest("#snake-pause-btn");
    if (pauseBtn && !pauseBtn.disabled) {
      if (state.paused) resumeGame();
      else pauseGame();
      return;
    }

    var fullscreenBtn = event.target.closest("#snake-fullscreen-btn");
    if (fullscreenBtn) {
      toggleFullscreen();
      return;
    }

    var soundBtn = event.target.closest("#snake-sound-btn");
    if (soundBtn) {
      state.soundEnabled = !state.soundEnabled;
      primeAudio();
      updateUI();
      return;
    }

    var boardBtn = event.target.closest(".snake-board-size-btn");
    if (boardBtn && !boardBtn.disabled) {
      var preset = boardBtn.getAttribute("data-board-preset");
      if (preset && preset !== w.getAttribute("data-board-preset")) {
        applyBoardPreset(w, preset);
        resetGame();
        state.prevSnake = state.snake.map(function (s) {
          return { x: s.x, y: s.y };
        });
        drawGame();
        updateUI();
      }
      return;
    }

    if (getDpadDirection(event.target)) {
      return;
    }
  }

  function handlePointerDown(event) {
    var dir = getDpadDirection(event.target);
    if (!dir) return;

    var w = event.target.closest("[data-snake-widget]");
    if (!w) return;
    if (w !== currentWidget) initFromWidget(w);

    event.preventDefault();
    resumeAudioContext();
    setDirection(dir);
  }

  function checkWidget() {
    var w = document.querySelector("[data-snake-widget]");
    if (!w) {
      if (currentWidget && !currentWidget.isConnected) {
        if (state.rafId) {
          cancelAnimationFrame(state.rafId);
          state.rafId = 0;
        }
        currentWidget = null;
      }
      return;
    }
    if (w !== currentWidget) {
      initFromWidget(w);
    }
  }

  function handleFullscreenChange() {
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var fsBtn = qs("#snake-fullscreen-btn");
    if (fsBtn) {
      fsBtn.textContent = isFs ? getSnTranslation("exitFs") : getSnTranslation("enterFs");
    }
  }

  // Event Listeners
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("click", handleClick);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

  var observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
