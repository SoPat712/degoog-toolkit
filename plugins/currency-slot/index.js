let template = "";

// ── Static currency data (server-side display only) ───────────
const CURRENCIES = {
  USD:"US Dollar",EUR:"Euro",GBP:"British Pound",JPY:"Japanese Yen",
  UAH:"Ukrainian Hryvnia",PLN:"Polish Zloty",CHF:"Swiss Franc",
  CAD:"Canadian Dollar",AUD:"Australian Dollar",CNY:"Chinese Yuan",
  SEK:"Swedish Krona",NOK:"Norwegian Krone",DKK:"Danish Krone",
  CZK:"Czech Koruna",HUF:"Hungarian Forint",RON:"Romanian Leu",
  TRY:"Turkish Lira",BRL:"Brazilian Real",INR:"Indian Rupee",
  KRW:"South Korean Won",SGD:"Singapore Dollar",HKD:"Hong Kong Dollar",
  MXN:"Mexican Peso",ZAR:"South African Rand",RUB:"Russian Ruble",
  BTC:"Bitcoin",ETH:"Ethereum",
};

const KNOWN_SYMBOLS = {
  USD:"$",EUR:"€",GBP:"£",JPY:"¥",CNY:"¥",INR:"₹",KRW:"₩",
  TRY:"₺",RUB:"₽",UAH:"₴",BRL:"R$",PLN:"zł",ZAR:"R",
  CHF:"Fr",CAD:"C$",AUD:"A$",BTC:"₿",ETH:"Ξ",
};

const CODES = Object.keys(CURRENCIES);
const CODE_REGEX = new RegExp("\\b(" + CODES.join("|") + ")\\b", "g");

const POPULAR_PAIRS = [
  ["EUR","USD"],["GBP","USD"],["USD","JPY"],
  ["USD","UAH"],["BTC","USD"],["USD","CNY"],
  ["AUD","USD"],["EUR","GBP"],
];

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
  const q = query.trim().toLowerCase();
  const clean = q
    .replace(/\b(convert|конвертировать|конвертувати|скільки|сколько|курс|rate|price)\b/g, "")
    .replace(/\b(to|in|у|в|до|into|=)\b/g, " TO ")
    .trim();

  const amountMatch = clean.match(/(\d[\d\s,']*)/);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/[\s,]/g, "").replace(/'/g, ""))
    : 1;

  const codes = clean.toUpperCase().match(CODE_REGEX) || [];

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
      options: CODES.filter(c => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert from by default.",
    },
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: CODES.filter(c => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert to by default.",
    },
  ],

  init(ctx) { template = ctx.template; },

  configure(settings) {
    this._defaultFrom = settings?.defaultFrom || "USD";
    this._defaultTo   = settings?.defaultTo   || "EUR";
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    if (/^!(currency|convert|cur|курс|валюта)/i.test(q)) return true;
    const codes = q.toUpperCase().match(CODE_REGEX) || [];
    if (codes.length >= 1 && /\b(to|in|у|в|convert|курс|rate|=)\b/i.test(q)) return true;
    if (codes.length >= 2) return true;
    return false;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

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

      const html = template
        .split("{{from_flag}}").join(_makeFlag(from))
        .split("{{from_code}}").join(from)
        .split("{{from_name}}").join(_esc(CURRENCIES[from] || from))
        .split("{{to_flag}}").join(_makeFlag(to))
        .split("{{to_code}}").join(to)
        .split("{{to_name}}").join(_esc(CURRENCIES[to] || to))
        .split("{{amount_for_js}}").join(amount)
        .split("{{rate_for_js}}").join(rates[to] || 0)
        .split("{{from_for_js}}").join(from)
        .split("{{to_for_js}}").join(to)
        .split("{{amount}}").join(amountStr)
        .split("{{result}}").join(resultStr)
        .split("{{rate}}").join(rateStr)
        .split("{{pairs_html}}").join(pairsHtml);

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
