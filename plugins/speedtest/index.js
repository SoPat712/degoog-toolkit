let templateHtml = "";

const PLUGIN_NAME = "Speedtest";
const PLUGIN_DESCRIPTION =
  "Google-style internet speed test with upload-first sequencing, download speed, latency, and server details.";
const TEST_BASE_URL = "https://speed.cloudflare.com";
const DOWNLOAD_API_URL = `${TEST_BASE_URL}/__down`;
const UPLOAD_API_URL = `${TEST_BASE_URL}/__up`;
const TRACE_API_URL = `${TEST_BASE_URL}/cdn-cgi/trace`;
const LATENCY_SAMPLE_COUNT = 7;
const TARGET_REQUEST_DURATION_MS = 650;
const MIN_VALID_SAMPLE_DURATION_MS = 200;
const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_SIZES = [
  250_000,
  1_000_000,
  5_000_000,
  10_000_000,
  25_000_000,
  50_000_000,
];
const DOWNLOAD_SIZES = [
  500_000,
  2_000_000,
  10_000_000,
  25_000_000,
  50_000_000,
  100_000_000,
];
const NATURAL_LANGUAGE_PHRASES = [
  "speed test",
  "internet speed",
  "network speed",
  "wifi speed",
  "connection speed",
  "bandwidth test",
];
const uploadBufferCache = new Map();

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function percentile(values, ratio) {
  const safeValues = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!safeValues.length) {
    return 0;
  }

  const clamped = Math.min(1, Math.max(0, ratio));
  const index = Math.min(
    safeValues.length - 1,
    Math.max(0, Math.round((safeValues.length - 1) * clamped))
  );
  return safeValues[index];
}

function roundToTenths(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return 0;
  }

  return Math.round(safe * 10) / 10;
}

function parseTraceResponse(text) {
  return String(text)
    .trim()
    .split("\n")
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
}

