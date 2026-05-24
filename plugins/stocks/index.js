let templateHtml = "";
let pluginFetch = (...args) => fetch(...args);
let quoteCache = null;

const PLUGIN_NAME = "Stocks";
const CACHE_TTL_MS = 60 * 1000;
const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const STOOQ_QUOTE_URL = "https://stooq.com/q/l/";
const STOCK_CHART_PERIODS = {
  "1d": { label: "1D", range: "1d", interval: "5m" },
  "5d": { label: "5D", range: "5d", interval: "15m" },
  "1mo": { label: "1M", range: "1mo", interval: "1d" },
  "6mo": { label: "6M", range: "6mo", interval: "1d" },
  ytd: { label: "YTD", range: "ytd", interval: "1d" },
  max: { label: "Max", range: "max", interval: "1mo" },
};

const REQUEST_HEADERS = {
  Accept: "application/json,text/csv,text/plain;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (compatible; degoog-stocks/1.0; +https://github.com/SoPat712)",
};

const BANG_PREFIX_RX = /^!(stock|stocks|quote|ticker)\b\s*/i;
const CASH_TAG_RX = /(?:^|\s)\$([A-Za-z][A-Za-z0-9.-]{0,11})(?=$|\s|[?!.,;:])/;
const STOCK_WORD_RX = /\b(stock|stocks|share|shares|equity|equities|quote|ticker)\b/i;
const PRICE_WORD_RX = /\b(price|prices)\b/i;
const MARKET_SHARE_RX = /\bmarket\s+shares?\b/i;

const ACCEPTED_QUOTE_TYPES = new Set([
  "EQUITY",
  "ETF",
  "MUTUALFUND",
  "ECNQUOTE",
]);
const REJECTED_QUOTE_TYPES = new Set([
  "CRYPTOCURRENCY",
  "CURRENCY",
  "FUTURE",
  "INDEX",
  "OPTION",
]);

const NON_STOCK_TARGETS = new Set([
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "crypto",
  "cryptocurrency",
  "dogecoin",
  "litecoin",
  "solana",
  "cardano",
  "xrp",
  "forex",
]);

const BAD_COMPANY_TARGETS = new Set([
  "market",
  "market today",
  "news",
  "today",
  "forecast",
  "photo",
  "photos",
  "image",
  "images",
  "video",
  "videos",
  "footage",
  "recipe",
  "recipes",
  "soup",
  "broth",
  "chicken",
  "vegetable",
]);

const NON_FINANCE_CONTEXT_WORDS = new Set([
  "photo",
  "photos",
  "image",
  "images",
  "video",
  "videos",
  "footage",
  "recipe",
  "recipes",
  "soup",
  "broth",
  "chicken",
  "vegetable",
]);

const AMBIGUOUS_SYMBOLS = new Set([
  "A",
  "I",
  "AI",
  "ALL",
  "ARE",
  "AS",
  "AT",
  "BE",
  "BY",
  "CAN",
  "FOR",
  "HAS",
  "IN",
  "IT",
  "LOW",
  "NOW",
  "ON",
  "OPEN",
  "OR",
  "SAVE",
  "SO",
  "TO",
  "TRY",
  "USA",
  "USD",
]);

const COMPANY_ALIASES = new Map([
  ["adobe", "ADBE"],
  ["alphabet", "GOOGL"],
  ["amazon", "AMZN"],
  ["amd", "AMD"],
  ["apple", "AAPL"],
  ["berkshire", "BRK-B"],
  ["berkshire hathaway", "BRK-B"],
  ["boeing", "BA"],
  ["costco", "COST"],
  ["disney", "DIS"],
  ["facebook", "META"],
  ["ford", "F"],
  ["google", "GOOGL"],
  ["home depot", "HD"],
  ["intel", "INTC"],
  ["johnson and johnson", "JNJ"],
  ["jpmorgan", "JPM"],
  ["mastercard", "MA"],
  ["meta", "META"],
  ["microsoft", "MSFT"],
  ["netflix", "NFLX"],
  ["nvidia", "NVDA"],
  ["oracle", "ORCL"],
  ["paypal", "PYPL"],
  ["pepsi", "PEP"],
  ["salesforce", "CRM"],
  ["tesla", "TSLA"],
  ["visa", "V"],
  ["walmart", "WMT"],
]);

const STOOQ_SUFFIX_META = {
  US: { currency: "USD", exchange: "US" },
  UK: { currency: "GBP", exchange: "LSE" },
  JP: { currency: "JPY", exchange: "TSE" },
  HK: { currency: "HKD", exchange: "HKEX" },
  PL: { currency: "PLN", exchange: "WSE" },
  DE: { currency: "EUR", exchange: "Germany" },
  FR: { currency: "EUR", exchange: "France" },
  CA: { currency: "CAD", exchange: "Canada" },
  AU: { currency: "AUD", exchange: "Australia" },
};

const EXCHANGE_LABELS = {
  NMS: "NasdaqGS",
  NGM: "NasdaqGM",
  NCM: "NasdaqCM",
  NAS: "Nasdaq",
  NYQ: "NYSE",
  ASE: "NYSE American",
  PCX: "NYSE Arca",
  PNK: "OTC",
};

