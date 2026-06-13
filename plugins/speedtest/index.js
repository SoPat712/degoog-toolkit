let templateHtml = "";
let debugMode = false;


const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.5.26";
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

function renderCardHtml(context) {
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
// degoog core owns the built-in `speedtest` trigger and drops later duplicate
// primary triggers — the whole plugin vanishes from Settings if we collide.
// Use `speed` as the collision-free primary trigger; keep `speedtest` as an alias.
//
// Natural language:
//   • `naturalLanguagePhrases` below drives CLIENT-SIDE prefix matching
//     ("speed test", "run a speedtest", "how fast is internet", ...).
//     The matched phrase is stripped before `execute()` runs.
//   • degoog injects its native per-command Natural language setting because
//     this command declares `naturalLanguagePhrases`.
//   • Trailing / mid-query phrases ("my internet speed", "how fast is
//     my connection today") do NOT fire — those would require a slot,
//     which would re-introduce the duplicate-row problem.
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

  async execute(query, context) {
    return {
      title: PLUGIN_NAME,
      html: renderCardHtml(context),
    };
  },
};

export default command;
