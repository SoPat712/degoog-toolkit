let template = "";
let _pluginDir = null;

// ── Hardcoded fallback (last resort when cache + API both fail) ─
const FALLBACK_CODES = [
  "USD","EUR","GBP","JPY","UAH","PLN","CHF","CAD","AUD","CNY",
  "SEK","NOK","DKK","CZK","HUF","RON","TRY","BRL","INR","KRW",
  "SGD","HKD","MXN","ZAR","RUB","BTC","ETH",
];
const FALLBACK_REGEX = new RegExp("\\b(" + FALLBACK_CODES.join("|") + ")\\b", "g");

// ── Mutable state populated from cache or API ─────────────────
let currencies = {};   // { USD: "US Dollar", ... }
let symbols = {};      // { USD: "$", ... }
let codeRegex = FALLBACK_REGEX;
const CACHE_FILE = "currencies-cache.json";

// Known symbols for fallback flag generation
const KNOWN_SYMBOLS = {
  USD:"$",EUR:"€",GBP:"£",JPY:"¥",CNY:"¥",INR:"₹",KRW:"₩",
  TRY:"₺",RUB:"₽",UAH:"₴",BRL:"R$",PLN:"zł",ZAR:"R",
  CHF:"Fr",CAD:"C$",AUD:"A$",BTC:"₿",ETH:"Ξ",
};

const POPULAR_PAIRS = [
  ["EUR","USD"],["GBP","USD"],["USD","JPY"],
  ["USD","UAH"],["BTC","USD"],["USD","CNY"],
  ["AUD","USD"],["EUR","GBP"],
];

// ── Flag SVG generator ────────────────────────────────────────
function _makeFlag(code) {
  const sym = symbols[code] || KNOWN_SYMBOLS[code] || code.slice(0, 2);
  const display = sym.length > 3 ? sym.slice(0, 3) : sym;
  const len = display.length;
  const fs = len <= 1 ? 11 : len <= 2 ? 9 : 8;
  return `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="${fs}" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">${_esc(display)}</text></svg>`;
}

// ── Apply currency data (shared by cache + API paths) ─────────
function _applyCurrencyData(data) {
  currencies = {};
  symbols = { ...KNOWN_SYMBOLS };
  for (const cur of data) {
    currencies[cur.iso_code] = cur.name;
    if (cur.symbol) symbols[cur.iso_code] = cur.symbol;
  }
  // Add crypto (not in Frankfurter)
  currencies.BTC = "Bitcoin";
  currencies.ETH = "Ethereum";
  // Rebuild regex from all known codes
  const codes = Object.keys(currencies).sort((a, b) => b.length - a.length);
  codeRegex = new RegExp("\\b(" + codes.join("|") + ")\\b", "g");
}

// ── Persist cache to plugin directory ─────────────────────────
async function _writeCache(data) {
  if (!_pluginDir) return;
  try {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(_pluginDir, CACHE_FILE), JSON.stringify(data));
  } catch (e) { /* non-critical */ }
}

// ── Load currencies from v2 API (one-shot) ────────────────────
let _loadPromise = null;
function _loadCurrencies() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const res = await fetch("https://api.frankfurter.dev/v2/currencies");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
      _applyCurrencyData(data);
      await _writeCache(data);
    } catch (e) {
      // If cache already populated state, keep it; otherwise use hardcoded
      if (Object.keys(currencies).length === 0) {
        for (const code of FALLBACK_CODES) currencies[code] = code;
      }
    }
  })();
  return _loadPromise;
}

