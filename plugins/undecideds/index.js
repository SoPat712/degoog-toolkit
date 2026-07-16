import { randomInt as cryptoRandomInt } from "node:crypto";

let template = "";
const MAX_ABS_NUMBER = 1_000_000_000;

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
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="coin" aria-selected="true">Coin Flip</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="dice" aria-selected="false">Roll Die</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="number" aria-selected="false">Pick Number</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="yesno" aria-selected="false">Yes or No</button>
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
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
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

  trigger(query) {
    return parseQuery(query) !== null;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    const parsed = parseQuery(query) || { mode: "coin" };
    const { mode, dieType = "d6", min = 1, max = 100 } = parsed;
    const { min: numMin, max: numMax } = normalizeRange(min, max);

    const coinResult = secureRandomInt(2) === 0 ? "heads" : "tails";
    const diceResultD6 = secureRandomInt(6) + 1;
    const diceResultD20 = secureRandomInt(20) + 1;
    const numResult = numMin + secureRandomInt(numMax - numMin + 1);
    const yesnoResult = secureRandomInt(2) === 0 ? "yes" : "no";
    const yesnoMessages = yesnoResult === "yes" ? YES_MESSAGES : NO_MESSAGES;
    const yesnoMsg = yesnoMessages[secureRandomInt(yesnoMessages.length)];

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

function normalizeRange(min, max) {
  let normalizedMin = clampInteger(min, 1);
  let normalizedMax = clampInteger(max, 100);
  if (normalizedMin > normalizedMax) {
    [normalizedMin, normalizedMax] = [normalizedMax, normalizedMin];
  }
  return { min: normalizedMin, max: normalizedMax };
}

function clampInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(-MAX_ABS_NUMBER, Math.min(MAX_ABS_NUMBER, parsed));
}

function secureRandomInt(maxExclusive) {
  const limit = Math.floor(maxExclusive);
  if (!Number.isSafeInteger(limit) || limit < 1) return 0;
  return cryptoRandomInt(limit);
}

function isDiceRoll(q) {
  return (
    /^(?:please\s+)?(?:roll\s+)?(?:a\s+)?(?:die|dice)(?:\s+roll)?$/i.test(q) ||
    /^(?:please\s+)?(?:roll\s+)?(?:a\s+)?d(?:6|20)(?:\s+(?:die|dice))?$/i.test(q) ||
    /^(?:please\s+)?roll\s+(?:a\s+)?(?:6|20)\s*-?\s*sided\s+(?:die|dice)$/i.test(q)
  );
}

function isD20Dice(q) {
  return /\bd20\b/i.test(q) || /\b20\s*-?\s*sided\b/i.test(q);
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

export { normalizeRange as testNormalizeRange };
