let template = "";
let enabled = true;

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the interactive Periodic Table of Elements for matching queries.",
  },
];

export const slot = {
  id: "periodic-table",
  name: "Periodic Table",
  description: "Interactive periodic table of elements with search, group highlighting, temperature state simulation, and rich element details.",
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
    return /^(?:!periodic|!elements|!chemistry|!ptable|\b(?:periodic\s+table(?:\s+of\s+elements)?|elements\s+table)\b)/i.test(
      query
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
