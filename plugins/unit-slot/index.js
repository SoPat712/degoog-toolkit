let template = "";
function t(key) {
  return `{{ t:plugin-unit-slot.${key} }}`;
}
import convert from "./convert-units.js";
import {
  hasNumericConversionPattern,
  isUnitConversionIn,
} from "./query-guards.js";

const ALIASES = {
  ltr: "l",
  ltrs: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  yrd: "yd",
  yrds: "yd",
  yr: "year",
  yrs: "year",
  sqft: "ft2",
  sqm: "m2",
  sqkm: "km2",
  sqmi: "mi2",
  sqin: "in2",
  floz: "fl-oz",
  "fl oz": "fl-oz",
  "fluid ounce": "fl-oz",
  "fluid ounces": "fl-oz",
  kph: "km/h",
  mph: "m/h",
  c: "C",
  f: "F",
  k: "K",
  sec: "s",
  secs: "s",
  mins: "min",
  hr: "h",
  hrs: "h",
  lbs: "lb",
  gals: "gal",
  qts: "qt",
  pt: "pnt",
  pts: "pnt",
  tbsp: "Tbs",
  tbsps: "Tbs",
  kms: "km",
  cms: "cm",
  mls: "ml",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  kilometer: "km",
  kilometers: "km",
  centimeter: "cm",
  centimeters: "cm",
  millimeter: "mm",
  millimeters: "mm",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milligram: "mg",
  milligrams: "mg",
};

const SUPPORTED_MEASURES = convert().measures();
const CASED_DIGITAL_ALIASES = new Map();

const ALL_UNITS = [];
for (const measure of SUPPORTED_MEASURES) {
  for (const abbr of convert().possibilities(measure)) {
    const desc = convert().describe(abbr);
    ALL_UNITS.push(desc);
    if (measure === "digital" || measure === "dataRate") {
      CASED_DIGITAL_ALIASES.set(abbr, abbr);
      if (abbr.startsWith("K") && abbr.includes("B")) CASED_DIGITAL_ALIASES.set("k" + abbr.slice(1), abbr);
      if (measure === "dataRate") {
        const perSecond = abbr.replace("/s", "ps");
        CASED_DIGITAL_ALIASES.set(perSecond, abbr);
        ALIASES[perSecond.toLowerCase()] = abbr;
      }
    }
    ALIASES[abbr.toLowerCase()] = abbr;
    const sing = desc.singular.toLowerCase();
    const plur = desc.plural.toLowerCase();
    addAlias(sing, abbr);
    addAlias(plur, abbr);
    addNameVariants(sing, abbr);
    addNameVariants(plur, abbr);
  }
}

