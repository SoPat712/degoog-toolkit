import {
  buildCurrencyAliasIndex,
  parseCurrencyQuery,
} from "./currency-aliases.js";
import {
  hasNumericConversionPattern,
  isEnglishPrepositionIn,
  isInformationalQuestion,
} from "./query-guards.js";

let template = "";
let externalFetch = (...args) => fetch(...args);
let currencyCache = null;

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v2";
const COINGECKO_SIMPLE_PRICE =
  "https://api.coingecko.com/api/v3/simple/price";
const FETCH_TIMEOUT_MS = 8_000;
const RATE_CACHE_TTL_MS = 5 * 60_000;
const HISTORY_CACHE_TTL_MS = 15 * 60_000;
const CRYPTO_CODES = new Set(["BTC", "ETH"]);
const AMBIGUOUS_WORD_CODES = new Set(["ALL", "TRY", "MAD", "TOP"]);
const COIN_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
};
const HISTORY_PERIODS = new Set(["1", "5", "30", "365", "1825", "max"]);

function createExtensionCache(ctx, namespace, ttlMs) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(namespace, ttlMs);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(ttlMs)
    : null;
}

async function cacheGet(cache, key) {
  return cache ? await cache.get(key) : null;
}

async function cacheSet(cache, key, value, ttlMs) {
  if (cache) await cache.set(key, value, ttlMs);
}

