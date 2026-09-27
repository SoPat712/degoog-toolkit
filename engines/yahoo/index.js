import { load } from "cheerio";

export const type = "web";
export const site = "https://search.yahoo.com";
export const outgoingHosts = ["*.yahoo.com"];

const PAGE_SIZE = 7;
const SAFE_SEARCH = { off: "p", moderate: "i", strict: "r" };
const TIME_FILTER = { day: "d", week: "w", month: "m" };
const FALLBACK_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function plainText(value) {
  if (typeof value !== "string") return "";
  const $ = load(value, null, false);
  $("script, style").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function resultUrl(href) {
  try {
    let url = new URL(href, site);
    if (url.hostname === "r.search.yahoo.com") {
      const encoded = /\/RU=(.*?)(?:\/R[KS]=|$)/.exec(url.pathname)?.[1];
      if (!encoded) return "";
      url = new URL(decodeURIComponent(encoded));
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if (url.hostname === "r.search.yahoo.com" || url.hostname === "search.yahoo.com") return "";
    return url.href;
  } catch { return ""; }
}

function fail(context, status, message, httpStatus) {
  const options = { engine: "Yahoo", httpStatus };
  if (context?.engineError) return context.engineError(status, message, options);
  return Object.assign(new Error(message), { name: "SentinelBreach", status, ...options });
}

export default class YahooEngine {
  name = "Yahoo";
  bangShortcut = "yh";
  isClientExposed = false;
  safeSearch = "moderate";
  browserOnly = false;

  settingsSchema = [{
    key: "safeSearch",
    label: "Safe Search",
    type: "select",
    options: ["off", "moderate", "strict"],
    default: "moderate",
    description: "Filter explicit content in HTTP mode. Browser-only mode uses Firefox's Yahoo preferences instead.",
  }, {
    key: "browserOnly",
    label: "Browser only (4play)",
    type: "toggle",
    default: "false",
    description: "Load results in Firefox without 4play's HTTP attempt. Uses the browser session's Safe Search and language preferences.",
  }];

  configure(settings = {}) {
    if (Object.hasOwn(SAFE_SEARCH, settings.safeSearch)) this.safeSearch = settings.safeSearch;
    if (settings.browserOnly !== undefined) this.browserOnly = settings.browserOnly === true || settings.browserOnly === "true";
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const text = String(query ?? "").trim();
    if (!text) return [];
    const pageNo = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
    context?.signal?.throwIfAborted();
    const params = new URLSearchParams({ p: text });
    if (pageNo > 1) {
      params.set("b", String((pageNo - 1) * PAGE_SIZE + 1));
      params.set("pz", String(PAGE_SIZE));
      params.set("bct", "0");
      params.set("xargs", "0");
    }
    if (Object.hasOwn(TIME_FILTER, timeFilter)) params.set("btf", TIME_FILTER[timeFilter]);
    const lang = (context?.lang ?? "").split(/[-_]/)[0].toLowerCase();
    const preferences = new URLSearchParams({
      v: "1", vm: SAFE_SEARCH[this.safeSearch], fl: "1",
      vl: `lang_${/^[a-z]{2,3}$/.test(lang) ? lang : "any"}`,
      pn: String(PAGE_SIZE), rw: "new", userset: "1",
    });
    const response = await (context?.fetch ?? fetch)(`${site}/search?${params}`, {
      headers: {
        "User-Agent": context?.userAgent?.() || FALLBACK_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": context?.buildAcceptLanguage?.() || "en-US,en;q=0.9",
        Cookie: `sB=${preferences}`,
      },
      redirect: "follow",
      ...(this.browserOnly ? {
        browserOnly: true,
        match: { domMatch: '#web, form[action*="captcha"], form[action*="consent.yahoo.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]' },
      } : {}),
      ...(context?.signal ? { signal: context.signal } : {}),
    });
    context?.sentinel?.(response, this.name);
    if (!response.ok) throw fail(context, response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked", `Yahoo returned HTTP ${response.status}`, response.status);
    const $ = load(await response.text());
    $("script, style").remove();
    const results = [];
    const seen = new Set();
    $("#web .algo-sr").each((_, element) => {
      const card = $(element);
      if (card.closest(".ad, .ads, [data-ad]").length) return;
      const heading = card.find(".compTitle h3").first();
      let link = heading.find("a[href]").first();
      if (!link.length) link = heading.closest("a[href]");
      const title = link.attr("aria-label")
        ? plainText(link.attr("aria-label"))
        : heading.text().replace(/\s+/g, " ").trim();
      const url = resultUrl(link.attr("href") || "");
      if (!title || !url || seen.has(url)) return;
      seen.add(url);
      results.push({ title, url, snippet: card.find(".compText").first().text().replace(/\s+/g, " ").trim(), source: this.name });
    });
    if (results.length) return results;

    // Check dedicated error UI only after looking for results: a query or
    // snippet mentioning CAPTCHA must not turn a valid page into an error.
    if ($('form[action*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').length) {
      throw fail(context, "captcha", "Yahoo returned a verification challenge", response.status);
    }
    if (/^https:\/\/(?:guce|consent)\.yahoo\.com\//i.test(response.url || "") || $('form[action*="consent.yahoo.com"]').length) {
      throw fail(context, "interstitial", "Yahoo returned a consent page instead of results", response.status);
    }
    const notice = $("#web").clone();
    notice.find(".algo-sr").remove();
    if (/\b(?:we did not find (?:any )?results for|no results found for|we couldn't find (?:any )?results for)\b/i.test(notice.text())) {
      context?.pagination?.({ total: pageNo });
      return [];
    }
    throw fail(context, "parse_error", "Yahoo returned no readable search results", response.status);
  }
}
