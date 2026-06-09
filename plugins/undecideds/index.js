import { readSlotPosition, shouldRenderSlotForContext } from "./slot-position.js";

let template = "";
let selectedSlotPosition = "at-a-glance";

const YES_MESSAGES = [
  "Absolutely!",
  "Yes, definitely!",
  "It is certain.",
  "Without a doubt!",
  "Outlook good.",
  "Most likely!",
  "Signs point to yes."
];

const NO_MESSAGES = [
  "No way!",
  "Maybe next time.",
  "Don't count on it.",
  "My sources say no.",
  "Very doubtful.",
  "Outlook not so good.",
  "Absolutely not!"
];

const FALLBACK_TEMPLATE = `<div class="undecideds-slot" data-undecideds-slot data-active-tab="coin" data-die-type="d6" data-num-min="1" data-num-max="100">
  <div class="undecideds-slot__card">
    <div class="undecideds-slot__tabs-carousel" data-undecideds-tabs-carousel>
      <button class="undecideds-slot__tab-nav undecideds-slot__tab-nav--prev" type="button" data-undecideds-tab-scroll="left" aria-label="Previous decision modes"><span aria-hidden="true">&lsaquo;</span></button>
      <div class="undecideds-slot__tabs" role="tablist" data-undecideds-tabs>
        <button class="undecideds-slot__tab-btn" role="tab" data-tab="coin" aria-selected="true">Coin Flip</button>
        <button class="undecideds-slot__tab-btn" role="tab" data-tab="dice" aria-selected="false">Roll Die</button>
        <button class="undecideds-slot__tab-btn" role="tab" data-tab="number" aria-selected="false">Pick Number</button>
        <button class="undecideds-slot__tab-btn" role="tab" data-tab="yesno" aria-selected="false">Yes or No</button>
      </div>
      <button class="undecideds-slot__tab-nav undecideds-slot__tab-nav--next" type="button" data-undecideds-tab-scroll="right" aria-label="Next decision modes"><span aria-hidden="true">&rsaquo;</span></button>
    </div>
  </div>
</div>`;

export const slot = {
  id: "undecideds-slot",
  name: "Undecideds",
  description: "Decision tools for coin flips, dice rolls, number picks, and yes/no choices.",
  isClientExposed: false,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],
  settingsSchema: [
    {
      key: "debugMode",
      label: "Debug mode",
      type: "toggle",
      default: false,
      description: "Log slot position decisions to the server console.",
    },
  ],

  init(ctx) {
    template = ctx.template || FALLBACK_TEMPLATE;
  },

  configure(settings) {
    selectedSlotPosition = readSlotPosition(settings, "at-a-glance");
  },

  trigger(query) {
    return parseQuery(query) !== null;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    if (!shouldRenderSlotForContext(context, selectedSlotPosition)) {
      return { html: "" };
    }

    const parsed = parseQuery(query) || { mode: "coin" };
    const { mode, dieType = "d6", min = 1, max = 100 } = parsed;
    
    let numMin = min;
    let numMax = max;
    if (numMin > numMax) [numMin, numMax] = [numMax, numMin];

    const coinResult = Math.random() < 0.5 ? "heads" : "tails";
    const diceResultD6 = Math.floor(Math.random() * 6) + 1;
    const diceResultD20 = Math.floor(Math.random() * 20) + 1;
    const numResult = Math.floor(Math.random() * (numMax - numMin + 1)) + numMin;
    const yesnoResult = Math.random() < 0.5 ? "yes" : "no";
    const yesnoMsg = (yesnoResult === "yes" ? YES_MESSAGES : NO_MESSAGES)[
      Math.floor(Math.random() * (yesnoResult === "yes" ? YES_MESSAGES.length : NO_MESSAGES.length))
    ];

    const data = {
      active_tab: mode,
      die_type: dieType,
      num_min: String(numMin),
      num_max: String(numMax),
      auto_coin_result: mode === "coin" ? coinResult : "",
      auto_dice_result_d6: mode === "dice" ? String(diceResultD6) : "",
      auto_dice_result_d20: mode === "dice" ? String(diceResultD20) : "",
      auto_die_type: mode === "dice" ? dieType : "",
      auto_num_result: mode === "number" ? String(numResult) : "",
      auto_yesno_result: mode === "yesno" ? yesnoResult : "",
      auto_yesno_msg: mode === "yesno" ? yesnoMsg : "",
      coin_result: "heads",
      coin_result_label: "Ready to flip",
      coin_ticker: "waiting",
      dice_result_d6: "1",
      dice_result_d20: "?",
      dice_result_label: "Ready to roll",
      dice_ticker: "waiting",
      num_result: "?",
      num_result_label: "Pick a number",
      yesno_result: yesnoResult,
      yesno_msg: "Ask yes or no",
      yesno_ticker: "waiting"
    };

    return { html: renderTemplate(template || FALLBACK_TEMPLATE, data) };
  }
};

export const slotPlugin = slot;
export default slot;

function parseQuery(query) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!]+$/g, "");
  if (!q) return null;

  if (/^(?:please\s+)?(?:should i|will i|will it|yes or no|decide yes no|yesno|yes-no)\b/i.test(q) || /yes\s*or\s*no/i.test(q)) {
    return { mode: "yesno" };
  }

  if (isDiceRoll(q)) {
    return { mode: "dice", dieType: isD20Dice(q) ? "d20" : "d6" };
  }

  const numRangeMatch = q.match(/(?:pick a number|random number|number between)\s+(-?\d+)\s*(?:-|to|and)\s*(-?\d+)/i) ||
                        q.match(/(-?\d+)\s*(?:-|to|and)\s*(-?\d+)\s+(?:pick a number|random number|number generator)\b/i) ||
                        q.match(/random\s+number\s*(?:from)?\s*(-?\d+)\s*(?:to|and)\s*(-?\d+)/i);
  if (numRangeMatch) {
    return { mode: "number", min: parseInt(numRangeMatch[1], 10), max: parseInt(numRangeMatch[2], 10) };
  }

  if (/\b(?:pick a number|random number|number generator|random digit)\b/i.test(q)) {
    return { mode: "number", min: 1, max: 100 };
  }

  if (/\b(?:coinflip|coin-flip|flipcoin|coin flip|coin toss|flip coin|flip a coin|toss coin|toss a coin|heads or tails|tails or heads)\b/i.test(q)) {
    return { mode: "coin" };
  }

  return null;
}

function isDiceRoll(q) {
  return /roll\s+(?:a\s+)?(?:die|dice)\b|dice\s+roll|die\s+roll|roll\s+(?:a\s+)?d\d+|\b(d6|d20|d8|d10|d12|d100)\b|\d+\s*-?\s*sided\s+(?:die|dice)/i.test(q);
}

function isD20Dice(q) {
  return /\bd20\b|20\s*-?\s*sided/i.test(q);
}

function renderTemplate(tpl, data) {
  let result = tpl;
  for (const [key, value] of Object.entries(data)) {
    result = result.split(`{{${key}}}`).join(esc(value));
  }
  return result;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