// ── Static currency data (server-side display only) ───────────
const CURRENCIES = {
  AED: "United Arab Emirates Dirham",
  AFN: "Afghan Afghani",
  ALL: "Albanian Lek",
  AMD: "Armenian Dram",
  ANG: "Netherlands Antillean Gulden",
  AOA: "Angolan Kwanza",
  ARS: "Argentine Peso",
  AUD: "Australian Dollar",
  AWG: "Aruban Florin",
  AZN: "Azerbaijani Manat",
  BAM: "Bosnia and Herzegovina Convertible Mark",
  BBD: "Barbadian Dollar",
  BDT: "Bangladeshi Taka",
  BGN: "Bulgarian Lev",
  BHD: "Bahraini Dinar",
  BIF: "Burundian Franc",
  BMD: "Bermudian Dollar",
  BND: "Brunei Dollar",
  BOB: "Bolivian Boliviano",
  BRL: "Brazilian Real",
  BSD: "Bahamian Dollar",
  BTN: "Bhutanese Ngultrum",
  BWP: "Botswana Pula",
  BYN: "Belarusian Ruble",
  BZD: "Belize Dollar",
  CAD: "Canadian Dollar",
  CDF: "Congolese Franc",
  CHF: "Swiss Franc",
  CLP: "Chilean Peso",
  CNH: "Chinese Renminbi Yuan Offshore",
  CNY: "Chinese Renminbi Yuan",
  COP: "Colombian Peso",
  CRC: "Costa Rican Colón",
  CUP: "Cuban Peso",
  CVE: "Cape Verdean Escudo",
  CZK: "Czech Koruna",
  DJF: "Djiboutian Franc",
  DKK: "Danish Krone",
  DOP: "Dominican Peso",
  DZD: "Algerian Dinar",
  EGP: "Egyptian Pound",
  ERN: "Eritrean Nakfa",
  ETB: "Ethiopian Birr",
  EUR: "Euro",
  FJD: "Fijian Dollar",
  FKP: "Falkland Pound",
  GBP: "British Pound",
  GEL: "Georgian Lari",
  GGP: "Guernsey Pound",
  GHS: "Ghanaian Cedi",
  GIP: "Gibraltar Pound",
  GMD: "Gambian Dalasi",
  GNF: "Guinean Franc",
  GTQ: "Guatemalan Quetzal",
  GYD: "Guyanese Dollar",
  HKD: "Hong Kong Dollar",
  HNL: "Honduran Lempira",
  HTG: "Haitian Gourde",
  HUF: "Hungarian Forint",
  IDR: "Indonesian Rupiah",
  ILS: "Israeli New Shekel",
  IMP: "Isle of Man Pound",
  INR: "Indian Rupee",
  IQD: "Iraqi Dinar",
  IRR: "Iranian Rial",
  ISK: "Icelandic Króna",
  JEP: "Jersey Pound",
  JMD: "Jamaican Dollar",
  JOD: "Jordanian Dinar",
  JPY: "Japanese Yen",
  KES: "Kenyan Shilling",
  KGS: "Kyrgyzstani Som",
  KHR: "Cambodian Riel",
  KMF: "Comorian Franc",
  KRW: "South Korean Won",
  KWD: "Kuwaiti Dinar",
  KYD: "Cayman Islands Dollar",
  KZT: "Kazakhstani Tenge",
  LAK: "Lao Kip",
  LBP: "Lebanese Pound",
  LKR: "Sri Lankan Rupee",
  LRD: "Liberian Dollar",
  LSL: "Lesotho Loti",
  LYD: "Libyan Dinar",
  MAD: "Moroccan Dirham",
  MDL: "Moldovan Leu",
  MGA: "Malagasy Ariary",
  MKD: "Macedonian Denar",
  MMK: "Myanmar Kyat",
  MNT: "Mongolian Tögrög",
  MOP: "Macanese Pataca",
  MRO: "Mauritanian Ouguiya",
  MRU: "Mauritanian Ouguiya",
  MUR: "Mauritian Rupee",
  MVR: "Maldivian Rufiyaa",
  MWK: "Malawian Kwacha",
  MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit",
  MZN: "Mozambican Metical",
  NAD: "Namibian Dollar",
  NGN: "Nigerian Naira",
  NIO: "Nicaraguan Córdoba",
  NOK: "Norwegian Krone",
  NPR: "Nepalese Rupee",
  NZD: "New Zealand Dollar",
  OMR: "Omani Rial",
  PAB: "Panamanian Balboa",
  PEN: "Peruvian Sol",
  PGK: "Papua New Guinean Kina",
  PHP: "Philippine Peso",
  PKR: "Pakistani Rupee",
  PLN: "Polish Złoty",
  PYG: "Paraguayan Guaraní",
  QAR: "Qatari Riyal",
  RON: "Romanian Leu",
  RSD: "Serbian Dinar",
  RUB: "Russian Ruble",
  RWF: "Rwandan Franc",
  SAR: "Saudi Riyal",
  SBD: "Solomon Islands Dollar",
  SCR: "Seychellois Rupee",
  SDG: "Sudanese Pound",
  SEK: "Swedish Krona",
  SGD: "Singapore Dollar",
  SHP: "Saint Helenian Pound",
  SLE: "New Leone",
  SOS: "Somali Shilling",
  SRD: "Surinamese Dollar",
  SSP: "South Sudanese Pound",
  STN: "São Tomé and Príncipe Dobra",
  SVC: "Salvadoran Colón",
  SYP: "Syrian Pound",
  SZL: "Swazi Lilangeni",
  THB: "Thai Baht",
  TJS: "Tajikistani Somoni",
  TMT: "Turkmenistani Manat",
  TND: "Tunisian Dinar",
  TOP: "Tongan Paʻanga",
  TRY: "Turkish Lira",
  TTD: "Trinidad and Tobago Dollar",
  TWD: "New Taiwan Dollar",
  TZS: "Tanzanian Shilling",
  UAH: "Ukrainian Hryvnia",
  UGX: "Ugandan Shilling",
  USD: "United States Dollar",
  UYU: "Uruguayan Peso",
  UZS: "Uzbekistan Som",
  VES: "Venezuelan Bolívar Soberano",
  VND: "Vietnamese Đồng",
  VUV: "Vanuatu Vatu",
  WST: "Samoan Tala",
  XAF: "Central African CFA Franc",
  XAG: "Silver (Troy Ounce)",
  XAU: "Gold (Troy Ounce)",
  XCD: "East Caribbean Dollar",
  XCG: "Caribbean Guilder",
  XDR: "Special Drawing Rights",
  XOF: "West African CFA Franc",
  XPD: "Palladium",
  XPF: "CFP Franc",
  XPT: "Platinum",
  YER: "Yemeni Rial",
  ZAR: "South African Rand",
  ZMW: "Zambian Kwacha",
  ZWG: "Zimbabwe Gold",
  BTC: "Bitcoin",
  ETH: "Ethereum",
};