export const slot = {
  id: "stocks",
  name: PLUGIN_NAME,
  description:
    "Shows no-key stock quotes for explicit ticker and company-share queries using server-side Yahoo Finance data with Stooq fallback.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "at-a-glance", "knowledge-panel"],
  waitForResults: true,

  async init(ctx) {
    templateHtml = ctx?.template || "";
    if (!templateHtml && typeof ctx?.readFile === "function") {
      templateHtml = await ctx.readFile("template.html");
    }
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
    if (typeof ctx?.createCache === "function") {
      quoteCache = ctx.createCache(CACHE_TTL_MS);
    }
  },

  trigger(query) {
    return parseStockQuery(query) !== null || shouldConsiderResultHints(query);
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { html: "" };

    const request =
      parseStockQuery(query) || parseYahooResultRequest(context?.results);
    if (!request) return { html: "" };

    const doFetch =
      typeof context?.fetch === "function"
        ? (...args) => context.fetch(...args)
        : pluginFetch;
    if (!doFetch) return { html: "" };

    try {
      const quote = await getCachedQuote(request, doFetch);
      if (!quote) return { html: "" };

      return {
        title: "",
        html: renderQuote(quote),
      };
    } catch {
      return { html: "" };
    }
  },
};

export default slot;

export const routes = [
  {
    path: "chart",
    method: "get",
    handler: handleChartRoute,
  },
];

async function getCachedQuote(request, doFetch) {
  const key = `stocks:${request.kind}:${request.symbol || request.target}`;
  const cached = quoteCache?.get?.(key);
  if (cached) return cached;

  const quote = await resolveQuote(request, doFetch);
  if (quote) quoteCache?.set?.(key, quote, CACHE_TTL_MS);
  return quote;
}

async function getCachedChartSeries(symbol, period, doFetch) {
  const key = `stocks:chart:${symbol}:${period}`;
  const cached = quoteCache?.get?.(key);
  if (cached) return cached;

  const chart = await fetchYahooChartSeries(symbol, period, doFetch);
  if (chart) quoteCache?.set?.(key, chart, CACHE_TTL_MS);
  return chart;
}

async function resolveQuote(request, doFetch) {
  let symbol = request.symbol || "";
  let searchQuote = null;
  let resolvedByAlias = false;

  if (request.kind === "company") {
    searchQuote = await findYahooQuote(request.target, doFetch);
    if (searchQuote?.symbol) {
      symbol = searchQuote.symbol;
    } else {
      symbol = COMPANY_ALIASES.get(normalizeWords(request.target)) || "";
      resolvedByAlias = Boolean(symbol);
    }
  } else {
    searchQuote = await findExactYahooQuote(symbol, doFetch);
  }

  if (!symbol) return null;

  const yahooQuote = await fetchYahooChart(symbol, searchQuote, doFetch);
  if (yahooQuote) return yahooQuote;

  if (request.kind === "symbol" || resolvedByAlias || searchQuote?.symbol) {
    return fetchStooqQuote(symbol, searchQuote, doFetch);
  }

  return null;
}

function parseStockQuery(value) {
  const raw = String(value || "").trim();
  if (raw.length < 2 || raw.length > 160) return null;
  if (/^https?:\/\//i.test(raw) || MARKET_SHARE_RX.test(raw)) return null;

  const cashtag = raw.match(CASH_TAG_RX);
  if (cashtag) {
    const symbol = normalizeSymbol(cashtag[1], { allowAmbiguous: true });
    return symbol ? { kind: "symbol", symbol, explicit: true } : null;
  }

  const bangMatch = raw.match(BANG_PREFIX_RX);
  if (bangMatch) {
    const target = cleanupTarget(raw.replace(BANG_PREFIX_RX, ""));
    if (!target) return null;
    const symbol = symbolFromSingleToken(target, { allowLowercase: true });
    if (symbol) return { kind: "symbol", symbol, explicit: true };
    if (isRejectedCompanyTarget(target)) return null;
    return { kind: "company", target, explicit: false };
  }

  const hasStockWord = STOCK_WORD_RX.test(raw);
  const hasPriceWord = PRICE_WORD_RX.test(raw);
  if (!hasStockWord && !hasPriceWord) return null;

  const explicitSymbol = extractExplicitSymbol(raw, hasPriceWord);
  if (explicitSymbol) {
    return { kind: "symbol", symbol: explicitSymbol, explicit: true };
  }

  if (!hasStockWord) return null;

  const target = cleanupTarget(raw);
  if (!target || isRejectedCompanyTarget(target)) return null;

  const upperTarget = symbolFromSingleToken(target, { allowLowercase: false });
  if (upperTarget) {
    return { kind: "symbol", symbol: upperTarget, explicit: true };
  }

  return { kind: "company", target, explicit: false };
}

function shouldConsiderResultHints(value) {
  const raw = String(value || "").trim();
  if (raw.length < 2 || raw.length > 160) return false;
  if (/^https?:\/\//i.test(raw) || MARKET_SHARE_RX.test(raw)) return false;
  const normalized = normalizeWords(cleanupTarget(raw) || raw);
  if (!normalized || isRejectedCompanyTarget(normalized)) return false;
  return true;
}

function parseYahooResultRequest(results) {
  if (!Array.isArray(results)) return null;

  for (const result of results.slice(0, 10)) {
    const symbol = extractYahooFinanceSymbol(result?.url);
    if (symbol) {
      return { kind: "symbol", symbol, explicit: false, source: "result" };
    }
  }

  return null;
}

async function handleChartRoute(request) {
  try {
    const url = new URL(request.url);
    const symbol = normalizeSymbol(url.searchParams.get("symbol"), {
      allowAmbiguous: true,
    });
    const period = normalizeChartPeriod(url.searchParams.get("period"));

    if (!symbol || !period) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing or unsupported chart parameters",
        },
        400,
      );
    }

    const chart = await getCachedChartSeries(symbol, period, pluginFetch);
    if (!chart) {
      return jsonResponse(
        {
          ok: false,
          error: "Chart data unavailable",
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      ...chart,
    });
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Internal error while fetching chart data",
      },
      500,
    );
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function extractYahooFinanceSymbol(url) {
  try {
    const parsed = new URL(String(url || ""));
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "finance.yahoo.com") return "";

    const parts = parsed.pathname.split("/").filter(Boolean);
    const quoteIndex = parts.findIndex((part) => part.toLowerCase() === "quote");
    if (quoteIndex === -1 || !parts[quoteIndex + 1]) return "";

    const decoded = decodeURIComponent(parts[quoteIndex + 1]);
    if (
      decoded.startsWith("^") ||
      decoded.includes("=") ||
      /-(USD|USDT|EUR|GBP|JPY|BTC|ETH)$/i.test(decoded)
    ) {
      return "";
    }

    return normalizeSymbol(decoded, { allowAmbiguous: true });
  } catch {
    return "";
  }
}