// Lowercase storage shorthand keeps its familiar byte meaning. Rate shorthand
// such as mbps means bits; an explicit uppercase B always means bytes.
for (const prefix of ["", "K", "M", "G", "T", "P", "E", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei"]) {
  const bit = prefix + "b";
  const byte = prefix + "B";
  const lower = prefix.toLowerCase();
  for (const alias of [lower + "bps", lower + "bit/s", lower + "bits/s", lower + "b/s"]) ALIASES[alias] = bit + "/s";
  for (const alias of [lower + "bit", lower + "bits"]) ALIASES[alias] = bit;
  for (const alias of [lower + "byte", lower + "bytes"]) ALIASES[alias] = byte;
  for (const alias of [lower + "byte/s", lower + "bytes/s"]) ALIASES[alias] = byte + "/s";
}

// "t" is the SI symbol for the metric tonne; the library's "t" is the US short
// ton, which stays reachable through "ton" and "short ton".
for (const alias of ["t", "tonne", "tonnes", "metric ton", "metric tons"]) ALIASES[alias] = "mt";
for (const alias of ["short ton", "short tons"]) ALIASES[alias] = "t";
// Micro prefixes are normalised from µ/μ to "u" before matching.
for (const alias of ["ug", "ugs"]) ALIASES[alias] = "mcg";

// Qualified units the bundled library cannot convert. Refusing beats silently
// answering with the statute mile, US gallon, or short ton.
const UNSUPPORTED_UNIT_RE =
  /\b(?:nautical\s+miles?|n\.?\s?mi|(?:imperial|uk|british)\s+(?:gallons?|gal|pints?|pnt|pt|quarts?|qt|cups?|fluid\s+ounces?|fl\.?\s*oz|tons?)|metric\s+(?:cups?|teaspoons?|tablespoons?)|long\s+tons?)\b/i;

function resolveAlias(raw) {
  const exact = CASED_DIGITAL_ALIASES.get(raw);
  if (exact) return exact;
  const rate = raw.match(/^([kmgtpe](?:i)?)?([bB])(?:\/s|ps)$/i);
  if (rate) {
    const prefix = rate[1] ? rate[1][0].toUpperCase() + (rate[1].length > 1 ? "i" : "") : "";
    return CASED_DIGITAL_ALIASES.get(prefix + rate[2] + "/s");
  }
  return ALIASES[raw.toLowerCase()];
}

const _aliasKeys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
const UNIT_REGEX = new RegExp(
  `\\b(?:${_aliasKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi",
);

const COMMAND_PREFIX_RE = /^!(unit|convert|conv)\b/i;
const CONVERTER_LAUNCHER_RE =
  /^(?:(?:unit|measurement)\s+convert(?:er|or)|unit\s+conversion|convert\s+units?|conversion\s+calculator)\s*[?!.,;:]*$/i;
const GLUED_CONNECTORS = ["into", "to", "in"];

const COMPACT_ALIASES = new Map();
const CASED_COMPACT_ALIASES = new Map();
for (const [alias, abbr] of CASED_DIGITAL_ALIASES) {
  CASED_COMPACT_ALIASES.set(compactUnit(alias, true), abbr);
}
for (const [alias, abbr] of Object.entries(ALIASES)) {
  const compact = compactUnit(alias);
  if (compact && !COMPACT_ALIASES.has(compact)) {
    COMPACT_ALIASES.set(compact, abbr);
  }
}

function resolveCompactAlias(raw) {
  return CASED_COMPACT_ALIASES.get(raw) || resolveAlias(raw) || COMPACT_ALIASES.get(raw.toLowerCase());
}

// Standalone amounts only: a digit glued to letters ("m2", "ft3") is part of a
// unit. Alternatives run from most to least specific; the trailing lookahead
// rejects partial matches such as "1" out of "1,5,3".
const AMOUNT_RE =
  /(?<![\p{L}\p{N}_.,'\/-])(-?)(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d{1,3}(?:([,' ])\d{3})(?:\8\d{3})*(?:\.\d+)?)|(\d+),(\d{1,2})|(\d*\.\d+|\d+))(?![\d.,'\/]*\d)/u;

function findAmount(text) {
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  let value;
  if (match[2] !== undefined) {
    value = Number(match[2]) + Number(match[3]) / Number(match[4]);
  } else if (match[5] !== undefined) {
    value = Number(match[5]) / Number(match[6]);
  } else if (match[7] !== undefined) {
    value = Number(match[7].replace(/[,' ]/g, ""));
  } else if (match[9] !== undefined) {
    value = Number(`${match[9]}.${match[10]}`);
  } else {
    value = Number(match[11]);
  }
  return { value: sign * value, index: match.index, end: match.index + match[0].length };
}

const HOW_MANY_RE =
  /^how\s+many\s+(?<target>.+?)\s+(?:are\s+(?:there\s+)?)?in\s+(?:(?:a|an|one|the)\s+)?(?<source>.+?)\s*\??$/i;

// "how many feet in a mile" asks for 1 mile expressed in feet.
function parseHowManyQuery(query) {
  const match = query.match(HOW_MANY_RE);
  if (!match) return null;
  const amount = findAmount(match.groups.source);
  if (findAmount(match.groups.target)) return null;
  const sourceUnit = amount
    ? match.groups.source.slice(0, amount.index) + match.groups.source.slice(amount.end)
    : match.groups.source;
  const to = resolveUnitPhrase(match.groups.target);
  const from = resolveUnitPhrase(sourceUnit);
  if (!to || !from) return null;
  const parsed = normalizeUnitPair(from, to);
  return parsed ? { amount: amount ? amount.value : 1, ...parsed } : null;
}

function resolveUnitPhrase(phrase) {
  const normalized = String(phrase || "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return resolveAlias(normalized) || resolveCompactAlias(compactUnit(normalized, true)) || null;
}

function parseQuery(query) {
  if (query.trim().startsWith("#")) return null;

  let q = query
    .trim()
    .replace(/[µμ]s\b/g, "mu")
    .replace(/[µμ]/g, "u")
    .replace(/(\d)([a-z]+)/gi, "$1 $2");

  if (UNSUPPORTED_UNIT_RE.test(q)) return null;

  const howMany = parseHowManyQuery(q);
  if (howMany) return howMany;

  const explicitCommand = COMMAND_PREFIX_RE.test(q);
  if (
    CONVERTER_LAUNCHER_RE.test(q) ||
    /^!(?:unit|convert|conv)\s*[?!.,;:]*$/i.test(q)
  ) {
    return { amount: 1, from: "m", to: "ft", measure: "length" };
  }
  const hasConversionIntent = explicitCommand || hasNaturalConversionIntent(q);
  if (!explicitCommand && isCountdownDateQuery(q)) return null;

  const clean = q
    .replace(/^!(unit|convert|conv)\s*/i, "")
    .replace(/\b(to|into|=)\b/gi, " TO ")
    .replace(/\bin\b/gi, replaceInConnector)
    .trim();

  const amountMatch = findAmount(clean);
  // A standalone number that is not a recognisable amount ("1.000,50", "1,5,3")
  // is ambiguous; refuse rather than convert a default of 1.
  if (!amountMatch && /(?<![\p{L}_])\d/u.test(clean)) return null;
  const amount = amountMatch ? amountMatch.value : 1;
  if (!Number.isFinite(amount)) return null;

  if (!amountMatch && !hasConversionIntent) return null;

  const matches = findUnitMatches(clean);
  if (matches.length < 2) return null;

  if (!amountMatch && !explicitCommand && !hasNumericConversionPattern(q)) {
    const hasConnector =
      /\b(?:to|into)\b/i.test(q) || isUnitConversionIn(q, isCompactUnitToken);
    if (!hasConnector) return null;
  }

  const afterAmount = amountMatch
    ? matches.filter((match) => match.index >= amountMatch.end)
    : matches;
  const beforeAmount = amountMatch
    ? matches.filter((match) => match.end <= amountMatch.index)
    : [];

  return (
    chooseUnitPair(amount, afterAmount) ||
    chooseTargetBeforeAmount(amount, beforeAmount, afterAmount) ||
    chooseUnitPair(amount, matches)
  );
}

function hasNaturalConversionIntent(query) {
  if (hasNumericConversionPattern(query)) return true;

  if (
    query
      .split(/\s+/)
      .some((token) => splitCompactUnitToken(token).some((part) => part.score === 2))
  ) {
    return true;
  }

  if (/\bin\b/i.test(query) && isUnitConversionIn(query, isCompactUnitToken)) {
    return true;
  }

  if (/\b(?:to|into)\b|=/i.test(query)) return true;
  return false;
}

function isCountdownDateQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  const unitRelation = q.match(
    /^(?:please\s+)?(?:how\s+many\s+)?(?:years?|yrs?|months?|mos?|weeks?|wks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?)\s+(?:are\s+there\s+)?(?:until|till|til|since)\s+(?<target>.+)$/i,
  );
  if (!unitRelation?.groups?.target) return false;
  return isLikelyDateTarget(unitRelation.groups.target);
}

function isLikelyDateTarget(target) {
  const t = String(target || "")
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  if (!t) return false;

  return (
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(t) ||
    /\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i.test(t) ||
    /\b(today|tomorrow|tonight|eod|christmas|halloween|valentine|independence|new year)\b/i.test(t) ||
    /\b(?:next|last|this)\s+(?:week|month|year|mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)\b/i.test(t) ||
    /^\d{4}-\d{1,2}-\d{1,2}(?:\s|$)/.test(t) ||
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s|$)/.test(t) ||
    /^[1-9]\d{2,3}$/.test(t)
  );
}

function addAlias(alias, abbr) {
  const normalized = String(alias).trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized) ALIASES[normalized] = abbr;
}

function addNameVariants(name, abbr) {
  const variants = new Set([name]);
  variants.add(name.replace(/-/g, " "));
  variants.add(name.replace(/litres\b/g, "liters"));
  variants.add(name.replace(/litre\b/g, "liter"));
  variants.add(name.replace(/metres\b/g, "meters"));
  variants.add(name.replace(/metre\b/g, "meter"));
  variants.add(name.replace(/amperes\b/g, "amps"));
  variants.add(name.replace(/ampere\b/g, "amp"));

  for (const variant of variants) {
    addAlias(variant, abbr);
    if (variant.includes("-")) addAlias(variant.replace(/-/g, " "), abbr);
  }
}

function replaceInConnector(match, index, query) {
  const before = query.slice(0, index).trimEnd().match(/([a-z0-9./-]+)$/i)?.[1];
  const after = query.slice(index + match.length).trimStart().match(/^([a-z0-9./-]+)/i)?.[1];

  if (isCompactUnitToken(before) && isCompactUnitToken(after)) {
    return " TO ";
  }

  return match;
}

function isCompactUnitToken(token) {
  if (!token) return false;
  return COMPACT_ALIASES.has(compactUnit(token));
}

function findUnitMatches(query) {
  const matches = [];

  for (const match of query.matchAll(UNIT_REGEX)) {
    addUnitMatch(matches, {
      text: match[0],
      abbr: resolveAlias(match[0]),
      index: match.index,
      end: match.index + match[0].length,
      score: 0,
    });
  }

  for (const match of query.matchAll(/[a-z][a-z0-9./-]*/gi)) {
    for (const part of splitCompactUnitToken(match[0])) {
      addUnitMatch(matches, {
        text: part.text,
        abbr: part.abbr,
        index: match.index + part.start,
        end: match.index + part.end,
        score: part.score,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const match of matches) {
    const key = `${match.index}:${match.end}:${match.abbr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }

  // A sub-token that overlaps a longer unit ("F"+"l" inside "fl oz", "ounces"
  // inside "fluid ounces") is a fragment, not a second unit.
  const longest = deduped.filter(
    (match) =>
      !deduped.some(
        (other) =>
          other.end - other.index > match.end - match.index &&
          other.index < match.end &&
          match.index < other.end,
      ),
  );

  return filterConnectorUnits(
    longest.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      if (a.score !== b.score) return a.score - b.score;
      return b.text.length - a.text.length;
    }),
  );
}