const KNOWN_SYMBOLS = {
  AED: "د.إ",
  AFN: "؋",
  ALL: "L",
  AMD: "֏",
  ANG: "ƒ",
  AOA: "Kz",
  ARS: "$",
  AUD: "A$",
  AWG: "ƒ",
  AZN: "₼",
  BAM: "KM",
  BBD: "Bds$",
  BDT: "৳",
  BGN: "лв",
  BHD: "BD",
  BIF: "FBu",
  BMD: "$",
  BND: "B$",
  BOB: "Bs",
  BRL: "R$",
  BSD: "B$",
  BTN: "Nu",
  BWP: "P",
  BYN: "Br",
  BZD: "BZ$",
  CAD: "C$",
  CDF: "FC",
  CHF: "Fr",
  CLP: "$",
  CNH: "¥",
  CNY: "¥",
  COP: "$",
  CRC: "₡",
  CUP: "$",
  CVE: "$",
  CZK: "Kč",
  DJF: "Fdj",
  DKK: "kr",
  DOP: "RD$",
  DZD: "د.ج",
  EGP: "E£",
  ERN: "Nfk",
  ETB: "Br",
  EUR: "€",
  FJD: "FJ$",
  FKP: "£",
  GBP: "£",
  GEL: "₾",
  GGP: "£",
  GHS: "₵",
  GIP: "£",
  GMD: "D",
  GNF: "FG",
  GTQ: "Q",
  GYD: "G$",
  HKD: "HK$",
  HNL: "L",
  HTG: "G",
  HUF: "Ft",
  IDR: "Rp",
  ILS: "₪",
  IMP: "£",
  INR: "₹",
  IQD: "ع.د",
  IRR: "﷼",
  ISK: "kr",
  JEP: "£",
  JMD: "J$",
  JOD: "JD",
  JPY: "¥",
  KES: "KSh",
  KGS: "сом",
  KHR: "៛",
  KMF: "CF",
  KRW: "₩",
  KWD: "د.ك",
  KYD: "CI$",
  KZT: "₸",
  LAK: "₭",
  LBP: "ل.ل",
  LKR: "Rs",
  LRD: "L$",
  LSL: "L",
  LYD: "LD",
  MAD: "MAD",
  MDL: "L",
  MGA: "Ar",
  MKD: "ден",
  MMK: "K",
  MNT: "₮",
  MOP: "MOP$",
  MRO: "UM",
  MRU: "UM",
  MUR: "₨",
  MVR: "Rf",
  MWK: "MK",
  MXN: "MX$",
  MYR: "RM",
  MZN: "MT",
  NAD: "N$",
  NGN: "₦",
  NIO: "C$",
  NOK: "kr",
  NPR: "₨",
  NZD: "NZ$",
  OMR: "ر.ع.",
  PAB: "B/.",
  PEN: "S/.",
  PGK: "K",
  PHP: "₱",
  PKR: "₨",
  PLN: "zł",
  PYG: "₲",
  QAR: "QR",
  RON: "lei",
  RSD: "din",
  RUB: "₽",
  RWF: "RF",
  SAR: "﷼",
  SBD: "SI$",
  SCR: "₨",
  SDG: "ج.س.",
  SEK: "kr",
  SGD: "S$",
  SHP: "£",
  SLE: "Le",
  SOS: "Sh",
  SRD: "$",
  SSP: "£",
  STN: "Db",
  SVC: "₡",
  SYP: "£S",
  SZL: "E",
  THB: "฿",
  TJS: "SM",
  TMT: "T",
  TND: "د.ت",
  TOP: "T$",
  TRY: "₺",
  TTD: "TT$",
  TWD: "NT$",
  TZS: "TSh",
  UAH: "₴",
  UGX: "USh",
  USD: "$",
  UYU: "$U",
  UZS: "сўм",
  VES: "Bs.S",
  VND: "₫",
  VUV: "VT",
  WST: "WS$",
  XAF: "FCFA",
  XAG: "XAG",
  XAU: "XAU",
  XCD: "EC$",
  XCG: "CMg",
  XDR: "SDR",
  XOF: "CFA",
  XPD: "XPD",
  XPF: "₣",
  XPT: "XPT",
  YER: "﷼",
  ZAR: "R",
  ZMW: "ZK",
  ZWG: "ZiG",
  BTC: "₿",
  ETH: "Ξ",
};

