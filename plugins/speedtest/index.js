let templateHtml = "";
let debugMode = false;

const PLUGIN_NAME = "Speedtest";
const PLUGIN_VERSION = "1.5.6";
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

// Manually declared Natural language toggle so we fully control the
// default (ON). degoog would otherwise auto-inject its own toggle
// because the command below declares `naturalLanguagePhrases`, and we
// cannot set that auto-injected toggle's default. By shipping a field
// with the same `key: "naturalLanguage"` here, first-load honours
// `default: true` — if degoog's `schemaWithNaturalLanguage` wrapping
// dedupes by key we get a single field; worst case a duplicate field
// appears and we iterate.
const naturalLanguageSetting = {
  key: "naturalLanguage",
  label: "Natural language triggering",
  type: "toggle",
  default: true,
  description:
    "Trigger on phrases like 'speed test', 'run a speedtest', or 'how fast is internet' without the !speed prefix. Bang commands (!speed) always work regardless of this setting.",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  let rendered = templateHtml;
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
  return rendered;
}

export const routes = [];

// Command-only plugin. An earlier version also exported a `slot`, but
// degoog renders one Settings row per exported capability, which
// produced a duplicate "Speedtest" entry. Collapsing to command-only
// keeps Settings to one row.
//
// Trigger choice — `speed`, NOT `speedtest`:
// degoog core ships a built-in `speedtest` bang command. The command
// loader keeps the FIRST registration and silently drops later
// duplicates — and "drops" takes the WHOLE plugin command record
// (including its settingsSchema, so the Configure row disappears
// entirely). A previous version using `trigger: "speedtest"` hit
// exactly that: zero Configure rows. We use `trigger: "speed"` here
// so registration is guaranteed. `!speedtest` is deliberately NOT in
// the aliases for the same collision reason.
//
// Natural language:
//   • `naturalLanguagePhrases` below drives CLIENT-SIDE prefix matching
//     ("speed test", "run a speedtest", "how fast is internet", ...).
//     The matched phrase is stripped before `execute()` runs.
//   • A manual `naturalLanguage` toggle is declared in `settingsSchema`
//     (default: true) so first-load defaults to ON. If degoog's
//     `schemaWithNaturalLanguage` wrapping dedupes by key we get one
//     toggle; if it doesn't dedupe a visual duplicate may appear, in
//     which case iterate.
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
  trigger: "speed",
  aliases: ["speedtest", "speed-test", "networkspeed", "internetspeed"],
  // NOTE on trigger: deliberately NOT "speedtest" as the PRIMARY trigger
  // — that would collide with degoog core's built-in `speedtest` command
  // and the loader would silently drop this whole command record
  // (settingsSchema too, so the Configure row disappears). `"speed"` is
  // collision-free so primary registration is guaranteed.
  //
  // `"speedtest"` IS included as an alias. Alias-level collisions appear
  // to be handled differently from primary-trigger collisions: when the
  // core built-in is disabled, this alias claims `!speedtest` for this
  // plugin; when the built-in is enabled, the alias is either ignored
  // or overridden by the built-in but the rest of the command record
  // (primary trigger + other aliases + settingsSchema) still registers.
  // If a future degoog release starts dropping the whole command record
  // on alias collision too, remove "speedtest" from this list and the
  // Configure row will come back.
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
