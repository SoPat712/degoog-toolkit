(() => {
  const CARD_SELECTOR = ".speedtest-card[data-speedtest-card]";
  const AUTO_SERVER_ID = "auto";
  const MAX_GAUGE_MBPS = 1000;
  const SERVER_SELECTION_PINGS = 2;
  const LATENCY_SAMPLE_COUNT = 5;
  const LATENCY_TIMEOUT_MS = 2500;
  const DOWNLOAD_STREAMS = 4;
  const UPLOAD_STREAMS = 3;
  const DOWNLOAD_STREAM_DELAY_MS = 180;
  const UPLOAD_STREAM_DELAY_MS = 140;
  const DOWNLOAD_GRACE_MS = 1500;
  const UPLOAD_GRACE_MS = 1800;
  const DOWNLOAD_DURATION_MS = 5000;
  const UPLOAD_DURATION_MS = 5000;
  const DOWNLOAD_CHUNK_MB = 256;
  const UPLOAD_PAYLOAD_BYTES = 8 * 1024 * 1024;
  const UPDATE_INTERVAL_MS = 200;
  const OVERHEAD_COMPENSATION_FACTOR = 1.06;
  const PHASE_LABELS = {
    idle: "",
    preflight: "Selecting server",
    latency: "Latency",
    download: "Download",
    upload: "Upload",
    complete: "Complete",
    error: "Error",
  };

  let uploadPayload = null;

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function abortError() {
    try {
      return new DOMException("Aborted", "AbortError");
    } catch {
      const error = new Error("Aborted");
      error.name = "AbortError";
      return error;
    }
  }

  function isAbortError(error) {
    return (
      Boolean(error) &&
      (error.name === "AbortError" ||
        /abort/i.test(String(error.message || error)))
    );
  }

  function roundToTenths(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) {
      return 0;
    }

    return Math.round(safe * 10) / 10;
  }

  function median(values) {
    const sorted = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    if (!sorted.length) {
      return 0;
    }

    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function randomToken() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function appendQuery(url, params) {
    const nextUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      nextUrl.searchParams.set(key, String(value));
    });
    return nextUrl.toString();
  }

  function createRunContext() {
    return {
      aborted: false,
      fetchControllers: new Set(),
      uploadXhrs: new Set(),
      intervals: new Set(),
      timeouts: new Set(),

      dispose() {
        this.fetchControllers.forEach((controller) => controller.abort());
        this.uploadXhrs.forEach((xhr) => {
          try {
            xhr.abort();
          } catch {}
        });
        this.intervals.forEach((id) => window.clearInterval(id));
        this.timeouts.forEach((id) => window.clearTimeout(id));
        this.fetchControllers.clear();
        this.uploadXhrs.clear();
        this.intervals.clear();
        this.timeouts.clear();
      },

      abort() {
        this.aborted = true;
        this.dispose();
      },
    };
  }

  function registerInterval(run, callback, delay) {
    const id = window.setInterval(callback, delay);
    run.intervals.add(id);
    return id;
  }

  function clearRegisteredInterval(run, id) {
    window.clearInterval(id);
    run.intervals.delete(id);
  }

  function registerTimeout(run, callback, delay) {
    const id = window.setTimeout(() => {
      run.timeouts.delete(id);
      callback();
    }, delay);
    run.timeouts.add(id);
    return id;
  }

  function unregisterFetchController(run, controller) {
    if (!controller) {
      return;
    }

    run.fetchControllers.delete(controller);
  }

  function unregisterUploadXhr(run, xhr) {
    if (!xhr) {
      return;
    }

    run.uploadXhrs.delete(xhr);
  }

  function getUploadPayload() {
    if (!uploadPayload) {
      uploadPayload = new Blob([new Uint8Array(UPLOAD_PAYLOAD_BYTES)], {
        type: "application/octet-stream",
      });
    }

    return uploadPayload;
  }

  function getServers(card) {
    if (Array.isArray(card._speedtestServers)) {
      return card._speedtestServers;
    }

    const script = card.querySelector("[data-speedtest-server-data]");
    if (!script) {
      card._speedtestServers = [];
      return card._speedtestServers;
    }

    try {
      const parsed = JSON.parse(script.textContent || "[]");
      card._speedtestServers = Array.isArray(parsed) ? parsed : [];
    } catch {
      card._speedtestServers = [];
    }

    return card._speedtestServers;
  }

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
    const startedAt = nowMs();
    const duration = 220;

    const update = (frameAt) => {
      const elapsed = frameAt - startedAt;
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
    const serverSelect = card.querySelector("[data-speedtest-server-select]");
    if (!button) {
      return;
    }

    const running = Boolean(state.running);
    button.disabled = running;
    if (serverSelect) {
      serverSelect.disabled = running;
    }

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

    if (phaseNode) {
      phaseNode.textContent = PHASE_LABELS[state.phase] || "";
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
        state.serverLabel || "Automatic (lowest latency)";
    }

    if (assessmentNode) {
      assessmentNode.textContent =
        state.assessment ||
        "Measures latency first, then download, then upload using the selected server.";
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

  function buildAssessment(downloadMbps) {
    const speed = Number(downloadMbps) || 0;

    if (speed >= 500) {
      return "Your Internet connection is extremely fast.";
    }

    if (speed >= 200) {
      return "Your Internet connection is very fast.";
    }

    if (speed >= 100) {
      return "Your Internet connection is fast.";
    }

    if (speed >= 50) {
      return "Your Internet connection should handle streaming, calls, and gaming comfortably.";
    }

    if (speed >= 25) {
      return "Your Internet connection should handle HD streaming and everyday work well.";
    }

    if (speed >= 10) {
      return "Your Internet connection is fine for browsing, music, and lighter video calls.";
    }

    return "Your Internet connection may feel slow on heavier downloads or video streams.";
  }

  async function measurePing(url, run, timeoutMs = LATENCY_TIMEOUT_MS) {
    if (run.aborted) {
      throw abortError();
    }

    const controller = new AbortController();
    run.fetchControllers.add(controller);
    const startedAt = nowMs();
    let timeoutId = null;

    try {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(
        appendQuery(url, { cors: "true", r: randomToken() }),
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        throw new Error("Ping failed.");
      }

      await response.text();
      return nowMs() - startedAt;
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error("Ping timed out.");
      }

      throw error;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      unregisterFetchController(run, controller);
    }
  }

  async function probeServer(server, run, sampleCount = SERVER_SELECTION_PINGS) {
    const samples = [];

    for (let index = 0; index < sampleCount; index += 1) {
      try {
        samples.push(await measurePing(server.pingUrl, run));
      } catch (error) {
        if (run.aborted) {
          throw error;
        }
      }
    }

    return samples.length ? Math.min(...samples) : Number.POSITIVE_INFINITY;
  }

  async function selectBestServer(card, run, servers) {
    if (!servers.length) {
      throw new Error("No speed test servers are configured.");
    }

    let completed = 0;
    const results = await Promise.all(
      servers.map(async (server) => {
        const latencyMs = await probeServer(server, run);
        completed += 1;
        applyState(card, {
          phase: "preflight",
          running: true,
          serverLabel: "Selecting server...",
          status: `Checking servers (${completed}/${servers.length})...`,
        });
        return {
          server,
          latencyMs,
        };
      })
    );

    const reachable = results
      .filter((result) => Number.isFinite(result.latencyMs))
      .sort((left, right) => left.latencyMs - right.latencyMs);

    if (!reachable.length) {
      throw new Error("No speed test servers responded.");
    }

    return reachable[0];
  }

  async function measureLatency(card, run, server, initialSample) {
    const samples = [];
    if (Number.isFinite(initialSample) && initialSample > 0) {
      samples.push(initialSample);
      applyState(card, {
        phase: "latency",
        running: true,
        latencyMs: roundToTenths(median(samples)),
        serverLabel: server.optionLabel || server.label,
        status: `Measuring latency (${samples.length}/${LATENCY_SAMPLE_COUNT})...`,
      });
    }

    while (samples.length < LATENCY_SAMPLE_COUNT) {
      const latencyMs = await measurePing(server.pingUrl, run);
      samples.push(latencyMs);
      applyState(card, {
        phase: "latency",
        running: true,
        latencyMs: roundToTenths(median(samples)),
        serverLabel: server.optionLabel || server.label,
        status: `Measuring latency (${samples.length}/${LATENCY_SAMPLE_COUNT})...`,
      });
    }

    return roundToTenths(median(samples));
  }

  function formatPhaseElapsed(elapsedMs, totalMs) {
    const elapsedSeconds = Math.min(totalMs, Math.max(0, elapsedMs)) / 1000;
    return `${elapsedSeconds.toFixed(1)}/${(totalMs / 1000).toFixed(1)}s`;
  }

  function speedFromBytes(totalBytes, elapsedMs) {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      return 0;
    }

    const safeElapsedMs = Math.max(1, elapsedMs);
    return (
      ((totalBytes * 8) / (safeElapsedMs / 1000)) *
      OVERHEAD_COMPENSATION_FACTOR /
      1_000_000
    );
  }

  async function runDownloadTest(card, run, server) {
    return new Promise((resolve, reject) => {
      const rawStart = nowMs();
      const graceDeadline = rawStart + DOWNLOAD_GRACE_MS;
      const measurementDeadline = graceDeadline + DOWNLOAD_DURATION_MS;
      const localControllers = new Set();
      let measurementStart = rawStart;
      let totalLoaded = 0;
      let graceDone = false;
      let finished = false;
      let lastMbps = 0;

      const stopStreams = () => {
        localControllers.forEach((controller) => {
          try {
            controller.abort();
          } catch {}
          unregisterFetchController(run, controller);
        });
        localControllers.clear();
      };

      const finish = (value, error) => {
        if (finished) {
          return;
        }

        finished = true;
        clearRegisteredInterval(run, intervalId);
        stopStreams();

        if (error) {
          reject(error);
          return;
        }

        resolve(roundToTenths(value));
      };

      const intervalId = registerInterval(run, () => {
        if (run.aborted) {
          finish(lastMbps, abortError());
          return;
        }

        const currentNow = nowMs();
        if (currentNow - rawStart < 200) {
          return;
        }

        if (!graceDone) {
          if (currentNow >= graceDeadline) {
            graceDone = true;
            if (totalLoaded > 0) {
              totalLoaded = 0;
              measurementStart = nowMs();
            }
          }
          return;
        }

        const elapsedMs = Math.max(1, currentNow - measurementStart);
        lastMbps = speedFromBytes(totalLoaded, elapsedMs);
        applyState(card, {
          phase: "download",
          running: true,
          currentMbps: roundToTenths(lastMbps),
          downloadMbps: roundToTenths(lastMbps),
          status: `Testing download speed (${formatPhaseElapsed(
            elapsedMs,
            DOWNLOAD_DURATION_MS
          )})...`,
        });

        if (currentNow >= measurementDeadline) {
          finish(lastMbps);
        }
      }, UPDATE_INTERVAL_MS);

      const launchStream = (streamIndex, delayMs) => {
        registerTimeout(
          run,
          async () => {
            while (!finished && !run.aborted) {
              if (nowMs() >= measurementDeadline) {
                finish(lastMbps);
                return;
              }

              const controller = new AbortController();
              localControllers.add(controller);
              run.fetchControllers.add(controller);

              try {
                const response = await fetch(
                  appendQuery(server.downloadUrl, {
                    cors: "true",
                    r: randomToken(),
                    ckSize: String(DOWNLOAD_CHUNK_MB),
                  }),
                  {
                    cache: "no-store",
                    signal: controller.signal,
                  }
                );

                if (!response.ok || !response.body) {
                  throw new Error("Download request failed.");
                }

                const reader = response.body.getReader();
                while (!finished && !run.aborted) {
                  const { done, value } = await reader.read();
                  if (done) {
                    break;
                  }

                  if (graceDone) {
                    totalLoaded += value.byteLength;
                  }

                  if (nowMs() >= measurementDeadline) {
                    finish(lastMbps);
                    return;
                  }
                }
              } catch (error) {
                if (!isAbortError(error) && !finished && !run.aborted) {
                  continue;
                }
              } finally {
                localControllers.delete(controller);
                unregisterFetchController(run, controller);
              }
            }
          },
          delayMs + streamIndex
        );
      };

      for (let index = 0; index < DOWNLOAD_STREAMS; index += 1) {
        launchStream(index, DOWNLOAD_STREAM_DELAY_MS * index);
      }

      registerTimeout(
        run,
        () => finish(lastMbps),
        DOWNLOAD_GRACE_MS + DOWNLOAD_DURATION_MS + 1600
      );
    });
  }

  async function runUploadTest(card, run, server) {
    return new Promise((resolve, reject) => {
      const rawStart = nowMs();
      const graceDeadline = rawStart + UPLOAD_GRACE_MS;
      const measurementDeadline = graceDeadline + UPLOAD_DURATION_MS;
      const localXhrs = new Set();
      const payload = getUploadPayload();
      let measurementStart = rawStart;
      let totalLoaded = 0;
      let graceDone = false;
      let finished = false;
      let lastMbps = 0;

      const stopStreams = () => {
        localXhrs.forEach((xhr) => {
          try {
            xhr.abort();
          } catch {}
          unregisterUploadXhr(run, xhr);
        });
        localXhrs.clear();
      };

      const finish = (value, error) => {
        if (finished) {
          return;
        }

        finished = true;
        clearRegisteredInterval(run, intervalId);
        stopStreams();

        if (error) {
          reject(error);
          return;
        }

        resolve(roundToTenths(value));
      };

      const intervalId = registerInterval(run, () => {
        if (run.aborted) {
          finish(lastMbps, abortError());
          return;
        }

        const currentNow = nowMs();
        if (currentNow - rawStart < 200) {
          return;
        }

        if (!graceDone) {
          if (currentNow >= graceDeadline) {
            graceDone = true;
            if (totalLoaded > 0) {
              totalLoaded = 0;
              measurementStart = nowMs();
            }
          }
          return;
        }

        const elapsedMs = Math.max(1, currentNow - measurementStart);
        lastMbps = speedFromBytes(totalLoaded, elapsedMs);
        applyState(card, {
          phase: "upload",
          running: true,
          currentMbps: roundToTenths(lastMbps),
          uploadMbps: roundToTenths(lastMbps),
          status: `Testing upload speed (${formatPhaseElapsed(
            elapsedMs,
            UPLOAD_DURATION_MS
          )})...`,
        });

        if (currentNow >= measurementDeadline) {
          finish(lastMbps);
        }
      }, UPDATE_INTERVAL_MS);

      const launchStream = (streamIndex, delayMs) => {
        registerTimeout(
          run,
          () => {
            const sendNext = () => {
              if (finished || run.aborted || nowMs() >= measurementDeadline) {
                return;
              }

              const xhr = new XMLHttpRequest();
              let prevLoaded = 0;
              localXhrs.add(xhr);
              run.uploadXhrs.add(xhr);

              const cleanup = () => {
                xhr.upload.onprogress = null;
                xhr.upload.onload = null;
                xhr.upload.onerror = null;
                xhr.onabort = null;
                localXhrs.delete(xhr);
                unregisterUploadXhr(run, xhr);
              };

              xhr.upload.onprogress = (event) => {
                const diff = event.loaded - prevLoaded;
                if (diff > 0 && graceDone) {
                  totalLoaded += diff;
                }
                prevLoaded = event.loaded;
              };

              xhr.upload.onload = () => {
                cleanup();
                sendNext();
              };

              xhr.upload.onerror = () => {
                cleanup();
                if (!finished && !run.aborted) {
                  sendNext();
                }
              };

              xhr.onabort = cleanup;

              try {
                xhr.open(
                  "POST",
                  appendQuery(server.uploadUrl, {
                    cors: "true",
                    r: randomToken(),
                  }),
                  true
                );
                xhr.setRequestHeader("Content-Encoding", "identity");
                xhr.send(payload);
              } catch (error) {
                cleanup();
                if (!finished && !run.aborted && !isAbortError(error)) {
                  sendNext();
                }
              }
            };

            sendNext();
          },
          delayMs + streamIndex
        );
      };

      for (let index = 0; index < UPLOAD_STREAMS; index += 1) {
        launchStream(index, UPLOAD_STREAM_DELAY_MS * index);
      }

      registerTimeout(
        run,
        () => finish(lastMbps),
        UPLOAD_GRACE_MS + UPLOAD_DURATION_MS + 1600
      );
    });
  }

  async function startTest(card) {
    if (card.dataset.speedtestRunning === "true") {
      return;
    }

    const previousRun = card._speedtestRun;
    if (previousRun) {
      previousRun.abort();
    }

    const run = createRunContext();
    card._speedtestRun = run;
    card.dataset.speedtestRunning = "true";

    const serverSelect = card.querySelector("[data-speedtest-server-select]");
    const selectedServerId = serverSelect?.value || AUTO_SERVER_ID;
    const selectedServerLabel =
      serverSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
    const servers = getServers(card);
    const actualServers = servers.filter((server) => !server.auto);

    applyState(card, {
      phase: "preflight",
      running: true,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel:
        selectedServerId === AUTO_SERVER_ID
          ? "Selecting server..."
          : selectedServerLabel,
      assessment: "",
      status:
        selectedServerId === AUTO_SERVER_ID
          ? "Selecting the lowest-latency server..."
          : `Preparing ${selectedServerLabel}...`,
    });

    try {
      if (!actualServers.length) {
        throw new Error("No speed test servers are configured.");
      }

      let chosenServer = null;
      let selectionLatencyMs = null;

      if (selectedServerId === AUTO_SERVER_ID) {
        const selection = await selectBestServer(card, run, actualServers);
        chosenServer = selection.server;
        selectionLatencyMs = selection.latencyMs;
      } else {
        chosenServer = actualServers.find((server) => server.id === selectedServerId);
        if (!chosenServer) {
          throw new Error("The selected speed test server is unavailable.");
        }
        selectionLatencyMs = await probeServer(chosenServer, run, 1);
      }

      const serverLabel = chosenServer.optionLabel || chosenServer.label;
      const latencyMs = await measureLatency(
        card,
        run,
        chosenServer,
        selectionLatencyMs
      );

      applyState(card, {
        phase: "download",
        running: true,
        currentMbps: 0,
        uploadMbps: 0,
        downloadMbps: 0,
        latencyMs,
        serverLabel,
        status: "Testing download speed...",
      });

      const downloadMbps = await runDownloadTest(card, run, chosenServer);

      applyState(card, {
        phase: "upload",
        running: true,
        currentMbps: 0,
        downloadMbps,
        latencyMs,
        serverLabel,
        status: "Testing upload speed...",
      });

      const uploadMbps = await runUploadTest(card, run, chosenServer);

      if (run.aborted) {
        return;
      }

      applyState(card, {
        phase: "complete",
        running: false,
        currentMbps: downloadMbps,
        downloadMbps,
        uploadMbps,
        latencyMs,
        serverLabel,
        assessment: buildAssessment(downloadMbps),
        status: `Speed test complete using ${serverLabel}.`,
      });
    } catch (error) {
      if (run.aborted || isAbortError(error)) {
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
          "The speed test could not finish with the selected server. Try again or pick another server.",
      });
    } finally {
      if (card._speedtestRun === run) {
        run.dispose();
        card.dataset.speedtestRunning = "false";
        const state = card._speedtestState || initialState();
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
