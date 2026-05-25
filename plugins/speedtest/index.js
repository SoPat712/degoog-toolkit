let templateHtml = "";
let debugMode = false;

const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.5.15";
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

const naturalLanguageSetting = {
  key: "naturalLanguage",
  label: "Natural language",
  type: "toggle",
  default: true,
  description: "Allow this command to run when your query matches one of its phrases.",
};

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

function renderCardHtml() {
  if (!templateHtml) {
    return `<div class="speedtest-card"><p>${escapeHtml(PLUGIN_NAME)}</p></div>`;
  }
  return templateHtml
    .replaceAll("__PLUGIN_VERSION__", escapeHtml(PLUGIN_VERSION))
    .replaceAll("__DEBUG_HIDDEN__", debugMode ? "" : "hidden");
}

// Command-only plugin. An earlier version also exported a `slot`, but
// degoog renders one Settings row per exported capability, which
// produced a duplicate "Speedtest" entry. Collapsing to command-only
// keeps Settings to one row.
//
// Trigger choice:
// degoog core owns the built-in `speedtest` trigger. If this Store item
// also uses `speedtest` as its primary trigger, the command loader drops
// the whole plugin as a duplicate before it can appear in Settings. Use
// `speed` as the collision-free primary trigger and keep `speedtest` as an
// alias for deployments where the core built-in is disabled or aliases can
// coexist with the built-in trigger.
//
// Natural language:
//   • `naturalLanguagePhrases` below drives CLIENT-SIDE prefix matching
//     ("speed test", "run a speedtest", "how fast is internet", ...).
//     The matched phrase is stripped before `execute()` runs.
//   • degoog injects its native per-command Natural language setting
//     because this command declares `naturalLanguagePhrases`. This plugin
//     declares the same field explicitly so fresh installs default it on;
//     degoog skips injection when the schema already has this key.
//   • Trailing / mid-query phrases ("my internet speed", "how fast is
//     my connection today") do NOT fire — those would require a slot,
//     which would re-introduce the duplicate-row problem.
//
// Server list:
//   The full server catalog is hardcoded in script.js (client-side).
//   index.js does not inject server data into the template; the client
//   uses its built-in list directly.
//
// IMPORTANT — schema export wiring (see AGENTS.md): spell out every
// field on a named `export const command = { ... }` and re-export as
// `default`. Do NOT refactor into a spread or anonymous default — the
// Configure row has already regressed once because of that.
export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: true,
  trigger: "speed",
  aliases: ["speedtest", "speed-test", "networkspeed", "internetspeed"],
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
  settingsSchema: [debugModeSetting, naturalLanguageSetting],

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
