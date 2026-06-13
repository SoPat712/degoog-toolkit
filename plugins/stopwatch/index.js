import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";

let template = "";

const DEFAULT_TIMER_SECONDS = 5 * 60;
const DEFAULT_STOPWATCH_CYCLE_SECONDS = 60;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const STOPWATCH_CYCLE_OPTIONS = new Set(["60", "300", "3600"]);
const SOUNDS_DIR = "sounds";
const AUDIO_FILE_RX = /\.(m4a|mp3|wav|ogg|aac)$/i;

let enabled = true;
let stopwatchCycleSeconds = DEFAULT_STOPWATCH_CYCLE_SECONDS;
let pluginDir = "";
let pluginRouteBase = "";
/** @type {{ id: string, file: string, label: string }[]} */
let alarmSounds = [];
let alarmTone = "";

const COMMAND_PREFIX_RX = /^!(?<command>timer|stopwatch|countdown|minuteur|compte\s+à\s+rebours|temporizador|chronomètre|cronómetro)\b\s*/i;
const TIMER_KEYWORD_RX = /\b(?:timer|countdown|count\s+down|minuteur|compte\s+à\s+rebours|temporizador)\b/i;
const SIMPLE_STOPWATCH_RX =
  /^(?:please\s+|por\s+favor\s+|s'il\s+vous\s+plaît\s+|s'il\s+te\s+plaît\s+)?(?:(?:start|run|open|show|iniciar|lancer|ouvrir|afficher)\s+)?(?:a\s+|un\s+|une\s+)?(?:stop\s*watch|chronomètre|cronómetro)(?:\s+(?:please|por\s+favor|s'il\s+vous\s+plaît|s'il\s+te\s+plaît))?[.!?]*$/i;
const SIMPLE_TIMER_RX =
  /^(?:please\s+|por\s+favor\s+|s'il\s+vous\s+plaît\s+|s'il\s+te\s+plaît\s+)?(?:(?:start|set|run|open|show|iniciar|lancer|ouvrir|configurer|régler|regler|establecer)\s+)?(?:a\s+|un\s+|une\s+)?(?:timer|countdown|count\s+down|minuteur|compte\s+à\s+rebours|temporizador)(?:\s+(?:please|por\s+favor|s'il\s+vous\s+plaît|s'il\s+te\s+plaît))?[.!?]*$/i;

const UNIT_SECONDS = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  hora: 3600,
  horas: 3600,
  heure: 3600,
  heures: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  minuto: 60,
  minutos: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  seg: 1,
  segundo: 1,
  segundos: 1,
  seconde: 1,
  secondes: 1,
};

const UNIT_TOKEN_RX =
  /(\d+(?:\.\d+)?)\s*(hours?|horas?|heures?|hrs?|hr|h|minutes?|minutos?|mins?|min|m|seconds?|segundos?|secondes?|secs?|seg|sec|s)\b/gi;
const CLOCK_RX = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/;
const BARE_NUMBER_RX = /\b(\d{1,4})\b/;

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the timer and stopwatch card for matching queries.",
  },
  {
    key: "stopwatchCycle",
    label: "Stopwatch ring cycle",
    type: "select",
    options: ["60", "300", "3600"],
    default: String(DEFAULT_STOPWATCH_CYCLE_SECONDS),
    description:
      "Seconds per stopwatch progress ring. A short tick plays each time a ring completes.",
  },
];

function setPluginRouteBase(ctx) {
  if (ctx?.apiBase) {
    pluginRouteBase = ctx.apiBase;
  } else if (typeof ctx?.routeUrl === "function") {
    pluginRouteBase = ctx.routeUrl();
  } else {
    const dir = typeof ctx?.dir === "string" ? ctx.dir : "";
    const folder = dir.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
    const prefix = ["", "api", "plugin"].join("/");
    pluginRouteBase = folder
      ? `${prefix}/${encodeURIComponent(folder)}`
      : `${prefix}/stopwatch`;
  }
}

