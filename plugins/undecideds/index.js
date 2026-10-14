import { randomInt as cryptoRandomInt } from "node:crypto";

let template = "";
const MAX_ABS_NUMBER = 1_000_000_000;

const YES_MESSAGES = [
  "{{ t:plugin-undecideds.absolutely }}",
  "{{ t:plugin-undecideds.yesDefinitely }}",
  "{{ t:plugin-undecideds.certain }}",
  "{{ t:plugin-undecideds.withoutADoubt }}",
  "{{ t:plugin-undecideds.outlookGood }}",
  "{{ t:plugin-undecideds.mostLikely }}",
  "{{ t:plugin-undecideds.signsPointToYes }}"
];

const NO_MESSAGES = [
  "{{ t:plugin-undecideds.noWay }}",
  "{{ t:plugin-undecideds.maybeNextTime }}",
  "{{ t:plugin-undecideds.dontCountOnIt }}",
  "{{ t:plugin-undecideds.sourcesSayNo }}",
  "{{ t:plugin-undecideds.doubtful }}",
  "{{ t:plugin-undecideds.outlookNotGood }}",
  "{{ t:plugin-undecideds.absolutelyNot }}"
];

const FALLBACK_TEMPLATE = `<div class="undecideds-slot" data-undecideds-slot data-active-tab="coin" data-die-type="d6" data-num-min="1" data-num-max="100">
  <div class="undecideds-slot__card">
    <div class="undecideds-slot__tabs-carousel" data-undecideds-tabs-carousel>
      <button class="undecideds-slot__tab-nav undecideds-slot__tab-nav--prev" type="button" data-undecideds-tab-scroll="left" aria-label="{{ t:plugin-undecideds.previousModes }}"><span aria-hidden="true">&lsaquo;</span></button>
      <div class="undecideds-slot__tabs" role="tablist" data-undecideds-tabs>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="coin" aria-selected="true">{{ t:plugin-undecideds.coinFlip }}</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="dice" aria-selected="false">{{ t:plugin-undecideds.rollDie }}</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="number" aria-selected="false">{{ t:plugin-undecideds.pickNumber }}</button>
        <button type="button" class="undecideds-slot__tab-btn" role="tab" data-tab="yesno" aria-selected="false">{{ t:plugin-undecideds.yesNo }}</button>
      </div>
      <button class="undecideds-slot__tab-nav undecideds-slot__tab-nav--next" type="button" data-undecideds-tab-scroll="right" aria-label="{{ t:plugin-undecideds.nextModes }}"><span aria-hidden="true">&rsaquo;</span></button>
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
      coin_result_label: "{{ t:plugin-undecideds.readyFlip }}",
      coin_ticker: "{{ t:plugin-undecideds.waiting }}",
      dice_result_d6: "1",
      dice_result_d20: "?",
      dice_result_label: "{{ t:plugin-undecideds.readyRoll }}",
      dice_ticker: "{{ t:plugin-undecideds.waiting }}",
      num_result: "?",
      num_result_label: "{{ t:plugin-undecideds.pickPrompt }}",
      yesno_result: yesnoResult,
      yesno_msg: "{{ t:plugin-undecideds.askYesNo }}",
      yesno_ticker: "{{ t:plugin-undecideds.waiting }}"
    };

    return { html: renderTemplate(template || FALLBACK_TEMPLATE, data) };
  }
};

export const slotPlugin = slot;
export default slot;

function parseQuery(query) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!]+$/g, "");
  if (!q) return null;

  if (
    /^(?:please\s+)?(?:yes\s*or\s*no|decide\s+yes\s+(?:or\s+)?no|answer\s+yes\s+(?:or\s+)?no|yesno|yes-no)(?:\s+please)?$/i.test(q) ||
    /^(?:should i|will i|will it)\b.+\byes\s*or\s*no$/i.test(q)
  ) {
    return { mode: "yesno" };
  }

  if (isDiceRoll(q)) {
    return { mode: "dice", dieType: isD20Dice(q) ? "d20" : "d6" };
  }

  const numRangeMatch = q.match(/^(?:please\s+)?(?:pick a number|random number|number between)\s+(-?\d+)\s*(?:-|to|and)\s*(-?\d+)$/i) ||
                        q.match(/^(?:please\s+)?(-?\d+)\s*(?:-|to|and)\s*(-?\d+)\s+(?:pick a number|random number|number generator)$/i) ||
                        q.match(/^(?:please\s+)?random\s+number\s*(?:from)?\s*(-?\d+)\s*(?:to|and)\s*(-?\d+)$/i);
  if (numRangeMatch) {
    return { mode: "number", min: parseInt(numRangeMatch[1], 10), max: parseInt(numRangeMatch[2], 10) };
  }

  if (/^(?:please\s+)?(?:pick a number|random number|number generator|random digit)(?:\s+please)?$/i.test(q)) {
    return { mode: "number", min: 1, max: 100 };
  }

  if (/^(?:please\s+)?(?:coinflip|coin-flip|flipcoin|coin flip|coin toss|flip coin|flip a coin|toss coin|toss a coin|heads or tails|tails or heads)(?:\s+please)?$/i.test(q)) {
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