const CODES = Object.keys(CURRENCIES);
const CURRENCY_ALIAS_INDEX = buildCurrencyAliasIndex(CURRENCIES);

const POPULAR_PAIRS = [
  ["EUR", "USD"],
  ["GBP", "USD"],
  ["USD", "JPY"],
  ["USD", "UAH"],
  ["USD", "CNY"],
  ["EUR", "GBP"],
];

// ── Shared module-level settings ──────────────────────────────
// Both the slot and the bang command read from this single state
// so that configuring one settings panel applies to both code paths.
// Slot-only plugin: natural-language triggering IS the plugin (plus a
// `!cur` bang prefix handled inside the slot's `trigger`). There's no
// companion command export, so a user-facing "Natural language" toggle
// would only ever mean "disable the plugin entirely" — not useful.
// Removed accordingly.
const _settings = {
  defaultTo: "USD",
};

function _applySettings(settings) {
  const to =
    typeof settings?.defaultTo === "string" ? settings.defaultTo.trim() : "";
  _settings.defaultTo = to || "USD";
}

const COMMAND_PREFIX_RE =
  /^!(currency|convert|cur|\u043a\u0443\u0440\u0441|\u0432\u0430\u043b\u044e\u0442\u0430)\b/i;

// ── Flag SVG generator ────────────────────────────────────────
function _makeFlag(code) {
  const sym = KNOWN_SYMBOLS[code] || code.slice(0, 2);
  const display = sym.length > 3 ? sym.slice(0, 3) : sym;
  const len = display.length;
  const fs = len <= 1 ? 11 : len <= 2 ? 9 : 8;
  return `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="${fs}" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">${_esc(display)}</text></svg>`;
}

// ── Query parser ──────────────────────────────────────────────
function parseQuery(query) {
  return parseCurrencyQuery(query, CURRENCY_ALIAS_INDEX, {
    validCodes: CODES,
    ambiguousWordCodes: AMBIGUOUS_WORD_CODES,
  });
}

function _hasCurrencyTriggerIntent(query, parsed) {
  const q = String(query || "");
  if (isInformationalQuestion(q)) return false;
  if (COMMAND_PREFIX_RE.test(q)) return true;
  if (/\d/.test(q)) return true;
  if (hasNumericConversionPattern(q)) return true;
  if (/\b(?:to|into|a|en)\b/i.test(q) && !isEnglishPrepositionIn(q)) return true;
  if (/\b(convert|currency|exchange|rate|rates|price|convertir|convertir|taux|valeur|cambio)\b/i.test(q)) return true;
  return _isBareCurrencyPair(q, parsed);
}

function _isBareCurrencyPair(query, parsed) {
  if (!parsed?.from || !parsed?.to) return false;
  const tokens = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return false;
  return [parsed.from, parsed.to].every((code, index) => {
    const token = tokens[index] || "";
    if (!new RegExp(`^${code}$`, "i").test(token)) return false;
    return !AMBIGUOUS_WORD_CODES.has(code) || token === token.toUpperCase();
  });
}

function _jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function _normaliseCurrencyCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return CODES.includes(code) ? code : "";
}

function _normaliseHistoryDays(value) {
  const days = String(value || "30").trim().toLowerCase();
  return HISTORY_PERIODS.has(days) ? days : "";
}

function _getGroupForDays(days) {
  const numericDays = days === "max" ? 10000 : parseInt(days, 10) || 30;
  if (numericDays > 365) return "month";
  if (numericDays > 90) return "week";
  return "";
}

