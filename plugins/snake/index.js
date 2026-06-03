let template = "";
let enabled = true;
let initialSpeed = "Normal";
import { t } from "./locales.js";

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the Snake game card for matching queries.",
  },
  {
    key: "initialSpeed",
    label: "Initial Speed",
    type: "select",
    options: ["Easy", "Normal", "Hard"],
    default: "Normal",
    description: "The starting speed of the snake.",
  }
];

function configureSettings(settings) {
  enabled = settings?.enabled !== false && settings?.enabled !== "true" && settings?.enabled !== "false";
  // Handled appropriately since it can be boolean or string
  if (settings?.enabled === false || settings?.enabled === "false") {
    enabled = false;
  } else {
    enabled = true;
  }
  initialSpeed = settings?.initialSpeed || "Normal";
}

function parseSnakeQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  if (q.startsWith("!snake")) return true;
  return /^(?:play\s+)?snake(?:\s+game)?\b/i.test(q);
}

function renderSnakeCard(context) {
  // Slightly slower defaults for better control, especially on touch devices.
  const speedMsMap = { "Easy": 185, "Normal": 130, "Hard": 95 };
  const initialSpeedMs = speedMsMap[initialSpeed] || 130;

  return (template || "")
    .replaceAll("{{initial_speed_ms}}", String(initialSpeedMs))
    .replaceAll("{{t_snake}}", t("snake", context))
    .replaceAll("{{t_score}}", t("score", context))
    .replaceAll("{{t_high}}", t("high", context))
    .replaceAll("{{t_full_screen}}", t("fullScreen", context))
    .replaceAll("{{t_toggle_fs}}", t("toggleFullScreen", context))
    .replaceAll("{{t_pause}}", t("pause", context))
    .replaceAll("{{t_start_game}}", t("startGame", context))
    .replaceAll("{{t_press_start}}", t("pressStart", context))
    .replaceAll("{{t_game_over}}", t("gameOver", context))
    .replaceAll("{{t_paused}}", t("paused", context))
    .replaceAll("{{t_press_resume}}", t("pressResume", context))
    .replaceAll("{{t_play_again}}", t("playAgain", context))
    .replaceAll("{{t_resume}}", t("resume", context))
    .replaceAll("{{t_scored_prefix}}", t("scoredPrefix", context))
    .replaceAll("{{t_scored_suffix}}", t("scoredSuffix", context))
    .replaceAll("{{t_points}}", t("points", context))
    .replaceAll("{{t_you_win}}", t("youWin", context))
    .replaceAll("{{t_board_cleared}}", t("boardCleared", context));
}

export const command = {
  name: "Snake Game",
  description: "A snake game plugin with mobile support and full screen mode.",
  isClientExposed: false,
  trigger: "snake",

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    configureSettings(settings);
  },

  async execute(query, context) {
    if (!enabled) {
      return { title: "", html: "" };
    }

    return {
      title: "",
      html: renderSnakeCard(context),
    };
  },
};

export const slot = {
  id: "snake",
  name: "Snake Game",
  description: "A snake game plugin with mobile support and full screen mode.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  settingsSchema,

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    configureSettings(settings);
  },

  trigger(query) {
    if (!enabled) return false;
    return parseSnakeQuery(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    if (!parseSnakeQuery(query)) return { title: "", html: "" };

    return {
      title: "",
      html: renderSnakeCard(context),
    };
  },
};

export const slotPlugin = slot;
export default slot;
