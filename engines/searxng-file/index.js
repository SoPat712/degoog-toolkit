const TIME_RANGE_MAP = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const DEFAULT_CATEGORIES = "files";
const SAFE_SEARCH_VALUES = new Set(["0", "1", "2"]);

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

/** SearXNG sends engine strings ("4:13") or a timedelta encoded as seconds. */
function formatLength(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
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
      // Image engines put the small preview in thumbnail_src and leave
      // thumbnail empty, so img_src alone would load the full original.
      const thumbnail = r.thumbnail_src || r.thumbnail || r.img_src;
      const imageUrl = r.img_src || r.thumbnail || r.thumbnail_src;
      if (thumbnail) item.thumbnail = normalizeMediaUrl(thumbnail);
      if (imageUrl) item.imageUrl = normalizeMediaUrl(imageUrl);
      const duration = formatLength(r.length ?? r.duration);
      if (duration) item.duration = duration;
      // Core reads a YYYY-MM-DD publishedAt; SearXNG sends an ISO datetime.
      if (typeof r.publishedDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.publishedDate)) {
        item.publishedAt = r.publishedDate.slice(0, 10);
      }
      return item;
    });
}

export const type = "file";
export const outgoingHosts = ["*"];

class SearXNGFileEngine {
  name = "SearXNG File";
  bangShortcut = "sxf";
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
        'Comma-separated categories to search (defaults to "files" for this engine).',
    },
    {
      key: "engines",
      label: "Engines",
      type: "text",
      description:
        'Comma-separated engine names to use. Leave empty for all enabled.',
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

  configure(settings = {}) {
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
      } else if (!response.ok) {
        throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
      }
      const data = await withCancellation(response.json());
      parentSignal?.throwIfAborted();
      return Array.isArray(data?.results) ? mapResults(data.results) : [];
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
    } finally {
      parentSignal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export default SearXNGFileEngine;