function _buildHistoryUrl(from, to, days) {
  let startDate;
  if (days === "max") {
    startDate = "1999-01-04";
  } else {
    const numDays = parseInt(days, 10) || 30;
    const dt = new Date(Date.now() - numDays * 86400000);
    startDate = dt.toISOString().slice(0, 10);
  }

  const url = new URL(`${FRANKFURTER_BASE}/rates`);
  url.searchParams.set("from", startDate);
  url.searchParams.set("quotes", to);
  url.searchParams.set("base", from);

  const group = _getGroupForDays(days);
  if (group) url.searchParams.set("group", group);

  return url.toString();
}

async function _fetchJson(url, init = {}) {
  const headers = {
    Accept: "application/json",
    ...(init.headers || {}),
  };
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    : null;

  let response;
  try {
    response = await externalFetch(url, {
      ...init,
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: "Provider request failed",
      data: null,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // Provider returned invalid JSON or an empty error body.
  }

  return {
    ok: response.ok,
    status: response.status,
    error: response.ok ? "" : `Provider returned ${response.status}`,
    data,
  };
}

async function _fetchFiatRates(base, quotes) {
  const quoteList = [...new Set(quotes)].filter(Boolean).sort();
  if (!base || quoteList.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Missing currency pair",
    };
  }

  const cacheKey = `fiat:${base}:${quoteList.join(",")}`;
  const cached = await cacheGet(currencyCache, cacheKey);
  if (cached) return cached;

  const url = new URL(`${FRANKFURTER_BASE}/rates`);
  url.searchParams.set("base", base);
  url.searchParams.set("quotes", quoteList.join(","));

  const response = await _fetchJson(url.toString());
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      error:
        response.error || `Exchange rate provider returned ${response.status}`,
    };
  }

  if (!Array.isArray(response.data)) {
    return {
      ok: false,
      status: 502,
      error: "Exchange rate provider returned an unexpected response",
    };
  }

  const rates = {};
  for (const entry of response.data) {
    const quote = _normaliseCurrencyCode(entry?.quote);
    const rate = Number(entry?.rate);
    if (quote && Number.isFinite(rate) && rate > 0) rates[quote] = rate;
  }

  const result = { ok: true, rates };
  await cacheSet(currencyCache, cacheKey, result, RATE_CACHE_TTL_MS);
  return result;
}