// ── Query parser ──────────────────────────────────────────────
function parseQuery(query) {
  const q = query.trim().toLowerCase();
  const clean = q
    .replace(/\b(convert|конвертировать|конвертувати|скільки|сколько|курс|rate|price)\b/g, "")
    .replace(/\b(to|in|у|в|до|into|=)\b/g, " TO ")
    .trim();

  const amountMatch = clean.match(/(\d[\d\s,.']*)/);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/[\s,]/g, "").replace(/'/g, ""))
    : 1;

  const codes = clean.toUpperCase().match(codeRegex) || [];

  return {
    amount: amount || 1,
    from: codes[0] || "USD",
    to: codes[1] || "EUR",
  };
}

// ── Slot export ───────────────────────────────────────────────
export const slot = {
  id: "currency-slot",
  name: "Currency",
  description: "Currency converter with live rates. Supports !currency, or natural queries like '100 usd to eur'.",
  position: "above-results",

  settingsSchema: [
    {
      key: "defaultFrom",
      label: "Default source currency",
      type: "select",
      options: FALLBACK_CODES.filter(c => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert from by default.",
    },
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: FALLBACK_CODES.filter(c => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert to by default.",
    },
  ],

  async init(ctx) {
    template = ctx.template;
    _pluginDir = ctx.dir || null;
    // Load cached currency list (no network needed)
    try {
      const cached = await ctx.readFile(CACHE_FILE);
      if (cached) {
        const data = JSON.parse(cached);
        if (Array.isArray(data) && data.length > 0) _applyCurrencyData(data);
      }
    } catch (e) { /* no cache yet, will fetch on first execute */ }
  },

  configure(settings) {
    this._defaultFrom = settings?.defaultFrom || "USD";
    this._defaultTo   = settings?.defaultTo   || "EUR";
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    if (/^!(currency|convert|cur|курс|валюта)/i.test(q)) return true;
    const codes = q.toUpperCase().match(codeRegex) || [];
    if (codes.length >= 1 && /\b(to|in|у|в|convert|курс|rate|=)\b/i.test(q)) return true;
    if (codes.length >= 2) return true;
    return false;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    await _loadCurrencies();

    try {
      const clean = query.replace(/^!(currency|convert|cur|курс|валюта)\s*/i, "");
      const parsed = parseQuery(clean);
      const from = parsed.from || this._defaultFrom || "USD";
      const to   = parsed.to   || this._defaultTo   || "EUR";
      const amount = parsed.amount || 1;

      const quotes = [...new Set([
        to,
        ...POPULAR_PAIRS.flat(),
      ])].filter(c => c !== from && c !== "BTC" && c !== "ETH").join(",");

      let rates = {};
      let result = null;

      const fromIsCrypto = ["BTC","ETH"].includes(from);
      const toIsCrypto   = ["BTC","ETH"].includes(to);

      if (!fromIsCrypto && !toIsCrypto) {
        const res = await fetch(
          `https://api.frankfurter.dev/v2/rates?base=${from}&quotes=${quotes},${to}`,
        );
        if (res.ok) {
          const data = await res.json();
          // v2 returns an array of { base, quote, rate } objects — build our rates map
          for (const entry of data) {
            if (entry.quote && entry.rate != null) rates[entry.quote] = entry.rate;
          }
          result = rates[to] != null ? (amount * rates[to]) : null;
        }
      } else {
        const coinId = from === "BTC" ? "bitcoin" : "ethereum";
        const vsCurrency = toIsCrypto ? "usd" : to.toLowerCase();
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`,
        );
        if (res.ok) {
          const data = await res.json();
          const rate = data[coinId]?.[vsCurrency];
          if (rate) {
            rates[to] = toIsCrypto ? 1 / rate : rate;
            result = amount * rates[to];
          }
        }
      }

      if (result === null) return { html: "" };

      const pairsHtml = POPULAR_PAIRS.map(([a, b]) => {
        let pairRate = null;
        if (a === from) {
          pairRate = rates[b] ?? null;
        } else if (b === from) {
          pairRate = rates[a] ? (1 / rates[a]) : null;
        } else {
          pairRate = (rates[a] && rates[b]) ? (rates[b] / rates[a]) : null;
        }
        if (!pairRate) return "";
        const rateStr = pairRate >= 1000 ? _fmt(pairRate, 0) : pairRate >= 1 ? _fmt(pairRate, 4) : _fmt(pairRate, 6);
        return `<div class="cxs-pair" data-from="${a}" data-to="${b}">
          <div class="cxs-pair-name">${a} / ${b}</div>
          <div class="cxs-pair-rate">${rateStr}</div>
        </div>`;
      }).join("");

      const resultStr = result >= 1000 ? _fmt(result, 2) : result >= 1 ? _fmt(result, 4) : _fmt(result, 6);
      const rateStr   = rates[to] >= 1000 ? _fmt(rates[to], 2) : rates[to] >= 1 ? _fmt(rates[to], 4) : _fmt(rates[to], 6);
      const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);

      const curListObj = Object.entries(currencies).map(([code, name]) => ({
        code, name, symbol: symbols[code] || KNOWN_SYMBOLS[code] || code.slice(0, 2),
      }));

      const html = template
        .split("{{from_flag}}").join(_makeFlag(from))
        .split("{{from_code}}").join(from)
        .split("{{from_name}}").join(_esc(currencies[from] || from))
        .split("{{to_flag}}").join(_makeFlag(to))
        .split("{{to_code}}").join(to)
        .split("{{to_name}}").join(_esc(currencies[to] || to))
        .split("{{amount_for_js}}").join(amount)
        .split("{{rate_for_js}}").join(rates[to] || 0)
        .split("{{from_for_js}}").join(from)
        .split("{{to_for_js}}").join(to)
        .split("{{amount}}").join(amountStr)
        .split("{{result}}").join(resultStr)
        .split("{{rate}}").join(rateStr)
        .split("{{pairs_html}}").join(pairsHtml)
        .split("{{cur_list_json}}").join(JSON.stringify(curListObj));

      return { html };
    } catch(e) {
      return { html: "" };
    }
  },
};

export default { slot };

function _fmt(n, decimals) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function _esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
