let template = "";
const FETCH_TIMEOUT_MS = 8000;
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const settings = {
  timeFormat: "auto",
  defaultPlace: "",
};

let geoCache = null;

const BANG_PREFIX_RX = /^!(?:time|tz|clock)\b\s*/i;

const NATURAL_LANGUAGE_PHRASES = [
  "what time is it in",
  "what is the time in",
  "what's the time in",
  "whats the time in",
  "current time in",
  "local time in",
  "time in",
  "time at",
  "time for",
];

const TRAILING_TIME_RX = /^(.+?)\s+(?:time|clock|timezone|time\s*zone)\s*[?!.,]*$/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function configureSettings(nextSettings) {
  const timeFormat = String(nextSettings?.timeFormat || "auto").toLowerCase();
  settings.timeFormat = ["auto", "12h", "24h"].includes(timeFormat) ? timeFormat : "auto";
  settings.defaultPlace = String(nextSettings?.defaultPlace || "").trim();
}

async function fetchWithTimeout(fetcher, url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePlaceKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveIanaTimeZone(place) {
  const trimmed = String(place || "").trim();
  const key = normalizePlaceKey(trimmed);
  if (!key) return null;

  const candidates = [trimmed, key.replace(/\s+/g, "_")];
  for (const candidate of candidates) {
    if (candidate && isValidTimeZone(candidate)) return candidate;
  }
  return null;
}

function pickGeocodeResult(results, query) {
  if (!Array.isArray(results) || !results.length) return null;
  const key = normalizePlaceKey(query);
  const exactMatches = results.filter((row) => normalizePlaceKey(row.name) === key);
  const pool = exactMatches.length ? exactMatches : results;

  const ranked = [...pool].sort((left, right) => {
    const score = (row) => {
      let value = Number(row.population) || 0;
      if (row.feature_code === "PCLI") value += 1000000000;
      if (row.feature_code === "PPLC") value += 100000000;
      if (normalizePlaceKey(row.name) === key) value += 10000000;
      return value;
    };
    return score(right) - score(left);
  });

  return ranked[0] || results[0];
}

function titleCasePlace(value) {
  return String(value || "").trim().replace(/\b[\p{L}\p{N}']+\b/gu, (word) => {
    const [first, ...rest] = word;
    return `${first.toUpperCase()}${rest.join("")}`;
  });
}

function buildDisplayPlace(query, geo) {
  const requested = String(query || "").trim();
  if (!geo) return titleCasePlace(requested);

  if (geo.feature_code === "PCLI") {
    return geo.country || geo.name || titleCasePlace(requested);
  }

  const name = geo.name || titleCasePlace(requested);
  const country = geo.country || "";
  if (country && normalizePlaceKey(country) !== normalizePlaceKey(name)) {
    return `${name}, ${country}`;
  }
  return name;
}

async function resolveTimeZone(place, context) {
  const trimmed = String(place || "").trim();
  if (!trimmed) return null;

  const ianaTz = resolveIanaTimeZone(trimmed);
  if (ianaTz) {
    return {
      timeZone: ianaTz,
      displayPlace: titleCasePlace(trimmed),
    };
  }

  const doFetch = typeof context?.fetch === "function" ? context.fetch : fetch;
  const cacheKey = `geo:${(context?.lang || "en").toLowerCase()}:${normalizePlaceKey(trimmed)}`;
  let geoRow = geoCache ? await geoCache.get(cacheKey) : null;

  if (!geoRow) {
    const url = "https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({
      name: trimmed,
      count: "8",
      language: (context?.lang || "en").split("-")[0] || "en",
      format: "json",
    }).toString();

    try {
      const response = await fetchWithTimeout(doFetch, url);
      if (!response.ok) return null;
      const payload = await response.json();
      geoRow = pickGeocodeResult(payload?.results, trimmed);
      if (geoRow?.timezone && geoCache) {
        await geoCache.set(cacheKey, geoRow, GEO_CACHE_TTL_MS);
      }
    } catch {
      return null;
    }
  }

  if (!geoRow?.timezone || !isValidTimeZone(geoRow.timezone)) return null;

  return {
    timeZone: geoRow.timezone,
    displayPlace: buildDisplayPlace(trimmed, geoRow),
  };
}

