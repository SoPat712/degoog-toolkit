(function () {
  "use strict";

  var STOPWATCH_LANG_DICT = {
    en: {
      timer: "Timer",
      stopwatch: "Stopwatch",
      soundOff: "Sound off",
      soundOn: "Sound on",
      editTimerDuration: "Edit timer duration",
      start: "Start",
      pause: "Pause",
      reset: "Reset",
      timerDuration: "Timer duration"
    }
  };

  function getStTranslation(key) {
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    var el = currentWidget || document.querySelector("[data-timer-widget]");
    return (el && el.getAttribute(attrName)) || STOPWATCH_LANG_DICT["en"][key] || key;
  }

  var CIRCUMFERENCE = 2 * Math.PI * 54;
  var DEFAULT_DURATION_MS = 5 * 60 * 1000;
  var DEFAULT_STOPWATCH_CYCLE_MS = 60 * 1000;
  var MAX_DURATION_MS = 24 * 60 * 60 * 1000;
  var soundEnabled = false;
  var currentWidget = null;
  var audioCtx = null;

  var state = {
    mode: "timer",
    durationMs: DEFAULT_DURATION_MS,
    remainingMs: DEFAULT_DURATION_MS,
    elapsedMs: 0,
    stopwatchCycleMs: DEFAULT_STOPWATCH_CYCLE_MS,
    running: false,
    alarming: false,
    rafId: 0,
    lastFrameTime: 0,
    alarmTimerId: 0,
  };

  var ICON_PLAY =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5"/></svg>';
  var ICON_PAUSE =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICON_SOUND_OFF =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>';
  var ICON_SOUND_ON =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';

  function widget() {
    return document.querySelector("[data-timer-widget]");
  }

  function qs(selector) {
    return currentWidget ? currentWidget.querySelector(selector) : null;
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatTime(totalSeconds) {
    var safeSeconds = Math.max(0, totalSeconds);
    var hours = Math.floor(safeSeconds / 3600);
    var minutes = Math.floor((safeSeconds % 3600) / 60);
    var seconds = Math.floor(safeSeconds % 60);
    if (hours > 0) return hours + ":" + pad(minutes) + ":" + pad(seconds);
    return minutes + ":" + pad(seconds);
  }

  function parseTimeInput(value) {
    var raw = String(value || "").trim().toLowerCase();
    var unitMatch = raw.match(
      /(\d+(?:\.\d+)?)\s*(hours?|horas?|heures?|hrs?|hr|h|minutes?|minutos?|mins?|min|m|seconds?|segundos?|secondes?|secs?|seg|sec|s)\b/g,
    );
    if (unitMatch) {
      var totalSeconds = 0;
      for (var i = 0; i < unitMatch.length; i++) {
        var part = /^(\d+(?:\.\d+)?)\s*([a-z]+)/.exec(unitMatch[i]);
        if (!part) continue;
        var amount = Number(part[1]);
        var unit = part[2];
        var multiplier = /^h/.test(unit) ? 3600 : /^s/.test(unit) ? 1 : 60;
        totalSeconds += amount * multiplier;
      }
      return clampMs(totalSeconds * 1000);
    }

    var parts = raw.split(":").map(function (part) {
      return Number(part.trim());
    });
    if (!parts.length || parts.some(isNaN)) return null;
    if (parts.length === 3) {
      return clampMs((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
    }
    if (parts.length === 2) return clampMs((parts[0] * 60 + parts[1]) * 1000);
    return clampMs(parts[0] * 60 * 1000);
  }

  function clampMs(value) {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.min(Math.round(value), MAX_DURATION_MS);
  }

  function setArc(ratio) {
    var arc = qs("[data-timer-progress]");
    if (!arc) return;
    var bounded = Math.max(0, Math.min(1, ratio));
    arc.style.strokeDasharray = CIRCUMFERENCE.toFixed(3);
    arc.style.strokeDashoffset = (CIRCUMFERENCE * (1 - bounded)).toFixed(3);
  }

  function progressRatio() {
    if (state.mode === "timer") {
      return state.durationMs > 0 ? state.remainingMs / state.durationMs : 0;
    }
    return (state.elapsedMs % state.stopwatchCycleMs) / state.stopwatchCycleMs;
  }

  function displaySeconds() {
    if (state.mode === "timer") {
      return state.remainingMs > 0 ? Math.ceil(state.remainingMs / 1000) : 0;
    }
    return Math.floor(state.elapsedMs / 1000);
  }

  function render() {
    if (!currentWidget) return;
    currentWidget.setAttribute("data-mode", state.mode);
    currentWidget.setAttribute("data-running", state.running ? "true" : "false");
    currentWidget.setAttribute("data-alarming", state.alarming ? "true" : "false");

    var display = qs("[data-timer-display]");
    if (display && display.tagName !== "INPUT") {
      var text = formatTime(displaySeconds());
      if (display.textContent !== text) display.textContent = text;
      display.title = state.mode === "timer" ? getStTranslation("editTimerDuration") : getStTranslation("stopwatch");
    }

    var tabs = currentWidget.querySelectorAll("[data-timer-mode]");
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute("data-timer-mode") === state.mode;
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
    }

    setArc(progressRatio());
    updatePlayPauseButton();
    updateSoundButton();
  }

  function tick(now) {
    state.rafId = 0;
    if (!state.running) return;

    if (!state.lastFrameTime) state.lastFrameTime = now;
    var delta = Math.max(0, Math.min(now - state.lastFrameTime, 1000));
    state.lastFrameTime = now;

    if (state.mode === "timer") {
      state.remainingMs = Math.max(0, state.remainingMs - delta);
      if (state.remainingMs <= 0) {
        state.running = false;
        state.lastFrameTime = 0;
        startAlarm();
        render();
        return;
      }
    } else {
      state.elapsedMs += delta;
    }

    render();
    requestTick();
  }

  function requestTick() {
    if (!state.rafId) state.rafId = requestAnimationFrame(tick);
  }

  function cancelTick() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    state.lastFrameTime = 0;
  }

  function start() {
    if (state.running) return;
    stopAlarm();
    if (state.mode === "timer" && state.remainingMs <= 0) {
      state.remainingMs = state.durationMs;
    }
    state.running = true;
    state.lastFrameTime = 0;
    render();
    requestTick();
  }

  function pause() {
    state.running = false;
    cancelTick();
    render();
  }

  function reset() {
    pause();
    stopAlarm();
    if (state.mode === "timer") {
      state.remainingMs = state.durationMs;
    } else {
      state.elapsedMs = 0;
    }
    render();
  }

  function switchMode(mode) {
    if (mode !== "timer" && mode !== "stopwatch") return;
    if (state.mode === mode) return;
    pause();
    stopAlarm();
    state.mode = mode;
    if (mode === "timer") {
      state.remainingMs = state.durationMs;
    } else {
      state.elapsedMs = 0;
    }
    render();
  }

  function updatePlayPauseButton() {
    var button = qs('[data-timer-action="toggle-play"]');
    if (!button) return;
    var active = state.running || state.alarming;
    button.innerHTML = active ? ICON_PAUSE : ICON_PLAY;
    button.setAttribute("aria-label", active ? getStTranslation("pause") : getStTranslation("start"));
    button.title = active ? getStTranslation("pause") : getStTranslation("start");
  }

  function updateSoundButton() {
    var button = qs('[data-timer-action="toggle-sound"]');
    if (!button) return;
    button.innerHTML = soundEnabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
    button.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
    button.setAttribute("aria-label", soundEnabled ? getStTranslation("soundOn") : getStTranslation("soundOff"));
    button.title = soundEnabled ? getStTranslation("soundOn") : getStTranslation("soundOff");
  }

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playBeep() {
    if (!soundEnabled) return;
    try {
      var ctx = getAudioContext();
      [0, 0.18, 0.36].forEach(function (delay) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 920;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.65, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + delay + 0.14,
        );
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.14);
      });
    } catch (error) {
      // Audio support is optional.
    }
  }

  function startAlarm() {
    state.alarming = true;
    playBeep();
    scheduleAlarm();
  }

  function scheduleAlarm() {
    if (state.alarmTimerId || !state.alarming) return;
    state.alarmTimerId = window.setTimeout(function () {
      state.alarmTimerId = 0;
      if (!state.alarming) return;
      playBeep();
      scheduleAlarm();
    }, 1400);
  }

  function stopAlarm() {
    if (state.alarmTimerId) {
      window.clearTimeout(state.alarmTimerId);
      state.alarmTimerId = 0;
    }
    state.alarming = false;
  }

  function makeEditable() {
    if (!currentWidget || state.mode !== "timer" || state.running || state.alarming) {
      return;
    }

    var display = qs("[data-timer-display]");
    if (!display || display.tagName === "INPUT") return;

    var input = document.createElement("input");
    input.className = "timer-display-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.value = display.textContent.trim();
    input.setAttribute("data-timer-display", "");
    input.setAttribute("aria-label", getStTranslation("timerDuration"));
    display.replaceWith(input);
    input.focus();
    input.select();

    function restore(text) {
      var span = document.createElement("span");
      span.className = "timer-display";
      span.setAttribute("data-timer-display", "");
      span.title = getStTranslation("editTimerDuration");
      if (text) span.textContent = text;
      input.replaceWith(span);
    }

    function commit() {
      var parsed = parseTimeInput(input.value);
      restore();
      if (parsed !== null) {
        state.durationMs = parsed;
        state.remainingMs = parsed;
      }
      render();
    }

    input.addEventListener("blur", commit, { once: true });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.removeEventListener("blur", commit);
        restore(formatTime(displaySeconds()));
        render();
      }
    });
  }

  function readSecondsAttr(w, attr, fallback) {
    var value = Number(w.getAttribute(attr));
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
  }

  function initFromWidget(w) {
    stopAlarm();
    cancelTick();
    currentWidget = w;

    var durationSeconds = readSecondsAttr(
      w,
      "data-duration-seconds",
      DEFAULT_DURATION_MS / 1000,
    );
    var cycleSeconds = readSecondsAttr(
      w,
      "data-stopwatch-cycle-seconds",
      DEFAULT_STOPWATCH_CYCLE_MS / 1000,
    );
    var mode = w.getAttribute("data-mode") === "stopwatch" ? "stopwatch" : "timer";

    state.mode = mode;
    state.durationMs = clampMs(durationSeconds * 1000) || DEFAULT_DURATION_MS;
    state.remainingMs = state.durationMs;
    state.elapsedMs = 0;
    state.stopwatchCycleMs = clampMs(cycleSeconds * 1000) || DEFAULT_STOPWATCH_CYCLE_MS;
    state.running = false;
    state.alarming = false;
    state.lastFrameTime = 0;

    render();
    if (w.getAttribute("data-autostart") === "true") start();
  }

  function handleClick(event) {
    var w = event.target.closest("[data-timer-widget]");
    if (!w) return;
    if (w !== currentWidget) initFromWidget(w);

    var modeButton = event.target.closest("[data-timer-mode]");
    if (modeButton && w.contains(modeButton)) {
      switchMode(modeButton.getAttribute("data-timer-mode"));
      return;
    }

    var display = event.target.closest("[data-timer-display]");
    if (display && w.contains(display)) {
      makeEditable();
      return;
    }

    var actionButton = event.target.closest("[data-timer-action]");
    if (!actionButton || !w.contains(actionButton)) return;

    switch (actionButton.getAttribute("data-timer-action")) {
      case "toggle-play":
        if (state.alarming) {
          stopAlarm();
          render();
        } else if (state.running) {
          pause();
        } else {
          start();
        }
        break;
      case "reset":
        reset();
        break;
      case "toggle-sound":
        soundEnabled = !soundEnabled;
        if (state.alarming) playBeep();
        render();
        break;
    }
  }

  function checkWidget() {
    var w = widget();
    if (!w) {
      if (currentWidget && !currentWidget.isConnected) {
        pause();
        stopAlarm();
        currentWidget = null;
      }
      return;
    }
    if (w !== currentWidget) initFromWidget(w);
  }

  document.addEventListener("click", handleClick);

  var observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
