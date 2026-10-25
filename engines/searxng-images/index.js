const TIME_RANGE_MAP = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const DEFAULT_CATEGORIES = "images";
const SAFE_SEARCH_VALUES = new Set(["0", "1", "2"]);
const RESPONSE_BUDGET_MS = 200;

function failure(context, status, message, httpStatus) {
  return context?.engineError?.(status, message, { engine: "SearXNG Images", httpStatus })
    ?? Object.assign(new Error(message), { status, httpStatus });
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString().replace(/\/+$/, "");
    }
  } catch {}
  return null;
}

/** Give scheme-relative media URLs an HTTPS scheme for degoog's image proxy. */
function normalizeMediaUrl(value) {
  return typeof value === "string" ? value.replace(/^\/\//, "https://") : value;
}

function mapResults(results) {
  return results
    .filter((r) => r?.title && r?.url)
    .map((r) => {
      const item = {
        title: r.title,
        url: r.url,
        snippet: r.content ?? "",
        source: `SearXNG:${r.engine ?? "unknown"}`,
      };
      const thumbnail = r.thumbnail || r.img_src;
      const imageUrl = r.img_src || r.thumbnail;
      if (thumbnail) item.thumbnail = normalizeMediaUrl(thumbnail);
      if (imageUrl) item.imageUrl = normalizeMediaUrl(imageUrl);
      if (r.duration) item.duration = r.duration;
      return item;
    });
}

export const type = "images";
export const outgoingHosts = ["*"];

class SearXNGImagesEngine {
  name = "SearXNG Images";
  bangShortcut = "sxi";
  isClientExposed = false;
  baseUrl = "http://127.0.0.1:8888";

  settingsSchema = [
    {
      key: "baseUrl",
      label: "SearXNG URL",
      type: "text",
      default: "http://127.0.0.1:8888",
      description:
        "Base URL of your SearXNG instance (default: http://127.0.0.1:8888)",
    },
    {
      key: "categories",
      label: "Categories",
      type: "text",
      default: DEFAULT_CATEGORIES,
      description:
        'Comma-separated categories to search (defaults to "images" for this engine).',
    },
    {
      key: "engines",
      label: "Engines",
      type: "text",
      description:
        'Comma-separated engine names to use (e.g. "google images,qwant images"). Leave empty for all enabled.',
    },
    {
      key: "safesearch",
      label: "Safe Search",
      type: "select",
      options: ["0", "1", "2"],
      default: "0",
      description: "Safe search level: 0=off, 1=moderate, 2=strict",
    },
  ];

  #categories = DEFAULT_CATEGORIES;
  #engines = "";
  #safesearch = "0";
  #timeoutMs;

  configure(settings = {}) {
    if (Object.hasOwn(settings, "timeoutMs")) {
      const timeout = Number(settings.timeoutMs);
      this.#timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
    }
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (baseUrl) this.baseUrl = baseUrl;
    if (typeof settings.categories === "string") {
      this.#categories = settings.categories.trim() || DEFAULT_CATEGORIES;
    }
    if (typeof settings.engines === "string") {
      this.#engines = settings.engines.trim();
    }
    if (SAFE_SEARCH_VALUES.has(settings.safesearch)) {
      this.#safesearch = settings.safesearch;
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) return [];
    const parsedPage = Number.parseInt(page, 10);
    const pageNo = parsedPage > 0 ? parsedPage : 1;
    const params = new URLSearchParams({
      q: normalizedQuery,
      format: "json",
      pageno: String(pageNo),
      safesearch: this.#safesearch,
    });

    if (this.#engines) params.set("engines", this.#engines);
    else if (this.#categories) params.set("categories", this.#categories);
    if (context?.lang) params.set("language", context.lang);
    if (this.#timeoutMs) {
      // SearXNG must finish collecting partial results before core's deadline,
      // leaving room for the HTTP response and JSON parsing. Its per-query
      // limit reports unfinished providers in unresponsive_engines.
      const reserve = Math.min(RESPONSE_BUDGET_MS, this.#timeoutMs / 10);
      params.set("timeout_limit", String((this.#timeoutMs - reserve) / 1000));
    }

    const timeRange = TIME_RANGE_MAP[timeFilter];
    if (timeRange) params.set("time_range", timeRange);

    const url = `${this.baseUrl}/search?${params}`;
    const doFetch = context?.fetch ?? fetch;
    const parentSignal = context?.signal;
    parentSignal?.throwIfAborted();
    let forwardAbort;
    const cancellation = parentSignal && new Promise((_resolve, reject) => {
      forwardAbort = () => reject(parentSignal.reason);
      parentSignal.addEventListener("abort", forwardAbort, { once: true });
    });
    // A transport can abort and throw before returning a promise to race.
    cancellation?.catch(() => {});
    const withCancellation = (task) => cancellation
      ? Promise.race([task, cancellation])
      : task;
    let response;
    try {
      response = await withCancellation(doFetch(url, {
        headers: { Accept: "application/json" },
        // Core owns the configured deadline. When context.signal is absent,
        // leave this unset so ctx.fetch can inject core's cancellation signal.
        ...(parentSignal ? { signal: parentSignal } : {}),
      }));
      parentSignal?.throwIfAborted();
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      }
      if (!response.ok) throw failure(context,
        response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked",
        `${this.name} upstream returned HTTP ${response.status}`, response.status);
      const data = await withCancellation(response.json());
      parentSignal?.throwIfAborted();
      if (!Array.isArray(data?.results)) {
        throw failure(context, "parse_error", `${this.name} returned an unexpected search response`, response.status);
      }
      const results = mapResults(data.results);
      if (data.results.length && !results.length) {
        throw failure(context, "parse_error", `${this.name} returned no usable image results`, response.status);
      }
      const failures = (Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : [])
        .filter(row => Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string")
        .map(([name, reason]) => `${name.slice(0, 80)}: ${reason.slice(0, 160)}`);
      if (failures.length) {
        const message = `${this.name}: ${failures.join("; ")}`;
        if (!results.length) throw failure(context, "network", `No image results; ${message}`, response.status);
        console.warn(`${message} (${results.length} usable results retained)`);
      }
      return results;
    } catch (error) {
      parentSignal?.throwIfAborted();
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
      parentSignal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export default SearXNGImagesEngine;
