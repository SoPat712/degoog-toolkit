// SearXNG Engine for degoog
// Connects to a SearXNG instance and provides access to 242+ search engines
// Install via degoog Store: Settings > Store > Add this repo URL

const TIME_RANGE_MAP = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const DEFAULT_CATEGORIES = "general";

export const type = "web";
export const outgoingHosts = ["*"];

class SearXNGEngine {
  name = "SearXNG Web";
  bangShortcut = "sx";
  baseUrl = "http://127.0.0.1:8888";

  settingsSchema = [
    {
      key: "baseUrl",
      label: "SearXNG URL",
      type: "text",
      description:
        "Base URL of your SearXNG instance (default: http://127.0.0.1:8888)",
    },
    {
      key: "categories",
      label: "Categories",
      type: "text",
      default: DEFAULT_CATEGORIES,
      description:
        'Comma-separated categories to search (defaults to "general" for this engine).',
    },
    {
      key: "engines",
      label: "Engines",
      type: "text",
      description:
        'Comma-separated engine names to use (e.g. "google,duckduckgo,wikipedia"). Leave empty for all enabled.',
    },
    {
      key: "safesearch",
      label: "Safe Search",
      type: "select",
      options: ["0", "1", "2"],
      description: "Safe search level: 0=off, 1=moderate, 2=strict",
    },
  ];

  #categories = DEFAULT_CATEGORIES;
  #engines = "";
  #safesearch = "0";

  configure(settings) {
    if (typeof settings.baseUrl === "string" && settings.baseUrl.trim()) {
      this.baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
    }
    if (typeof settings.categories === "string") {
      this.#categories = settings.categories.trim() || DEFAULT_CATEGORIES;
    }
    if (typeof settings.engines === "string") {
      this.#engines = settings.engines.trim();
    }
    if (typeof settings.safesearch === "string") {
      this.#safesearch = settings.safesearch;
    }
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      pageno: String(Math.max(1, page || 1)),
      safesearch: this.#safesearch,
    });

    if (this.#categories) params.set("categories", this.#categories);
    if (this.#engines) params.set("engines", this.#engines);
    if (context?.lang) params.set("language", context.lang);

    if (
      timeFilter &&
      timeFilter !== "any" &&
      timeFilter !== "custom" &&
      TIME_RANGE_MAP[timeFilter]
    ) {
      params.set("time_range", TIME_RANGE_MAP[timeFilter]);
    }

    const url = `${this.baseUrl}/search?${params}`;
    const doFetch = context?.fetch ?? fetch;

    try {
      const response = await doFetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return [];

      const data = await response.json();
      if (!data.results || !Array.isArray(data.results)) return [];

      return data.results
        .filter((r) => r.title && r.url)
        .map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content ?? "",
          source: `SearXNG:${r.engine ?? "unknown"}`,
          ...((r.thumbnail || r.img_src)
            ? { thumbnail: r.thumbnail ?? r.img_src }
            : {}),
          ...((r.img_src || r.thumbnail)
            ? { imageUrl: r.img_src ?? r.thumbnail }
            : {}),
          ...(r.duration ? { duration: r.duration } : {}),
        }));
    } catch {
      return [];
    }
  }
}

export default SearXNGEngine;
