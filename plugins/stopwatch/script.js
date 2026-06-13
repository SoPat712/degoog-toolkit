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
  /** Wall-clock sync interval (RAF pauses in background tabs). */
  var TICK_INTERVAL_MS = 250;
  var soundEnabled = true;
  var currentWidget = null;
  var audioCtx = null;
  var alarmAudio = null;
  var ALARM_TONE_KEY = "degoog-stopwatch-alarm-tone";

  var state = {
    mode: "timer",
    durationMs: DEFAULT_DURATION_MS,
    remainingMs: DEFAULT_DURATION_MS,
    elapsedMs: 0,
    stopwatchCycleMs: DEFAULT_STOPWATCH_CYCLE_MS,
    running: false,
    alarming: false,
    intervalId: 0,
    rafId: 0,
    /** Timer: wall-clock instant when countdown reaches zero. */
    deadlineMs: 0,
    /** Stopwatch: wall-clock instant matching elapsedMs === 0 at start. */
    epochMs: 0,
    /** Last completed stopwatch ring (for lap ticks after background catch-up). */
    lastStopwatchCycle: 0,
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

  function formatTime(totalMs) {
    var safeMs = Math.max(0, totalMs);
    var hours = Math.floor(safeMs / 3600000);
    var minutes = Math.floor((safeMs % 3600000) / 60000);
    var seconds = Math.floor((safeMs % 60000) / 1000);
    var ms = Math.floor(safeMs % 1000);
    var msStr = String(ms);
    while (msStr.length < 3) msStr = "0" + msStr;
    if (hours > 0) return hours + ":" + pad(minutes) + ":" + pad(seconds) + "." + msStr;
    return minutes + ":" + pad(seconds) + "." + msStr;
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

  function liveRemainingMs() {
    if (state.running && state.mode === "timer" && state.deadlineMs) {
      return Math.max(0, state.deadlineMs - nowMs());
    }
    return state.remainingMs;
  }

  function liveElapsedMs() {
    if (state.running && state.mode === "stopwatch" && state.epochMs) {
      return Math.max(0, nowMs() - state.epochMs);
    }
    return state.elapsedMs;
  }

  function progressRatio() {
    if (state.mode === "timer") {
      return state.durationMs > 0 ? liveRemainingMs() / state.durationMs : 0;
    }
    var elapsed = liveElapsedMs();
    return (elapsed % state.stopwatchCycleMs) / state.stopwatchCycleMs;
  }

  function displayMs() {
    if (state.mode === "timer") {
      var remaining = liveRemainingMs();
      return remaining > 0 ? remaining : 0;
    }
    return liveElapsedMs();
  }

  function render() {
    if (!currentWidget) return;
    currentWidget.setAttribute("data-mode", state.mode);
    currentWidget.setAttribute("data-running", state.running ? "true" : "false");
    currentWidget.setAttribute("data-alarming", state.alarming ? "true" : "false");

    var display = qs("[data-timer-display]");
    if (display && display.tagName !== "INPUT") {
      var text = formatTime(displayMs());
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

  function nowMs() {
    return Date.now();
  }

  function stopRenderLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  function renderFrame() {
    state.rafId = 0;
    if (!state.running || document.hidden) return;
    render();
    requestRenderLoop();
  }

  function requestRenderLoop() {
    if (!state.rafId && state.running && !document.hidden) {
      state.rafId = requestAnimationFrame(renderFrame);
    }
  }

  function clearTickDriver() {
    if (state.intervalId) {
      window.clearInterval(state.intervalId);
      state.intervalId = 0;
    }
    stopRenderLoop();
  }

  /** Wall-clock logic: completion, lap ticks, pause snapshots (background-safe). */
  function syncFromWallClock() {
    if (!state.running) return;
    var renderWhileHidden = document.hidden;

    if (state.mode === "timer") {
      var remaining = Math.max(0, state.deadlineMs - nowMs());
      state.remainingMs = remaining;
      if (remaining <= 0) {
        state.running = false;
        clearTickDriver();
        startAlarm();
        render();
        return;
      }
    } else {
      var elapsed = Math.max(0, nowMs() - state.epochMs);
      var prevCycle = state.lastStopwatchCycle;
      var nextCycle = Math.floor(elapsed / state.stopwatchCycleMs);
      state.elapsedMs = elapsed;
      state.lastStopwatchCycle = nextCycle;
      if (nextCycle > prevCycle) playStopwatchTick();
    }

    if (renderWhileHidden) render();
  }

  function startTickDriver() {
    clearTickDriver();
    syncFromWallClock();
    if (!state.running) return;
    state.intervalId = window.setInterval(syncFromWallClock, TICK_INTERVAL_MS);
    requestRenderLoop();
  }

  function armWallClockAnchors() {
    if (state.mode === "timer") {
      if (state.remainingMs <= 0) state.remainingMs = state.durationMs;
      state.deadlineMs = nowMs() + state.remainingMs;
      state.epochMs = 0;
      state.lastStopwatchCycle = 0;
      return;
    }
    state.deadlineMs = 0;
    state.epochMs = nowMs() - state.elapsedMs;
    state.lastStopwatchCycle = Math.floor(
      state.elapsedMs / state.stopwatchCycleMs,
    );
  }

  function clearWallClockAnchors() {
    state.deadlineMs = 0;
    state.epochMs = 0;
    state.lastStopwatchCycle = 0;
  }

  function start() {
    if (state.running) return;
    stopAlarm();
    armWallClockAnchors();
    state.running = true;
    startTickDriver();
    render();
  }

  function pause() {
    if (!state.running) return;
    syncFromWallClock();
    state.running = false;
    clearTickDriver();
    render();
  }

  function reset() {
    pause();
    stopAlarm();
    clearWallClockAnchors();
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
    clearWallClockAnchors();
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
    button.setAttribute("aria-pressed", active ? "true" : "false");
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
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      var resumed = audioCtx.resume();
      if (resumed && typeof resumed.catch === "function") {
        resumed.catch(function () {});
      }
    }
    return audioCtx;
  }

  function getAlarmSoundsList() {
    if (!currentWidget) return [];
    var raw = currentWidget.getAttribute("data-alarm-sounds");
    if (!raw) return [];
    try {
      var sounds = JSON.parse(raw);
      return Array.isArray(sounds) ? sounds : [];
    } catch (error) {
      return [];
    }
  }

  function isValidAlarmTone(tone) {
    if (!tone || tone === "beep") return tone === "beep";
    var sounds = getAlarmSoundsList();
    for (var i = 0; i < sounds.length; i++) {
      if (sounds[i].id === tone) return true;
    }
    return false;
  }

  function applyAlarmTone(tone) {
    if (!currentWidget || !isValidAlarmTone(tone)) return;
    currentWidget.setAttribute("data-alarm-tone", tone);
    var select = qs("[data-timer-alarm-select]");
    if (select && select.value !== tone) select.value = tone;
    try {
      localStorage.setItem(ALARM_TONE_KEY, tone);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function restoreStoredAlarmTone() {
    if (!currentWidget) return;
    var stored = null;
    try {
      stored = localStorage.getItem(ALARM_TONE_KEY);
    } catch (error) {
      // Ignore storage failures.
    }
    if (stored && isValidAlarmTone(stored)) {
      applyAlarmTone(stored);
    }
  }

  function resolveAlarmUrl() {
    if (!currentWidget) return null;
    var tone = currentWidget.getAttribute("data-alarm-tone") || "";
    if (!tone || tone === "beep") return null;
    var sounds = getAlarmSoundsList();
    for (var i = 0; i < sounds.length; i++) {
      if (sounds[i].id === tone) return sounds[i].url;
    }
    return null;
  }

  function stopAlarmAudio() {
    if (!alarmAudio) return;
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio = null;
  }

  /** Short lap tick — stopwatch only, each ring cycle from settings. */
  function playStopwatchTick() {
    if (!soundEnabled || state.mode !== "stopwatch") return;
    try {
      var ctx = getAudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1240;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.45, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);
    } catch (error) {
      // Audio support is optional.
    }
  }

  /** Fallback when no sounds/ tone is selected — timer alarm only. */
  function playTimerFallbackBeep() {
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

  /** Timer finished — plays selected sounds/ tone (m4a/mp3) or fallback beep. */
  function playTimerAlarm() {
    if (!soundEnabled || state.mode !== "timer") return;
    var url = resolveAlarmUrl();
    if (url) {
      try {
        stopAlarmAudio();
        alarmAudio = new Audio(url);
        alarmAudio.addEventListener("ended", function () {
          if (state.alarming) scheduleTimerAlarm(500);
        });
        alarmAudio.play().catch(function () {
          stopAlarmAudio();
          playTimerFallbackBeep();
          scheduleTimerAlarm(1400);
        });
        return;
      } catch (error) {
        // Fall through to the built-in beep.
      }
    }
    playTimerFallbackBeep();
  }

  function startAlarm() {
    if (state.mode !== "timer") return;
    state.alarming = true;
    playTimerAlarm();
    if (!resolveAlarmUrl()) scheduleTimerAlarm(1400);
  }

  function scheduleTimerAlarm(delayMs) {
    if (state.alarmTimerId || !state.alarming) return;
    if (alarmAudio && !alarmAudio.paused && !alarmAudio.ended) return;
    state.alarmTimerId = window.setTimeout(function () {
      state.alarmTimerId = 0;
      if (!state.alarming) return;
      playTimerAlarm();
      if (!resolveAlarmUrl()) scheduleTimerAlarm(1400);
    }, delayMs || 1400);
  }

  function stopAlarm() {
    if (state.alarmTimerId) {
      window.clearTimeout(state.alarmTimerId);
      state.alarmTimerId = 0;
    }
    stopAlarmAudio();
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
    input.value = display.textContent.trim().replace(/\.\d+$/, "");
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
        restore(formatTime(displayMs()));
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
    clearTickDriver();
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
    clearWallClockAnchors();

    restoreStoredAlarmTone();
    render();
    if (w.getAttribute("data-autostart") === "true") start();
  }

  document.addEventListener("change", function (event) {
    var select = event.target.closest("[data-timer-alarm-select]");
    if (!select || !currentWidget || !currentWidget.contains(select)) return;
    applyAlarmTone(select.value);
  });

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
        if (state.alarming) {
          if (soundEnabled) {
            playTimerAlarm();
            if (!resolveAlarmUrl()) scheduleTimerAlarm(1400);
          } else {
            if (state.alarmTimerId) {
              window.clearTimeout(state.alarmTimerId);
              state.alarmTimerId = 0;
            }
            stopAlarmAudio();
          }
        }
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

  document.addEventListener("visibilitychange", function () {
    if (!state.running) return;
    syncFromWallClock();
    if (document.hidden) {
      stopRenderLoop();
    } else {
      requestRenderLoop();
    }
  });

  window.addEventListener("focus", function () {
    if (!state.running) return;
    syncFromWallClock();
    requestRenderLoop();
  });

  window.addEventListener("pageshow", function (event) {
    if (event.persisted && state.running) syncFromWallClock();
  });

  var observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