function labelFromFilename(file) {
  return file.replace(/\.[^.]+$/, "");
}

async function scanAlarmSounds(dir) {
  const soundsPath = join(dir, SOUNDS_DIR);
  try {
    const entries = await readdir(soundsPath);
    return entries
      .filter((file) => AUDIO_FILE_RX.test(file))
      .sort((a, b) => a.localeCompare(b))
      .map((file) => ({
        id: file,
        file,
        label: labelFromFilename(file),
      }));
  } catch {
    return [];
  }
}

function syncDefaultAlarmTone() {
  if (!alarmSounds.length) {
    alarmTone = "beep";
    return;
  }
  if (!alarmSounds.some((sound) => sound.id === alarmTone)) {
    const defaultTone = alarmSounds.find((sound) => sound.label.toLowerCase() === "strum") || alarmSounds[0];
    alarmTone = defaultTone.id;
  }
}

function soundUrl(file) {
  return `${pluginRouteBase}/sounds/file?f=${encodeURIComponent(file)}`;
}

function alarmSoundsPayload() {
  return alarmSounds.map((sound) => ({
    id: sound.id,
    label: sound.label,
    url: soundUrl(sound.file),
  }));
}

function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escHtml(value) {
  return escAttr(value);
}

function renderAlarmToneOptions(selected) {
  return alarmSounds
    .map((sound) => {
      const isSelected = sound.id === selected ? " selected" : "";
      return `<option value="${escAttr(sound.id)}"${isSelected}>${escHtml(sound.label)}</option>`;
    })
    .join("");
}

function renderAlarmToneBar() {
  if (!alarmSounds.length) return "";
  return `<div class="timer-tone-bar" data-timer-tone-bar>
    <label class="timer-tone-label" for="timer-alarm-tone-select">{{ t:plugin-stopwatch.alarmTone }}</label>
    <select
      id="timer-alarm-tone-select"
      class="timer-tone-select"
      data-timer-alarm-select
      aria-label="{{ t:plugin-stopwatch.alarmTone }}"
    >${renderAlarmToneOptions(alarmTone)}</select>
  </div>`;
}

function audioContentType(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function resolveSoundFile(requested) {
  const file = basename(String(requested || ""));
  if (!file || !AUDIO_FILE_RX.test(file)) return null;
  return alarmSounds.some((sound) => sound.file === file) ? file : null;
}

function clampDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(Math.round(seconds), MAX_DURATION_SECONDS);
}

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function stripCommandPrefix(value) {
  return normalizeQuery(value).replace(COMMAND_PREFIX_RX, "");
}

function parseDuration(value, options = {}) {
  const q = normalizeQuery(value).toLowerCase();
  if (!q) return null;

  const clock = CLOCK_RX.exec(q);
  if (clock) {
    const hours = clock[1] ? Number(clock[1]) : 0;
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    return clampDuration(hours * 3600 + minutes * 60 + seconds);
  }

  let total = 0;
  let matched = false;
  for (const match of q.matchAll(UNIT_TOKEN_RX)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount) || !UNIT_SECONDS[unit]) continue;
    total += amount * UNIT_SECONDS[unit];
    matched = true;
  }
  if (matched) return clampDuration(total);

  if (options.allowBareNumber) {
    const bare = BARE_NUMBER_RX.exec(q);
    if (bare) return clampDuration(Number(bare[1]) * 60);
  }

  return null;
}