function addUnitMatch(matches, match) {
  if (!match.abbr) return;
  matches.push(match);
}

function splitCompactUnitToken(token) {
  const originalCase = compactUnit(token, true);
  const compact = originalCase.toLowerCase();
  if (!compact) return [];

  const parts = [];
  const whole = resolveAlias(token) || resolveCompactAlias(originalCase);
  if (whole) {
    parts.push({
      text: token,
      abbr: whole,
      start: 0,
      end: token.length,
      score: 1,
    });
  }

  for (const connector of GLUED_CONNECTORS) {
    if (compact.startsWith(connector) && compact.length > connector.length) {
      const abbr = resolveCompactAlias(originalCase.slice(connector.length));
      if (abbr) {
        parts.push({
          text: compact.slice(connector.length),
          abbr,
          start: connector.length,
          end: token.length,
          score: 2,
        });
      }
    }

    if (compact.endsWith(connector) && compact.length > connector.length) {
      const abbr = resolveCompactAlias(originalCase.slice(0, -connector.length));
      if (abbr) {
        parts.push({
          text: compact.slice(0, -connector.length),
          abbr,
          start: 0,
          end: token.length - connector.length,
          score: 2,
        });
      }
    }

    for (let i = 1; i < compact.length - connector.length; i += 1) {
      if (compact.slice(i, i + connector.length) !== connector) continue;
      const left = resolveCompactAlias(originalCase.slice(0, i));
      const right = resolveCompactAlias(originalCase.slice(i + connector.length));
      if (left && right) {
        parts.push({
          text: compact.slice(0, i),
          abbr: left,
          start: 0,
          end: i,
          score: 2,
        });
        parts.push({
          text: compact.slice(i + connector.length),
          abbr: right,
          start: i + connector.length,
          end: token.length,
          score: 2,
        });
      }
    }
  }

  if (!whole && compact.length <= 12) {
    for (let i = 1; i < compact.length; i += 1) {
      const left = resolveCompactAlias(originalCase.slice(0, i));
      const right = resolveCompactAlias(originalCase.slice(i));
      if (left && right) {
        parts.push({
          text: compact.slice(0, i),
          abbr: left,
          start: 0,
          end: i,
          score: 3,
        });
        parts.push({
          text: compact.slice(i),
          abbr: right,
          start: i,
          end: token.length,
          score: 3,
        });
        break;
      }
    }
  }

  return parts;
}