async function _fetchConversionRate(from, to) {
  if (!from || !to) {
    return {
      ok: false,
      status: 400,
      error: "Missing currency pair",
    };
  }

  if (from === to) {
    return {
      ok: true,
      rate: 1,
      provider: "local",
    };
  }

  const cacheKey = `rate:${from}:${to}`;
  const cached = await cacheGet(currencyCache, cacheKey);
  if (cached) return cached;

  const fromIsCrypto = CRYPTO_CODES.has(from);
  const toIsCrypto = CRYPTO_CODES.has(to);

  if (!fromIsCrypto && !toIsCrypto) {
    const response = await _fetchJson(
      `${FRANKFURTER_BASE}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    );

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error:
          response.error || `Exchange rate provider returned ${response.status}`,
      };
    }

    const rate = Number(response.data?.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return {
        ok: false,
        status: 404,
        error: "Exchange rate is not available for this pair",
      };
    }

    const result = {
      ok: true,
      rate,
      provider: "frankfurter",
    };
    await cacheSet(currencyCache, cacheKey, result, RATE_CACHE_TTL_MS);
    return result;
  }

  const cryptoCode = fromIsCrypto ? from : to;
  const coinId = COIN_IDS[cryptoCode];
  const vsCurrency = (fromIsCrypto ? to : from).toLowerCase();
  if (!coinId || !vsCurrency) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported crypto currency pair",
    };
  }

  const url = new URL(COINGECKO_SIMPLE_PRICE);
  url.searchParams.set("ids", coinId);
  url.searchParams.set("vs_currencies", vsCurrency);

  const response = await _fetchJson(url.toString());
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      error:
        response.error || `Crypto price provider returned ${response.status}`,
    };
  }

  const price = Number(response.data?.[coinId]?.[vsCurrency]);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      ok: false,
      status: 404,
      error: "Crypto price is not available for this pair",
    };
  }

  const result = {
    ok: true,
    rate: fromIsCrypto ? price : 1 / price,
    provider: "coingecko",
  };
  await cacheSet(currencyCache, cacheKey, result, RATE_CACHE_TTL_MS);
  return result;
}

async function _handleRateRoute(request) {
  try {
    const url = new URL(request.url);
    const from = _normaliseCurrencyCode(url.searchParams.get("from"));
    const to = _normaliseCurrencyCode(url.searchParams.get("to"));

    if (!from || !to) {
      return _jsonResponse(
        {
          ok: false,
          status: 400,
          error: "Missing or unsupported currency code",
        },
        400,
      );
    }

    const result = await _fetchConversionRate(from, to);
    if (!result.ok) {
      const status = result.status || 502;
      return _jsonResponse(
        {
          ok: false,
          status,
          error: result.error || "Exchange rate unavailable",
        },
        status,
      );
    }

    return _jsonResponse({
      ok: true,
      status: 200,
      from,
      to,
      rate: result.rate,
      provider: result.provider,
    });
  } catch (error) {
    return _jsonResponse(
      {
        ok: false,
        status: 500,
        error: "Internal error while fetching exchange rate",
      },
      500,
    );
  }
}

async function _handleHistoryRoute(request) {
  try {
    const url = new URL(request.url);
    const from = _normaliseCurrencyCode(url.searchParams.get("from"));
    const to = _normaliseCurrencyCode(url.searchParams.get("to"));
    const days = _normaliseHistoryDays(url.searchParams.get("days"));

    if (!from || !to || !days) {
      return _jsonResponse(
        {
          ok: false,
          status: 400,
          error: "Missing or unsupported chart parameters",
        },
        400,
      );
    }

    if (CRYPTO_CODES.has(from) || CRYPTO_CODES.has(to)) {
      return _jsonResponse(
        {
          ok: false,
          status: 422,
          error: "Chart history is not available for crypto pairs",
        },
        422,
      );
    }

    const cacheKey = `history:${from}:${to}:${days}`;
    let data = await cacheGet(currencyCache, cacheKey);
    if (!data) {
      const response = await _fetchJson(_buildHistoryUrl(from, to, days));
      if (!response.ok) {
        return _jsonResponse(
          {
            ok: false,
            status: 502,
            error:
              response.error ||
              `Exchange rate provider returned ${response.status}`,
          },
          502,
        );
      }

      if (!Array.isArray(response.data)) {
        return _jsonResponse(
          {
            ok: false,
            status: 502,
            error: "Exchange rate provider returned an unexpected response",
          },
          502,
        );
      }

      data = response.data
        .map((entry) => ({
          date: String(entry?.date || ""),
          rate: Number(entry?.rate),
        }))
        .filter((entry) => entry.date && Number.isFinite(entry.rate));
      await cacheSet(currencyCache, cacheKey, data, HISTORY_CACHE_TTL_MS);
    }

    return _jsonResponse({
      ok: true,
      status: 200,
      from,
      to,
      days,
      data,
    });
  } catch (error) {
    return _jsonResponse(
      {
        ok: false,
        status: 500,
        error: "Internal error while fetching chart history",
      },
      500,
    );
  }
}

export const routes = [
  {
    path: "rate",
    method: "get",
    handler: _handleRateRoute,
  },
  {
    path: "history",
    method: "get",
    handler: _handleHistoryRoute,
  },
  {
    path: "search-index",
    method: "get",
    handler: async () =>
      _jsonResponse(CURRENCY_ALIAS_INDEX.searchTextByCode),
  },
];

function isTranslationQuery(q) {
  return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) || /how (do|would|can) you say\b/i.test(q);
}

export const slot = {
  id: "currency-slot",
  name: "Currency",
  description:
    "Currency converter with live rates. Supports !currency, or natural queries like '100 usd to eur'.",
  isClientExposed: false,
  position: "full-width-above-results",

  settingsSchema: [
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: CODES.filter((c) => c !== "BTC" && c !== "ETH"),
      default: "USD",
      description: "Currency to convert to when not specified in the query.",
    },
  ],

  init(ctx) {
    template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      externalFetch = (...args) => ctx.fetch(...args);
    }
    currencyCache = createExtensionCache(
      ctx,
      "ext:currency-slot:rates",
      RATE_CACHE_TTL_MS,
    );
  },

  configure(settings) {
    _applySettings(settings);
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3 || isInformationalQuestion(q)) return false;
    if (COMMAND_PREFIX_RE.test(q)) return true;
    if (isTranslationQuery(q)) return false;
    const parsed = parseQuery(q);
    return Boolean(parsed?.from && parsed?.to && _hasCurrencyTriggerIntent(q, parsed));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    const rawQuery = (query || "").trim();

    try {
      const clean = query.replace(
        /^!(currency|convert|cur|\u043a\u0443\u0440\u0441|\u0432\u0430\u043b\u044e\u0442\u0430)\s*/i,
        "",
      );
      const parsed = parseQuery(clean);
      const from = parsed.from || "USD";
      const to = parsed.to || _settings.defaultTo;
      const amount = parsed.amount || 1;

      const quotes = [...new Set([to, ...POPULAR_PAIRS.flat()])].filter(
        (c) => c !== from && !CRYPTO_CODES.has(c),
      );

      let rates = {};
      let result = null;

      const fromIsCrypto = CRYPTO_CODES.has(from);
      const toIsCrypto = CRYPTO_CODES.has(to);

      if (!fromIsCrypto && !toIsCrypto) {
        const rateResult = await _fetchFiatRates(from, quotes);
        if (rateResult.ok) {
          rates = rateResult.rates;
          result = rates[to] != null ? amount * rates[to] : null;
        }
      } else {
        const rateResult = await _fetchConversionRate(from, to);
        if (rateResult.ok) {
          rates[to] = rateResult.rate;
          result = amount * rates[to];
        }
      }

      if (result === null) return { html: "" };

      const pairsHtml = POPULAR_PAIRS.map(([a, b]) => {
        let pairRate = null;
        if (a === from) {
          pairRate = rates[b] ?? null;
        } else if (b === from) {
          pairRate = rates[a] ? 1 / rates[a] : null;
        } else {
          pairRate = rates[a] && rates[b] ? rates[b] / rates[a] : null;
        }
        if (!pairRate) return "";
        const rateStr = _fmtRate(pairRate, 0);
        return `<div class="cxs-pair" data-from="${a}" data-to="${b}">
          <div class="cxs-pair-name">${a} / ${b}</div>
          <div class="cxs-pair-rate">${rateStr}</div>
        </div>`;
      }).join("");

      const resultStr = _fmtRate(result);
      const rateStr = _fmtRate(rates[to]);
      const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);

      const html = _fillTemplate(template, {
        from_flag: _makeFlag(from),
        from_code: from,
        from_name: _esc(CURRENCIES[from] || from),
        to_flag: _makeFlag(to),
        to_code: to,
        to_name: _esc(CURRENCIES[to] || to),
        amount_for_js: amount,
        rate_for_js: rates[to] || 0,
        from_for_js: from,
        to_for_js: to,
        amount: amountStr,
        result: resultStr,
        rate: rateStr,
        pairs_html: pairsHtml,
      });

      return { html };
    } catch (e) {
      return { html: "" };
    }
  },
};

// ── Exports ───────────────────────────────────────────────────
// Slot-only shape: a previous version of this file also exported a
// bang `command`, but degoog's Settings → Plugins page renders one row
// per exported capability, which produced a duplicate "Currency" entry.
// The slot's own `trigger(query)` already handles the bang prefixes
// (!cur, !currency, !convert, !курс, !валюта) via COMMAND_PREFIX_RE,
// AND the bare-query regex match (e.g. "100 usd to eur") that a
// command's prefix-only `naturalLanguagePhrases` cannot express. So
// collapsing to slot-only preserves all activation paths at the cost
// of losing the autobang suggestion entry for !cur — an acceptable
// trade given the plugin's headline feature is no-bang NL matching.
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
function _fmtRate(n, bigDecimals = 2) {
  if (n >= 1000) return _fmt(n, bigDecimals);
  if (n >= 1) return _fmt(n, 4);
  return _fmt(n, 6);
}
function _fillTemplate(tpl, vars) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.split(`{{${k}}}`).join(String(v)),
    tpl,
  );
}
