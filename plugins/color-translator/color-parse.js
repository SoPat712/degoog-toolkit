import { NAMED_COLORS } from "./named-colors.js";

export { NAMED_COLORS } from "./named-colors.js";
export { HEX_TO_NAME } from "./named-colors.js";

function normalizeNameKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\(([^)]*)\)\s*/g, (_, inner) => inner.replace(/\s+/g, ""))
    .replace(/[^a-z0-9]/g, "");
}

function lookupNamedColor(query) {
  const q = query.trim().toLowerCase();
  if (NAMED_COLORS[q]) return NAMED_COLORS[q];
  const compact = normalizeNameKey(query);
  if (compact && NAMED_COLORS[compact]) return NAMED_COLORS[compact];
  return null;
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hsbToRgb(h, s, b) {
  h /= 360;
  s /= 100;
  b /= 100;

  let r = 0;
  let g = 0;
  let bl = 0;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = b; g = t; bl = p; break;
    case 1: r = q; g = b; bl = p; break;
    case 2: r = p; g = b; bl = t; break;
    case 3: r = p; g = q; bl = b; break;
    case 4: r = t; g = p; bl = b; break;
    case 5: r = b; g = p; bl = q; break;
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)];
}

function cmykToRgb(c, m, y, k) {
  c /= 100;
  m /= 100;
  y /= 100;
  k /= 100;
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  return [r, g, b];
}

function parseCmykComponent(val) {
  const n = parseFloat(String(val).trim());
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function rgbFromCmykParts(parts) {
  if (parts.length < 4) return null;
  const c = parseCmykComponent(parts[0]);
  const m = parseCmykComponent(parts[1]);
  const y = parseCmykComponent(parts[2]);
  const k = parseCmykComponent(parts[3]);
  if (c === null || m === null || y === null || k === null) return null;
  const [r, g, b] = cmykToRgb(c, m, y, k);
  return { r, g, b, a: 1, sourceCmyk: [c, m, y, k] };
}

function parseHex(hex) {
  let r;
  let g;
  let b;
  let a = 1;
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 4) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
    a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  } else if (cleanHex.length === 8) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
    a = parseInt(cleanHex.slice(6, 8), 16) / 255;
  } else {
    return null;
  }
  if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
  return { r, g, b, a: Number(a.toFixed(3)) };
}

function parseComponent(val, max) {
  const trimmed = String(val).trim();
  let n;
  if (trimmed.endsWith("%")) {
    n = (parseFloat(trimmed) / 100) * max;
  } else {
    n = parseFloat(trimmed);
  }
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function parseAlpha(val) {
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  let n;
  if (trimmed.endsWith("%")) {
    n = parseFloat(trimmed) / 100;
  } else {
    n = parseFloat(trimmed);
  }
  if (Number.isNaN(n)) return null;
  return n;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function rgbResult(r, g, b, a = 1) {
  if (r === null || g === null || b === null || Number.isNaN(a)) return null;
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp(a, 0, 1)
  };
}

function splitParenArgs(inner) {
  let body = inner.trim();
  let alpha = null;
  const slashMatch = body.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slashMatch) {
    body = slashMatch[1].trim();
    alpha = parseAlpha(slashMatch[2]);
  }
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  return { parts, alpha };
}

const COLOR_INTENT_PREFIX = /^(?:!(?:color-translator|color|translate-color)|colou?r)\s+/i;
const COLOR_INTENT_SUFFIX = /\s+(?:(?:hex|rgb)\s+)?(?:colou?r|hex|rgb)(?:\s+(?:code|value))?$/i;

function stripColorIntent(query) {
  const trimmed = String(query || "").trim();
  const stripped = trimmed
    .replace(COLOR_INTENT_PREFIX, "")
    .replace(COLOR_INTENT_SUFFIX, "")
    .trim();
  return { stripped, hadIntent: stripped !== trimmed };
}