function filterConnectorUnits(matches) {
  return matches.filter((match) => {
    if (match.abbr !== "in" || compactUnit(match.text) !== "in") return true;

    const hasUnitBefore = matches.some(
      (other) => other !== match && other.end <= match.index,
    );
    const hasUnitAfter = matches.some(
      (other) => other !== match && other.index >= match.end,
    );

    return !(hasUnitBefore && hasUnitAfter);
  });
}

function chooseTargetBeforeAmount(amount, beforeAmount, afterAmount) {
  if (beforeAmount.length === 0 || afterAmount.length === 0) return null;

  const source = afterAmount[0];
  for (let i = beforeAmount.length - 1; i >= 0; i -= 1) {
    const parsed = normalizeUnitPair(source.abbr, beforeAmount[i].abbr);
    if (parsed) return { amount, ...parsed };
  }

  return null;
}

function chooseUnitPair(amount, matches) {
  if (matches.length < 2) return null;

  for (let i = 0; i < matches.length - 1; i += 1) {
    for (let j = i + 1; j < matches.length; j += 1) {
      const parsed = normalizeUnitPair(matches[i].abbr, matches[j].abbr);
      if (parsed) return { amount, ...parsed };
    }
  }

  return null;
}

function normalizeUnitPair(from, to) {
  if (from === to) return null;
  try {
    let fromDesc = convert().describe(from);
    let toDesc = convert().describe(to);

    if (from === "oz" && toDesc.measure === "volume") {
      from = "fl-oz";
      fromDesc = convert().describe(from);
    }
    if (to === "oz" && fromDesc.measure === "volume") {
      to = "fl-oz";
      toDesc = convert().describe(to);
    }
    if (from === to) return null;

    if (fromDesc.measure === toDesc.measure) {
      return { from, to, measure: fromDesc.measure };
    }
  } catch {}

  return null;
}