function extractExplicitSymbol(raw, allowPriceOnly) {
  const prefixPattern = allowPriceOnly
    ? /\b(?:stock|stocks|quote|ticker|share|shares|price|prices)\b\s+(?:for\s+)?([A-Z][A-Z0-9.-]{0,11})\b/
    : /\b(?:stock|stocks|quote|ticker|share|shares)\b\s+(?:for\s+)?([A-Z][A-Z0-9.-]{0,11})\b/;
  const suffixPattern = allowPriceOnly
    ? /\b([A-Z][A-Z0-9.-]{0,11})\b\s+(?:stock|stocks|quote|ticker|share|shares|price|prices)\b/
    : /\b([A-Z][A-Z0-9.-]{0,11})\b\s+(?:stock|stocks|quote|ticker|share|shares)\b/;

  const prefix = raw.match(prefixPattern);
  if (prefix) {
    const symbol = normalizeSymbol(prefix[1], { allowAmbiguous: false });
    if (symbol) return symbol;
  }

  const suffix = raw.match(suffixPattern);
  if (suffix) {
    const symbol = normalizeSymbol(suffix[1], { allowAmbiguous: false });
    if (symbol) return symbol;
  }

  return "";
}

function normalizeChartPeriod(value) {
  const period = String(value || "1d")
    .trim()
    .toLowerCase();
  if (period === "1m") return "1mo";
  if (period === "6m") return "6mo";
  return STOCK_CHART_PERIODS[period] ? period : "";
}

function symbolFromSingleToken(value, options = {}) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^\$/, "")
    .replace(/[?!.,;:]+$/g, "");
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(cleaned)) return "";
  if (!options.allowLowercase && cleaned !== cleaned.toUpperCase()) return "";
  return normalizeSymbol(cleaned, options);
}

