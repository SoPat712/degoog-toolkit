import bundledServerCatalog from "./servers-data.mjs";

let templateHtml = "";
let customServerProfiles = [];
let debugMode = false;

const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.2.2";
const PLUGIN_DESCRIPTION =
  "Minimal internet speed test with selectable servers, latency, download-first flow, and a circular gauge.";

const AUTO_SERVER_PROFILE = {
  id: "auto",
  label: "Automatic (lowest latency)",
  auto: true,
};

const DISABLED_SERVER_IDS = new Set([
  "24", // Helsinki, Finland (5) (Hetzner) - KABI.tk
  "27", // Nuremberg, Germany (2) (Hetzner) - LibreSpeed
  "28", // Nuremberg, Germany (1) (Hetzner) - Snopyta
  "30", // Nuremberg, Germany (3) (Hetzner) - LibreSpeed
  "31", // Nuremberg, Germany (4) (Hetzner) - LibreSpeed
  "43", // Nottingham, England (LayerIP) - fosshost.org
  "46", // Nuremberg, Germany (6) (Hetzner) - luki9100
  "69", // Vilnius, Lithuania (RackRay) - Time4VPS
  "70", // Johannesburg, South Africa (Host Africa) - HOSTAFRICA
  "75", // Bangalore, India - DigitalOcean
  "76", // Tehran, Iran (Fanava) - Bardia Moshiri
  "77", // Ghom, Iran (Amin IDC) - Bardia Moshiri
  "80", // Tehran, Iran (Faraso) - Bardia Moshiri
  "87", // Serbia (SOX) - Serbian Open eXchange (SOX)
  "90", // Las Vegas, USA - Sharktech
  "91", // Los Angeles, USA - Sharktech
  "92", // Denver, USA - Sharktech
  "93", // Chicago, USA - Sharktech
  "94", // Amsterdam, Netherlands - Sharktech
  "95", // Ohio, USA (Rust backend) - Sudo Dios
]);

const LEGACY_FALLBACK_SERVER_PROFILES = [
  {
    id: "new-york",
    label: "New York, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://nyc.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "atlanta",
    label: "Atlanta, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://atl.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "los-angeles",
    label: "Los Angeles, United States",
    sponsorName: "Clouvider",
    downloadUrl: "https://la.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "london",
    label: "London, England",
    sponsorName: "Clouvider",
    downloadUrl: "https://lon.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "frankfurt",
    label: "Frankfurt, Germany",
    sponsorName: "Clouvider",
    downloadUrl: "https://fra.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "amsterdam",
    label: "Amsterdam, Netherlands",
    sponsorName: "Clouvider",
    downloadUrl: "https://ams.speedtest.clouvider.net/backend/garbage.php",
    uploadUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
    pingUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
  },
  {
    id: "tokyo",
    label: "Tokyo, Japan",
    sponsorName: "A573",
    downloadUrl: "https://librespeed.a573.net/backend/garbage.php",
    uploadUrl: "https://librespeed.a573.net/backend/empty.php",
    pingUrl: "https://librespeed.a573.net/backend/empty.php",
  },
];

const debugModeSetting = {
  key: "debugMode",
  label: "Debug mode",
  type: "toggle",
  default: false,
  description:
    "Show Speedtest debug details for troubleshooting server behavior and measurement output.",
};

// Single-capability plugin: only the bang command is exported, so degoog
// surfaces exactly one Configure entry for Speedtest. Natural-language
// triggering is handled by degoog's native `naturalLanguagePhrases` feature
// and the built-in global "Natural language" toggle in Settings.
//
// NOTE: the settingsSchema array is spelled out inline on `export const
// command` below rather than aliased through a module-level constant.
// Per AGENTS.md this is the defensive wiring that keeps the Configure
// entry (Debug mode) from disappearing in degoog's plugin loader.

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

function deriveServerLabel(rawProfile) {
  const rawName = String(rawProfile?.label || rawProfile?.name || "").trim();
  const sponsorName = String(rawProfile?.sponsorName || "").trim();
  if (!rawName || !sponsorName) {
    return rawName;
  }

  const suffix = `(${sponsorName})`;
  if (!rawName.endsWith(suffix)) {
    return rawName;
  }

  return rawName.slice(0, -suffix.length).trim();
}

function normalizeAbsoluteUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveServerUrl(baseUrl, path) {
  const safeBaseUrl = normalizeAbsoluteUrl(baseUrl);
  if (!safeBaseUrl) {
    return "";
  }

  const safePath = String(path ?? "").trim();
  if (!safePath) {
    return "";
  }

  try {
    return new URL(safePath, ensureTrailingSlash(safeBaseUrl)).toString();
  } catch {
    return "";
  }
}

