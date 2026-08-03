/** @typedef {{ aliasToCode: Map<string, string>, sortedAliases: string[], searchTextByCode: Record<string, string> }} CurrencyAliasIndex */

const AMBIGUOUS_UNIT_WORDS = new Set([
  "afghani",
  "ariary",
  "balboa",
  "boliviano",
  "cedi",
  "colón",
  "colon",
  "cordoba",
  "córdoba",
  "dalasi",
  "denar",
  "dinar",
  "dirham",
  "dollar",
  "dollars",
  "dong",
  "dram",
  "escudo",
  "florin",
  "forint",
  "franc",
  "francs",
  "gourde",
  "gulden",
  "guaraní",
  "guarani",
  "hryvnia",
  "kina",
  "kip",
  "koruna",
  "krone",
  "krona",
  "kwacha",
  "kyat",
  "lari",
  "lats",
  "lempira",
  "leone",
  "lev",
  "lek",
  "leu",
  "lilangeni",
  "lira",
  "loti",
  "manat",
  "mark",
  "metical",
  "nakfa",
  "naira",
  "ngultrum",
  "ouguiya",
  "paʻanga",
  "paanga",
  "pataca",
  "peso",
  "pesos",
  "pound",
  "pounds",
  "pula",
  "quetzal",
  "real",
  "reais",
  "rial",
  "riel",
  "ringgit",
  "riyal",
  "rub",
  "ruble",
  "rouble",
  "rubles",
  "roubles",
  "rufiyaa",
  "rupiah",
  "rupee",
  "rupees",
  "shekel",
  "shilling",
  "sol",
  "som",
  "somoni",
  "taka",
  "tala",
  "tenge",
  "tögrög",
  "togrog",
  "vatu",
  "won",
  "yen",
  "yuan",
  "zloty",
  "złoty",
]);

/** Hand-tuned phrases people type in search/conversion queries. */
export const MANUAL_CURRENCY_ALIASES = {
  USD: [
    "us dollar",
    "us dollars",
    "u s dollar",
    "u s dollars",
    "u.s. dollar",
    "u.s. dollars",
    "american dollar",
    "american dollars",
    "united states dollar",
    "united states dollars",
  ],
  EUR: ["euro", "euros", "eu euro", "eu euros"],
  GBP: [
    "british pound",
    "british pounds",
    "pound sterling",
    "uk pound",
    "uk pounds",
    "sterling",
  ],
  JPY: ["japanese yen", "jp yen"],
  CNY: [
    "chinese yuan",
    "chinese yen",
    "chinese renminbi",
    "renminbi",
    "rmb",
    "yuan",
  ],
  CNH: ["offshore yuan", "chinese offshore yuan", "offshore renminbi"],
  RUB: [
    "russian ruble",
    "russian rouble",
    "russian rubles",
    "russian roubles",
    "ruble",
    "rouble",
    "rubles",
    "roubles",
  ],
  CAD: ["canadian dollar", "canadian dollars"],
  AUD: ["australian dollar", "australian dollars", "aussie dollar"],
  NZD: ["new zealand dollar", "new zealand dollars", "kiwi dollar"],
  CHF: ["swiss franc", "swiss francs"],
  INR: ["indian rupee", "indian rupees"],
  KRW: ["south korean won", "korean won"],
  MXN: ["mexican peso", "mexican pesos"],
  BRL: ["brazilian real", "brazilian reais"],
  ZAR: ["south african rand", "south african rands"],
  SEK: ["swedish krona", "swedish kronor"],
  NOK: ["norwegian krone", "norwegian kroner"],
  DKK: ["danish krone", "danish kroner"],
  PLN: ["polish zloty", "polish złoty", "zloty", "złoty"],
  TRY: ["turkish lira"],
  HKD: ["hong kong dollar", "hong kong dollars"],
  SGD: ["singapore dollar", "singapore dollars"],
  THB: ["thai baht"],
  IDR: ["indonesian rupiah"],
  MYR: ["malaysian ringgit"],
  PHP: ["philippine peso", "philippine pesos"],
  ILS: ["israeli shekel", "israeli new shekel"],
  AED: ["uae dirham", "emirati dirham"],
  SAR: ["saudi riyal"],
  UAH: ["ukrainian hryvnia"],
  ARS: ["argentine peso", "argentine pesos"],
  CLP: ["chilean peso", "chilean pesos"],
  COP: ["colombian peso", "colombian pesos"],
  PEN: ["peruvian sol"],
  VND: ["vietnamese dong"],
  TWD: ["taiwan dollar", "new taiwan dollar"],
  BTC: ["bitcoin"],
  ETH: ["ethereum", "ether"],
};

export function normalizeCurrencyText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pluralizeLastWord(phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const last = words[words.length - 1];
  if (last.endsWith("s")) return phrase;
  let pluralLast = last;
  if (last.endsWith("y") && !/[aeiou]y$/i.test(last)) {
    pluralLast = `${last.slice(0, -1)}ies`;
  } else {
    pluralLast = `${last}s`;
  }
  return `${words.slice(0, -1).join(" ")} ${pluralLast}`.trim();
}

function addAlias(aliasMap, alias, code) {
  const key = normalizeCurrencyText(alias);
  if (!key) return;
  if (!aliasMap.has(key)) aliasMap.set(key, code);
}