function compactUnit(value, preserveCase = false) {
  const normalized = String(value)
    .replace(/\u00b5/g, "u")
    .replace(/\u03bc/g, "u")
    .replace(/\u00b2/g, "2")
    .replace(/\u00b3/g, "3")
    .replace(/[^a-z0-9]+/gi, "");
  return preserveCase ? normalized : normalized.toLowerCase();
}

function isTranslation(q) {
  return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) ||
         /how (do|would|can) you say\b/i.test(q);
}

export const slot = {
  id: "unit-slot",
  name: "Unit Converter",
  description:
    "Unit converter for length, mass, volume, temperature, and more. Supports fuzzy natural queries like '25.4oz toml'.",
  isClientExposed: false,
  position: "knowledge-panel",
  slotPositions: ["above-results", "knowledge-panel"],

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    if (COMMAND_PREFIX_RE.test(q)) return true;

    if (isTranslation(q)) return false;

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
    } catch { return { html: "" }; }
    if (!Number.isFinite(result)) return { html: "" };

    // The field holds the typed value, grouped but not rounded.
    const amountStr = amount.toLocaleString("en-US", { maximumFractionDigits: 10 });
    const resultStr = _fmt(result);

    const html = template
      .split("{{t_unit_converter}}")
      .join(t("unitConverter", context))
      .split("{{from_code}}")
      .join(from)
      .split("{{to_code}}")
      .join(to)
      .split("{{from_label}}")
      .join(_esc(unitSymbol(from)))
      .split("{{to_label}}")
      .join(_esc(unitSymbol(to)))
      .split("{{amount_short}}")
      .join(_fmt(amount))
      .split("{{amount_len}}")
      .join(String(amountStr.length))
      .split("{{result_len}}")
      .join(String(resultStr.length))
      .split("{{amount_for_js}}")
      .join(amount)
      .split("{{amount}}")
      .join(amountStr)
      .split("{{result}}")
      .join(resultStr)
      .split("{{measure}}")
      .join(measure);

    return { html, title: "" };
  },
};

export const slotPlugin = slot;
export default slot;

// One number style everywhere (answer, equation, tiles): six significant
// digits, grouped, without padding zeros, so 1234567890 B reads 1.23457 GB in
// each place. Whole digits are never rounded away (1,234,567,890), and only
// extreme magnitudes switch to exponent form. Mirrors fmt() in card.js.
function _fmt(n) {
  const value = Number(n);
  const magnitude = Math.abs(value);
  if (value !== 0 && (magnitude < 0.000001 || magnitude >= 1e15)) {
    return value.toExponential(5).replace(/\.?0+e/, "e").replace("e+", "e");
  }
  if (magnitude < 1) {
    return value.toLocaleString("en-US", { maximumSignificantDigits: 6 });
  }
  const wholeDigits = Math.floor(Math.log10(magnitude)) + 1;
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Math.max(0, 6 - wholeDigits),
  });
}

// Display symbols where the converter's codes read poorly: degree signs, and
// "t" for the metric tonne (the library's "t" is the US short ton, shown as
// "ton"). Codes themselves stay as they are for conversion.
const UNIT_SYMBOLS = { C: "°C", F: "°F", R: "°R", mt: "t", t: "ton" };
function unitSymbol(code) {
  return UNIT_SYMBOLS[code] || code;
}
function _esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
