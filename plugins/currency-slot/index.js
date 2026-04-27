let template = "";

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
const CODE_REGEX = new RegExp("\\b(" + CODES.join("|") + ")\\b", "g");

const POPULAR_PAIRS = [
  ["EUR", "USD"],
  ["GBP", "USD"],
  ["USD", "JPY"],
  ["USD", "UAH"],
  ["BTC", "USD"],
  ["USD", "CNY"],
  ["AUD", "USD"],
  ["EUR", "GBP"],
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
    .replace(
      /\b(convert|\u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c|\u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0443\u0432\u0430\u0442\u0438|\u0441\u043a\u0456\u043b\u044c\u043a\u0438|\u0441\u043a\u043e\u043b\u044c\u043a\u043e|\u043a\u0443\u0440\u0441|rate|price)\b/g,
      "",
    )
    .replace(/\b(to|in|\u0443|\u0432|\u0434\u043e|into|=)\b/g, " TO ")
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
  description:
    "Currency converter with live rates. Supports !currency, or natural queries like '100 usd to eur'.",
  position: "above-results",

  settingsSchema: [
    {
      key: "defaultFrom",
      label: "Default source currency",
      type: "select",
      options: CODES.filter((c) => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert from by default.",
    },
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: CODES.filter((c) => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert to by default.",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    this._defaultFrom = settings?.defaultFrom || "USD";
    this._defaultTo = settings?.defaultTo || "EUR";
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    if (
      /^!(currency|convert|cur|\u043a\u0443\u0440\u0441|\u0432\u0430\u043b\u044e\u0442\u0430)/i.test(
        q,
      )
    )
      return true;
    const codes = q.toUpperCase().match(CODE_REGEX) || [];
    if (codes.length >= 2) return true;
    return false;
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    try {
      const clean = query.replace(
        /^!(currency|convert|cur|\u043a\u0443\u0440\u0441|\u0432\u0430\u043b\u044e\u0442\u0430)\s*/i,
        "",
      );
      const parsed = parseQuery(clean);
      const from = parsed.from || this._defaultFrom || "USD";
      const to = parsed.to || this._defaultTo || "EUR";
      const amount = parsed.amount || 1;

      const quotes = [...new Set([to, ...POPULAR_PAIRS.flat()])]
        .filter((c) => c !== from && c !== "BTC" && c !== "ETH")
        .join(",");

      let rates = {};
      let result = null;

      const fromIsCrypto = ["BTC", "ETH"].includes(from);
      const toIsCrypto = ["BTC", "ETH"].includes(to);

      if (!fromIsCrypto && !toIsCrypto) {
        const res = await fetch(
          `https://api.frankfurter.dev/v2/rates?base=${from}&quotes=${quotes},${to}`,
        );
        if (res.ok) {
          const data = await res.json();
          for (const entry of data) {
            if (entry.quote && entry.rate != null)
              rates[entry.quote] = entry.rate;
          }
          result = rates[to] != null ? amount * rates[to] : null;
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
          pairRate = rates[a] ? 1 / rates[a] : null;
        } else {
          pairRate = rates[a] && rates[b] ? rates[b] / rates[a] : null;
        }
        if (!pairRate) return "";
        const rateStr =
          pairRate >= 1000
            ? _fmt(pairRate, 0)
            : pairRate >= 1
              ? _fmt(pairRate, 4)
              : _fmt(pairRate, 6);
        return `<div class="cxs-pair" data-from="${a}" data-to="${b}">
          <div class="cxs-pair-name">${a} / ${b}</div>
          <div class="cxs-pair-rate">${rateStr}</div>
        </div>`;
      }).join("");

      const resultStr =
        result >= 1000
          ? _fmt(result, 2)
          : result >= 1
            ? _fmt(result, 4)
            : _fmt(result, 6);
      const rateStr =
        rates[to] >= 1000
          ? _fmt(rates[to], 2)
          : rates[to] >= 1
            ? _fmt(rates[to], 4)
            : _fmt(rates[to], 6);
      const amountStr = _fmt(amount, amount % 1 === 0 ? 0 : 2);

      const html = template
        .split("{{from_flag}}")
        .join(_makeFlag(from))
        .split("{{from_code}}")
        .join(from)
        .split("{{from_name}}")
        .join(_esc(CURRENCIES[from] || from))
        .split("{{to_flag}}")
        .join(_makeFlag(to))
        .split("{{to_code}}")
        .join(to)
        .split("{{to_name}}")
        .join(_esc(CURRENCIES[to] || to))
        .split("{{amount_for_js}}")
        .join(amount)
        .split("{{rate_for_js}}")
        .join(rates[to] || 0)
        .split("{{from_for_js}}")
        .join(from)
        .split("{{to_for_js}}")
        .join(to)
        .split("{{amount}}")
        .join(amountStr)
        .split("{{result}}")
        .join(resultStr)
        .split("{{rate}}")
        .join(rateStr)
        .split("{{pairs_html}}")
        .join(pairsHtml);

      return { html };
    } catch (e) {
      return { html: "" };
    }
  },
};

// ── Bang command export ───────────────────────────────────────
export const slotPlugin = slot;

export const command = {
  name: "Currency",
  description: "Convert currencies. Usage: !cur 100 USD to EUR",
  trigger: "cur",
  aliases: ["currency", "convert"],
  naturalLanguagePhrases: [
    "convert currency",
    "exchange rate",
    "currency converter",
  ],

  settingsSchema: [
    {
      key: "defaultFrom",
      label: "Default source currency",
      type: "select",
      options: CODES.filter((c) => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert from by default.",
    },
    {
      key: "defaultTo",
      label: "Default target currency",
      type: "select",
      options: CODES.filter((c) => c !== "BTC" && c !== "ETH"),
      description: "Currency to convert to by default.",
    },
  ],

  init(ctx) {
    if (!template) template = ctx.template;
  },

  configure(settings) {
    this._defaultFrom = settings?.defaultFrom || "USD";
    this._defaultTo = settings?.defaultTo || "EUR";
  },

  async execute(args) {
    const result = await slot.execute.call(
      {
        _defaultFrom: this._defaultFrom || "USD",
        _defaultTo: this._defaultTo || "EUR",
      },
      args || "",
      null,
    );
    if (!result?.html) {
      return {
        title: "Currency",
        html:
          `<p style="color:var(--text-secondary);font-size:0.9rem;padding:8px 0">` +
          `Usage: <code>!cur 100 USD to EUR</code></p>`,
      };
    }
    return { title: "Currency", html: result.html };
  },
};

// Default export must be a single concrete capability so degoog registers it correctly.
export default command;

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