function addGeneratedNameAliases(aliasMap, code, name) {
  const normalized = normalizeCurrencyText(name);
  if (!normalized) return;

  addAlias(aliasMap, normalized, code);

  const plural = pluralizeLastWord(normalized);
  if (plural && plural !== normalized) addAlias(aliasMap, plural, code);

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(" ");
    addAlias(aliasMap, lastTwo, code);
    const lastTwoPlural = pluralizeLastWord(lastTwo);
    if (lastTwoPlural && lastTwoPlural !== lastTwo) {
      addAlias(aliasMap, lastTwoPlural, code);
    }
  }

  const lastWord = words[words.length - 1] || "";
  if (lastWord && !AMBIGUOUS_UNIT_WORDS.has(lastWord)) {
    addAlias(aliasMap, lastWord, code);
    const lastPlural = pluralizeLastWord(lastWord);
    if (lastPlural && lastPlural !== lastWord) addAlias(aliasMap, lastPlural, code);
  }
}

/**
 * @param {Record<string, string>} currencies
 * @param {Record<string, string[]>} [manualAliases]
 * @returns {CurrencyAliasIndex}
 */
export function buildCurrencyAliasIndex(
  currencies,
  manualAliases = MANUAL_CURRENCY_ALIASES,
) {
  const aliasMap = new Map();

  for (const [code, name] of Object.entries(currencies)) {
    addGeneratedNameAliases(aliasMap, code, name);
    addAlias(aliasMap, code.toLowerCase(), code);
  }

  for (const [code, aliases] of Object.entries(manualAliases)) {
    if (!currencies[code]) continue;
    for (const alias of aliases) addAlias(aliasMap, alias, code);
  }

  const sortedAliases = [...aliasMap.keys()].sort((a, b) => b.length - a.length);

  const searchTextByCode = {};
  for (const [code, name] of Object.entries(currencies)) {
    const aliases = sortedAliases.filter((alias) => aliasMap.get(alias) === code);
    searchTextByCode[code] = [code, name, ...aliases]
      .join(" ")
      .toLowerCase();
  }

  return { aliasToCode: aliasMap, sortedAliases, searchTextByCode };
}

/**
 * @param {string} text
 * @param {CurrencyAliasIndex} index
 * @param {{ validCodes?: string[], ambiguousWordCodes?: Set<string> }} [options]
 * @returns {string[]}
 */
export function extractCurrencyCodes(
  text,
  index,
  { validCodes = [], ambiguousWordCodes = new Set() } = {},
) {
  const haystack = String(text || "");
  const lower = haystack.toLowerCase();
  const matches = [];

  for (const alias of index.sortedAliases) {
    const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, "gi");
    for (const match of lower.matchAll(re)) {
      const code = index.aliasToCode.get(alias);
      const originalToken = haystack.slice(match.index, match.index + match[0].length);
      if (
        alias.length === 3 &&
        ambiguousWordCodes.has(code) &&
        originalToken !== originalToken.toUpperCase()
      ) {
        continue;
      }
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        code,
        len: alias.length,
      });
    }
  }

  if (validCodes.length > 0) {
    const codePattern = validCodes
      .map((code) => escapeRegex(code))
      .join("|");
    const codeRe = new RegExp(`\\b(?:${codePattern})\\b`, "gi");
    for (const match of haystack.matchAll(codeRe)) {
      const code = match[0].toUpperCase();
      if (ambiguousWordCodes.has(code)) {
        const token = match[0];
        if (token !== token.toUpperCase()) continue;
      }
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        code,
        len: code.length,
      });
    }
  }

  matches.sort((a, b) => a.start - b.start || b.len - a.len);

  const picked = [];
  for (const match of matches) {
    if (!match.code) continue;
    if (picked.some((p) => match.start < p.end && match.end > p.start)) continue;
    picked.push(match);
  }

  return picked.map((match) => match.code);
}

/**
 * @param {string} query
 * @param {CurrencyAliasIndex} index
 * @param {{ validCodes?: string[], ambiguousWordCodes?: Set<string> }} [options]
 */
export function parseCurrencyQuery(
  query,
  index,
  { validCodes = [], ambiguousWordCodes = new Set() } = {},
) {
  const q = String(query || "").trim();
  const clean = q
    .replace(
      /\b(convert|\u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c|\u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0443\u0432\u0430\u0442\u0438|\u0441\u043a\u0456\u043b\u044c\u043a\u0438|\u0441\u043a\u043e\u043b\u044c\u043a\u043e|\u043a\u0443\u0440\u0441|rate|price)\b/gi,
      "",
    )
    .replace(/\b(to|in|\u0443|\u0432|\u0434\u043e|into|a|en|=)\b/gi, " TO ")
    .trim();

  const amountMatch = clean.match(/(\d[\d\s,']*(?:\.\d+)?)/);
  const amount = amountMatch
    ? parseFloat(amountMatch[1].replace(/[\s,]/g, "").replace(/'/g, ""))
    : 1;

  const options = { validCodes, ambiguousWordCodes };
  const parts = clean.split(/\s+TO\s+/i);
  if (parts.length >= 2) {
    const fromCodes = extractCurrencyCodes(parts[0], index, options);
    const toCodes = extractCurrencyCodes(parts[parts.length - 1], index, options);
    return {
      amount: amount || 1,
      from: fromCodes[0] || null,
      to: toCodes[0] || null,
    };
  }

  const codes = extractCurrencyCodes(clean, index, options);

  return {
    amount: amount || 1,
    from: codes[0] || null,
    to: codes[1] || null,
  };
}
