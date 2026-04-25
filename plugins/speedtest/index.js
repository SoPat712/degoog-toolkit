let templateHtml = "";
let customServerProfiles = [];

const PLUGIN_NAME = "Speedtest";
const PLUGIN_DESCRIPTION =
  "Google-style internet speed test with download speed, upload speed, latency, and server details.";
const TEST_BASE_URL = "https://speed.cloudflare.com";
const DOWNLOAD_API_URL = `${TEST_BASE_URL}/__down`;
const UPLOAD_API_URL = `${TEST_BASE_URL}/__up`;
const TRACE_API_URL = `${TEST_BASE_URL}/cdn-cgi/trace`;
const LATENCY_SAMPLE_COUNT = 7;
const TARGET_SAMPLE_DURATION_MS = 900;
const TARGET_DIRECTION_DURATION_MS = 3_000;
const MAX_DIRECTION_SAMPLES = 8;
const MIN_VALID_SAMPLE_DURATION_MS = 350;
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
const DEFAULT_SERVER_PROFILE = {
  id: "auto",
  label: "Automatic (nearest Cloudflare edge)",
  downloadUrl: DOWNLOAD_API_URL,
  uploadUrl: UPLOAD_API_URL,
  traceUrl: TRACE_API_URL,
  fallbackLabel: "Cloudflare edge",
};
const sharedSettingsSchema = [
  {
    key: "customServersJson",
    label: "Custom server profiles (JSON)",
    type: "textarea",
    placeholder:
      '[{"id":"new-york","label":"New York worker","downloadUrl":"https://example.com/__down","uploadUrl":"https://example.com/__up","traceUrl":"https://example.com/cdn-cgi/trace"}]',
    description:
      "Optional admin-defined server list for the server picker. Each item must include label, downloadUrl, and uploadUrl. traceUrl is optional.",
  },
];

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

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAbsoluteUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
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

