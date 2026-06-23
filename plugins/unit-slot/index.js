let template = "";
function t(key) {
  return `{{ t:plugin-unit-slot.${key} }}`;
}
import convert from "./convert-units.js";
import {
  hasNumericConversionPattern,
  isInformationalQuestion,
  isUnitConversionIn,
} from "./query-guards.js";

// ── Build Alias Map ──────────────────────────────────────────
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

// Pre-compute all unit definitions to embed in the client as well
const ALL_UNITS = [];
for (const measure of SUPPORTED_MEASURES) {
  for (const abbr of convert().possibilities(measure)) {
    const desc = convert().describe(abbr);
    ALL_UNITS.push(desc);
    ALIASES[abbr.toLowerCase()] = abbr;
    const sing = desc.singular.toLowerCase();
    const plur = desc.plural.toLowerCase();
    addAlias(sing, abbr);
    addAlias(plur, abbr);
    addNameVariants(sing, abbr);
    addNameVariants(plur, abbr);
  }
}

const TRANSLATED_ALIASES = {
  // Length
  "metro": "m", "metros": "m", "mètre": "m", "mètres": "m",
  "kilómetro": "km", "kilómetros": "km", "kilometro": "km", "kilometros": "km", "kilomètre": "km", "kilomètres": "km",
  "centímetro": "cm", "centímetros": "cm", "centimetro": "cm", "centimetros": "cm", "centimètre": "cm", "centimètres": "cm",
  "milímetro": "mm", "milímetros": "mm", "milimetro": "mm", "milimetros": "mm", "millimètre": "mm", "millimètres": "mm",
  "pulgada": "in", "pulgadas": "in", "pouce": "in", "pouces": "in", "zoll": "in",
  "pie": "ft", "pies": "ft", "pied": "ft", "pieds": "ft", "fuß": "ft",
  "yarda": "yd", "yardas": "yd", "verge": "yd", "verges": "yd",
  "milla": "mi", "millas": "mi", "milos": "mi", "milas": "mi", "mille": "mi", "milles": "mi", "meile": "mi", "meilen": "mi",
  
  // Mass
  "gramo": "g", "gramos": "g", "gramme": "g", "grammes": "g",
  "kilogramo": "kg", "kilogramos": "kg", "kilogramme": "kg", "kilogrammes": "kg",
  "miligramo": "mg", "miligramos": "mg", "milligramme": "mg", "milligrammes": "mg",
  "libra": "lb", "libras": "lb", "livre": "lb", "livres": "lb", "pfund": "lb",
  "onza": "oz", "onzas": "oz", "once": "oz", "onces": "oz", "unze": "oz", "unzen": "oz",
  "tonelada": "t", "toneladas": "t", "tonne": "t", "tonnes": "t",
  
  // Volume
  "litro": "l", "litros": "l", "litre": "l", "litres": "l",
  "mililitro": "ml", "mililitros": "ml", "millilitre": "ml", "millilitres": "ml",
  "galón": "gal", "galones": "gal", "galon": "gal", "galons": "gal",
  "pinta": "pnt", "pintas": "pnt", "pinte": "pnt", "pintes": "pnt",
  "taza": "cup", "tazas": "cup", "tasse": "cup", "tasses": "cup",
  "onza líquida": "fl-oz", "onzas líquidas": "fl-oz", "once liquide": "fl-oz", "onces liquides": "fl-oz",
  
  // Temperature
  "celsius": "C", "centígrados": "C", "centigrados": "C", "fahrenheit": "F", "kelvin": "K",
  
  // Area
  "metro cuadrado": "m2", "metros cuadrados": "m2", "mètre carré": "m2", "mètres carrés": "m2",
  "hectárea": "ha", "hectáreas": "ha", "hectare": "ha", "hectares": "ha",
  "acre": "ac", "acres": "ac",
  
  // Speed
  "kilómetros por hora": "km/h", "kilometros por hora": "km/h", "kilomètres par heure": "km/h",
  "millas por hora": "m/h", "milles par heure": "m/h",
  
  // Time
  "segundo": "s", "segundos": "s", "seconde": "s", "secondes": "s", "sekunde": "s", "sekunden": "s",
  "minuto": "min", "minutos": "min", "minute": "min", "minutes": "min", "minuten": "min",
  "hora": "h", "horas": "h", "heure": "h", "heures": "h", "stunde": "h", "stunden": "h",
  "día": "d", "días": "d", "dia": "d", "dias": "d", "jour": "d", "jours": "d", "tag": "d", "tage": "d",
  "semana": "week", "semanas": "week", "semaine": "week", "semaines": "week", "woche": "week", "wochen": "week",
  "mes": "month", "meses": "month", "mois": "month", "monat": "month", "monate": "month",
  "año": "year", "años": "year", "an": "year", "ans": "year", "année": "year", "années": "year", "jahr": "year", "jahre": "year",
  "ano": "year", "anos": "year",

  // Italian additions
  "chilometro": "km", "chilometri": "km",
  "metri": "m",
  "miglio": "mi", "miglia": "mi",
  "libra": "lb", "libras": "lb", "libbra": "lb", "libbre": "lb",
  "oncia": "oz",
  "grammo": "g", "grammi": "g",
  "chilogrammo": "kg", "chilogrammi": "kg",
  "litri": "l",
  "ora": "h", "ore": "h",
  "minuti": "min",
  "secondi": "s",
  "giorno": "d", "giorni": "d",
  "settimane": "week",
  "mesi": "month",
  "anni": "year",

  // German additions
  "gramm": "g",
  "kilogramm": "kg",
  "sekunden": "s",
  "minuten": "min",
  "stunden": "h",
  "tage": "d",
  "wochen": "week",
  "monate": "month",
  "jahre": "year"
};

