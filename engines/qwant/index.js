import { load } from "cheerio";

export const type = "web";
export const site = "https://www.qwant.com";
export const outgoingHosts = ["api.qwant.com"];

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

export default class QwantEngine {
  name = "Qwant";
  bangShortcut = "qw";
  isClientExposed = false;
  safeSearch = "moderate";

  settingsSchema = [{
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content from Qwant results.",
  }];

  configure(settings = {}) {
    if (Object.hasOwn(SAFE_SEARCH, settings.safeSearch)) this.safeSearch = settings.safeSearch;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const text = String(query ?? "").trim();
    if (!text) return [];
    const pageNo = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
    if (pageNo > MAX_PAGES) {
      context?.pagination?.({ total: MAX_PAGES });
      return [];
    }
    context?.signal?.throwIfAborted();
    const params = new URLSearchParams({
      q: text, count: String(PAGE_SIZE), locale: localeFor(context),
      offset: String((pageNo - 1) * PAGE_SIZE), tgp: "1", device: "desktop",
      safesearch: SAFE_SEARCH[this.safeSearch], displayed: "true", llm: "false",
    });
    const response = await (context?.fetch ?? fetch)(`${API_URL}?${params}`, {
      headers: { Accept: "application/json", Referer: `${site}/`, Origin: site },
      ...(context?.signal ? { signal: context.signal } : {}),
    });
    const body = await response.text();
    const data = parseResponse(body);
    if (isChallenge(data?.url)) throw fail(context, "captcha", "Qwant returned a verification challenge", response.status);
    if (data?.data?.error_code === 24) throw fail(context, "rate_limited", "Qwant rate limit reached", response.status);
    context?.sentinel?.(response, this.name);
    if (!response.ok) throw fail(context, response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked", `Qwant returned HTTP ${response.status}`, response.status);
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
