let template = "";

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
  description: "A premium multi-mode decision-making dashboard featuring Coin Flip, Roll Die, Pick Number, and Yes or No decisions.",
  isClientExposed: false,
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],

  init(ctx) {
    template = ctx.template || FALLBACK_TEMPLATE;
  },

  trigger(query) {
    return parseQuery(query) !== null;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    
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
    const coinResultLabel = coinResult === "heads" ? "Heads" : "Tails";
    const displayCoinResult = shouldResolveCoin ? coinResult : "heads";

    const diceResultD6 = Math.floor(Math.random() * 6) + 1;
    const diceResultD20 = Math.floor(Math.random() * 20) + 1;
    const diceResult = dieType === "d20" ? diceResultD20 : diceResultD6;

    const numResult = Math.floor(Math.random() * (numMax - numMin + 1)) + numMin;

    const yesnoResult = Math.random() < 0.5 ? "yes" : "no";
    const yesnoMsg = yesnoResult === "yes" 
      ? YES_MESSAGES[Math.floor(Math.random() * YES_MESSAGES.length)]
      : NO_MESSAGES[Math.floor(Math.random() * NO_MESSAGES.length)];

    const data = {
      active_tab: activeTab,
      die_type: dieType,
      num_min: String(numMin),
      num_max: String(numMax),
      coin_result: displayCoinResult,
      coin_result_label: shouldResolveCoin ? coinResultLabel : "Ready to flip",
      coin_ticker: shouldResolveCoin ? `landed ${coinResult}` : "waiting",
      dice_result_d6: shouldResolveDice ? String(diceResultD6) : "1",
      dice_result_d20: shouldResolveDice ? String(diceResultD20) : "?",
      dice_result_label: shouldResolveDice ? `Rolled ${diceResult}` : "Ready to roll",
      dice_ticker: shouldResolveDice ? `landed ${diceResult}` : "waiting",
      num_result: shouldResolveNumber ? String(numResult) : "?",
      num_result_label: shouldResolveNumber ? `Picked ${numResult}` : "Pick a number",
      yesno_result: yesnoResult,
      yesno_msg: shouldResolveYesNo ? yesnoMsg : "Ask yes or no",
      yesno_ticker: shouldResolveYesNo ? `landed ${yesnoResult}` : "waiting"
    };

    const tpl = template || FALLBACK_TEMPLATE;
    const html = renderTemplate(tpl, data);

    return { html };
  }
};

export const slotPlugin = slot;
export default slot;

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
  const d20Match = /\bd20\b/i.test(q);
  if (
    /roll\s+(?:a\s+)?(?:die|dice)\b/i.test(q) ||
    /\bdice\s+roll\b/i.test(q) ||
    /\bdie\s+roll\b/i.test(q) ||
    /roll\s+d\d+\b/i.test(q) ||
    /roll\s+(?:a\s+)?d\d+\b/i.test(q) ||
    /\b(d6|d20|d8|d10|d12|d100)\b/i.test(q)
  ) {
    return {
      mode: "dice",
      dieType: d20Match ? "d20" : "d6"
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

function renderTemplate(tpl, data) {
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
