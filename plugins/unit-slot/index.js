let template = "";
import convert from "./convert-units.cjs.js";

// ── Build Alias Map ──────────────────────────────────────────
const ALIASES = {
  "ltr": "l", "ltrs": "l",
  "yrd": "yd", "yrds": "yd", "yr": "year", "yrs": "year",
  "sqft": "ft2", "sqm": "m2", "sqkm": "km2", "sqmi": "mi2", "sqin": "in2",
  "floz": "fl-oz",
  "kph": "km/h", "mph": "m/h",
  "c": "C", "f": "F", "k": "K",
  "sec": "s", "secs": "s", "mins": "min",
};

const SUPPORTED_MEASURES = convert().measures();

// Pre-compute all unit definitions to embed in the client as well
const ALL_UNITS = [];
for (const measure of SUPPORTED_MEASURES) {
  for (const abbr of convert().possibilities(measure)) {
    const desc = convert().describe(abbr);
    ALL_UNITS.push(desc);
    ALIASES[abbr.toLowerCase()] = abbr;
    ALIASES[desc.singular.toLowerCase()] = abbr;
    ALIASES[desc.plural.toLowerCase()] = abbr;
  }
}

// Sort by length descending to match longest first (e.g. "fluid ounces" before "fluid")
const _aliasKeys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
const UNIT_REGEX = new RegExp(`\\b(?:${_aliasKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");

const COMMAND_PREFIX_RE = /^!(unit|convert|conv)\b/i;

// ── Query parser ──────────────────────────────────────────────
function parseQuery(query) {
  // Separate numbers and letters so "100C to F" becomes "100 C to F"
  let q = query.trim().toLowerCase().replace(/(\d)([a-z]+)/gi, "$1 $2");
  
  const clean = q
    .replace(/^!(unit|convert|conv)\s*/i, "")
    .replace(/\b(to|into|=)\b/g, " TO ")
    .trim();

  const amountMatch = clean.match(/(-?\d[\d\s,']*(?:\.\d+)?)/);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/[\s,]/g, "").replace(/'/g, ""))
    : 1;

  const matches = [...clean.matchAll(UNIT_REGEX)].map(m => m[0].toLowerCase());
  
  if (matches.length >= 2) {
    let from = ALIASES[matches[0]];
    let to = ALIASES[matches[1]];
    
    // Heuristic: If "oz" is used with a volume unit, assume they meant "fl-oz"
    try {
      const fromIsVol = convert().describe(from).measure === "volume";
      const toIsVol = convert().describe(to).measure === "volume";
      if (from === "oz" && toIsVol) from = "fl-oz";
      if (to === "oz" && fromIsVol) to = "fl-oz";
    } catch (e) {}

    // Ensure they are in the same category
    try {
      const fromMeasure = convert().describe(from).measure;
      const toMeasure = convert().describe(to).measure;
      if (fromMeasure === toMeasure) {
        return { amount, from, to, measure: fromMeasure };
      }
    } catch (e) {
      // Ignore if unknown
    }
  }
  return null;
}

// ── Slot export ───────────────────────────────────────────────
export const slot = {
  id: "unit-slot",
  name: "Unit Converter",
  description: "Unit converter for length, mass, volume, temperature, and more. Supports natural queries like '12 ft to in' or '!unit 100c f'.",
  position: "above-results",

  init(ctx) {
    template = ctx.template;
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    if (COMMAND_PREFIX_RE.test(q)) return true;
    const parsed = parseQuery(q);
    return parsed !== null;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    const parsed = parseQuery(query);
    if (!parsed) return { html: "" };

    const { amount, from, to, measure } = parsed;
    
    let result = 0;
    try {
      result = convert(amount).from(from).to(to);
    } catch (e) {
      return { html: "" };
    }

    const fromDesc = convert().describe(from);
    const toDesc = convert().describe(to);

    const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);
    const resultStr = result >= 1000 ? _fmt(result, 2) : result >= 1 ? _fmt(result, 4) : _fmt(result, 6);

    const html = template
      .split("{{from_code}}").join(from)
      .split("{{from_name}}").join(_esc(fromDesc.plural))
      .split("{{to_code}}").join(to)
      .split("{{to_name}}").join(_esc(toDesc.plural))
      .split("{{amount_for_js}}").join(amount)
      .split("{{amount}}").join(amountStr)
      .split("{{result}}").join(resultStr)
      .split("{{measure}}").join(measure);

    return { html };
  },
};

export const slotPlugin = slot;
export default slot;

function _fmt(n, decimals) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function _esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
