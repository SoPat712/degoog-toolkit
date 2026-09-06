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

function mapResults(payload) {
  const results = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return results.flatMap((result) => {
    if (!result || typeof result !== "object") return [];
    const urlValue = result.url ?? result.link;
    const url = typeof urlValue === "string" ? urlValue.trim() : "";
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
  requestTimeoutMs = 10_000;

  settingsSchema = [
    {
      key: "baseUrl",
      label: "Mwmbl API URL",
      type: "text",
      default: DEFAULT_API_BASE_URL,
      description:
        "Base URL for the Mwmbl API (default: https://api.mwmbl.org/api/v1).",
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
    const controller = new AbortController();
    const parentSignal = context?.signal;
    const forwardAbort = () => controller.abort(parentSignal.reason);
    let timedOut = false;
    if (parentSignal?.aborted) forwardAbort();
    else parentSignal?.addEventListener("abort", forwardAbort, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Mwmbl request timed out", "TimeoutError"));
    }, this.requestTimeoutMs);

    let response;
    try {
      response = await doFetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      } else if (!response.ok) {
        throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
      }
      return mapResults(await response.json());
    } catch (error) {
      if (timedOut) {
        if (typeof context?.engineError === "function") {
          throw context.engineError("timeout", `${this.name} upstream request timed out`, {
            engine: this.name,
          });
        }
        throw new Error(`${this.name} upstream request timed out`, { cause: error });
      }
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
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export default MwmblEngine;
