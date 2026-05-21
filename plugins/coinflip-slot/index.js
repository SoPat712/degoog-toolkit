let template = "";

const QUERY_PATTERNS = [
  /^(?:please\s+)?!?(?:coinflip|coin-flip|flipcoin|coin flip|coin toss|flip coin|flip a coin|toss coin|toss a coin)(?:\s+(?:please|now|for me|again))?$/i,
  /^(?:please\s+)?(?:heads or tails|tails or heads)(?:\s+(?:please|now|for me|again))?$/i,
  /^(?:please\s+)?(?:pick|choose)\s+(?:heads or tails|tails or heads)(?:\s+(?:please|now|for me|again))?$/i,
];

const FALLBACK_TEMPLATE = `
<div class="coinflip-slot" data-coinflip-slot data-result="{{result}}" data-flips="{{flips}}">
  <div class="coinflip-slot__panel">
    <div class="coinflip-slot__copy">
      <div class="coinflip-slot__eyebrow">Coin flip</div>
      <div class="coinflip-slot__result" data-coinflip-result aria-live="polite">{{result_label}}</div>
      <button class="coinflip-slot__button" type="button" data-coinflip-reroll>Flip again</button>
    </div>
    <div class="coinflip-slot__stage">
      <div class="coinflip-slot__coin-scene" aria-hidden="true">
        <div class="coinflip-slot__coin" data-coinflip-coin>
          <div class="coinflip-slot__face coinflip-slot__face--heads">
            <div class="coinflip-slot__face-spin" data-coinflip-spin>
              <span class="coinflip-slot__face-ring coinflip-slot__face-ring--outer"></span>
              <span class="coinflip-slot__face-ring coinflip-slot__face-ring--inner"></span>
              <span class="coinflip-slot__face-mark">H</span>
              <span class="coinflip-slot__face-label">HEADS</span>
            </div>
          </div>
          <div class="coinflip-slot__face coinflip-slot__face--tails">
            <div class="coinflip-slot__face-spin" data-coinflip-spin>
              <span class="coinflip-slot__face-ring coinflip-slot__face-ring--outer"></span>
              <span class="coinflip-slot__face-ring coinflip-slot__face-ring--inner"></span>
              <span class="coinflip-slot__face-mark">T</span>
              <span class="coinflip-slot__face-label">TAILS</span>
            </div>
          </div>
        </div>
        <div class="coinflip-slot__shadow"></div>
      </div>
      <div class="coinflip-slot__ticker" data-coinflip-ticker>landed {{result}}</div>
    </div>
  </div>
</div>`;

export const slot = {
  id: "coinflip-slot",
  name: "Coinflip",
  description:
    "Flips a realistic animated CSS coin for quick heads-or-tails decisions.",
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],

  init(ctx) {
    template = ctx.template || FALLBACK_TEMPLATE;
  },

  trigger(query) {
    return isCoinflipQuery(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    if (!isCoinflipQuery(query)) return { html: "" };

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const flips = 6 + Math.floor(Math.random() * 4);
    const resultLabel = result === "heads" ? "Heads" : "Tails";

    const html = (template || FALLBACK_TEMPLATE)
      .split("{{result_label}}")
      .join(_esc(resultLabel))
      .split("{{result}}")
      .join(_esc(result))
      .split("{{flips}}")
      .join(String(flips));

    return { title: "Coin flip", html };
  },
};

export const slotPlugin = slot;
export default slot;

function isCoinflipQuery(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");

  if (!q) return false;
  return QUERY_PATTERNS.some((pattern) => pattern.test(q));
}

function _esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
