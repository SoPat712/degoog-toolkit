import { load } from "cheerio";

const DEFAULT_API_BASE_URL = "https://api.mwmbl.org/api/v1";

function engineFailure(context, status, message, httpStatus) {
  if (typeof context?.engineError === "function") {
    return context.engineError(status, message, { engine: "Mwmbl", httpStatus });
  }
  return Object.assign(new Error(message), { status, httpStatus });
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/") url.pathname = "/api/v1";
    else url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((segment) => {
      if (typeof segment === "string") return segment;
      if (!segment || typeof segment !== "object") return "";
      return segment.value ?? segment.text ?? "";
    })
    .filter((segment) => typeof segment === "string")
    .join("");
}

function normalizeResultUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Some transport/API combinations return Markdown link syntax instead of
  // the URL itself. Degoog expects a navigable URL in every result object.
  const markdownLink = /^\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^)]*["'])?\)$/i.exec(trimmed);
  const rawUrl = (markdownLink?.[1] ?? trimmed).trim();

  // Mwmbl's index frequently retains an HTTP crawl URL even when the site
  // redirects every visitor to HTTPS. Degoog derives its "Insecure" badge
  // from the URL returned by an engine, before client-side link fixers run.
  // Upgrade the destination here so the displayed URL and security state
  // match the destination users actually reach, without probing every result.
  if (/^http:/i.test(rawUrl)) return rawUrl.replace(/^http:/i, "https:");
  return rawUrl;
}

function mapResults(payload) {
  const results = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return results.flatMap((result) => {
    if (!result || typeof result !== "object") return [];
    const urlValue = result.url ?? result.link;
    const url = normalizeResultUrl(urlValue);
    if (!url) return [];

    const title = textValue(result.title).trim() || url;
    const snippet = (
      textValue(result.extract) ||
      textValue(result.content) ||
      textValue(result.description) ||
      textValue(result.snippet)
    ).trim();
    return [{ title, url, snippet, source: "Mwmbl" }];
  });
}

function mapNativeResults(html, query, context, httpStatus) {
  const $ = load(html);
  const containers = $(".results .result-container");
  const title = $("title").text().replace(/\s+/g, " ").trim();
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const invalid = () => engineFailure(context, "parse_error", "Mwmbl returned an unexpected native search page", httpStatus);
  if (title !== `Mwmbl - ${normalizedQuery}`) throw invalid();
  if (!containers.length) {
    const text = $.root().text().replace(/\s+/g, " ");
    if (text.includes(`No results found for "${normalizedQuery}"`)) return [];
    throw invalid();
  }
  const rows = containers.map((_index, element) => {
    const node = $(element);
    const url = node.find("a[href]").first().attr("href");
    if (!/^https?:\/\//i.test(url ?? "")) return null;
    return {
      url,
      title: node.find(".title, .more-title").first().text().replace(/\s+/g, " ").trim(),
      extract: node.find(".extract, .more-extract").first().text().replace(/\s+/g, " ").trim(),
    };
  }).get();
  if (!rows.length) throw invalid();
  return mapResults(rows);
}

export const type = "web";
export const site = "https://mwmbl.org";
export const outgoingHosts = ["*"];

class MwmblEngine {
  name = "Mwmbl";
  bangShortcut = "mw";
  isClientExposed = false;
  baseUrl = DEFAULT_API_BASE_URL;
  searchMode = "api";

  settingsSchema = [
    {
      key: "searchMode",
      label: "Search mode",
      type: "select",
      options: ["api", "native"],
      default: "api",
      description:
        "native searches Mwmbl's own index using its live results page. api includes optional live Wikipedia enrichment, which can delay results. Native mode can return fewer results.",
    },
    {
      key: "baseUrl",
      label: "Mwmbl API URL",
      type: "text",
      default: DEFAULT_API_BASE_URL,
      description:
        "Base URL for the Mwmbl API (default: https://api.mwmbl.org/api/v1; /api/v2 is also supported). Set the request deadline using this engine's Timeout (ms) setting. Use a direct transport to avoid browser startup delays.",
    },
  ];

  configure(settings = {}) {
    const baseUrl = normalizeApiBaseUrl(settings.baseUrl);
    if (baseUrl) this.baseUrl = baseUrl;
    if (["api", "native"].includes(settings.searchMode)) this.searchMode = settings.searchMode;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    // The public API returns one complete result set, not separate pages.
    context?.pagination?.({ total: 1 });
    if (page > 1) return [];

    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) return [];

    const parentSignal = context?.signal;
    parentSignal?.throwIfAborted();
    // The documented v2 API uses q; v1 uses s. A v2 base URL with s returns
    // HTTP 422, even though its wrapped result shape is already supported.
    const queryKey = /\/api\/v2\/?$/.test(new URL(this.baseUrl).pathname) ? "q" : "s";
    const native = this.searchMode === "native";
    const url = native
      ? `${new URL("/app/home/", this.baseUrl)}?${new URLSearchParams({ q: normalizedQuery })}`
      : `${this.baseUrl}/search/?${new URLSearchParams({ [queryKey]: normalizedQuery })}`;
    const doFetch = context?.fetch ?? fetch;
    let abortFromParent;
    const cancellationPromise = parentSignal && new Promise((_resolve, reject) => {
      abortFromParent = () => reject(parentSignal.reason);
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    });
    // A transport may abort and throw before it returns a promise to race.
    cancellationPromise?.catch(() => {});
    const withCancellation = (task) => cancellationPromise
      ? Promise.race([task, cancellationPromise])
      : task;

    let response;
    try {
      response = await withCancellation(
        doFetch(url, {
          headers: { Accept: native ? "text/html" : "application/json" },
          // Core owns the configured timeout. Without an exposed signal,
          // leave this unset so ctx.fetch can inject core's cancellation.
          ...(parentSignal ? { signal: parentSignal } : {}),
        }),
      );
      parentSignal?.throwIfAborted();
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      }
      if (!response.ok) throw engineFailure(context,
        response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked",
        `${this.name} upstream returned HTTP ${response.status}`, response.status);
      if (native) {
        const html = await withCancellation(response.text());
        parentSignal?.throwIfAborted();
        return mapNativeResults(html, normalizedQuery, context, response.status);
      }
      const payload = await withCancellation(response.json());
      parentSignal?.throwIfAborted();
      if (!Array.isArray(payload) && !Array.isArray(payload?.results)) {
        throw engineFailure(context, "parse_error", `${this.name} upstream returned an unexpected search response`, response.status);
      }
      const results = mapResults(payload);
      if ((Array.isArray(payload) ? payload.length : payload.results.length) && !results.length) {
        throw engineFailure(context, "parse_error", `${this.name} upstream returned no usable result URLs`, response.status);
      }
      return results;
    } catch (error) {
      parentSignal?.throwIfAborted();
      if (error?.name !== "SyntaxError") throw error;
      throw engineFailure(context, "parse_error", `${this.name} upstream returned invalid JSON`, response?.status);
    } finally {
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  }
}

export default MwmblEngine;
