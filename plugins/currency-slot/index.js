let template = "";

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

// SVG флаги — компактные, но узнаваемые
const FLAGS = {
  USD: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">$</text></svg>`,
  
  EUR: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">€</text></svg>`,
  
  GBP: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">£</text></svg>`,
  
  JPY: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">¥</text></svg>`,
  
  UAH: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₴</text></svg>`,
  
  PLN: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="8" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">zł</text></svg>`,
  
  CHF: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">CH</text></svg>`,
  
  CAD: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">CA</text></svg>`,
  
  AUD: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">AU</text></svg>`,
  
  CNY: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">¥</text></svg>`,
  
  SEK: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">SE</text></svg>`,
  
  NOK: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">NO</text></svg>`,
  
  DKK: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">DK</text></svg>`,
  
  CZK: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">CZ</text></svg>`,
  
  HUF: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">HU</text></svg>`,
  
  RON: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">RO</text></svg>`,
  
  TRY: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₺</text></svg>`,
  
  BRL: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">R$</text></svg>`,
  
  INR: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₹</text></svg>`,
  
  KRW: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₩</text></svg>`,
  
  SGD: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">SG</text></svg>`,
  
  HKD: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">HK</text></svg>`,
  
  MXN: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="9" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">MX</text></svg>`,
  
  ZAR: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">R</text></svg>`,
  
  RUB: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₽</text></svg>`,
  
  BTC: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">₿</text></svg>`,
  
  ETH: `<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="11" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">Ξ</text></svg>`,
};

const POPULAR_PAIRS = [
  ["EUR","USD"],["GBP","USD"],["USD","JPY"],
  ["USD","UAH"],["BTC","USD"],["USD","CNY"],
];

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

  const codes = clean.toUpperCase().match(/\b(USD|EUR|GBP|JPY|UAH|PLN|CHF|CAD|AUD|CNY|SEK|NOK|DKK|CZK|HUF|RON|TRY|BRL|INR|KRW|SGD|HKD|MXN|ZAR|RUB|BTC|ETH)\b/g) || [];

  return {
    amount: amount || 1,
    from: codes[0] || "USD",
    to: codes[1] || "EUR",
  };
}

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
      options: Object.keys(CURRENCIES),
      description: "Currency to convert from by default.",
    },
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: Object.keys(CURRENCIES),
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
    const codes = q.toUpperCase().match(/\b(USD|EUR|GBP|JPY|UAH|PLN|CHF|CAD|AUD|CNY|SEK|NOK|DKK|CZK|HUF|RON|TRY|BRL|INR|KRW|SGD|HKD|MXN|ZAR|RUB|BTC|ETH)\b/g) || [];
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

      const symbols = [...new Set([
        to,
        ...POPULAR_PAIRS.flat(),
      ])].filter(c => c !== from && c !== "BTC" && c !== "ETH").join(",");

      let rates = {};
      let result = null;

      const fromIsCrypto = ["BTC","ETH"].includes(from);
      const toIsCrypto   = ["BTC","ETH"].includes(to);

      if (!fromIsCrypto && !toIsCrypto) {
        const res = await fetch(
          `https://api.frankfurter.app/latest?from=${from}&symbols=${symbols},${to}`,
        );
        if (res.ok) {
          const data = await res.json();
          rates = data.rates || {};
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
        // rates are relative to `from`. To get rate a→b:
        // if a === from: rates[b] directly
        // if b === from: 1 / rates[a]
        // otherwise cross-rate: rates[b] / rates[a]
        let pairRate = null;
        if (a === from) {
          pairRate = rates[b] ?? null;
        } else if (b === from) {
          pairRate = rates[a] ? (1 / rates[a]) : null;
        } else {
          pairRate = (rates[a] && rates[b]) ? (rates[b] / rates[a]) : null;
        }
        const rate = pairRate;
        if (!rate) return "";
        const rateStr = rate >= 1000 ? _fmt(rate, 0) : rate >= 1 ? _fmt(rate, 4) : _fmt(rate, 6);
        return `<div class="cxs-pair" data-from="${a}" data-to="${b}">
          <div class="cxs-pair-name">${a} / ${b}</div>
          <div class="cxs-pair-rate">${rateStr}</div>
        </div>`;
      }).join("");

      const resultStr = result >= 1000 ? _fmt(result, 2) : result >= 1 ? _fmt(result, 4) : _fmt(result, 6);
      const rateStr   = rates[to] >= 1000 ? _fmt(rates[to], 2) : rates[to] >= 1 ? _fmt(rates[to], 4) : _fmt(rates[to], 6);
      const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);

      const curListObj = Object.entries(CURRENCIES).map(([code,name]) => ({code,name,flag:FLAGS[code]||''}));

      const html = template
        .split("{{from_flag}}").join(FLAGS[from] || "")
        .split("{{from_code}}").join(from)
        .split("{{from_name}}").join(_esc(CURRENCIES[from] || from))
        .split("{{to_flag}}").join(FLAGS[to] || "")
        .split("{{to_code}}").join(to)
        .split("{{to_name}}").join(_esc(CURRENCIES[to] || to))
        .split("{{amount}}").join(amountStr)
        .split("{{result}}").join(resultStr)
        .split("{{rate}}").join(rateStr)
        .split("{{pairs_html}}").join(pairsHtml)
        .split("{{cur_list_json}}").join(JSON.stringify(curListObj))
        .split("{{from_for_js}}").join(from)
        .split("{{to_for_js}}").join(to)
        .split("{{amount_for_js}}").join(amount)
        .split("{{rate_for_js}}").join(rates[to] || 0);

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
