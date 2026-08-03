import { parseTipQuery } from "./parse-tip-query.js";

let template = "";
let enabled = true;
let defaultTipPercent = 15;

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the tip calculator card for matching queries.",
  },
  {
    key: "defaultTipPercent",
    label: "Default Tip Percentage",
    type: "select",
    options: ["10", "15", "18", "20", "25"],
    default: "15",
    description: "Default tip percentage to use if not specified in search query.",
  },
];

export const slot = {
  id: "tip-calculator",
  name: "Tip Calculator",
  description: "Interactive tip calculator with real-time bill split, custom slider parameters, and animations.",
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
    defaultTipPercent = parseInt(settings?.defaultTipPercent || "15", 10);
    if (
      !Number.isFinite(defaultTipPercent) ||
      defaultTipPercent < 0 ||
      defaultTipPercent > 100
    ) {
      defaultTipPercent = 15;
    }
  },

  trigger(query) {
    return enabled && Boolean(parseTipQuery(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const request = parseTipQuery(query);
    if (!request) return { title: "", html: "" };

    const bill = Math.min(Math.max(request.bill ?? 50, 0), 1_000_000_000);
    const tipPercent = Math.min(
      Math.max(request.tipPercent ?? defaultTipPercent, 0),
      1_000,
    );
    const split = Math.min(Math.max(request.split ?? 1, 1), 100);

    return {
      title: "",
      html: (template || "")
        .replaceAll("{{bill}}", bill.toFixed(2))
        .replaceAll("{{tip_percent}}", String(tipPercent))
        .replaceAll("{{split}}", String(split)),
    };
  },
};

export const slotPlugin = slot;
export default slot;
