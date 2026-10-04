const DEFAULT_API_BASE_URL = "https://api.mwmbl.org/api/v1";
const REQUEST_TIMEOUT_MS = 1000;

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

export const type = "web";
export const site = "https://mwmbl.org";
export const outgoingHosts = ["*"];

class MwmblEngine {
  name = "Mwmbl";
  bangShortcut = "mw";
  baseUrl = DEFAULT_API_BASE_URL;

  settingsSchema = [
    {
      key: "baseUrl",
      label: "Mwmbl API URL",
      type: "text",
      default: DEFAULT_API_BASE_URL,
      description:
        "Base URL for the Mwmbl API (default: https://api.mwmbl.org/api/v1). Requests have a fixed 1,000 ms limit, including reading the response. Slow results are discarded. Use a direct transport to avoid browser startup delays.",
    },
  ];

  configure(settings = {}) {
    const baseUrl = normalizeApiBaseUrl(settings.baseUrl);
    if (baseUrl) this.baseUrl = baseUrl;
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    // The public API returns one complete result set, not separate pages.
    context?.pagination?.({ total: 1 });
    if (page > 1) return [];

    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) return [];

    const parentSignal = context?.signal;
    parentSignal?.throwIfAborted();
    const url = `${this.baseUrl}/search/?${new URLSearchParams({ s: normalizedQuery })}`;
    const doFetch = context?.fetch ?? fetch;
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(parentSignal.reason);
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => {
      controller.abort(new DOMException("Mwmbl timeout after 1000 ms", "TimeoutError"));
    }, REQUEST_TIMEOUT_MS);
    let onAbort;
    const cancellationPromise = new Promise((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    // A transport may abort and throw before it returns a promise to race.
    cancellationPromise.catch(() => {});
    const withCancellation = (task) => Promise.race([task, cancellationPromise]);

    let response;
    try {
      response = await withCancellation(
        doFetch(url, {
          headers: { Accept: "application/json" },
          // Core still applies its outer configured deadline. When core does
          // not expose its signal, this request can outlive a shorter
          // host deadline, but only until our one-second cap.
          signal: controller.signal,
        }),
      );
      controller.signal.throwIfAborted();
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      } else if (!response.ok) {
        throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
      }
      const payload = await withCancellation(response.json());
      controller.signal.throwIfAborted();
      return mapResults(payload);
    } catch (error) {
      controller.signal.throwIfAborted();
      if (error?.name !== "SyntaxError") throw error;
      if (typeof context?.engineError === "function") {
        throw context.engineError(
          "parse_error",
          `${this.name} upstream returned invalid JSON`,
          { httpStatus: response?.status, engine: this.name },
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
}

export default MwmblEngine;