function formatServerLabel(serverInfo) {
  const colo = String(serverInfo.colo || "").trim().toUpperCase();
  const country = String(serverInfo.loc || "").trim().toUpperCase();

  if (colo && country) {
    return `Cloudflare edge (${colo}, ${country})`;
  }

  if (colo) {
    return `Cloudflare edge (${colo})`;
  }

  return "Cloudflare edge";
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

async function loadTemplate(ctx) {
  templateHtml = ctx?.template || "";
  if (!templateHtml && ctx?.readFile) {
    templateHtml = await ctx.readFile("template.html");
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseServerTimingDuration(headers) {
  const value = headers?.get?.("server-timing") || "";
  const match = value.match(/dur=([\d.]+)/i);
  if (!match) {
    return 0;
  }

  const duration = Number(match[1]);
  return Number.isFinite(duration) ? duration : 0;
}

function payloadForBytes(bytes) {
  if (!uploadBufferCache.has(bytes)) {
    uploadBufferCache.set(bytes, new Uint8Array(bytes));
  }

  return uploadBufferCache.get(bytes);
}

async function consumeResponseBytes(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength;
  }

  const reader = response.body.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
  }

  return total;
}

function mbpsFromTransfer(bytes, durationMs) {
  const safeDuration = Math.max(1, Number(durationMs) || 0);
  return (bytes * 8) / (safeDuration / 1000) / 1_000_000;
}

async function resolveServerInfo() {
  try {
    const response = await fetchWithTimeout(TRACE_API_URL, {
      headers: {
        Accept: "text/plain",
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return {
        label: "Cloudflare edge",
      };
    }

    const trace = parseTraceResponse(await response.text());
    return {
      ...trace,
      label: formatServerLabel(trace),
    };
  } catch {
    return {
      label: "Cloudflare edge",
    };
  }
}

async function measureLatency(onUpdate = () => {}) {
  const samples = [];

  for (let index = 0; index < LATENCY_SAMPLE_COUNT; index += 1) {
    const startedAt = nowMs();
    const response = await fetchWithTimeout(
      `${DOWNLOAD_API_URL}?bytes=0&seed=${Date.now()}-${index}`,
      {
        headers: {
          Accept: "*/*",
          "Cache-Control": "no-store",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Latency probe failed.");
    }

    await response.arrayBuffer();
    const durationMs = Math.max(
      1,
      nowMs() - startedAt - parseServerTimingDuration(response.headers)
    );
    samples.push(durationMs);
    onUpdate({
      sampleIndex: index + 1,
      sampleCount: LATENCY_SAMPLE_COUNT,
      latencyMs: roundToTenths(percentile(samples, 0.5)),
    });
  }

  return {
    latencyMs: roundToTenths(percentile(samples, 0.5)),
    samples,
  };
}

async function measureUploadSample(bytes) {
  const payload = payloadForBytes(bytes);
  const startedAt = nowMs();
  const response = await fetchWithTimeout(UPLOAD_API_URL, {
    method: "post",
    headers: {
      Accept: "*/*",
      "Cache-Control": "no-store",
      "Content-Type": "application/octet-stream",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error("Upload probe failed.");
  }

  await response.text();
  const durationMs = Math.max(
    1,
    nowMs() - startedAt - parseServerTimingDuration(response.headers)
  );
  return {
    bytes,
    durationMs,
    mbps: mbpsFromTransfer(bytes, durationMs),
  };
}

async function measureDownloadSample(bytes) {
  const startedAt = nowMs();
  const response = await fetchWithTimeout(
    `${DOWNLOAD_API_URL}?bytes=${bytes}&seed=${Date.now()}-${bytes}`,
    {
      headers: {
        Accept: "*/*",
        "Cache-Control": "no-store",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Download probe failed.");
  }

  const transferredBytes = await consumeResponseBytes(response);
  const durationMs = Math.max(
    1,
    nowMs() - startedAt - parseServerTimingDuration(response.headers)
  );
  return {
    bytes: transferredBytes || bytes,
    durationMs,
    mbps: mbpsFromTransfer(transferredBytes || bytes, durationMs),
  };
}

function summarizeDirection(samples) {
  if (!samples.length) {
    return 0;
  }

  const preferred = samples.filter(
    (sample) => sample.durationMs >= MIN_VALID_SAMPLE_DURATION_MS
  );
  const source = preferred.length ? preferred : samples;
  return roundToTenths(percentile(source.map((sample) => sample.mbps), 0.75));
}

async function measureDirection(direction, sizes, onUpdate = () => {}) {
  const samples = [];
  const totalHint = sizes.length + 1;

  for (let index = 0; index < sizes.length; index += 1) {
    const bytes = sizes[index];
    const sample =
      direction === "upload"
        ? await measureUploadSample(bytes)
        : await measureDownloadSample(bytes);
    samples.push(sample);

    onUpdate({
      phase: direction,
      sampleIndex: samples.length,
      totalHint,
      currentMbps: roundToTenths(sample.mbps),
      provisionalMbps: summarizeDirection(samples),
    });

    if (sample.durationMs >= TARGET_REQUEST_DURATION_MS) {
      const confirmSample =
        direction === "upload"
          ? await measureUploadSample(bytes)
          : await measureDownloadSample(bytes);
      samples.push(confirmSample);

      onUpdate({
        phase: direction,
        sampleIndex: samples.length,
        totalHint,
        currentMbps: roundToTenths(confirmSample.mbps),
        provisionalMbps: summarizeDirection(samples),
      });
      break;
    }
  }

  return {
    mbps: summarizeDirection(samples),
    samples,
  };
}

function streamResponse(start) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (eventName, payload) => {
          controller.enqueue(
            encoder.encode(
              `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
            )
          );
        };

        try {
          await start(send);
        } catch (error) {
          send("error", {
            message:
              error instanceof Error ? error.message : "Speed test failed.",
          });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    }
  );
}

function emitState(send, state, partial) {
  Object.assign(state, partial);
  send("update", state);
}

async function handleRunRoute() {
  return streamResponse(async (send) => {
    const state = {
      phase: "preflight",
      running: true,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel: "",
      assessment: "",
      status: "Finding the nearest speed test server...",
    };

    send("update", state);

    const serverInfo = await resolveServerInfo();
    emitState(send, state, {
      serverLabel: serverInfo.label,
      status: `Using ${serverInfo.label}. Measuring latency...`,
    });

    const latency = await measureLatency(({ sampleIndex, sampleCount, latencyMs }) => {
      emitState(send, state, {
        phase: "latency",
        latencyMs,
        currentMbps: 0,
        status: `Measuring latency (${sampleIndex}/${sampleCount})...`,
      });
    });

    emitState(send, state, {
      phase: "upload",
      latencyMs: latency.latencyMs,
      currentMbps: 0,
      status: "Testing upload speed...",
    });

    const upload = await measureDirection("upload", UPLOAD_SIZES, ({
      sampleIndex,
      totalHint,
      currentMbps,
      provisionalMbps,
    }) => {
      emitState(send, state, {
        phase: "upload",
        currentMbps,
        uploadMbps: provisionalMbps,
        status: `Testing upload speed (${sampleIndex}/${totalHint})...`,
      });
    });

    emitState(send, state, {
      phase: "download",
      currentMbps: 0,
      uploadMbps: upload.mbps,
      status: "Testing download speed...",
    });

    const download = await measureDirection("download", DOWNLOAD_SIZES, ({
      sampleIndex,
      totalHint,
      currentMbps,
      provisionalMbps,
    }) => {
      emitState(send, state, {
        phase: "download",
        currentMbps,
        downloadMbps: provisionalMbps,
        status: `Testing download speed (${sampleIndex}/${totalHint})...`,
      });
    });

    emitState(send, state, {
      phase: "complete",
      running: false,
      currentMbps: download.mbps,
      uploadMbps: upload.mbps,
      downloadMbps: download.mbps,
      latencyMs: latency.latencyMs,
      assessment: buildAssessment(download.mbps),
      status: `Speed test complete using ${serverInfo.label}.`,
    });
  });
}

function shouldTrigger(query) {
  const value = String(query ?? "").trim();
  if (!value) {
    return false;
  }

  return /\b(speed\s*test|speedtest|internet speed|network speed|wifi speed|connection speed|bandwidth test)\b/i.test(
    value
  );
}

function renderCardHtml() {
  if (templateHtml) {
    return templateHtml;
  }

  return `
    <div class="speedtest-card">
      <p>${escapeHtml(PLUGIN_NAME)}</p>
    </div>
  `;
}

export const routes = [
  {
    path: "run",
    method: "get",
    handler: handleRunRoute,
  },
];

export const slot = {
  id: "speedtest",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],

  async init(ctx) {
    await loadTemplate(ctx);
  },

  trigger(query) {
    return shouldTrigger(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") {
      return { html: "" };
    }

    if (!shouldTrigger(query)) {
      return { html: "" };
    }

    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

export const slotPlugin = slot;

export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  trigger: "speedtest",
  aliases: ["speed", "bandwidth"],
  naturalLanguagePhrases: NATURAL_LANGUAGE_PHRASES,

  async init(ctx) {
    await loadTemplate(ctx);
  },

  async execute() {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

export default command;
