const DEFAULT_API_BASE_URL = "https://api.mwmbl.org/api/v1";

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
export const outgoingHosts = ["*"];

class MwmblEngine {
  name = "Mwmbl";
  bangShortcut = "mwmbl";
  baseUrl = DEFAULT_API_BASE_URL;

  settingsSchema = [
    {
      key: "baseUrl",
      label: "Mwmbl API URL",
      type: "text",
      default: DEFAULT_API_BASE_URL,
      description:
        "Base URL for the Mwmbl API (default: https://api.mwmbl.org/api/v1). Direct Fetch is recommended; use 4play only if direct requests are blocked.",
    },
  ];

  configure(settings = {}) {
    const baseUrl = normalizeApiBaseUrl(settings.baseUrl);
    if (baseUrl) this.baseUrl = baseUrl;
  }

  async executeSearch(query, _page = 1, _timeFilter, context) {
    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) return [];

    const url = `${this.baseUrl}/search/?${new URLSearchParams({ s: normalizedQuery })}`;
    const doFetch = context?.fetch ?? fetch;

    let response;
    try {
      response = await doFetch(url, {
        headers: { Accept: "application/json" },
        signal: context?.signal,
      });
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      } else if (!response.ok) {
        throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
      }
      return mapResults(await response.json());
    } catch (error) {
      if (error?.name !== "SyntaxError") throw error;
      if (typeof context?.engineError === "function") {
        throw context.engineError(
          "parse_error",
          `${this.name} upstream returned invalid JSON`,
          { httpStatus: response?.status, engine: this.name },
        );
      }
      throw error;
    }
  }
}

export default MwmblEngine;
