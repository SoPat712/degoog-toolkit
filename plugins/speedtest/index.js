import bundledServerCatalog from "./servers-data.mjs";

let templateHtml = "";
let customServerProfiles = [];
let debugMode = false;

const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.5.1";
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
  // Note: degoog auto-injects a `naturalLanguage` toggle on the command
  // below (because it declares a non-empty `naturalLanguagePhrases`
  // array). That toggle is evaluated CLIENT-SIDE by degoog — if it's off
  // the plugin's `execute` simply never runs on bare phrases, so we do
  // not need to mirror the value into any server-side state here. Any
  // unrecognised keys in `settings` (including `naturalLanguage`) are
  // safely ignored.
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

// Command-only plugin. An earlier version of this file also exported a
// `slot` so trailing-keyword queries like "my internet speed" would
// render the card, but degoog's Settings → Plugins UI renders one row
// per exported capability (even for a slot with no `settingsSchema` —
// it falls back to a default Position row). That produced a duplicate
// "Speedtest" entry on the settings page with no way to collapse. To
// guarantee a single Configure row we removed the slot export entirely.
//
// Trade-offs to be aware of if editing this file:
//   • Trailing / mid-query natural phrases ("my internet speed",
//     "how fast is my connection today") no longer fire — the command's
//     `naturalLanguagePhrases` are matched CLIENT-SIDE, prefix-only,
//     word-boundary (see AGENTS.md › "Natural language matching").
//     Leading-keyword phrases like "speed test", "internet speed test",
//     "check my internet speed" still work.
//   • `!speedtest` is NOT claimed here because it collides with degoog
//     core's built-in `speedtest` command; the loader keeps the first
//     match and silently drops later duplicates (aliases included). We
//     use `trigger: "speed"` instead, which is collision-free and shows
//     up in the `!`-autobang list. Users who have disabled the core
//     built-in can still type `!speedtest`, but only the built-in path
//     serves it — this plugin responds to `!speed` and its aliases.
//
// `naturalLanguagePhrases` being non-empty also causes degoog to
// auto-inject the per-command "Natural language" toggle into this
// plugin's Configure screen. Do NOT add a manual toggle for that — it
// would produce a duplicate field. The toggle is evaluated client-side,
// so `execute()` simply never runs when it's off.
//
// IMPORTANT — schema export wiring (see AGENTS.md): a previous
// regression caused degoog to lose the custom `settingsSchema` when
// the export wiring used spread syntax or an anonymous default. The
// defensive pattern here spells out every field on a named
// `export const command = { ... }` and re-exports it as `default`, so
// every loader path resolves to the same object with `settingsSchema`
// attached. Do NOT refactor this back into a spread or anonymous
// default — the Configure screen will regress to the Position
// fallback again.
export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  trigger: "speedtest",
  aliases: ["speed", "speed-test", "networkspeed", "internetspeed"],
  // NOTE: `trigger: "speedtest"` collides with degoog core's built-in
  // `speedtest` command. The command loader keeps the FIRST registered
  // match and silently drops the later one (plus its aliases). For this
  // plugin to handle any of its bangs, the operator MUST disable the
  // core built-in "Speed Test" entry under Settings → Plugins → Built-in
  // commands. If that's not acceptable, swap `trigger` back to "speed"
  // and demote "speedtest" out of the claim (collision-free fallback).
  naturalLanguagePhrases: [
    "speedtest",
    "speed test",
    "internet speed test",
    "network speed test",
    "wifi speed test",
    "connection speed test",
    "bandwidth test",
    "run a speedtest",
    "run speedtest",
    "run a speed test",
    "run speed test",
    "test my internet",
    "test my connection",
    "test internet speed",
    "check my internet speed",
    "check my connection speed",
    "check internet speed",
    "how fast is internet",
    "how fast is the internet",
    "how fast is my internet",
    "how fast is my connection",
    "how fast is my wifi",
    "what is my internet speed",
    "whats my internet speed",
    "measure my internet",
    "measure internet speed",
  ],
  settingsSchema: [debugModeSetting],

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure(settings) {
    configureSettings(settings);
  },

  async execute() {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(),
    };
  },
};

// Default export must be a single concrete capability so degoog
// registers it correctly.
export default command;
