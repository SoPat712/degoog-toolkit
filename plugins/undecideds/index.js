import {
  readSlotPosition,
  shouldRenderSlotForContext,
} from "./slot-position.js";

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
    const activeTab = parsed.mode;
    const dieType = parsed.dieType || "d6";
    const shouldResolveCoin = activeTab === "coin";
    const shouldResolveDice = activeTab === "dice";
    const shouldResolveNumber = activeTab === "number";
    const shouldResolveYesNo = activeTab === "yesno";
    
    let numMin = typeof parsed.min === "number" ? parsed.min : 1;
    let numMax = typeof parsed.max === "number" ? parsed.max : 100;
    if (numMin > numMax) {
      const temp = numMin;
      numMin = numMax;
      numMax = temp;
    }

    const coinResult = Math.random() < 0.5 ? "heads" : "tails";

    const diceResultD6 = Math.floor(Math.random() * 6) + 1;
    const diceResultD20 = Math.floor(Math.random() * 20) + 1;
    const diceResult = dieType === "d20" ? diceResultD20 : diceResultD6;

    const numResult = Math.floor(Math.random() * (numMax - numMin + 1)) + numMin;

    const yesnoResult = Math.random() < 0.5 ? "yes" : "no";
    const yesnoMsg = yesnoResult === "yes" 
      ? YES_MESSAGES[Math.floor(Math.random() * YES_MESSAGES.length)]
      : NO_MESSAGES[Math.floor(Math.random() * NO_MESSAGES.length)];

    // Always render the "ready" state — results are stored as data-auto-* attributes
    // so script.js can animate them on first visibility instead of showing them pre-resolved.
    const data = {
      active_tab: activeTab,
      die_type: dieType,
      num_min: String(numMin),
      num_max: String(numMax),
      // Auto-result attributes (read by script.js to trigger entrance animation)
      auto_coin_result: shouldResolveCoin ? coinResult : "",
      auto_dice_result_d6: shouldResolveDice ? String(diceResultD6) : "",
      auto_dice_result_d20: shouldResolveDice ? String(diceResultD20) : "",
      auto_die_type: shouldResolveDice ? dieType : "",
      auto_num_result: shouldResolveNumber ? String(numResult) : "",
      auto_yesno_result: shouldResolveYesNo ? yesnoResult : "",
      auto_yesno_msg: shouldResolveYesNo ? yesnoMsg : "",
      // Always show the neutral/ready state in the template
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

    const tpl = template || FALLBACK_TEMPLATE;
    const html = renderTemplate(tpl, data);

    return { html };
  }
};

export const slotPlugin = slot;
export default slot;

const TriggerGuard = {
  // Checks if a query looks like physical unit conversion (e.g. "5m to km")
  isUnitConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const UNIT_CONV_RE = /^-?[\d][\d\s.,]*\s*\S.*?\b(?:to|into)\s+[a-z0-9°µ]{1,8}\s*$/i;
      return UNIT_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query looks like currency conversion (e.g. "100 usd to eur")
  isCurrencyConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const CURRENCY_CONV_RE = /^-?[\d][\d\s.,]*\s*[a-z]{3}\s+\b(?:to|into|in|=)\s+[a-z]{3}\s*$/i;
      return CURRENCY_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query is language translation
  isTranslation(q, lower) {
    return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) ||
           /how (do|would|can) you say\b/i.test(q);
  },

  // Checks if a query is a general non-financial tips article/advice (e.g. "gardening tips")
  isTipAdvice(q) {
    return /\b(tips?\s+(?:to|on\s+how|on|for|about|with|and|from|in)|(?:gardening|coding|interview|study|writing|clean|life|health|safety|cooking|travel|career|business)\s+tips?)\b/i.test(q);
  },

  // Checks if a query is a dice roll (e.g. "roll a 20 sided die", "d20")
  isDiceRoll(q) {
    return (
      /roll\s+(?:a\s+)?(?:die|dice)\b/i.test(q) ||
      /\bdice\s+roll\b/i.test(q) ||
      /\bdie\s+roll\b/i.test(q) ||
      /roll\s+d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q) ||
      /\b(d6|d20|d8|d10|d12|d100)\b/i.test(q) ||
      /\b\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q)
    );
  },

  // Checks if a query specifically targets a 20-sided die
  isD20Dice(q) {
    return /\bd20\b/i.test(q) || /\b20\s*-?\s*sided\b/i.test(q);
  },

  // Checks if a query is a utility tool (calculator, weather, timer, stocks, etc.)
  isUtility(q) {
    return /\b(weather|forecast|погода|метео|temperature|humidity|wind|rain|snow|translate|translation|convert|currency|calculator|calculate|math|stopwatch|timer|countdown|coinflip|coin-flip|yesno|yes-no|tip|tips|gratuity|gratuities|stocks?)\b/i.test(q);
  }
};

function parseQuery(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");

  if (!q) return null;

  // Yes / No
  if (
    /^(?:please\s+)?(?:should i|will i|will it|yes or no|decide yes no|yesno|yes-no)\b/i.test(q) ||
    /yes\s*or\s*no/i.test(q)
  ) {
    return { mode: "yesno" };
  }

  // Dice
  if (TriggerGuard.isDiceRoll(q)) {
    return {
      mode: "dice",
      dieType: TriggerGuard.isD20Dice(q) ? "d20" : "d6"
    };
  }

  // Random number
  const numRangeMatch = q.match(/(?:pick a number|random number|number between)\s+(-?\d+)\s*(?:-|to|and)\s*(-?\d+)/i) ||
                        q.match(/(-?\d+)\s*(?:-|to|and)\s*(-?\d+)\s+(?:pick a number|random number|number generator)\b/i) ||
                        q.match(/random\s+number\s*(?:from)?\s*(-?\d+)\s*(?:to|and)\s*(-?\d+)/i);
  if (numRangeMatch) {
    return {
      mode: "number",
      min: parseInt(numRangeMatch[1], 10),
      max: parseInt(numRangeMatch[2], 10)
    };
  }
  if (
    /\b(?:pick a number|random number|number generator|random digit)\b/i.test(q)
  ) {
    return {
      mode: "number",
      min: 1,
      max: 100
    };
  }

  // Coinflip
  if (
    /\b(?:coinflip|coin-flip|flipcoin|coin flip|coin toss|flip coin|flip a coin|toss coin|toss a coin)\b/i.test(q) ||
    /\b(?:heads or tails|tails or heads)\b/i.test(q)
  ) {
    return { mode: "coin" };
  }

  return null;
}

function renderTemplate(tpl, data, context) {
  let result = tpl;
  for (const key of Object.keys(data)) {
    result = result.split(`{{${key}}}`).join(_esc(data[key]));
  }
  return result;
}

function _esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
