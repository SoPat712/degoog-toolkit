let template = "";

function getAction(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/^!\s*/, "") // Support optional leading bang
    .replace(/[.!?]+$/, "") // Strip trailing punctuation
    .trim();

  if (q === "do a barrel roll" || q === "barrel roll") {
    return "roll";
  }
  if (q === "tilt" || q === "askew") {
    return "tilt";
  }
  return null;
}

export const slot = {
  id: "barrel-roll",
  name: "Barrel Roll",
  description: "Triggers on queries like 'do a barrel roll' or 'tilt' to tilt or rotate the page.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "at-a-glance", "below-results", "knowledge-panel"],

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  trigger(query) {
    return getAction(query) !== null;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") {
      return { html: "" };
    }

    const action = getAction(query);
    if (!action) {
      return { html: "" };
    }

    const html = (template || '<div class="barrel-roll-marker" data-action="{{action}}" style="display:none"></div>')
      .replaceAll("{{action}}", action);

    return { html };
  },
};

export const slotPlugin = slot;
export default slot;
