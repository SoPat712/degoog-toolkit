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

const PLACE_ALIAS_MAP = new Map(
  Object.entries({
    tokyo: "Asia/Tokyo", japan: "Asia/Tokyo", osaka: "Asia/Tokyo", kyoto: "Asia/Tokyo",
    london: "Europe/London", uk: "Europe/London", britain: "Europe/London", england: "Europe/London", scotland: "Europe/London", wales: "Europe/London",
    france: "Europe/Paris", paris: "Europe/Paris", germany: "Europe/Berlin", berlin: "Europe/Berlin",
    spain: "Europe/Madrid", madrid: "Europe/Madrid", barcelona: "Europe/Madrid", italy: "Europe/Rome", rome: "Europe/Rome", milan: "Europe/Rome",
    netherlands: "Europe/Amsterdam", amsterdam: "Europe/Amsterdam", belgium: "Europe/Brussels", brussels: "Europe/Brussels",
    switzerland: "Europe/Zurich", zurich: "Europe/Zurich", geneva: "Europe/Zurich", austria: "Europe/Vienna", vienna: "Europe/Vienna",
    portugal: "Europe/Lisbon", lisbon: "Europe/Lisbon", greece: "Europe/Athens", athens: "Europe/Athens",
    poland: "Europe/Warsaw", warsaw: "Europe/Warsaw", sweden: "Europe/Stockholm", stockholm: "Europe/Stockholm",
    norway: "Europe/Oslo", oslo: "Europe/Oslo", denmark: "Europe/Copenhagen", copenhagen: "Europe/Copenhagen",
    finland: "Europe/Helsinki", helsinki: "Europe/Helsinki", ireland: "Europe/Dublin", dublin: "Europe/Dublin",
    iceland: "Atlantic/Reykjavik", reykjavik: "Atlantic/Reykjavik", russia: "Europe/Moscow", moscow: "Europe/Moscow",
    turkey: "Europe/Istanbul", istanbul: "Europe/Istanbul", uae: "Asia/Dubai", dubai: "Asia/Dubai",
    israel: "Asia/Jerusalem", jerusalem: "Asia/Jerusalem", india: "Asia/Kolkata", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", bangalore: "Asia/Kolkata",
    singapore: "Asia/Singapore", malaysia: "Asia/Kuala_Lumpur", "kuala lumpur": "Asia/Kuala_Lumpur",
    thailand: "Asia/Bangkok", bangkok: "Asia/Bangkok", vietnam: "Asia/Ho_Chi_Minh", "ho chi minh": "Asia/Ho_Chi_Minh",
    indonesia: "Asia/Jakarta", jakarta: "Asia/Jakarta", philippines: "Asia/Manila", manila: "Asia/Manila",
    china: "Asia/Shanghai", beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai", "hong kong": "Asia/Hong_Kong",
    taiwan: "Asia/Taipei", taipei: "Asia/Taipei", "south korea": "Asia/Seoul", korea: "Asia/Seoul", seoul: "Asia/Seoul",
    australia: "Australia/Sydney", sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", perth: "Australia/Perth",
    "new zealand": "Pacific/Auckland", auckland: "Pacific/Auckland", nz: "Pacific/Auckland",
    usa: "America/New_York", us: "America/New_York", america: "America/New_York", "united states": "America/New_York",
    "new york": "America/New_York", nyc: "America/New_York", boston: "America/New_York", philadelphia: "America/New_York",
    washington: "America/New_York", "washington dc": "America/New_York", miami: "America/New_York", atlanta: "America/New_York",
    chicago: "America/Chicago", dallas: "America/Chicago", houston: "America/Chicago", denver: "America/Denver", phoenix: "America/Phoenix",
    "los angeles": "America/Los_Angeles", la: "America/Los_Angeles", "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles",
    seattle: "America/Los_Angeles", portland: "America/Los_Angeles", "las vegas": "America/Los_Angeles",
    canada: "America/Toronto", toronto: "America/Toronto", montreal: "America/Toronto", vancouver: "America/Vancouver",
    mexico: "America/Mexico_City", "mexico city": "America/Mexico_City", brazil: "America/Sao_Paulo", "sao paulo": "America/Sao_Paulo", rio: "America/Sao_Paulo",
    argentina: "America/Argentina/Buenos_Aires", "buenos aires": "America/Argentina/Buenos_Aires", chile: "America/Santiago", santiago: "America/Santiago",
    colombia: "America/Bogota", bogota: "America/Bogota", peru: "America/Lima", lima: "America/Lima",
    egypt: "Africa/Cairo", cairo: "Africa/Cairo", "south africa": "Africa/Johannesburg", johannesburg: "Africa/Johannesburg",
    nigeria: "Africa/Lagos", lagos: "Africa/Lagos", kenya: "Africa/Nairobi", nairobi: "Africa/Nairobi",
    utc: "UTC", gmt: "UTC", est: "America/New_York", pst: "America/Los_Angeles", cst: "America/Chicago", mst: "America/Denver",
  })
);

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

function resolveAliasTimeZone(place) {
  const trimmed = String(place || "").trim();
  const key = normalizePlaceKey(trimmed);
  if (!key) return null;
  if (PLACE_ALIAS_MAP.has(key)) return PLACE_ALIAS_MAP.get(key);

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

  const aliasTz = resolveAliasTimeZone(trimmed);
  if (aliasTz) {
    return {
      timeZone: aliasTz,
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

  value = value.replace(BANG_PREFIX_RX, "").trim();
  const lower = value.toLowerCase();

  const phrases = [...NATURAL_LANGUAGE_PHRASES].sort((left, right) => right.length - left.length);
  for (const phrase of phrases) {
    if (lower === phrase) {
      value = "";
      break;
    }
    if (lower.startsWith(`${phrase} `)) {
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
    html: `<div class="time-result"><p class="time-card__usage">{{ t:plugin-time.usageLine1 }}</p><p class="time-card__usage">{{ t:plugin-time.usageLine2 }}</p></div>`,
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

async function renderTimeQuery(rawInput, context, { allowDefault = false } = {}) {
  const place = parsePlaceFromQuery(rawInput) || (allowDefault ? settings.defaultPlace : "");
  if (!place) return renderUsageCard();

  const resolved = await resolveTimeZone(place, context);
  if (!resolved) {
    return {
      title: "",
      html: `<div class="time-result"><p class="time-card__usage">Could not find a timezone for <strong>${escapeHtml(place)}</strong>.</p></div>`,
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
    const isBang = BANG_PREFIX_RX.test(String(query || "").trim());
    return renderTimeQuery(query, context, { allowDefault: isBang });
  },
};

export default slot;
export const slotPlugin = slot;