// Many color names are also everyday words ("rust", "salmon", "gold", "wine",
// "light"), so a bare name only opens the card when it can hardly mean anything
// else. Every other name needs intent: "salmon color", "color salmon",
// "salmon hex".
const BARE_COLOR_WORDS = new Set([
  "aureolin", "beige", "bistre", "celadon", "cerise", "cerulean", "chartreuse",
  "cinereous", "cyan", "feldgrau", "fuchsia", "fulvous", "gainsboro", "gamboge",
  "glaucous", "icterine", "isabelline", "magenta", "mauve", "puce", "sinopia",
  "taupe", "teal", "turquoise", "ultramarine", "vermillion", "viridian", "zaffre",
]);
// CSS keywords made of words that are not color terms on their own.
const BARE_COLOR_KEYWORDS = new Set([
  "blanchedalmond", "burlywood", "lavenderblush", "lemonchiffon", "mintcream",
  "mistyrose", "olivedrab", "papayawhip", "peachpuff",
]);
const BARE_COLOR_DENYLIST = new Set(["littleboyblue"]);
// "<qualifier> blue", "cornflowerblue", "dark slate gray"...
const COLOR_HEAD_RE = /^[a-z]{3,}(?:red|blue|green|yellow|orange|purple|pink|brown|black|white|gray|grey|violet|cyan|magenta|teal|turquoise|aquamarine)$/;
const SHADE_PREFIX_RE = /^(?:light|dark|medium|pale|deep|bright|vivid|neon|pastel)([a-z]{3,})$/;

function isBareColorName(name) {
  const key = normalizeNameKey(name).replace(/\d+$/, "");
  if (!key || BARE_COLOR_DENYLIST.has(key)) return false;
  if (BARE_COLOR_WORDS.has(key) || BARE_COLOR_KEYWORDS.has(key)) return true;
  if (COLOR_HEAD_RE.test(key)) return true;
  const shade = key.match(SHADE_PREFIX_RE);
  return Boolean(shade && NAMED_COLORS[shade[1]]);
}