function normalizeServerProfile(rawProfile) {
  const label = deriveServerLabel(rawProfile);
  const sponsorName = String(rawProfile?.sponsorName || "").trim();
  const normalizedBaseUrl = normalizeAbsoluteUrl(rawProfile?.server);
  const downloadUrl =
    normalizeAbsoluteUrl(rawProfile?.downloadUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.dlURL);
  const uploadUrl =
    normalizeAbsoluteUrl(rawProfile?.uploadUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.ulURL);
  const pingUrl =
    normalizeAbsoluteUrl(rawProfile?.pingUrl) ||
    resolveServerUrl(normalizedBaseUrl, rawProfile?.pingURL);
  const id = slugify(rawProfile?.id || label);

  if (!label || !downloadUrl || !uploadUrl || !pingUrl || !id) {
    return null;
  }

  return {
    id,
    label,
    sponsorName,
    auto: false,
    downloadUrl,
    uploadUrl,
    pingUrl,
  };
}

function dedupeProfiles(profiles) {
  const seen = new Set();
  return profiles.filter((profile) => {
    const id = String(profile?.id || "")
      .trim()
      .toLowerCase();
    if (!id || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function isEnabledServerProfile(profile) {
  if (profile?.auto) {
    return true;
  }

  const id = String(profile?.id || "")
    .trim()
    .toLowerCase();
  return Boolean(id) && !DISABLED_SERVER_IDS.has(id);
}

const BUNDLED_SERVER_PROFILES = dedupeProfiles(
  (Array.isArray(bundledServerCatalog) ? bundledServerCatalog : [])
    .map(normalizeServerProfile)
    .filter(Boolean),
);

function parseCustomServerProfiles(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeProfiles(parsed.map(normalizeServerProfile).filter(Boolean));
  } catch {
    return [];
  }
}

function configureSettings(settings) {
  debugMode = settings?.debugMode === true || settings?.debugMode === "true";
  customServerProfiles = parseCustomServerProfiles(settings?.customServersJson);
}

function getActualServerProfiles() {
  const defaultProfiles = BUNDLED_SERVER_PROFILES.length
    ? BUNDLED_SERVER_PROFILES
    : LEGACY_FALLBACK_SERVER_PROFILES;

  return dedupeProfiles([
    ...defaultProfiles.map((profile) => ({ ...profile })),
    ...customServerProfiles.map((profile) => ({ ...profile })),
  ]).filter(isEnabledServerProfile);
}

function getAvailableServerProfiles() {
  return [AUTO_SERVER_PROFILE, ...getActualServerProfiles()];
}

function buildOptionLabel(profile) {
  if (profile.auto) {
    return profile.label;
  }

  return profile.sponsorName
    ? `${profile.label} - ${profile.sponsorName}`
    : profile.label;
}

function encodeBase64Text(value) {
  const text = String(value ?? "");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64");
  }

  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(text)));
  }

  return encodeURIComponent(text);
}

function encodeServerData(value) {
  return encodeBase64Text(JSON.stringify(value));
}

function buildServerDataPayload() {
  return getAvailableServerProfiles().map((profile) => ({
    ...profile,
    optionLabel: buildOptionLabel(profile),
  }));
}

function replaceTemplateToken(template, tokenName, value) {
  const safeTemplate = String(template ?? "");
  const replacement = String(value ?? "");
  const escapedTokenName = String(tokenName)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\-/g, "-");
  const tokenPattern = new RegExp(
    `__\\s*${escapedTokenName.replace(/-/g, "[-_ ]?")}\\s*__`,
    "gi",
  );
  return safeTemplate.replace(tokenPattern, replacement);
}

function forceInjectServerPayload(template, serverPayload) {
  const safeJson = escapeHtml(JSON.stringify(serverPayload));
  const safeB64 = escapeHtml(encodeServerData(serverPayload));
  let rendered = String(template ?? "");

  if (/data-speedtest-servers\s*=/.test(rendered)) {
    rendered = rendered.replace(
      /data-speedtest-servers\s*=\s*"[^"]*"/i,
      `data-speedtest-servers="${safeB64}"`,
    );
  } else {
    rendered = rendered.replace(
      /<div\s+class="speedtest-card"/i,
      `<div class="speedtest-card" data-speedtest-servers="${safeB64}"`,
    );
  }

  if (
    /<template\s+data-speedtest-servers-json>[\s\S]*?<\/template>/i.test(
      rendered,
    )
  ) {
    rendered = rendered.replace(
      /<template\s+data-speedtest-servers-json>[\s\S]*?<\/template>/i,
      `<template data-speedtest-servers-json>${safeJson}</template>`,
    );
  } else {
    rendered = rendered.replace(
      /<\/div>\s*$/,
      `  <template data-speedtest-servers-json>${safeJson}</template>\n</div>`,
    );
  }

  return rendered;
}

