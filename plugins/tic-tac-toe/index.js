let template = "";

let defaultDifficulty = "impossible";
let defaultSymbol = "X";
const VALID_DIFFICULTIES = new Set([
  "easy",
  "medium",
  "hard",
  "impossible",
  "pvp",
]);

const settingsSchema = [
  {
    key: "defaultDifficulty",
    label: "Default Difficulty",
    type: "select",
    options: ["easy", "medium", "hard", "impossible", "pvp"],
    default: "impossible",
    description: "The default difficulty for Tic-Tac-Toe AI.",
  },
  {
    key: "defaultSymbol",
    label: "Default Symbol",
    type: "select",
    options: ["X", "O"],
    default: "X",
    description: "The default symbol you play as.",
  },
];

export const slot = {
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  description:
    "Tic-Tac-Toe game with AI difficulty settings, local multiplayer, and win-line animation.",
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
    defaultDifficulty = VALID_DIFFICULTIES.has(settings?.defaultDifficulty)
      ? settings.defaultDifficulty
      : "impossible";
    defaultSymbol = settings?.defaultSymbol === "O" ? "O" : "X";
  },

  trigger(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase()
      .replace(/[?!.,;:]+$/, "");
    return (
      q === "!tictactoe" ||
      q === "!tic-tac-toe" ||
      q === "tictactoe" ||
      q === "tic-tac-toe" ||
      q === "tic tac toe" ||
      q === "play tictactoe" ||
      q === "play tic-tac-toe" ||
      q === "play tic tac toe" ||
      q === "play a game of tictactoe" ||
      q === "play a game of tic-tac-toe" ||
      q === "play a game of tic tac toe" ||
      q === "noughts and crosses"
    );
  },
  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const html = (template || "")
      .replaceAll("{{default_difficulty}}", defaultDifficulty)
      .replaceAll("{{default_symbol}}", defaultSymbol);
    return {
      title: "",
      html,
    };
  },
};

export const slotPlugin = slot;
export default slot;