/** Slot trigger only: whole query must be an exact named color or literal value. */
function tryParseExactColor(rawQuery, hadIntent) {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;
  const q = trimmed.toLowerCase();

  const namedHex = lookupNamedColor(trimmed);
  if (namedHex) {
    return hadIntent || isBareColorName(trimmed) ? parseHex(namedHex) : null;
  }

  const hexMatch = q.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const rawHex = hexMatch[1];
    const startsWithHash = q.startsWith("#");
    const isLongBareHex = (rawHex.length === 6 || rawHex.length === 8)
      && /[a-f]/i.test(rawHex)
      && /\d/.test(rawHex);
    if (startsWithHash || hadIntent || isLongBareHex) {
      return parseHex(rawHex);
    }
  }

  const parenRgb = q.match(/^rgba?\(\s*([^)]+)\)$/i);
  if (parenRgb) {
    const { parts, alpha } = splitParenArgs(parenRgb[1]);
    if (parts.length >= 3) {
      const r = parseComponent(parts[0], 255);
      const g = parseComponent(parts[1], 255);
      const b = parseComponent(parts[2], 255);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      const result = rgbResult(r, g, b, a ?? 1);
      if (result) return result;
    }
  }

  const parenHsl = q.match(/^hsla?\(\s*([^)]+)\)$/i);
  if (parenHsl) {
    const { parts, alpha } = splitParenArgs(parenHsl[1]);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      const l = parseFloat(parts[2]);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(l) && a !== null && !Number.isNaN(a)) {
        const [r, g, b] = hslToRgb(h, s, l);
        return { r, g, b, a: clamp(a, 0, 1) };
      }
    }
  }

  const parenHsb = q.match(/^hs[bv]a?\(\s*([^)]+)\)$/i);
  if (parenHsb) {
    const { parts, alpha } = splitParenArgs(parenHsb[1]);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(b) && a !== null && !Number.isNaN(a)) {
        const [r, g, bVal] = hsbToRgb(h, s, b);
        return { r, g, b: bVal, a: clamp(a, 0, 1) };
      }
    }
  }

  const parenCmyk = q.match(/^(?:device-)?cmyk\(\s*([^)]+)\)$/i);
  if (parenCmyk) {
    const { parts } = splitParenArgs(parenCmyk[1]);
    const parsed = rgbFromCmykParts(parts);
    if (parsed) return parsed;
  }

  const objcRgbMatch = q.match(/^(?:ui|ns)color\s+colorwith(?:calibrated|device)?red\s*:\s*([0-9.]+)\s+green\s*:\s*([0-9.]+)\s+blue\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?$/i);
  if (objcRgbMatch) {
    const r = Math.round(parseFloat(objcRgbMatch[1]) * 255);
    const g = Math.round(parseFloat(objcRgbMatch[2]) * 255);
    const b = Math.round(parseFloat(objcRgbMatch[3]) * 255);
    const a = objcRgbMatch[4] !== undefined ? parseFloat(objcRgbMatch[4]) : 1;
    return rgbResult(r, g, b, a);
  }

  const objcHsbMatch = q.match(/^(?:ui|ns)color\s+colorwith(?:calibrated|device)?hue\s*:\s*([0-9.]+)\s+saturation\s*:\s*([0-9.]+)\s+brightness\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?$/i);
  if (objcHsbMatch) {
    const h = parseFloat(objcHsbMatch[1]) * 360;
    const s = parseFloat(objcHsbMatch[2]) * 100;
    const b = parseFloat(objcHsbMatch[3]) * 100;
    const a = objcHsbMatch[4] !== undefined ? parseFloat(objcHsbMatch[4]) : 1;
    const [r, g, bVal] = hsbToRgb(h, s, b);
    return { r, g, b: bVal, a: clamp(a, 0, 1) };
  }

  const spaceRgbMatch = q.match(/^rgba?\s+([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceRgbMatch) {
    const r = parseComponent(spaceRgbMatch[1], 255);
    const g = parseComponent(spaceRgbMatch[2], 255);
    const b = parseComponent(spaceRgbMatch[3], 255);
    let a = 1;
    if (spaceRgbMatch[4] !== undefined) {
      a = parseAlpha(spaceRgbMatch[4]) ?? 1;
    } else if (spaceRgbMatch[5] !== undefined) {
      a = parseFloat(spaceRgbMatch[5]);
    }
    const result = rgbResult(r, g, b, a);
    if (result) return result;
  }

  const spaceHslMatch = q.match(/^hsla?\s+([0-9.]+)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceHslMatch) {
    const h = parseFloat(spaceHslMatch[1]);
    const s = parseFloat(spaceHslMatch[2]);
    const l = parseFloat(spaceHslMatch[3]);
    let a = 1;
    if (spaceHslMatch[4] !== undefined) {
      a = parseAlpha(spaceHslMatch[4]) ?? 1;
    } else if (spaceHslMatch[5] !== undefined) {
      a = parseFloat(spaceHslMatch[5]);
    }
    if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(l) && !Number.isNaN(a)) {
      const [r, g, b] = hslToRgb(h, s, l);
      return { r, g, b, a: clamp(a, 0, 1) };
    }
  }

  const spaceHsbMatch = q.match(/^hs[bv]a?\s+([0-9.]+)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceHsbMatch) {
    const h = parseFloat(spaceHsbMatch[1]);
    const s = parseFloat(spaceHsbMatch[2]);
    const b = parseFloat(spaceHsbMatch[3]);
    let a = 1;
    if (spaceHsbMatch[4] !== undefined) {
      a = parseAlpha(spaceHsbMatch[4]) ?? 1;
    } else if (spaceHsbMatch[5] !== undefined) {
      a = parseFloat(spaceHsbMatch[5]);
    }
    if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(b) && !Number.isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  const spaceCmykMatch = q.match(/^(?:device-)?cmyk\s+([0-9.]+)%?\s+([0-9.]+)%?\s+([0-9.]+)%?\s+([0-9.]+)%?$/i);
  if (spaceCmykMatch) {
    const parsed = rgbFromCmykParts([
      spaceCmykMatch[1],
      spaceCmykMatch[2],
      spaceCmykMatch[3],
      spaceCmykMatch[4]
    ]);
    if (parsed) return parsed;
  }

  return null;
}

export function parseColorForTrigger(query) {
  if (!query || !String(query).trim()) return null;
  const { stripped, hadIntent } = stripColorIntent(query);
  if (!stripped) return null;
  return tryParseExactColor(stripped, hadIntent);
}

function tryParseSingleColor(rawQuery, originalQuery) {
  let q = rawQuery.trim().toLowerCase();
  if (!q) return null;

  const namedHex = lookupNamedColor(rawQuery);
  if (namedHex) {
    return parseHex(namedHex);
  }

  const hexMatch = q.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const rawHex = hexMatch[1];
    const startsWithHash = q.startsWith("#");
    const orig = (originalQuery || rawQuery).trim().toLowerCase();
    const hasColorPrefix = orig.startsWith("color ") || orig.startsWith("!color");
    const isLongBareHex = (rawHex.length === 6 || rawHex.length === 8)
      && /[a-f]/i.test(rawHex)
      && /\d/.test(rawHex);
    if (startsWithHash || hasColorPrefix || isLongBareHex) {
      return parseHex(rawHex);
    }
  }

  const embeddedHex = q.match(/#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  if (embeddedHex && rawQuery.trim().startsWith("#")) {
    return parseHex(embeddedHex[0]);
  }

  const parenRgb = q.match(/rgba?\(\s*([^)]+)\)/i);
  if (parenRgb) {
    const { parts, alpha } = splitParenArgs(parenRgb[1]);
    if (parts.length >= 3) {
      const r = parseComponent(parts[0], 255);
      const g = parseComponent(parts[1], 255);
      const b = parseComponent(parts[2], 255);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      const result = rgbResult(r, g, b, a ?? 1);
      if (result) return result;
    }
  }

  const parenHsl = q.match(/hsla?\(\s*([^)]+)\)/i);
  if (parenHsl) {
    const { parts, alpha } = splitParenArgs(parenHsl[1]);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      const l = parseFloat(parts[2]);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(l) && a !== null && !Number.isNaN(a)) {
        const [r, g, b] = hslToRgb(h, s, l);
        return { r, g, b, a: clamp(a, 0, 1) };
      }
    }
  }

  const parenHsb = q.match(/hs[bv]a?\(\s*([^)]+)\)/i);
  if (parenHsb) {
    const { parts, alpha } = splitParenArgs(parenHsb[1]);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      const a = alpha !== null ? alpha : (parts.length > 3 ? parseAlpha(parts[3]) : 1);
      if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(b) && a !== null && !Number.isNaN(a)) {
        const [r, g, bVal] = hsbToRgb(h, s, b);
        return { r, g, b: bVal, a: clamp(a, 0, 1) };
      }
    }
  }

  const parenCmyk = q.match(/(?:device-)?cmyk\(\s*([^)]+)\)/i);
  if (parenCmyk) {
    const { parts } = splitParenArgs(parenCmyk[1]);
    const parsed = rgbFromCmykParts(parts);
    if (parsed) return parsed;
  }

  const objcRgbMatch = q.match(/(?:ui|ns)color\s+colorwith(?:calibrated|device)?red\s*:\s*([0-9.]+)\s+green\s*:\s*([0-9.]+)\s+blue\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?/i);
  if (objcRgbMatch) {
    const r = Math.round(parseFloat(objcRgbMatch[1]) * 255);
    const g = Math.round(parseFloat(objcRgbMatch[2]) * 255);
    const b = Math.round(parseFloat(objcRgbMatch[3]) * 255);
    const a = objcRgbMatch[4] !== undefined ? parseFloat(objcRgbMatch[4]) : 1;
    return rgbResult(r, g, b, a);
  }

  const objcHsbMatch = q.match(/(?:ui|ns)color\s+colorwith(?:calibrated|device)?hue\s*:\s*([0-9.]+)\s+saturation\s*:\s*([0-9.]+)\s+brightness\s*:\s*([0-9.]+)(?:\s+alpha\s*:\s*([0-9.]+))?/i);
  if (objcHsbMatch) {
    const h = parseFloat(objcHsbMatch[1]) * 360;
    const s = parseFloat(objcHsbMatch[2]) * 100;
    const b = parseFloat(objcHsbMatch[3]) * 100;
    const a = objcHsbMatch[4] !== undefined ? parseFloat(objcHsbMatch[4]) : 1;
    const [r, g, bVal] = hsbToRgb(h, s, b);
    return { r, g, b: bVal, a: clamp(a, 0, 1) };
  }

  const looseRgbMatch = q.match(/red\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*green\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*blue\s*[:\s]\s*([0-9.]+)(?:%|\b)(?:\s*alpha\s*[:\s]\s*([0-9.]+))?/i);
  if (looseRgbMatch) {
    const isPct = looseRgbMatch[0].includes("%");
    const r = parseComponent(looseRgbMatch[1] + (isPct ? "%" : ""), 255);
    const g = parseComponent(looseRgbMatch[2] + (isPct ? "%" : ""), 255);
    const b = parseComponent(looseRgbMatch[3] + (isPct ? "%" : ""), 255);
    const a = looseRgbMatch[4] !== undefined ? parseFloat(looseRgbMatch[4]) : 1;
    const result = rgbResult(r, g, b, a);
    if (result) return result;
  }

  const looseHsbMatch = q.match(/hue\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*saturation\s*[:\s]\s*([0-9.]+)(?:%|\b)\s*(?:brightness|value)\s*[:\s]\s*([0-9.]+)(?:%|\b)(?:\s*alpha\s*[:\s]\s*([0-9.]+))?/i);
  if (looseHsbMatch) {
    const h = parseFloat(looseHsbMatch[1]);
    const s = parseFloat(looseHsbMatch[2]);
    const b = parseFloat(looseHsbMatch[3]);
    const a = looseHsbMatch[4] !== undefined ? parseFloat(looseHsbMatch[4]) : 1;
    if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(b) && !Number.isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  const spaceRgbMatch = q.match(/^rgba?\s+([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceRgbMatch) {
    const r = parseComponent(spaceRgbMatch[1], 255);
    const g = parseComponent(spaceRgbMatch[2], 255);
    const b = parseComponent(spaceRgbMatch[3], 255);
    let a = 1;
    if (spaceRgbMatch[4] !== undefined) {
      a = parseAlpha(spaceRgbMatch[4]) ?? 1;
    } else if (spaceRgbMatch[5] !== undefined) {
      a = parseFloat(spaceRgbMatch[5]);
    }
    const result = rgbResult(r, g, b, a);
    if (result) return result;
  }

  const spaceHslMatch = q.match(/^hsla?\s+([0-9.]+)\s+([0-9.]+)%?\s+([0-9.]+)%?(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceHslMatch) {
    const h = parseFloat(spaceHslMatch[1]);
    const s = parseFloat(spaceHslMatch[2]);
    const l = parseFloat(spaceHslMatch[3]);
    let a = 1;
    if (spaceHslMatch[4] !== undefined) {
      a = parseAlpha(spaceHslMatch[4]) ?? 1;
    } else if (spaceHslMatch[5] !== undefined) {
      a = parseFloat(spaceHslMatch[5]);
    }
    if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(l) && !Number.isNaN(a)) {
      const [r, g, b] = hslToRgb(h, s, l);
      return { r, g, b, a: clamp(a, 0, 1) };
    }
  }

  const spaceHsbMatch = q.match(/^hs[bv]a?\s+([0-9.]+)\s+([0-9.]+)%?\s+([0-9.]+)%?(?:\s*\/\s*([0-9.]+%?))?(?:\s+([0-9.]+))?$/i);
  if (spaceHsbMatch) {
    const h = parseFloat(spaceHsbMatch[1]);
    const s = parseFloat(spaceHsbMatch[2]);
    const b = parseFloat(spaceHsbMatch[3]);
    let a = 1;
    if (spaceHsbMatch[4] !== undefined) {
      a = parseAlpha(spaceHsbMatch[4]) ?? 1;
    } else if (spaceHsbMatch[5] !== undefined) {
      a = parseFloat(spaceHsbMatch[5]);
    }
    if (!Number.isNaN(h) && !Number.isNaN(s) && !Number.isNaN(b) && !Number.isNaN(a)) {
      const [r, g, bVal] = hsbToRgb(h, s, b);
      return { r, g, b: bVal, a: clamp(a, 0, 1) };
    }
  }

  const spaceCmykMatch = q.match(/^(?:device-)?cmyk\s+([0-9.]+)%?\s+([0-9.]+)%?\s+([0-9.]+)%?\s+([0-9.]+)%?$/i);
  if (spaceCmykMatch) {
    const parsed = rgbFromCmykParts([
      spaceCmykMatch[1],
      spaceCmykMatch[2],
      spaceCmykMatch[3],
      spaceCmykMatch[4]
    ]);
    if (parsed) return parsed;
  }

  return null;
}

const EMBEDDED_COLOR_PATTERNS = [
  /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi,
  /(?:device-)?cmyk\(\s*[^)]+\)/gi,
  /rgba?\(\s*[^)]+\)/gi,
  /hsla?\(\s*[^)]+\)/gi,
  /hs[bv]a?\(\s*[^)]+\)/gi,
  /(?:device-)?cmyk\s+[0-9.]+%?\s+[0-9.]+%?\s+[0-9.]+%?\s+[0-9.]+%?/gi,
  /rgba?\s+[0-9.]+%?\s+[0-9.]+%?\s+[0-9.]+%?(?:\s*\/\s*[0-9.]+%?)?/gi,
  /hsla?\s+[0-9.]+\s+[0-9.]+%?\s+[0-9.]+%?(?:\s*\/\s*[0-9.]+%?)?/gi,
  /hs[bv]a?\s+[0-9.]+\s+[0-9.]+%?\s+[0-9.]+%?(?:\s*\/\s*[0-9.]+%?)?/gi,
  /(?:ui|ns)color\s+colorwith(?:calibrated|device)?(?:red|hue)\s*:[^;]+/gi
];

function collectColorCandidates(query) {
  const original = query.trim();
  let stripped = original
    .replace(/^!(?:color-translator|color|translate-color)\s+/i, "")
    .replace(/^color\s+/i, "")
    .trim();

  const seen = new Set();
  const candidates = [];

  const add = (value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(value);
  };

  add(stripped);

  for (const pattern of EMBEDDED_COLOR_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      add(match[0]);
    }
  }

  const words = stripped.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const clean = word.replace(/^[^a-z#]+|[^a-z0-9#%(),./-]+$/gi, "");
    if (clean) add(clean);
  }

  const compactFull = normalizeNameKey(stripped);
  if (compactFull && NAMED_COLORS[compactFull]) {
    add(stripped);
  }

  const maxPhrase = Math.min(5, words.length);
  for (let len = maxPhrase; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      const key = normalizeNameKey(phrase);
      if (key && NAMED_COLORS[key]) add(phrase);
    }
  }

  return candidates;
}

export function parseColor(query) {
  if (!query || !String(query).trim()) return null;

  const candidates = collectColorCandidates(query);
  for (const candidate of candidates) {
    const parsed = tryParseSingleColor(candidate, query);
    if (parsed) return parsed;
  }

  return null;
}