function parsePlaceFromQuery(query) {
  let value = String(query || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (["time", "!time", "tz", "!tz", "clock", "!clock"].includes(lower)) {
    return "";
  }

  value = value.replace(BANG_PREFIX_RX, "").trim();
  const lowerVal = value.toLowerCase();

  const phrases = [...NATURAL_LANGUAGE_PHRASES].sort((left, right) => right.length - left.length);
  for (const phrase of phrases) {
    if (lowerVal === phrase) {
      value = "";
      break;
    }
    if (lowerVal.startsWith(`${phrase} `)) {
      value = value.slice(phrase.length).trim();
      break;
    }
  }

  const trailingMatch = value.match(TRAILING_TIME_RX);
  if (trailingMatch) {
    value = trailingMatch[1].trim();
  }

  return value.replace(/^the\s+/i, "").replace(/[?.,!]+$/, "").trim();
}

function hour12ModeForContext(context) {
  if (settings.timeFormat === "12h") return "true";
  if (settings.timeFormat === "24h") return "false";
  const lang = String(context?.lang || "").toLowerCase();
  if (lang.startsWith("en")) return "true";
  return "auto";
}

function formatClock(now, timeZone, context) {
  const opts = {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  };
  if (settings.timeFormat === "12h") opts.hour12 = true;
  else if (settings.timeFormat === "24h") opts.hour12 = false;
  else if (hour12ModeForContext(context) === "true") opts.hour12 = true;

  try {
    return now.toLocaleTimeString(context?.lang || undefined, opts);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

function formatOffsetLabel(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function formatDateLine(now, timeZone, context) {
  const opts = {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  let dateStr;
  try {
    dateStr = now.toLocaleDateString(context?.lang || undefined, opts);
  } catch {
    dateStr = now.toISOString().slice(0, 10);
  }
  const offset = formatOffsetLabel(now, timeZone);
  return offset ? `${dateStr} (${offset})` : dateStr;
}

function renderUsageCard() {
  return {
    title: "",
    html: `<div class="command-result time-result"><p class="time-card__usage">{{ t:plugin-time.usageLine1 }}</p><p class="time-card__usage">{{ t:plugin-time.usageLine2 }}</p></div>`,
  };
}

function renderTimeCard(resolved, context) {
  const now = new Date();
  const time = formatClock(now, resolved.timeZone, context);
  const dateLine = formatDateLine(now, resolved.timeZone, context);
  const placeLabel = `Time in ${escapeHtml(resolved.displayPlace)}`;

  const html = template
    .replaceAll("{{timezone}}", escapeHtml(resolved.timeZone))
    .replaceAll("{{hour12}}", escapeHtml(hour12ModeForContext(context)))
    .replaceAll("{{time}}", escapeHtml(time))
    .replaceAll("{{dateLine}}", escapeHtml(dateLine))
    .replaceAll("{{placeLabel}}", placeLabel);

  return { title: "", html };
}

async function renderTimeQuery(rawInput, context) {
  const place = parsePlaceFromQuery(rawInput) || settings.defaultPlace;
  if (!place) return renderUsageCard();

  const resolved = await resolveTimeZone(place, context);
  if (!resolved) {
    return {
      title: "",
      html: `<div class="command-result time-result"><p class="time-card__usage">Could not find a timezone for <strong>${escapeHtml(place)}</strong>.</p></div>`,
    };
  }

  return renderTimeCard(
    {
      timeZone: resolved.timeZone,
      displayPlace: resolved.displayPlace,
    },
    context,
  );
}

function hasLikelyPlaceToken(value) {
  const remainder = String(value || "").replace(/^the\s+/i, "").replace(/[?.,!]+$/, "").trim();
  if (!remainder || remainder.length < 2) return false;

  const stopwords = new Set([
    "morning", "afternoon", "evening", "night", "noon", "midnight",
    "now", "today", "tomorrow", "yesterday", "week", "month", "year",
  ]);
  return !stopwords.has(remainder.toLowerCase());
}

function isTimeQuery(query) {
  const raw = String(query || "").trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  if (["time", "!time", "tz", "!tz", "clock", "!clock"].includes(lower)) {
    return Boolean(settings.defaultPlace);
  }

  if (BANG_PREFIX_RX.test(raw)) return true;

  for (const phrase of NATURAL_LANGUAGE_PHRASES) {
    const normalizedPhrase = phrase.toLowerCase();
    if (lower === normalizedPhrase) return false;
    if (lower.startsWith(`${normalizedPhrase} `)) {
      return hasLikelyPlaceToken(raw.slice(phrase.length));
    }
  }

  const place = parsePlaceFromQuery(raw);
  if (!place || !hasLikelyPlaceToken(place)) return false;
  return TRAILING_TIME_RX.test(raw);
}

const settingsSchema = [
  {
    key: "timeFormat",
    label: "Clock format",
    type: "select",
    options: ["auto", "12h", "24h"],
    default: "auto",
    description: "12-hour, 24-hour, or follow locale when set to auto.",
  },
  {
    key: "defaultPlace",
    label: "Default place",
    type: "text",
    default: "",
    placeholder: "France",
    description: "Optional fallback when !time is used without a place.",
  },
];

const slot = {
  id: "time",
  name: "Time",
  description: "Google-style world clock for cities and countries. Supports natural phrases like \"time in France\" and trailing queries like \"Tokyo time\".",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel", "at-a-glance"],
  settingsSchema,

  init(ctx) {
    template = ctx?.template || "";
    geoCache = typeof ctx?.useCache === "function" ? ctx.useCache("time-geocode", GEO_CACHE_TTL_MS) : (typeof ctx?.createCache === "function" ? ctx.createCache(GEO_CACHE_TTL_MS) : null);
  },

  configure: configureSettings,

  trigger(query) {
    return isTimeQuery(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };
    if (!isTimeQuery(query)) return { title: "", html: "" };
    return renderTimeQuery(query, context);
  },
};

export default slot;
export const slotPlugin = slot;
