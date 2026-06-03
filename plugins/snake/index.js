let template = "";
let enabled = true;
let initialSpeed = "Normal";
let boardSize = "Standard";


/** Classic Google-style board dimensions (cols × rows). */
const BOARD_PRESETS = {
  Small: { cols: 9, rows: 10 },
  Standard: { cols: 15, rows: 17 },
  Large: { cols: 21, rows: 24 },
};

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the Snake game card for matching queries.",
  },
  {
    key: "boardSize",
    label: "Board size",
    type: "select",
    options: ["Small (9×10)", "Standard (15×17)", "Large (21×24)"],
    default: "Standard (15×17)",
    description: "Playfield size (columns × rows), matching common Snake variants.",
  },
  {
    key: "initialSpeed",
    label: "Initial Speed",
    type: "select",
    options: ["Easy", "Normal", "Hard"],
    default: "Normal",
    description: "The starting speed of the snake.",
  },
];

function resolveBoardPreset(label) {
  if (label === "Small (9×10)" || label === "Small") return BOARD_PRESETS.Small;
  if (label === "Large (21×24)" || label === "Large") return BOARD_PRESETS.Large;
  return BOARD_PRESETS.Standard;
}

function boardPresetKey(label) {
  if (label === "Small (9×10)" || label === "Small") return "small";
  if (label === "Large (21×24)" || label === "Large") return "large";
  return "standard";
}

function boardCellPx(cols, rows) {
  return Math.max(
    12,
    Math.min(22, Math.floor(360 / cols), Math.floor(400 / rows)),
  );
}

function configureSettings(settings) {
  if (settings?.enabled === false || settings?.enabled === "false") {
    enabled = false;
  } else {
    enabled = true;
  }
  initialSpeed = settings?.initialSpeed || "Normal";
  boardSize = settings?.boardSize || "Standard (15×17)";
}

function parseSnakeQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  if (
    q.startsWith("!snake") ||
    q.startsWith("!serpiente") ||
    q.startsWith("!serpent")
  )
    return true;
  return /^(?:play\s+|jugar\s+|jouer\s+|jouer\s+au\s+)?(?:snake|serpiente|serpent)(?:\s+(?:game|juego|jeu))?\b/i.test(
    q
  );
}

function renderSnakeCard(context) {
  // Slightly slower defaults for better control, especially on touch devices.
  const speedMsMap = { "Easy": 185, "Normal": 130, "Hard": 95 };
  const initialSpeedMs = speedMsMap[initialSpeed] || 130;
  const board = resolveBoardPreset(boardSize);
  const cellPx = boardCellPx(board.cols, board.rows);
  const boardW = board.cols * cellPx;
  const boardH = board.rows * cellPx;

  return (template || "")
    .replaceAll("{{initial_speed_ms}}", String(initialSpeedMs))
    .replaceAll("{{grid_cols}}", String(board.cols))
    .replaceAll("{{grid_rows}}", String(board.rows))
    .replaceAll("{{cell_px}}", String(cellPx))
    .replaceAll("{{board_width_px}}", String(boardW))
    .replaceAll("{{board_height_px}}", String(boardH))
    .replaceAll("{{canvas_width}}", String(boardW))
    .replaceAll("{{canvas_height}}", String(boardH))
    .replaceAll("{{board_preset}}", boardPresetKey(boardSize));
}

export const command = {
  name: "Snake Game",
  description: "A snake game plugin with mobile support and full screen mode.",
  isClientExposed: false,
  trigger: "snake",
  aliases: ["serpiente", "serpent"],
  settingsId: "plugin-snake",
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
  settingsId: "plugin-snake",

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
