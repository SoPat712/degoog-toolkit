(() => {
  const CARD_SELECTOR = ".speedtest-card[data-speedtest-card]";
  const MAX_GAUGE_MBPS = 1000;
  const PHASE_LABELS = {
    idle: "Ready",
    preflight: "Finding server",
    latency: "Latency",
    upload: "Upload",
    download: "Download",
    complete: "Complete",
    error: "Error",
  };

  function formatMbps(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "0.0";
    }

    return safe.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatLatency(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "--";
    }

    return `${Math.round(safe)} ms`;
  }

  function gaugeProgress(speedMbps) {
    const safe = Math.max(0, Number(speedMbps) || 0);
    if (safe <= 0) {
      return 0;
    }

    return Math.min(
      1,
      Math.log10(Math.min(safe, MAX_GAUGE_MBPS) + 1) /
        Math.log10(MAX_GAUGE_MBPS + 1)
    );
  }

  function positionTicks(card) {
    card.querySelectorAll("[data-speedtest-tick]").forEach((node) => {
      const speed = Number(node.dataset.speedtestTick);
      if (!Number.isFinite(speed)) {
        return;
      }

      const progress = gaugeProgress(speed);
      const angle = Math.PI - progress * Math.PI;
      const x = 50 + Math.cos(angle) * 40;
      const y = 78 - Math.sin(angle) * 42;
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
    });
  }

  function setArc(card, speedMbps) {
    const arc = card.querySelector("[data-speedtest-arc]");
    if (!arc) {
      return;
    }

    const dash = (gaugeProgress(speedMbps) * 100).toFixed(2);
    arc.style.strokeDasharray = `${dash} 100`;
  }

  function setDisplayValue(card, value) {
    const valueNode = card.querySelector("[data-speedtest-value]");
    if (!valueNode) {
      return;
    }

    if (card._speedtestFrame) {
      window.cancelAnimationFrame(card._speedtestFrame);
    }

    const nextValue = Math.max(0, Number(value) || 0);
    const startValue = Number(card.dataset.displayMbps || 0);
    const startedAt = performance.now();
    const duration = 260;

    const update = (now) => {
      const elapsed = now - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (nextValue - startValue) * eased;
      card.dataset.displayMbps = String(current);
      valueNode.textContent = formatMbps(current);
      setArc(card, current);

      if (progress < 1) {
        card._speedtestFrame = window.requestAnimationFrame(update);
      }
    };

    card._speedtestFrame = window.requestAnimationFrame(update);
  }

  function updateButton(card, state) {
    const button = card.querySelector("[data-speedtest-action]");
    if (!button) {
      return;
    }

    const running = Boolean(state.running);
    button.disabled = running;
    if (running) {
      button.textContent = "Running...";
      return;
    }

    if (state.phase === "complete") {
      button.textContent = "Run again";
      return;
    }

    if (state.phase === "error") {
      button.textContent = "Try again";
      return;
    }

    button.textContent = "Run test";
  }

  function renderCard(card, state) {
    const phaseNode = card.querySelector("[data-speedtest-phase]");
    const downloadNode = card.querySelector("[data-speedtest-download]");
    const uploadNode = card.querySelector("[data-speedtest-upload]");
    const latencyNode = card.querySelector("[data-speedtest-latency]");
    const serverNode = card.querySelector("[data-speedtest-server]");
    const assessmentNode = card.querySelector("[data-speedtest-assessment]");
    const statusNode = card.querySelector("[data-speedtest-status]");

    card.classList.toggle("speedtest-card--running", Boolean(state.running));

    if (phaseNode) {
      phaseNode.textContent = PHASE_LABELS[state.phase] || PHASE_LABELS.idle;
    }

    setDisplayValue(card, state.currentMbps || 0);

    if (downloadNode) {
      downloadNode.textContent = formatMbps(state.downloadMbps);
    }

    if (uploadNode) {
      uploadNode.textContent = formatMbps(state.uploadMbps);
    }

    if (latencyNode) {
      latencyNode.textContent = formatLatency(state.latencyMs);
    }

    if (serverNode) {
      serverNode.textContent =
        state.serverLabel || "Resolving nearest edge...";
    }

    if (assessmentNode) {
      assessmentNode.textContent =
        state.assessment ||
        "Upload runs first, then download, and the card will show the server used for the test.";
    }

    if (statusNode) {
      statusNode.textContent =
        state.status || "Ready to measure your connection.";
    }

    updateButton(card, state);
  }

  function initialState() {
    return {
      phase: "idle",
      running: false,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel: "",
      assessment: "",
      status: "Ready to measure your connection.",
    };
  }

  function applyState(card, partial) {
    const state = {
      ...(card._speedtestState || initialState()),
      ...partial,
    };
    card._speedtestState = state;
    renderCard(card, state);
  }

  function handleSseChunk(card, chunk) {
    let eventName = "message";
    let data = "";

    chunk.split("\n").forEach((line) => {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        return;
      }

      if (line.startsWith("data:")) {
        data += line.slice(5).trim();
      }
    });

    if (!data) {
      return;
    }

    try {
      const payload = JSON.parse(data);
      if (eventName === "update") {
        applyState(card, payload);
        return;
      }

      if (eventName === "error") {
        applyState(card, {
          phase: "error",
          running: false,
          status: payload.message || "Speed test failed.",
          assessment:
            payload.message ||
            "The speed test could not complete. Try again in a moment.",
        });
      }
    } catch {
      applyState(card, {
        phase: "error",
        running: false,
        status: "Could not read the speed test response.",
        assessment:
          "The speed test response was malformed, so the UI stopped early.",
      });
    }
  }

  async function startTest(card) {
    if (card.dataset.speedtestRunning === "true") {
      return;
    }

    card.dataset.speedtestRunning = "true";
    applyState(card, {
      phase: "preflight",
      running: true,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel: "",
      assessment: "",
      status: "Finding the nearest speed test server...",
    });

    if (card._speedtestAbortController) {
      card._speedtestAbortController.abort();
    }

    const controller = new AbortController();
    card._speedtestAbortController = controller;
    const endpoint = card.dataset.speedtestEndpoint || "/api/plugin/speedtest/run";

    try {
      const response = await fetch(`${endpoint}?seed=${Date.now()}`, {
        headers: {
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("The speed test endpoint did not respond.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        parts.forEach((part) => handleSseChunk(card, part.trim()));
      }

      if (buffer.trim()) {
        handleSseChunk(card, buffer.trim());
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      applyState(card, {
        phase: "error",
        running: false,
        status:
          error instanceof Error
            ? error.message
            : "The speed test could not be started.",
        assessment:
          "The speed test hit an unexpected error before it could finish.",
      });
    } finally {
      card.dataset.speedtestRunning = "false";
      const state = card._speedtestState || initialState();
      if (state.phase !== "complete" && state.phase !== "error") {
        applyState(card, {
          running: false,
        });
      } else {
        updateButton(card, state);
      }
    }
  }

  function initCard(card) {
    if (!(card instanceof HTMLElement) || card.dataset.speedtestBound === "true") {
      return;
    }

    card.dataset.speedtestBound = "true";
    card._speedtestState = initialState();
    positionTicks(card);
    renderCard(card, card._speedtestState);

    const button = card.querySelector("[data-speedtest-action]");
    if (button) {
      button.addEventListener("click", () => startTest(card));
    }

    window.requestAnimationFrame(() => startTest(card));
  }

  function initAll(root = document) {
    if (root instanceof HTMLElement && root.matches(CARD_SELECTOR)) {
      initCard(root);
    }

    root.querySelectorAll?.(CARD_SELECTOR).forEach(initCard);
  }

  function boot() {
    initAll();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          initAll(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
