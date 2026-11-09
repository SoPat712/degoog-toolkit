let template = "";
let enabled = true;
let drawCount = "1";

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the Solitaire game card for matching queries.",
  },
  {
    key: "drawCount",
    label: "Cards per draw",
    type: "select",
    options: ["1", "3"],
    default: "1",
    description: "How many cards the stock turns over at a time. Players can switch on the card.",
  },
];

// Exact game queries only, so "solitaire ring" or "klondike gold rush" stay
// ordinary searches.
const SOLITAIRE_QUERY =
  /^(?:!(?:solitaire|klondike)|(?:(?:play|jugar(?:\s+al)?|jouer\s+au)\s+(?:(?:a|the)\s+game\s+of\s+)?)?(?:klondike(?:\s+solitaire)?|solitaire(?:\s+klondike)?)(?:\s+game)?|jugar\s+(?:al\s+)?solitario(?:\s+klondike)?)[?!.,;:]*$/i;

export function parseSolitaireQuery(query) {
  return SOLITAIRE_QUERY.test(String(query || "").trim().replace(/\s+/g, " "));
}

export const slot = {
  id: "solitaire",
  name: "Solitaire",
  description: "Klondike solitaire with drag and drop, tap-to-move, undo, and draw 1 or draw 3.",
  isClientExposed: false,
  position: "full-width-above-results",
  slotPositions: ["full-width-above-results", "knowledge-panel"],
  settingsSchema,

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    enabled = settings?.enabled !== false && settings?.enabled !== "false";
    drawCount = String(settings?.drawCount ?? "1").trim() === "3" ? "3" : "1";
  },

  trigger(query) {
    return enabled && parseSolitaireQuery(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    if (!enabled || !parseSolitaireQuery(query)) return { title: "", html: "" };
    return {
      title: "",
      html: (template || "").replaceAll("{{draw_count}}", drawCount),
    };
  },
};

export const slotPlugin = slot;
export default slot;