for (const [key, val] of Object.entries(TRANSLATED_ALIASES)) {
  addAlias(key, val);
}

// Sort by length descending to match longest first (e.g. "fluid ounces" before "fluid")
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
for (const [alias, abbr] of Object.entries(ALIASES)) {
  const compact = compactUnit(alias);
  if (compact && !COMPACT_ALIASES.has(compact)) {
    COMPACT_ALIASES.set(compact, abbr);
  }
}

// ── Query parser ──────────────────────────────────────────────
function parseQuery(query, isExplicitCommand = false) {
  if (query.trim().startsWith("#")) return null;
  if (isInformationalQuestion(query)) return null;

  // Separate numbers and letters so "100C to F" becomes "100 C to F"
  let q = query
    .trim()
    .toLowerCase()
    .replace(/(\d)([a-z]+)/gi, "$1 $2");

  const explicitCommand = isExplicitCommand || COMMAND_PREFIX_RE.test(q);
  if (
    CONVERTER_LAUNCHER_RE.test(q) ||
    /^!(?:unit|convert|conv)\s*[?!.,;:]*$/i.test(q) ||
    (isExplicitCommand && q === "")
  ) {
    return { amount: 1, from: "m", to: "ft", measure: "length" };
  }
  const hasConversionIntent = explicitCommand || hasNaturalConversionIntent(q);
  if (!explicitCommand && isCountdownDateQuery(q)) return null;

  let clean = q.replace(/^!(unit|convert|conv)\s*/i, "");
  if (explicitCommand) {
    clean = clean
      .replace(/\b(to|into|=|a|à|para|em|en|in|nach|zu|do|na|w)\b/g, " TO ")
      .trim();
  } else {
    clean = clean
      .replace(/\b(to|into|=)\b/g, " TO ")
      .replace(/\bin\b/g, replaceInConnector)
      .trim();
  }

  const amountMatch = clean.match(/(-?\d[\d\s,']*(?:\.\d+)?)/);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/[\s,]/g, "").replace(/'/g, ""))
    : 1;

  if (!amountMatch && !hasConversionIntent) return null;

  const matches = findUnitMatches(clean);
  if (matches.length < 2) return null;

  // Without a number or explicit connector, reject long prose that merely mentions
  // unit words (e.g. "how many days of the week …").
  if (!amountMatch && !explicitCommand && !hasNumericConversionPattern(q)) {
    const hasConnector =
      /\b(?:to|into)\b/i.test(q) || isUnitConversionIn(q, isCompactUnitToken);
    if (!hasConnector) return null;
  }

  const afterAmount = amountMatch
    ? matches.filter(
        (match) => match.index >= amountMatch.index + amountMatch[0].length,
      )
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

  // Plain English "in them / in the week" is not a conversion connector.
  if (/\bin\b/i.test(query) && isUnitConversionIn(query, isCompactUnitToken)) {
    return true;
  }

  if (/\b(?:to|into)\b|=/.test(query)) return true;
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
      abbr: ALIASES[match[0].toLowerCase()],
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

  return filterConnectorUnits(
    deduped.sort((a, b) => {
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
  const compact = compactUnit(token);
  if (!compact) return [];

  const parts = [];
  const whole = COMPACT_ALIASES.get(compact);
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
      const abbr = COMPACT_ALIASES.get(compact.slice(connector.length));
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
      const abbr = COMPACT_ALIASES.get(compact.slice(0, -connector.length));
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
      const left = COMPACT_ALIASES.get(compact.slice(0, i));
      const right = COMPACT_ALIASES.get(compact.slice(i + connector.length));
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
      const left = COMPACT_ALIASES.get(compact.slice(0, i));
      const right = COMPACT_ALIASES.get(compact.slice(i));
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

    // Heuristic: If "oz" is used with a volume unit, assume they meant "fl-oz".
    if (from === "oz" && toDesc.measure === "volume") {
      from = "fl-oz";
      fromDesc = convert().describe(from);
    }
    if (to === "oz" && fromDesc.measure === "volume") {
      to = "fl-oz";
      toDesc = convert().describe(to);
    }

    if (fromDesc.measure === toDesc.measure) {
      return { from, to, measure: fromDesc.measure };
    }
  } catch {}

  return null;
}

function compactUnit(value) {
  return String(value)
    .toLowerCase()
    .replace(/\u00b5/g, "u")
    .replace(/\u03bc/g, "u")
    .replace(/\u00b2/g, "2")
    .replace(/\u00b3/g, "3")
    .replace(/[^a-z0-9]+/g, "");
}

function isTranslation(q) {
  return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) ||
         /how (do|would|can) you say\b/i.test(q);
}

// ── Slot export ───────────────────────────────────────────────
export const slot = {
  id: "unit-slot",
  name: "Unit Converter",
  description:
    "Unit converter for length, mass, volume, temperature, and more. Supports fuzzy natural queries like '25.4oz toml' or '!unit 100c f'.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  settingsSchema: [
    {
      key: "debugMode",
      label: "Debug mode",
      type: "toggle",
      default: false,
      description:
        "Log slot position and parser decisions to the server console.",
    },
  ],

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

    const parsed = parseQuery(query, context?.isExplicitCommand);
    if (!parsed) return { html: "" };

    const { amount, from, to, measure } = parsed;

    let result = 0;
    try {
      result = convert(amount).from(from).to(to);
    } catch { return { html: "" }; }

    const fromDesc = convert().describe(from);
    const toDesc = convert().describe(to);

    const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);
    const resultStr =
      result >= 1000
        ? _fmt(result, 2)
        : result >= 1
          ? _fmt(result, 4)
          : _fmt(result, 6);

    const html = template
      .split("{{t_unit_converter}}")
      .join(t("unitConverter", context))
      .split("{{from_code}}")
      .join(from)
      .split("{{from_name}}")
      .join(_esc(fromDesc.plural))
      .split("{{to_code}}")
      .join(to)
      .split("{{to_name}}")
      .join(_esc(toDesc.plural))
      .split("{{amount_for_js}}")
      .join(amount)
      .split("{{amount}}")
      .join(amountStr)
      .split("{{result}}")
      .join(resultStr)
      .split("{{measure}}")
      .join(measure);

    return { html };
  },
};

export const slotPlugin = slot;
export default slot;

export const command = {
  name: "Unit Converter",
  description: "Unit converter for length, mass, volume, temperature, and more.",
  trigger: "unit",
  aliases: ["convert", "conv"],
  naturalLanguagePhrases: [
    "convert",
    "unit converter",
    "convert units",
    "unit conversion"
  ],
  isClientExposed: false,
  async execute(args, context) {
    return slot.execute(args, { ...context, isExplicitCommand: true });
  }
};

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
