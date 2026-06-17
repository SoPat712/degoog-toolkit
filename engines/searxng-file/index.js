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
      if (thumbnail) item.thumbnail = thumbnail;
      if (imageUrl) item.imageUrl = imageUrl;
      if (r.duration) item.duration = r.duration;
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

    if (this.#categories) params.set("categories", this.#categories);
    if (this.#engines) params.set("engines", this.#engines);
    if (context?.lang) params.set("language", context.lang);

    const timeRange = TIME_RANGE_MAP[timeFilter];
    if (timeRange) params.set("time_range", timeRange);

    const url = `${this.baseUrl}/search?${params}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: { Accept: "application/json" },
    });

    if (typeof context?.sentinel === "function") {
      context.sentinel(response, this.name);
    } else if (!response.ok) {
      throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
    }

    try {
      const data = await response.json();
      return Array.isArray(data?.results) ? mapResults(data.results) : [];
    } catch (error) {
      if (typeof context?.engineError === "function") {
        throw context.engineError(
          "parse_error",
          `${this.name} upstream returned invalid JSON`,
          { httpStatus: response.status, engine: this.name },
        );
      }
      throw error;
    }
  }
}

export default SearXNGFileEngine;
