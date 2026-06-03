import {
  readSlotPosition,
  shouldRenderSlotForContext,
} from "./slot-position.js";

let template = "";
let enabled = true;
let defaultBpmSetting = 120;
let selectedSlotPosition = "at-a-glance";

const METRONOME_CMD_RX = /^!(?:metronome|bpm|tempo)\b/i;
const METRONOME_KEYWORDS_RX = /\b(?:metronome|tempo|bpm|tap\s+tempo)\b/i;

function parseRequest(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return null;

  const isBang = METRONOME_CMD_RX.test(q);
  const isKeywordOnly = /^(?:metronome|tempo|bpm|tap\s+tempo|online\s+metronome)$/.test(q);
  
  const bpmMatch = q.match(/\b(?:metronome|bpm|tempo)\s+(\d{2,3})\b/) || q.match(/\b(\d{2,3})\s*(?:bpm|tempo|beats\s*per\s*minute)\b/);
  
  let bpmVal = null;
  if (bpmMatch) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 40 && val <= 240) {
      bpmVal = val;
    }
  }

  if (isBang || isKeywordOnly || (METRONOME_KEYWORDS_RX.test(q) && bpmMatch)) {
    return {
      bpm: bpmVal
    };
  }

  return null;
}

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the metronome card for matching queries.",
  },
  {
    key: "defaultBpm",
    label: "Default BPM",
    type: "text",
    default: "120",
    description: "The default Beats Per Minute (40-240) when no BPM is specified in the query.",
  }
];

function configureSettings(settings) {
  enabled = settings?.enabled !== false && settings?.enabled !== "false";
  const bpm = parseInt(settings?.defaultBpm, 10);
  if (!isNaN(bpm) && bpm >= 40 && bpm <= 240) {
    defaultBpmSetting = bpm;
  } else {
    defaultBpmSetting = 120;
  }
  selectedSlotPosition = readSlotPosition(settings, "at-a-glance");
}


function renderTemplate(request, context) {
  const bpm = request.bpm || defaultBpmSetting;
  return (template || "")
    .replaceAll("{{default_bpm}}", String(bpm));
}

export const slot = {
  id: "metronome",
  name: "Metronome",
  description: "Metronome widget with tempo controls, tap tempo, and beat signatures.",
  isClientExposed: false,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],
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
    return Boolean(parseRequest(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    if (!shouldRenderSlotForContext(context, selectedSlotPosition)) {
      return { title: "", html: "" };
    }
    const request = parseRequest(query);
    if (!request) return { title: "", html: "" };

    return {
      title: "",
      html: renderTemplate(request, context),
    };
  },
};

export const slotPlugin = slot;
export default slot;