async function loadTemplate(ctx) {
  templateHtml = ctx?.template || "";
  if (!templateHtml && ctx?.readFile) {
    templateHtml = await ctx.readFile("template.html");
  }
}

function renderCardHtml() {
  if (!templateHtml) {
    return `<div class="speedtest-card"><p>${escapeHtml(PLUGIN_NAME)}</p></div>`;
  }

  const serverPayload = buildServerDataPayload();
  let rendered = templateHtml;
  rendered = replaceTemplateToken(
    rendered,
    "SERVER_DATA_JSON",
    escapeHtml(JSON.stringify(serverPayload)),
  );
  rendered = replaceTemplateToken(
    rendered,
    "SERVER_DATA_B64",
    escapeHtml(encodeServerData(serverPayload)),
  );
  rendered = replaceTemplateToken(
    rendered,
    "PLUGIN_VERSION",
    escapeHtml(PLUGIN_VERSION),
  );
  rendered = replaceTemplateToken(
    rendered,
    "DEBUG_HIDDEN",
    debugMode ? "" : "hidden",
  );
  return forceInjectServerPayload(rendered, serverPayload);
}

export const routes = [];

// Single-capability plugin: this file exports only a slot. The slot's own
// `trigger(query)` recognises the `!speedtest` / `!speed` / etc. bang
// prefixes, so the bang behaviour is an addition to the slot rather than
// a separate command capability. This keeps Settings → Plugins to a
// single row for Speedtest (see AGENTS.md › "Collapsing to one capability
// per folder").
//
// Side-benefit of being slot-only: degoog's core ships a built-in
// `speedtest` bang command whose trigger would collide with a plugin
// command using the same trigger, causing the loader to silently skip
// the plugin (and its settings entry) even after the Configure screen
// shows a "disabled" toggle. A slot has no string trigger to collide
// with, so it registers regardless.
//
// IMPORTANT — schema export wiring (see AGENTS.md):
// A previous regression caused degoog to lose this plugin's custom
// `settingsSchema` (Debug mode) when the export wiring wasn't explicit
// enough (spread syntax, anonymous default export, etc.). The defensive
// pattern below spells out every field on a named `export const slot = {
// ... }` object and also re-exports it as `default`, so every loader
// path in degoog resolves to the same object with `settingsSchema`
// attached. Do NOT refactor this back into a spread or anonymous default
// — the settings page will disappear again.

async function slotInit(ctx) {
  await loadTemplate(ctx);
}

async function slotExecute() {
  return {
    title: PLUGIN_NAME,
    html: renderCardHtml(),
  };
}

// Bang prefixes the slot should fire on. Mirrors the old command trigger +
// aliases. \b-anchored so "!speedy" etc. don't match.
const BANG_PREFIX_RX =
  /^!(speedtest|speed|speed-test|networkspeed|internetspeed)\b/i;

// Leading / embedded natural-language phrases the slot should fire on.
// Unlike a command's naturalLanguagePhrases (which degoog matches
// client-side, prefix-only), the slot does its own matching here so
// trailing/anywhere-in-query variants like "run a speed test please" also
// work.
const NATURAL_LANGUAGE_PHRASES = [
  "speed test",
  "speedtest",
  "internet speed",
  "network speed",
  "wifi speed",
  "connection speed",
  "bandwidth test",
  "check my speed",
  "test my internet",
  "how fast is my internet",
  "how fast is my connection",
];

function slotTrigger(query) {
  const q = String(query || "").trim();
  if (!q) return false;

  // Bangs always fire — this is the "bang is an addition to the slot"
  // behaviour. Works whether or not the built-in core speedtest command
  // is enabled, because the slot isn't bound to a string trigger.
  if (BANG_PREFIX_RX.test(q)) return true;

  // Everything below is natural-language matching. Honour the global
  // Natural language toggle: if the user has it off, only bangs fire.
  // (We read from module-level `debugMode` siblings? No — natural language
  // toggle is injected by degoog when a capability declares phrases; for
  // a slot there's no auto-injection, so we treat all phrases as
  // opt-in-by-install.)
  const lower = q.toLowerCase();
  for (const phrase of NATURAL_LANGUAGE_PHRASES) {
    const p = phrase.toLowerCase();
    if (!p) continue;
    if (
      lower === p ||
      lower.startsWith(p + " ") ||
      lower.endsWith(" " + p) ||
      lower.includes(" " + p + " ")
    ) {
      return true;
    }
  }
  return false;
}

export const slot = {
  id: "speedtest",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  position: "above-results",
  settingsSchema: [debugModeSetting],
  init: slotInit,
  configure: configureSettings,
  trigger: slotTrigger,
  execute: slotExecute,
};

export const slotPlugin = slot;

export default slot;
