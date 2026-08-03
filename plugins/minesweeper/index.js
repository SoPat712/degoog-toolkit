

let template = "";
let enabled = true;

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the Minesweeper game card for matching queries.",
  },
];

export const slot = {
  id: "minesweeper",
  name: "Minesweeper",
  description: "Minesweeper game card with board sizes, flags, a mobile flag toggle, and a timer.",
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
    enabled = settings?.enabled !== false && settings?.enabled !== "false";
  },

  trigger(query) {
    if (!enabled) return false;
    const q = String(query || "").trim();
    return /^(?:!(?:minesweeper|ms|buscaminas|demineur|démineur)\b|(?:(?:play|jugar|jouer|jouer\s+au)\s+(?:(?:a|the)\s+game\s+of\s+)?)?(?:minesweeper|buscaminas|démineur|demineur)(?:\s+game)?)[?!.,;:]*$/i.test(
      q,
    );
  },
  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    return {
      title: "",
      html: template || "",
    };
  },
};

export const slotPlugin = slot;
export default slot;
