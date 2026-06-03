(function () {
  "use strict";

  let audioCtx = null;
  let currentWidget = null;
  let timerId = null;
  let nextNoteTime = 0.0;
  
  function getTranslation(key, fallback) {
    var el = currentWidget || document.querySelector(".metro-card");
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    return (el && el.getAttribute(attrName)) || fallback;
  }
  
  const lookahead = 25.0; // Milliseconds between scheduler updates
  const scheduleAheadTime = 0.1; // Seconds of audio to schedule ahead

  const state = {
    isPlaying: false,
    bpm: 120,
    beatsPerBar: 4,
    currentBeat: 0
  };

  let tapTimes = [];

  function initAudio() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function getTempoMarking(bpm) {
    if (bpm < 60) return "Largo";
    if (bpm < 76) return "Adagio";
    if (bpm < 108) return "Andante";
    if (bpm < 120) return "Moderato";
    if (bpm < 156) return "Allegro";
    if (bpm < 176) return "Vivace";
    return "Presto";
  }

  function updateBpm(newBpm) {
    state.bpm = Math.max(40, Math.min(240, Math.round(newBpm)));

    const display = document.querySelector("[data-metro-bpm-val]");
    if (display) {
      display.textContent = state.bpm;
    }

    const slider = document.querySelector("[data-metro-slider]");
    if (slider) {
      slider.value = state.bpm;
    }

    const tempoText = document.querySelector("[data-metro-tempo-text]");
    if (tempoText) {
      tempoText.textContent = getTempoMarking(state.bpm);
    }
  }

  function updateDotVisibility() {
    const dots = document.querySelectorAll(".metro-dot");
    dots.forEach((dot, index) => {
      if (index < state.beatsPerBar) {
        dot.classList.remove("metro-hidden");
      } else {
        dot.classList.add("metro-hidden");
      }
      dot.classList.remove("active", "accent");
    });
  }

  function pulseVisuals(beatNumber) {
    // 1. Pulse play/pause button
    const playBtn = document.querySelector("[data-metro-play-btn]");
    if (playBtn) {
      playBtn.classList.remove("pulse");
      void playBtn.offsetWidth; // Force layout reflow to restart animation
      playBtn.classList.add("pulse");
    }

    // 2. Pulse beat indicator dots
    const dots = document.querySelectorAll(".metro-dot");
    dots.forEach((dot, index) => {
      const idx = parseInt(dot.getAttribute("data-index"), 10);
      if (idx === beatNumber) {
        dot.classList.add("active");
        if (beatNumber === 0) {
          dot.classList.add("accent");
        } else {
          dot.classList.remove("accent");
        }
      } else {
        dot.classList.remove("active", "accent");
      }
    });
  }

  function clearVisuals() {
    const playBtn = document.querySelector("[data-metro-play-btn]");
    if (playBtn) {
      playBtn.classList.remove("pulse");
    }
    const dots = document.querySelectorAll(".metro-dot");
    dots.forEach(dot => {
      dot.classList.remove("active", "accent");
    });
  }

  function updatePlayBtnState(playing) {
    const playBtn = document.querySelector("[data-metro-play-btn]");
    if (!playBtn) return;

    const playIcon = playBtn.querySelector(".metro-play-icon");
    const pauseIcon = playBtn.querySelector(".metro-pause-icon");

    if (playing) {
      playIcon.classList.add("metro-hidden");
      pauseIcon.classList.remove("metro-hidden");
      playBtn.setAttribute("aria-label", getTranslation("pause", "Pause"));
    } else {
      playIcon.classList.remove("metro-hidden");
      pauseIcon.classList.add("metro-hidden");
      playBtn.setAttribute("aria-label", getTranslation("play", "Play"));
    }
  }

  function nextNote() {
    const secondsPerBeat = 60.0 / state.bpm;
    nextNoteTime += secondsPerBeat;
    state.currentBeat = (state.currentBeat + 1) % state.beatsPerBar;
  }

  function scheduleNote(beatNumber, time) {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Accent pitch on downbeat (beat 0) vs regular beats
    if (beatNumber === 0) {
      osc.frequency.setValueAtTime(1000, time);
    } else {
      osc.frequency.setValueAtTime(800, time);
    }

    // Precise envelope: quick rise and fast exponential decay to prevent pops/clicks
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.06);

    // Schedule visual pulsing animation
    const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (!state.isPlaying) return;
      pulseVisuals(beatNumber);
    }, delayMs);
  }

  function scheduler() {
    if (!state.isPlaying) return;
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
      scheduleNote(state.currentBeat, nextNoteTime);
      nextNote();
    }
    timerId = setTimeout(scheduler, lookahead);
  }

  function start() {
    if (state.isPlaying) return;

    initAudio();
    state.isPlaying = true;
    state.currentBeat = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;

    updatePlayBtnState(true);
    scheduler();
  }

  function stop() {
    if (!state.isPlaying) return;

    state.isPlaying = false;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }

    updatePlayBtnState(false);
    clearVisuals();
  }

  function tapTempo() {
    initAudio();
    const now = performance.now();

    // If the last tap was more than 2 seconds ago, reset history
    if (tapTimes.length > 0 && (now - tapTimes[tapTimes.length - 1]) > 2000) {
      tapTimes = [];
    }

    tapTimes.push(now);

    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) {
        intervals.push(tapTimes[i] - tapTimes[i - 1]);
      }

      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      let calculatedBpm = Math.round(60000 / avgInterval);

      calculatedBpm = Math.max(40, Math.min(240, calculatedBpm));
      updateBpm(calculatedBpm);
    }

    if (tapTimes.length > 5) {
      tapTimes.shift();
    }
  }

  function handleControlsClick(event) {
    const card = event.target.closest(".metro-card");
    if (!card) return;

    // Adjust BPM +/- 1
    const adjustBtn = event.target.closest(".metro-adjust-btn");
    if (adjustBtn) {
      const action = adjustBtn.getAttribute("data-action");
      if (action === "increment") {
        updateBpm(state.bpm + 1);
      } else if (action === "decrement") {
        updateBpm(state.bpm - 1);
      }
      return;
    }

    // Play/Pause toggling
    const playBtn = event.target.closest("[data-metro-play-btn]");
    if (playBtn) {
      if (state.isPlaying) {
        stop();
      } else {
        start();
      }
      return;
    }

    // Tap Tempo
    const tapBtn = event.target.closest("[data-metro-tap-btn]");
    if (tapBtn) {
      tapTempo();
      return;
    }
  }

  function handleSliderInput(event) {
    const slider = event.target.closest("[data-metro-slider]");
    if (!slider) return;

    const val = parseInt(slider.value, 10);
    if (!isNaN(val)) {
      updateBpm(val);
    }
  }

  function handleSelectChange(event) {
    const select = event.target.closest("[data-metro-select]");
    if (!select) return;

    const val = parseInt(select.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 4) {
      state.beatsPerBar = val;
      state.currentBeat = 0;
      updateDotVisibility();
    }
  }

  function checkWidget() {
    const card = document.querySelector(".metro-card");
    if (!card) {
      if (state.isPlaying) {
        stop();
      }
      currentWidget = null;
      return;
    }

    if (card !== currentWidget) {
      currentWidget = card;
      const defaultBpm = parseInt(card.getAttribute("data-default-bpm"), 10) || 120;
      
      state.bpm = defaultBpm;
      state.beatsPerBar = 4;
      state.currentBeat = 0;

      updateBpm(state.bpm);
      updateDotVisibility();
      updatePlayBtnState(false);
    }
  }

  document.addEventListener("click", handleControlsClick);
  document.addEventListener("input", handleSliderInput);
  document.addEventListener("change", handleSelectChange);

  const observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
