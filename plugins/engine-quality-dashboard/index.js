import { join } from "node:path";
import { sharedStore, WINDOWS } from "./store.js";
import { authorize, basePath, jsonResponse } from "./auth.js";

let template = "", apiBase = "", store, initialized;
let catalogs = {};
let defaultWindow = "24h";
let recording = false, recorderActive = false;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function init(ctx) {
  template = ctx.template || template;
  apiBase = ctx.apiBase ? `${basePath()}${ctx.apiBase}` : apiBase;
  if (!initialized) {
    store = sharedStore(join(process.env.DEGOOG_DATA_DIR || join(process.cwd(), "data"), "engine-quality-dashboard"));
    initialized = Promise.all([store.load(), ...["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"].map(async lang => {
      if (!ctx.readFile) return;
      const dictionary = JSON.parse(await ctx.readFile(`locales/${lang}.json`));
      catalogs[lang] = dictionary["plugin-engine-quality-dashboard"];
    })]);
  }
  await initialized;
}

function configure(settings = {}) {
  defaultWindow = Object.hasOwn(WINDOWS, settings.defaultWindow) ? settings.defaultWindow : "24h";
  recording = settings.disabled !== "true" && settings.recordingEnabled !== "false";
  store?.configure(settings);
}

export function createDataHandler(getStore, check = authorize, download = false) {
  return async request => {
    const status = await check(request);
    if (status !== 200) return jsonResponse({ error: status === 503 ? "Admin session verification is unavailable. Try again shortly." : "Sign in to admin settings to view engine statistics." }, status);
    const current = getStore();
    if (!current) return jsonResponse({ error: "Engine history is not initialized." }, 503);
    const params = new URL(request.url).searchParams;
    const window = params.get("window") || "24h", type = params.get("type") || "all";
    if (!Object.hasOwn(WINDOWS, window) || type.length > 64 || /[\u0000-\u001f]/.test(type)) return jsonResponse({ error: "Invalid history filter." }, 400);
    await current.flush();
    return jsonResponse({ ...current.snapshot({ window, type }), recording: recording && recorderActive }, 200, download ? { "Content-Disposition": 'attachment; filename="engine-quality.json"' } : {});
  };
}

const metadata = {
  name: "Engine Quality Dashboard",
  description: "Admin-only engine reliability, response times and result counts, with shared server-side history.",
  settingsSchema: [
    { key: "recordingEnabled", label: "Record engine statistics", type: "toggle", default: "true", description: "Pause collection without deleting the history already saved." },
    { key: "retentionHours", label: "History retention (hours)", type: "number", default: "48", description: "Keep hourly statistics for 1–336 hours. Statistics are stored on the server; queries and result URLs are never recorded." },
    { key: "defaultWindow", label: "Default period", type: "select", default: "24h", options: Object.keys(WINDOWS) },
    { key: "dashboardHelp", label: "Open dashboard", type: "info", description: "Search !eq to open. Viewing and downloading history always require a logged-in admin session." },
  ],
};

export const interceptor = {
  name: "Engine quality recorder", isClientExposed: false, priority: -100,
  async init(ctx) { await init(ctx); recorderActive = true; },
  configure(settings = {}) { recorderActive = settings.disabled !== "true"; },
  async intercept(query) { return { query }; },
  observe(report) { if (recording && recorderActive) store?.record(report); },
};

export const command = {
  name: "Engine Quality Dashboard", description: metadata.description,
  settingsSchema: metadata.settingsSchema,
  trigger: "eq", isClientExposed: false,
  init, configure,
  execute(args = "") {
    const window = Object.hasOwn(WINDOWS, args.trim()) ? args.trim() : defaultWindow;
    return { title: "", html: template.replaceAll("{{apiBase}}", escape(apiBase)).replaceAll("{{window}}", window).replaceAll("{{adminPath}}", escape(`${basePath()}/admin`)).replaceAll("{{catalogs}}", escape(JSON.stringify(catalogs))) };
  },
};

export const routes = [
  { method: "get", path: "snapshot", rateLimit: true, handler: createDataHandler(() => store) },
  { method: "get", path: "export", rateLimit: true, handler: createDataHandler(() => store, authorize, true) },
];
