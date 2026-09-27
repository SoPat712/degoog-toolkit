let templateHtml = "";
let debugMode = false;


const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.5.30";
const PLUGIN_DESCRIPTION =
  "Minimal internet speed test with selectable servers, latency, download-first flow, and a circular gauge.";

const debugModeSetting = {
  key: "debugMode",
  label: "Debug mode",
  type: "toggle",
  default: false,
  description:
    "Show Speedtest debug details for troubleshooting server behavior and measurement output.",
};

const SEARCH_PHRASES = [
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
  "run an internet speed test",
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
  "how fast is my wi-fi",
  "what is my internet speed",
  "what's my internet speed",
  "whats my internet speed",
  "what is my connection speed",
  "what's my connection speed",
  "whats my connection speed",
  "my internet speed",
  "my connection speed",
  "measure my internet",
  "measure internet speed",
  "speed-test",
  "networkspeed",
  "internetspeed",
];

const NORMALIZED_SEARCH_PHRASES = new Set(
  SEARCH_PHRASES.map((phrase) => normalizeSearchPhrase(phrase)),
);

function normalizeSearchPhrase(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function configureSettings(settings) {
  debugMode = settings?.debugMode === true || settings?.debugMode === "true";
}

async function loadTemplate(ctx) {
  templateHtml = ctx?.template || "";
  if (!templateHtml && ctx?.readFile) {
    templateHtml = await ctx.readFile("template.html");
  }
}

function renderCardHtml(_context) {
  if (!templateHtml) {
    return `<div class="speedtest-card"><p>${escapeHtml(PLUGIN_NAME)}</p></div>`;
  }
  return templateHtml
    .replaceAll("__PLUGIN_VERSION__", escapeHtml(PLUGIN_VERSION))
    .replaceAll("__DEBUG_HIDDEN__", debugMode ? "" : "hidden");
}

// The command owns the settings schema. The companion slot intentionally has
// no schema, so degoog still renders one Configure row for Speedtest.
//
// Trigger choice:
// degoog core owns the built-in `speedtest` trigger and drops later duplicate
// primary triggers — the whole plugin vanishes from Settings if we collide.
// Use `speed` as the collision-free primary trigger; keep `speedtest` as an alias.
//
// Ordinary searches use the companion slot below. Keeping those phrases out of
// the command matcher is intentional: command mode replaces normal web results,
// while the slot lets searches such as "speedtest" show both the tool and the
// regular result stream.
//
// Server list:
//   The full server catalog is hardcoded in script.js (client-side).
//   index.js does not inject server data into the template; the client
//   uses its built-in list directly.
//
// Keep this as a single concrete default command export. degoog 0.19 tightened
// extension recognition, and exporting both a named command and the same object
// as default can keep this plugin from registering on updated deployments.
const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: true,
  trigger: "speed",
  aliases: ["speedtest", "speed-test", "networkspeed", "internetspeed"],
  settingsSchema: [debugModeSetting],

  async init(ctx) {
    await loadTemplate(ctx);
  },

  configure(settings) {
    configureSettings(settings);
  },

  async execute(_query, _context) {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(_context),
    };
  },
};

export const slot = {
  id: "speedtest",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: true,
  position: "at-a-glance",

  trigger(query) {
    return NORMALIZED_SEARCH_PHRASES.has(normalizeSearchPhrase(query));
  },

  async init(ctx) {
    await loadTemplate(ctx);
  },

  async execute(_query, context) {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(context),
    };
  },
};

export default command;