function parseRequest(input) {
  const original = normalizeQuery(input);
  if (!original || original.length > 160) return null;

  const commandMatch = COMMAND_PREFIX_RX.exec(original);
  const command = commandMatch?.groups?.command?.toLowerCase() || "";
  const q = stripCommandPrefix(original);
  const haystack = q || original.replace(COMMAND_PREFIX_RX, command);

  if (
    command === "stopwatch" ||
    command === "chronomètre" ||
    command === "cronómetro" ||
    (!command && SIMPLE_STOPWATCH_RX.test(original))
  ) {
    return {
      mode: "stopwatch",
      durationSeconds: DEFAULT_TIMER_SECONDS,
      autostart: /\b(?:start|run|lancer|iniciar)\b/i.test(original),
    };
  }

  const isTimerCommand =
    command === "timer" ||
    command === "countdown" ||
    command === "minuteur" ||
    command === "compte à rebours" ||
    command === "temporizador";
  const hasTimerKeyword = TIMER_KEYWORD_RX.test(original);
  const timerDuration = parseDuration(haystack, {
    allowBareNumber: isTimerCommand || hasTimerKeyword,
  });

  if (
    isTimerCommand ||
    SIMPLE_TIMER_RX.test(original) ||
    (hasTimerKeyword && timerDuration !== null)
  ) {
    return {
      mode: "timer",
      durationSeconds: timerDuration || DEFAULT_TIMER_SECONDS,
      autostart:
        timerDuration !== null ||
        /\b(?:start|run|countdown|count\s+down|lancer|iniciar|minuteur|compte\s+à\s+rebours|temporizador)\b/i.test(
          original,
        ),
    };
  }

  return null;
}

function configureSettings(settings) {
  enabled = settings?.enabled !== false && settings?.enabled !== "false";
  const nextCycle = String(settings?.stopwatchCycle || DEFAULT_STOPWATCH_CYCLE_SECONDS);
  stopwatchCycleSeconds = STOPWATCH_CYCLE_OPTIONS.has(nextCycle)
    ? Number(nextCycle)
    : DEFAULT_STOPWATCH_CYCLE_SECONDS;
  syncDefaultAlarmTone();
}

function renderTemplate(request) {
  const soundsJson = JSON.stringify(alarmSoundsPayload());
  return (template || "")
    .replaceAll("{{duration_seconds}}", String(request.durationSeconds))
    .replaceAll("{{mode}}", request.mode)
    .replaceAll("{{autostart}}", request.autostart ? "true" : "false")
    .replaceAll("{{stopwatch_cycle_seconds}}", String(stopwatchCycleSeconds))
    .replaceAll("{{alarm_tone}}", escAttr(alarmTone))
    .replaceAll("{{alarm_sounds_json}}", escAttr(soundsJson))
    .replaceAll("{{alarm_tone_bar}}", renderAlarmToneBar());
}

export const slot = {
  id: "stopwatch",
  name: "Timer / Stopwatch",
  description:
    "Compact timer and stopwatch with smooth circular progress, editable timer duration, and optional sound.",
  isClientExposed: false,
  position: "knowledge-panel",
  slotPositions: ["knowledge-panel", "above-results"],
  settingsSchema,

  async init(ctx) {
    pluginDir = typeof ctx?.dir === "string" ? ctx.dir : "";
    setPluginRouteBase(ctx);
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
    if (pluginDir) {
      alarmSounds = await scanAlarmSounds(pluginDir);
      syncDefaultAlarmTone();
    }
  },

  configure(settings) {
    configureSettings(settings);
  },

  trigger(query) {
    if (!enabled) return false;
    return Boolean(parseRequest(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const request = parseRequest(query);
    if (!request) return { title: "", html: "" };

    return {
      title: "",
      html: renderTemplate(request),
    };
  },
};

export const routes = [
  {
    method: "get",
    path: "sounds/list",
    handler: async () =>
      new Response(JSON.stringify(alarmSoundsPayload()), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }),
  },
  {
    method: "get",
    path: "sounds/file",
    handler: async (req) => {
      const url = new URL(req.url);
      const file = resolveSoundFile(url.searchParams.get("f"));
      if (!file || !pluginDir) {
        return new Response("Not found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }

      try {
        const bytes = await readFile(join(pluginDir, SOUNDS_DIR, file));
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": audioContentType(file),
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        return new Response("Not found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
    },
  },
];

export const slotPlugin = slot;
export default slot;