function parseCustomServerProfiles(raw) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const label = String(item?.label || "").trim();
        const downloadUrl = normalizeAbsoluteUrl(item?.downloadUrl);
        const uploadUrl = normalizeAbsoluteUrl(item?.uploadUrl);
        const traceUrl = normalizeAbsoluteUrl(item?.traceUrl);
        const id = slugify(item?.id || label);

        if (!label || !downloadUrl || !uploadUrl || !id) {
          return null;
        }

        return {
          id,
          label,
          downloadUrl,
          uploadUrl,
          traceUrl,
          fallbackLabel: label,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function configureSharedSettings(settings) {
  customServerProfiles = parseCustomServerProfiles(settings?.customServersJson);
}

function getAvailableServerProfiles() {
  return [DEFAULT_SERVER_PROFILE, ...customServerProfiles];
}

function getServerProfileById(id) {
  const selectedId = String(id || "").trim().toLowerCase();
  return (
    getAvailableServerProfiles().find((profile) => profile.id === selectedId) ||
    DEFAULT_SERVER_PROFILE
  );
}

function buildServerOptionsHtml(selectedId = DEFAULT_SERVER_PROFILE.id) {
  return getAvailableServerProfiles()
    .map((profile) => {
      const selected = profile.id === selectedId ? ' selected="selected"' : "";
      return `<option value="${escapeHtml(profile.id)}"${selected}>${escapeHtml(
        profile.label
      )}</option>`;
    })
    .join("");
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

function getRequestUrls(profile) {
  return {
    downloadUrl: profile.downloadUrl,
    uploadUrl: profile.uploadUrl,
    traceUrl: profile.traceUrl,
    fallbackLabel: profile.fallbackLabel || profile.label || "Speed test server",
  };
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

async function resolveServerInfo(profile) {
  const requestUrls = getRequestUrls(profile);
  try {
    if (!requestUrls.traceUrl) {
      return {
        label: requestUrls.fallbackLabel,
      };
    }

    const response = await fetchWithTimeout(requestUrls.traceUrl, {
      headers: {
        Accept: "text/plain",
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return {
        label: requestUrls.fallbackLabel,
      };
    }

    const trace = parseTraceResponse(await response.text());
    return {
      ...trace,
      label:
        profile.id === DEFAULT_SERVER_PROFILE.id
          ? formatServerLabel(trace)
          : trace.colo || trace.loc
            ? `${requestUrls.fallbackLabel} (${[trace.colo, trace.loc]
                .filter(Boolean)
                .join(", ")})`
            : requestUrls.fallbackLabel,
    };
  } catch {
    return {
      label: requestUrls.fallbackLabel,
    };
  }
}

async function measureLatency(requestUrls, onUpdate = () => {}) {
  const samples = [];

  for (let index = 0; index < LATENCY_SAMPLE_COUNT; index += 1) {
    const startedAt = nowMs();
    const response = await fetchWithTimeout(
      `${requestUrls.downloadUrl}?bytes=0&seed=${Date.now()}-${index}`,
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

async function measureUploadSample(bytes, requestUrls) {
  const payload = payloadForBytes(bytes);
  const startedAt = nowMs();
  const response = await fetchWithTimeout(requestUrls.uploadUrl, {
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

async function measureDownloadSample(bytes, requestUrls) {
  const startedAt = nowMs();
  const response = await fetchWithTimeout(
    `${requestUrls.downloadUrl}?bytes=${bytes}&seed=${Date.now()}-${bytes}`,
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

async function measureDirection(direction, sizes, requestUrls, onUpdate = () => {}) {
  const samples = [];
  let sizeIndex = 0;
  let totalDurationMs = 0;

  while (
    samples.length < MAX_DIRECTION_SAMPLES &&
    (totalDurationMs < TARGET_DIRECTION_DURATION_MS || !samples.length)
  ) {
    const bytes = sizes[Math.min(sizeIndex, sizes.length - 1)];
    const sample =
      direction === "upload"
        ? await measureUploadSample(bytes, requestUrls)
        : await measureDownloadSample(bytes, requestUrls);
    samples.push(sample);
    totalDurationMs += sample.durationMs;

    onUpdate({
      phase: direction,
      sampleIndex: samples.length,
      totalHint: MAX_DIRECTION_SAMPLES,
      totalDurationMs: roundToTenths(totalDurationMs),
      targetDurationMs: TARGET_DIRECTION_DURATION_MS,
      currentMbps: roundToTenths(sample.mbps),
      provisionalMbps: summarizeDirection(samples),
    });

    if (
      totalDurationMs >= TARGET_DIRECTION_DURATION_MS &&
      sample.durationMs >= MIN_VALID_SAMPLE_DURATION_MS
    ) {
      break;
    }

    if (
      sizeIndex < sizes.length - 1 &&
      sample.durationMs < TARGET_SAMPLE_DURATION_MS
    ) {
      sizeIndex += 1;
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

async function handleRunRoute(request) {
  const url = new URL(request.url);
  const profile = getServerProfileById(url.searchParams.get("server"));
  const requestUrls = getRequestUrls(profile);

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

    const serverInfo = await resolveServerInfo(profile);
    emitState(send, state, {
      serverLabel: serverInfo.label,
      status: `Using ${serverInfo.label}. Measuring latency...`,
    });

    const latency = await measureLatency(
      requestUrls,
      ({ sampleIndex, sampleCount, latencyMs }) => {
        emitState(send, state, {
          phase: "latency",
          latencyMs,
          currentMbps: 0,
          status: `Measuring latency (${sampleIndex}/${sampleCount})...`,
        });
      }
    );

    emitState(send, state, {
      phase: "download",
      latencyMs: latency.latencyMs,
      currentMbps: 0,
      status: "Testing download speed...",
    });

    const download = await measureDirection(
      "download",
      DOWNLOAD_SIZES,
      requestUrls,
      ({
        sampleIndex,
        totalHint,
        totalDurationMs,
        targetDurationMs,
        currentMbps,
        provisionalMbps,
      }) => {
        emitState(send, state, {
          phase: "download",
          currentMbps,
          downloadMbps: provisionalMbps,
          status: `Testing download speed (${sampleIndex}/${totalHint}, ${Math.round(
            totalDurationMs / 1000
          )}/${Math.round(targetDurationMs / 1000)}s)...`,
        });
      }
    );

    emitState(send, state, {
      phase: "upload",
      currentMbps: 0,
      downloadMbps: download.mbps,
      status: "Testing upload speed...",
    });

    const upload = await measureDirection(
      "upload",
      UPLOAD_SIZES,
      requestUrls,
      ({
        sampleIndex,
        totalHint,
        totalDurationMs,
        targetDurationMs,
        currentMbps,
        provisionalMbps,
      }) => {
        emitState(send, state, {
          phase: "upload",
          currentMbps,
          uploadMbps: provisionalMbps,
          status: `Testing upload speed (${sampleIndex}/${totalHint}, ${Math.round(
            totalDurationMs / 1000
          )}/${Math.round(targetDurationMs / 1000)}s)...`,
        });
      }
    );

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
    return templateHtml.replace(
      "{{server_options_html}}",
      buildServerOptionsHtml()
    );
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
  settingsSchema: sharedSettingsSchema,

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure: configureSharedSettings,

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
  settingsSchema: sharedSettingsSchema,

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure: configureSharedSettings,

  async execute() {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

export default command;