function normalizeSymbol(value, options = {}) {
  const symbol = String(value || "")
    .trim()
    .replace(/^\$/, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return "";
  if (!options.allowAmbiguous && AMBIGUOUS_SYMBOLS.has(symbol)) return "";
  return symbol;
}

function cleanupTarget(raw) {
  return String(raw || "")
    .replace(BANG_PREFIX_RX, "")
    .replace(CASH_TAG_RX, " ")
    .replace(
      /\b(what(?:'s|s| is)?|show|show me|get|latest|current|today|now|the|a|an|of|for|on|about|please)\b/gi,
      " ",
    )
    .replace(
      /\b(stock|stocks|share|shares|equity|equities|quote|ticker|price|prices|company)\b/gi,
      " ",
    )
    .replace(/[?!,;:(){}\[\]"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRejectedCompanyTarget(target) {
  const normalized = normalizeWords(target);
  if (!normalized || normalized.length < 2) return true;
  if (NON_STOCK_TARGETS.has(normalized) || BAD_COMPANY_TARGETS.has(normalized)) {
    return true;
  }
  const words = normalized.split(" ");
  if (words.some((word) => NON_FINANCE_CONTEXT_WORDS.has(word))) return true;
  if (words.every((word) => BAD_COMPANY_TARGETS.has(word))) return true;
  if (words.some((word) => NON_STOCK_TARGETS.has(word))) return true;
  return false;
}

async function findExactYahooQuote(symbol, doFetch) {
  const quotes = await fetchYahooSearch(symbol, doFetch);
  if (!quotes?.length) return null;

  const normalized = symbol.toUpperCase();
  return (
    quotes.find(
      (quote) =>
        String(quote.symbol || "").toUpperCase() === normalized &&
        isAcceptedYahooQuote(quote),
    ) || null
  );
}

async function findYahooQuote(target, doFetch) {
  const quotes = await fetchYahooSearch(target, doFetch);
  if (!quotes?.length) return null;

  const normalizedTarget = normalizeWords(target);
  const candidates = quotes
    .filter(isAcceptedYahooQuote)
    .map((quote) => ({ quote, score: scoreYahooQuote(quote, normalizedTarget) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.quote || null;
}

async function fetchYahooQuoteSnapshot(symbol, doFetch) {
  try {
    const params = new URLSearchParams({
      symbols: symbol,
      formatted: "false",
    });
    const response = await doFetch(`${YAHOO_QUOTE_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });
    if (!response?.ok) return null;
    const data = await response.json();
    const quote = data?.quoteResponse?.result?.[0];
    return quote && isAcceptedYahooQuote(quote) ? quote : null;
  } catch {
    return null;
  }
}

async function fetchYahooSearch(query, doFetch) {
  try {
    const params = new URLSearchParams({
      q: query,
      quotes_count: "8",
      news_count: "0",
      lists_count: "0",
      enableFuzzyQuery: "false",
    });
    const response = await doFetch(`${YAHOO_SEARCH_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });
    if (!response?.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.quotes) ? data.quotes : null;
  } catch {
    return null;
  }
}

function isAcceptedYahooQuote(quote) {
  const type = String(quote?.quoteType || quote?.typeDisp || "").toUpperCase();
  const symbol = String(quote?.symbol || "");
  if (!symbol || symbol.includes("=") || symbol.startsWith("^")) return false;
  if (/-(USD|USDT|EUR|GBP|JPY|BTC|ETH)$/i.test(symbol)) return false;
  if (REJECTED_QUOTE_TYPES.has(type)) return false;
  if (type && !ACCEPTED_QUOTE_TYPES.has(type)) return false;
  return true;
}

function scoreYahooQuote(quote, normalizedTarget) {
  const symbol = normalizeWords(quote.symbol || "");
  const shortName = normalizeCompanyName(quote.shortname || "");
  const longName = normalizeCompanyName(quote.longname || "");
  const exchange = String(quote.exchange || "").toUpperCase();
  let score = 0;

  if (symbol === normalizedTarget) score += 100;
  if (shortName === normalizedTarget || longName === normalizedTarget) score += 90;
  if (shortName.startsWith(normalizedTarget + " ")) score += 70;
  if (longName.startsWith(normalizedTarget + " ")) score += 70;
  if (containsAllWords(shortName, normalizedTarget)) score += 45;
  if (containsAllWords(longName, normalizedTarget)) score += 45;
  if (["NMS", "NGM", "NCM", "NYQ", "ASE", "PCX"].includes(exchange)) {
    score += 10;
  }

  return score;
}

async function fetchYahooChart(symbol, searchQuote, doFetch) {
  try {
    const snapshot = await fetchYahooQuoteSnapshot(symbol, doFetch);
    const params = new URLSearchParams({
      interval: "5m",
      range: "1d",
      includePrePost: "false",
    });
    const response = await doFetch(
      `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params}`,
      { headers: REQUEST_HEADERS },
    );
    if (!response?.ok) return null;
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    if (!result || !isAcceptedYahooInstrument(meta, searchQuote, snapshot)) {
      return null;
    }

    const intraday = extractYahooIntradayStats(result);
    const price = firstFinite(
      snapshot?.regularMarketPrice,
      meta.regularMarketPrice,
      meta.previousClose,
      lastFinite(result.indicators?.quote?.[0]?.close),
    );
    if (!Number.isFinite(price)) return null;

    const previousClose = firstFinite(
      snapshot?.regularMarketPreviousClose,
      meta.chartPreviousClose,
      meta.previousClose,
      searchQuote?.regularMarketPreviousClose,
    );
    const change = Number.isFinite(previousClose) ? price - previousClose : null;
    const changePercent =
      Number.isFinite(change) && previousClose
        ? (change / previousClose) * 100
        : null;
    const chartPoints = extractYahooChartPoints(result);
    const exchange =
      meta.fullExchangeName ||
      searchQuote?.exchDisp ||
      EXCHANGE_LABELS[meta.exchangeName] ||
      meta.exchangeName ||
      searchQuote?.exchange ||
      "";
    const annualDividendRate = firstFinite(
      snapshot?.dividendRate,
      snapshot?.trailingAnnualDividendRate,
    );

    return {
      symbol: String(
        snapshot?.symbol || meta.symbol || searchQuote?.symbol || symbol,
      ).toUpperCase(),
      name:
        snapshot?.longName ||
        snapshot?.shortName ||
        searchQuote?.longname ||
        searchQuote?.shortname ||
        meta.longName ||
        meta.shortName ||
        symbol,
      price,
      priceHint: firstFinite(snapshot?.priceHint, meta.priceHint),
      currency: snapshot?.currency || meta.currency || searchQuote?.currency || "",
      change,
      changePercent,
      previousClose,
      open: firstFinite(
        snapshot?.regularMarketOpen,
        meta.regularMarketOpen,
        intraday.open,
      ),
      high: firstFinite(
        snapshot?.regularMarketDayHigh,
        meta.regularMarketDayHigh,
        intraday.high,
      ),
      low: firstFinite(
        snapshot?.regularMarketDayLow,
        meta.regularMarketDayLow,
        intraday.low,
      ),
      volume: firstFinite(
        snapshot?.regularMarketVolume,
        meta.regularMarketVolume,
        intraday.volume,
      ),
      averageVolume: firstFinite(
        snapshot?.averageDailyVolume3Month,
        snapshot?.averageVolume,
      ),
      averageVolume10Day: firstFinite(snapshot?.averageDailyVolume10Day),
      marketCap: firstFinite(snapshot?.marketCap),
      peRatio: firstFinite(snapshot?.trailingPE, snapshot?.forwardPE),
      fiftyTwoWeekHigh: firstFinite(snapshot?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: firstFinite(snapshot?.fiftyTwoWeekLow),
      dividendYield: normalizeDividendYield(
        snapshot?.dividendYield,
        snapshot?.trailingAnnualDividendYield,
      ),
      annualDividendRate,
      quarterlyDividendAmount: Number.isFinite(annualDividendRate)
        ? annualDividendRate / 4
        : null,
      bid: firstFinite(snapshot?.bid),
      ask: firstFinite(snapshot?.ask),
      epsTrailingTwelveMonths: firstFinite(snapshot?.epsTrailingTwelveMonths),
      beta: firstFinite(snapshot?.beta),
      sharesOutstanding: firstFinite(snapshot?.sharesOutstanding),
      fiftyDayAverage: firstFinite(snapshot?.fiftyDayAverage),
      twoHundredDayAverage: firstFinite(snapshot?.twoHundredDayAverage),
      exDividendDate: formatYahooTime(snapshot?.exDividendDate, {
        dateOnly: true,
      }),
      sector: snapshot?.sector || searchQuote?.sector || "",
      industry: snapshot?.industry || searchQuote?.industry || "",
      quoteType: formatQuoteType(
        snapshot?.typeDisp ||
          searchQuote?.typeDisp ||
          snapshot?.quoteType ||
          searchQuote?.quoteType ||
          meta.instrumentType,
      ),
      exchange:
        snapshot?.fullExchangeName ||
        snapshot?.exchange ||
        snapshot?.exchangeName ||
        exchange,
      marketState: formatMarketState(
        snapshot?.marketState || searchQuote?.marketState || meta.marketState,
      ),
      asOf: formatYahooTime(
        firstFinite(snapshot?.regularMarketTime, meta.regularMarketTime),
      ),
      sourceLabel: "Yahoo Finance",
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      chartPoints,
      chartLabel: chartPoints.length > 2 ? "1D" : "",
    };
  } catch {
    return null;
  }
}

async function fetchYahooChartSeries(symbol, period, doFetch) {
  const config = STOCK_CHART_PERIODS[period];
  if (!config) return null;

  try {
    const params = new URLSearchParams({
      interval: config.interval,
      range: config.range,
      includePrePost: "false",
    });
    const response = await doFetch(
      `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params}`,
      { headers: REQUEST_HEADERS },
    );
    if (!response?.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    if (!result || !isAcceptedYahooInstrument(meta, null, null)) return null;

    const points = extractYahooChartPoints(result);
    if (points.length < 2) return null;

    return {
      symbol: String(meta.symbol || symbol).toUpperCase(),
      period,
      label: config.label,
      currency: meta.currency || "",
      priceHint: firstFinite(meta.priceHint),
      previousClose: firstFinite(
        meta.chartPreviousClose,
        meta.previousClose,
        meta.regularMarketPreviousClose,
      ),
      asOf: formatYahooTime(meta.regularMarketTime),
      points,
    };
  } catch {
    return null;
  }
}

function isAcceptedYahooInstrument(meta, searchQuote, snapshot) {
  const metaType = String(meta?.instrumentType || "").toUpperCase();
  const quoteType = String(searchQuote?.quoteType || "").toUpperCase();
  const snapshotType = String(snapshot?.quoteType || "").toUpperCase();
  if (
    REJECTED_QUOTE_TYPES.has(metaType) ||
    REJECTED_QUOTE_TYPES.has(quoteType) ||
    REJECTED_QUOTE_TYPES.has(snapshotType)
  ) {
    return false;
  }
  if (quoteType && !ACCEPTED_QUOTE_TYPES.has(quoteType)) return false;
  if (snapshotType && !ACCEPTED_QUOTE_TYPES.has(snapshotType)) return false;
  return true;
}

function extractYahooChartPoints(result) {
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const close = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(close)) return [];

  return close
    .map((price, index) => ({
      price: Number(price),
      time: Number(timestamps[index] || 0),
    }))
    .filter((point) => Number.isFinite(point.price));
}

function extractYahooIntradayStats(result) {
  const quote = result?.indicators?.quote?.[0] || {};
  return {
    open: firstFiniteFromArray(quote.open),
    high: maxFinite(quote.high),
    low: minFinite(quote.low),
    volume: sumFinite(quote.volume),
  };
}

async function fetchStooqQuote(symbol, searchQuote, doFetch) {
  const candidates = stooqSymbolCandidates(symbol);
  for (const candidate of candidates) {
    const quote = await fetchStooqCandidate(candidate, symbol, searchQuote, doFetch);
    if (quote) return quote;
  }
  return null;
}

async function fetchStooqCandidate(stooqSymbol, displaySymbol, searchQuote, doFetch) {
  try {
    const params = new URLSearchParams({
      s: stooqSymbol.toLowerCase(),
      f: "sd2t2ohlcvnp",
      h: "",
      e: "csv",
    });
    const response = await doFetch(`${STOOQ_QUOTE_URL}?${params}`, {
      headers: REQUEST_HEADERS,
    });
    if (!response?.ok) return null;
    const text = await response.text();
    const rows = parseCsv(text);
    const row = rows[0];
    if (!row || !row.Symbol || row.Close === "N/D") return null;

    const price = toNumber(row.Close);
    const previousClose = toNumber(row.Prev);
    if (!Number.isFinite(price)) return null;

    const change = Number.isFinite(previousClose) ? price - previousClose : null;
    const changePercent =
      Number.isFinite(change) && previousClose
        ? (change / previousClose) * 100
        : null;
    const suffix = String(row.Symbol || "").split(".").pop().toUpperCase();
    const suffixMeta = STOOQ_SUFFIX_META[suffix] || {};
    const chartPoints = [
      toNumber(row.Open),
      toNumber(row.Low),
      toNumber(row.High),
      price,
    ].filter(Number.isFinite);

    return {
      symbol: displaySymbolForStooq(row.Symbol, displaySymbol),
      name:
        searchQuote?.longname ||
        searchQuote?.shortname ||
        formatCompanyDisplayName(row.Name) ||
        displaySymbol,
      price,
      priceHint: null,
      currency: suffixMeta.currency || "",
      change,
      changePercent,
      previousClose,
      open: toNumber(row.Open),
      high: toNumber(row.High),
      low: toNumber(row.Low),
      volume: toNumber(row.Volume),
      exchange: suffixMeta.exchange || suffix || "",
      marketState: "Delayed quote",
      asOf: formatStooqTime(row.Date, row.Time),
      sourceLabel: "Stooq",
      sourceUrl: `https://stooq.com/q/?s=${encodeURIComponent(row.Symbol)}`,
      chartPoints: chartPoints.map((point) => ({ price: point })),
      chartLabel: chartPoints.length > 2 ? "Range" : "",
    };
  } catch {
    return null;
  }
}

function stooqSymbolCandidates(symbol) {
  const base = String(symbol || "").trim().toUpperCase();
  if (!base) return [];

  const normalizedClass = base.replace("-", ".");
  const candidates = new Set();
  candidates.add(normalizedClass);

  if (!base.includes(".") && !base.includes("-")) {
    candidates.add(`${base}.US`);
  } else if (/^[A-Z]+-[A-Z]$/.test(base)) {
    candidates.add(`${normalizedClass}.US`);
  }

  return [...candidates];
}

function parseCsv(text) {
  const rows = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvLine);
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function renderQuote(quote) {
  const trend = quote.change > 0 ? "up" : quote.change < 0 ? "down" : "flat";
  const replacements = {
    trend,
    symbol: escapeHtml(quote.symbol),
    symbol_attr: escapeAttr(quote.symbol),
    company: escapeHtml(quote.name),
    price: escapeHtml(formatPrice(quote.price, quote.priceHint)),
    currency: escapeHtml(quote.currency || "Quote"),
    price_hint: Number.isFinite(quote.priceHint)
      ? escapeAttr(String(quote.priceHint))
      : "",
    change: escapeHtml(formatChange(quote.change, quote.changePercent)),
    exchange: escapeHtml(quote.exchange || "Exchange unavailable"),
    source_label: escapeHtml(quote.sourceLabel),
    source_url: escapeHtml(quote.sourceUrl),
    sparkline: renderSparkline(quote.chartPoints, trend, quote.chartLabel),
    stats: renderStats(quote, trend),
    details: renderDetails(quote),
  };

  if (!templateHtml) {
    return `<div class="stocks-card"><strong>${replacements.symbol}</strong> ${replacements.price}</div>`;
  }

  let html = templateHtml;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

function renderStats(quote, trend) {
  if (!quote.price || !quote.chartPoints || quote.chartPoints.length < 2) return "";
  const priceHint = quote.priceHint;
  const change = quote.change;
  const changePercent = quote.changePercent;
  const sign = change >= 0 ? "+" : "";
  const trendClass = change >= 0 ? "stocks-chart-stat-value--up" : "stocks-chart-stat-value--down";
  
  const prices = quote.chartPoints.map((p) => Number(p.price)).filter(Number.isFinite);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const last = prices[prices.length - 1];

  return `
    <div class="stocks-chart-stat">
      <span class="stocks-chart-stat-label">Low</span>
      <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(low, priceHint))}</span>
    </div>
    <div class="stocks-chart-stat">
      <span class="stocks-chart-stat-label">High</span>
      <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(high, priceHint))}</span>
    </div>
    <div class="stocks-chart-stat">
      <span class="stocks-chart-stat-label">Last</span>
      <span class="stocks-chart-stat-value">${escapeHtml(formatPrice(last, priceHint))}</span>
    </div>
    <div class="stocks-chart-stat">
      <span class="stocks-chart-stat-label">Change</span>
      <span class="stocks-chart-stat-value ${trendClass}">${sign}${changePercent.toFixed(2)}%</span>
    </div>
  `;
}

function renderDetails(quote) {
  const priceHint = quote.priceHint;
  const rows = [
    ["Open", formatMaybePrice(quote.open, priceHint)],
    ["High", formatMaybePrice(quote.high, priceHint)],
    ["Low", formatMaybePrice(quote.low, priceHint)],
    ["Prev close", formatMaybePrice(quote.previousClose, priceHint)],
    ["Day range", formatDayRange(quote.low, quote.high, priceHint)],
    ["52-wk high", formatMaybePrice(quote.fiftyTwoWeekHigh, priceHint)],
    ["52-wk low", formatMaybePrice(quote.fiftyTwoWeekLow, priceHint)],
    ["Mkt cap", formatLargeNumber(quote.marketCap)],
    ["P/E ratio", formatRatio(quote.peRatio)],
    ["Dividend", formatPercentValue(quote.dividendYield)],
    ["Qtrly Div Amt", formatMaybePrice(quote.quarterlyDividendAmount, priceHint)],
    ["Annual Div Rate", formatMaybePrice(quote.annualDividendRate, priceHint)],
    ["Volume", formatVolume(quote.volume)],
    ["Avg volume", formatVolume(quote.averageVolume)],
    ["10-day avg vol", formatVolume(quote.averageVolume10Day)],
    ["Bid", formatMaybePrice(quote.bid, priceHint)],
    ["Ask", formatMaybePrice(quote.ask, priceHint)],
    ["EPS (TTM)", formatRatio(quote.epsTrailingTwelveMonths)],
    ["Beta", formatRatio(quote.beta)],
    ["Shares out", formatLargeNumber(quote.sharesOutstanding)],
    ["50-day avg", formatMaybePrice(quote.fiftyDayAverage, priceHint)],
    ["200-day avg", formatMaybePrice(quote.twoHundredDayAverage, priceHint)],
    ["Ex-div date", quote.exDividendDate || "N/A"],
    ["Sector", quote.sector || "N/A"],
    ["Industry", quote.industry || "N/A"],
    ["Type", quote.quoteType || "N/A"],
    ["Exchange", quote.exchange || "N/A"],
    ["Market state", quote.marketState || "N/A"],
    ["As of", quote.asOf || "N/A"],
  ];

  const detailHtml = rows
    .filter(([, value]) => hasDisplayValue(value))
    .map(([label, value]) => renderDetail(label, value))
    .join("");
  const sourceHref = escapeHtml(quote.sourceUrl);
  const sourceLabel = escapeHtml(quote.sourceLabel || "Source");
  const sourceHtml = renderDetail(
    "Source",
    `<a class="stocks-detail-link" href="${sourceHref}" target="_blank" rel="noopener">${sourceLabel}</a>`,
    { rawValue: true },
  );

  return detailHtml + sourceHtml;
}

function renderDetail(label, value, options = {}) {
  const safeValue = options.rawValue ? value : escapeHtml(value);
  return `
    <div class="stocks-detail">
      <span class="stocks-detail-label">${escapeHtml(label)}</span>
      <span class="stocks-detail-value">${safeValue}</span>
    </div>
  `;
}

function hasDisplayValue(value) {
  const text = String(value ?? "").trim();
  return text !== "" && text.toUpperCase() !== "N/A";
}

function renderSparkline(points, trend, label) {
  const prices = (Array.isArray(points) ? points : [])
    .map((point) => Number(point.price))
    .filter(Number.isFinite);
  if (prices.length < 2) {
    return '<div class="stocks-sparkline-empty">No chart data</div>';
  }

  const width = 320;
  const height = 212;
  const padL = 52, padR = 10, padT = 15, padB = 20;
  const chartH = height - padT - padB;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(Math.abs(max), 1) * 0.01;
  const step = prices.length > 1 ? (width - padL - padR) / (prices.length - 1) : 0;
  const coords = prices.map((price, index) => {
    const x = padL + index * step;
    const y = padT + chartH - ((price - min) / span) * chartH;
    return [round(x), round(y)];
  });
  const path = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const area = `${path} L ${coords[coords.length - 1][0]} ${padT + chartH} L ${coords[0][0]} ${padT + chartH} Z`;
  const last = coords[coords.length - 1];

  const gridLinesHtml = [0, 1, 2, 3].map((gi) => {
    const frac = gi / 3;
    const yVal = min + frac * span;
    const yPx = padT + chartH - frac * chartH;
    const labelText = escapeHtml(formatPrice(yVal));
    return `<line x1="${padL}" y1="${yPx.toFixed(2)}" x2="${width - padR}" y2="${yPx.toFixed(2)}" class="stocks-chart-grid-line"></line>` +
           `<text x="${(padL - 8).toFixed(2)}" y="${(yPx + 4).toFixed(2)}" class="stocks-chart-y-label" text-anchor="end">${labelText}</text>`;
  }).join("");

  return `
    <svg class="stocks-sparkline stocks-sparkline-${trend}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="img" aria-label="Price sparkline">
      <defs>
        <linearGradient id="stocks-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--stocks-line)" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="var(--stocks-line)" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${gridLinesHtml}
      <path class="stocks-sparkline-area" d="${area}" fill="url(#stocks-grad)"></path>
      <path class="stocks-sparkline-line" d="${path}"></path>
      <circle class="stocks-sparkline-dot" cx="${last[0]}" cy="${last[1]}" r="3"></circle>
    </svg>
  `;
}

function formatPrice(value, priceHint) {
  if (!Number.isFinite(value)) return "N/A";
  const decimals = Number.isFinite(priceHint)
    ? Math.max(0, Math.min(6, priceHint))
    : value < 1
      ? 4
      : value < 10
        ? 3
        : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatMaybePrice(value, priceHint) {
  return Number.isFinite(value) ? formatPrice(value, priceHint) : "N/A";
}

function formatChange(change, percent) {
  if (!Number.isFinite(change)) return "";
  const sign = change > 0 ? "+" : "";
  const percentPart = Number.isFinite(percent)
    ? ` (${sign}${percent.toFixed(2)}%)`
    : "";
  return `${sign}${formatPrice(change, Math.abs(change) < 1 ? 4 : 2)}${percentPart}`;
}

function formatDayRange(low, high, priceHint) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "N/A";
  return `${formatPrice(low, priceHint)} - ${formatPrice(high, priceHint)}`;
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatLargeNumber(value) {
  if (!Number.isFinite(value)) return "N/A";
  const abs = Math.abs(value);
  const units = [
    ["T", 1_000_000_000_000],
    ["B", 1_000_000_000],
    ["M", 1_000_000],
    ["K", 1_000],
  ];
  const unit = units.find(([, threshold]) => abs >= threshold);
  if (!unit) return formatVolume(value);

  const [suffix, divisor] = unit;
  const scaled = value / divisor;
  const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(decimals)}${suffix}`;
}

function formatPercentValue(value) {
  if (!Number.isFinite(value)) return "N/A";
  const decimals = Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}%`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeDividendYield(displayYield, trailingYield) {
  const display = toNumber(displayYield);
  if (Number.isFinite(display)) return display;

  const trailing = toNumber(trailingYield);
  if (Number.isFinite(trailing)) return trailing * 100;

  return null;
}

function formatMarketState(value) {
  const state = String(value || "").toUpperCase();
  if (state === "REGULAR") return "Market open";
  if (state === "PRE") return "Pre-market";
  if (state === "POST") return "After hours";
  if (state === "CLOSED") return "Market closed";
  if (!state) return "";
  return state
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatQuoteType(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatYahooTime(seconds, options = {}) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const formatOptions = options.dateOnly
    ? {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    : {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      };
  return new Intl.DateTimeFormat("en-US", formatOptions).format(
    new Date(value * 1000),
  );
}

function formatStooqTime(date, time) {
  const parts = [date, time].filter(Boolean);
  return parts.length ? parts.join(" ") : "";
}

function displaySymbolForStooq(stooqSymbol, fallback) {
  const symbol = String(stooqSymbol || fallback || "").toUpperCase();
  return symbol.endsWith(".US") ? symbol.slice(0, -3) : symbol;
}

function formatCompanyDisplayName(value) {
  const name = String(value || "").trim();
  if (!name) return "";
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word === "inc") return "Inc.";
      if (word === "corp") return "Corp.";
      if (word === "co") return "Co.";
      if (word === "ltd") return "Ltd.";
      if (word === "plc") return "PLC";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeCompanyName(value) {
  return normalizeWords(value).replace(
    /\b(incorporated|inc|corporation|corp|company|co|class|ordinary|shares|common|stock|plc|ltd|limited|sa|nv|adr|ads)\b/g,
    "",
  ).replace(/\s+/g, " ").trim();
}

function normalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAllWords(haystack, needle) {
  if (!haystack || !needle) return false;
  const haystackWords = new Set(haystack.split(" "));
  return needle.split(" ").every((word) => haystackWords.has(word));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "N/D") {
    return null;
  }
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = toNumber(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function firstFiniteFromArray(values) {
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    const number = toNumber(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function lastFinite(values) {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    const number = toNumber(values[i]);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function maxFinite(values) {
  if (!Array.isArray(values)) return null;
  const numbers = values.map(toNumber).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
}

function minFinite(values) {
  if (!Array.isArray(values)) return null;
  const numbers = values.map(toNumber).filter(Number.isFinite);
  return numbers.length ? Math.min(...numbers) : null;
}

function sumFinite(values) {
  if (!Array.isArray(values)) return null;
  let total = 0;
  let found = false;
  for (const value of values) {
    const number = toNumber(value);
    if (Number.isFinite(number)) {
      total += number;
      found = true;
    }
  }
  return found ? total : null;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#039;").replace(/`/g, "&#096;");
}
