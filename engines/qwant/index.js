import { load } from "cheerio";

export const type = "web";
export const site = "https://www.qwant.com";
export const outgoingHosts = ["api.qwant.com", "www.qwant.com"];

const API_URL = "https://api.qwant.com/v3/search/web";
const SAFE_SEARCH = { off: "0", moderate: "1", strict: "2" };
const PAGE_SIZE = 10;
const MAX_PAGES = 5;

function plainText(value) {
  if (typeof value !== "string") return "";
  const $ = load(value, null, false);
  $("script, style").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function webUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : "";
  } catch { return ""; }
}

function localeFor(context) {
  const language = context?.lang || context?.buildAcceptLanguage?.()?.split(",")[0]?.split(";")[0] || "en-US";
  try {
    const locale = new Intl.Locale(language.replace(/_/g, "-")).maximize();
    return `${locale.language}_${locale.region}`;
  } catch { return "en_US"; }
}

function fail(context, status, message, httpStatus) {
  const options = { engine: "Qwant", httpStatus };
  if (context?.engineError) return context.engineError(status, message, options);
  return Object.assign(new Error(message), { name: "SentinelBreach", status, ...options });
}

function isChallenge(value) {
  try {
    const host = new URL(value).hostname;
    return host === "captcha-delivery.com" || host.endsWith(".captcha-delivery.com");
  } catch { return false; }
}

function parseResponse(body) {
  try { return JSON.parse(body); } catch { /* Browser transports may return the JSON viewer's HTML. */ }
  try { return JSON.parse(load(body)("pre").first().text()); } catch { return undefined; }
}

function hasChallengePage(body) {
  const $ = load(body);
  return $("script[src], iframe[src]").toArray().some((element) => isChallenge($(element).attr("src")));
}

function parseWebPage(body, context, httpStatus) {
  const $ = load(body);
  $("script, style").remove();
  const results = [];
  const seen = new Set();
  $('[data-testid="webResult"]').each((_, element) => {
    const card = $(element);
    const heading = card.find("h2").first();
    const url = webUrl(heading.find("a[href]").first().attr("href"));
    const title = heading.text().replace(/\s+/g, " ").trim();
    if (!url || !title || seen.has(url)) return;
    seen.add(url);
    results.push({ title, url, snippet: heading.next().text().replace(/\s+/g, " ").trim(), source: "Qwant" });
  });
  if (!results.length) throw fail(context, "parse_error", "Qwant returned no readable web results", httpStatus);
  context?.pagination?.({ total: 1 });
  return results;
}

export default class QwantEngine {
  name = "Qwant";
  bangShortcut = "qw";
  isClientExposed = false;
  safeSearch = "moderate";
  requestMode = "api";

  settingsSchema = [{
    key: "requestMode",
    label: "Request mode",
    type: "select",
    options: ["api", "browser"],
    default: "api",
    description: "API supports pagination. Browser requires 4play and reads the first page using Firefox's Safe Search preferences.",
  }, {
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content in API mode. Browser mode uses Firefox's Qwant preferences instead.",
  }];

  configure(settings = {}) {
    if (Object.hasOwn(SAFE_SEARCH, settings.safeSearch)) this.safeSearch = settings.safeSearch;
    if (["api", "browser"].includes(settings.requestMode)) this.requestMode = settings.requestMode;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const text = String(query ?? "").trim();
    if (!text) return [];
    const pageNo = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
    const browserMode = this.requestMode === "browser";
    const maxPages = browserMode ? 1 : MAX_PAGES;
    if (pageNo > maxPages) {
      context?.pagination?.({ total: maxPages });
      return [];
    }
    context?.signal?.throwIfAborted();
    const params = new URLSearchParams({
      q: text, count: String(PAGE_SIZE), locale: localeFor(context),
      offset: String((pageNo - 1) * PAGE_SIZE), tgp: "1", device: "desktop",
      safesearch: SAFE_SEARCH[this.safeSearch], displayed: "true", llm: "false",
    });
    const url = browserMode ? `${site}/?${new URLSearchParams({ q: text, t: "web" })}` : `${API_URL}?${params}`;
    const response = await (context?.fetch ?? fetch)(url, {
      headers: { Accept: browserMode ? "text/html" : "application/json", Referer: `${site}/`, Origin: site },
      ...(browserMode ? {
        browserOnly: true,
        match: { domMatch: '[data-testid="webResult"], iframe[src*="captcha-delivery.com"], script[src*="captcha-delivery.com"]' },
      } : {}),
      ...(context?.signal ? { signal: context.signal } : {}),
    });
    const body = await response.text();
    const data = browserMode ? undefined : parseResponse(body);
    if (isChallenge(data?.url) || (!data && hasChallengePage(body))) throw fail(context, "captcha", "Qwant returned a verification challenge", response.status);
    if (data?.data?.error_code === 24) throw fail(context, "rate_limited", "Qwant rate limit reached", response.status);
    context?.sentinel?.(response, this.name);
    if (!response.ok) throw fail(context, response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked", `Qwant returned HTTP ${response.status}`, response.status);
    if (browserMode) return parseWebPage(body, context, response.status);
    if (!data || typeof data !== "object") throw fail(context, "parse_error", "Qwant returned invalid JSON", response.status);
    if (data.status !== "success") throw fail(context, "network", "Qwant returned an API error", response.status);

    const rows = data.data?.result?.items?.mainline;
    if (!Array.isArray(rows)) throw fail(context, "parse_error", "Qwant response is missing web results", response.status);
    const results = [];
    const seen = new Set();
    let webItems = 0;
    for (const row of rows) {
      if (row?.type !== "web") continue;
      if (!Array.isArray(row.items)) throw fail(context, "parse_error", "Qwant web results have an unexpected format", response.status);
      webItems += row.items.length;
      for (const item of row.items) {
        const url = webUrl(item?.url);
        const title = plainText(item?.title);
        if (!url || !title || seen.has(url)) continue;
        seen.add(url);
        results.push({ title, url, snippet: plainText(item.desc), source: this.name });
      }
    }
    if (webItems && !results.length) throw fail(context, "parse_error", "Qwant returned no readable web results", response.status);
    context?.pagination?.({ total: webItems < PAGE_SIZE ? pageNo : MAX_PAGES });
    return results;
  }
}
