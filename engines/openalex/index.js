export const type = "scientific publications";
export const site = "https://openalex.org";
export const outgoingHosts = ["api.openalex.org"];

const API_URL = "https://api.openalex.org/works";
const FIELDS = [
  "id", "doi", "title", "publication_date", "type", "authorships",
  "primary_location", "best_oa_location", "open_access", "cited_by_count",
  "abstract_inverted_index", "is_retracted",
];
const PAGE_SIZES = new Set([20, 40, 100]);
const SORTS = { newest: "publication_date:desc", "most-cited": "cited_by_count:desc" };
const TIME_DAYS = { hour: 0, day: 1, week: 7, month: 30, year: 365 };
const BASIC_PAGING_LIMIT = 10_000;

function failure(context, status, message, httpStatus) {
  return context?.engineError?.(status, message, { engine: "OpenAlex", httpStatus })
    ?? Object.assign(new Error(message), { status, httpStatus });
}

const text = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const enabled = value => value === true || value === "true";

function safeUrl(value) {
  try {
    const url = new URL(text(value));
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : "";
  } catch { return ""; }
}

function abstractText(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) return "";
  const words = new Map();
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0 && position < 80) words.set(position, word);
    }
  }
  return text([...words].sort(([a], [b]) => a - b).map(([, word]) => word).join(" "));
}

function resultFor(work, preferOpenAccess) {
  const title = text(work?.title);
  if (!title) return null;
  const doi = safeUrl(work.doi);
  const id = safeUrl(work.id);
  const landing = safeUrl(work.primary_location?.landing_page_url);
  const openLink = safeUrl(work.best_oa_location?.landing_page_url)
    || safeUrl(work.best_oa_location?.pdf_url) || safeUrl(work.open_access?.oa_url);
  const url = (preferOpenAccess ? openLink : "") || doi || landing || id;
  if (!url) return null;

  const authors = (Array.isArray(work.authorships) ? work.authorships : [])
    .map(item => text(item?.author?.display_name)).filter(Boolean);
  const authorLine = authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(work.publication_date) ? work.publication_date : "";
  const metadata = [
    work.is_retracted === true ? "RETRACTED" : "",
    authorLine,
    date.slice(0, 4),
    text(work.primary_location?.source?.display_name),
    Number.isSafeInteger(work.cited_by_count) && work.cited_by_count >= 0
      ? `Cited by ${work.cited_by_count}` : "",
    work.open_access?.is_oa === true ? "Open access" : "",
  ].filter(Boolean).join(" · ");
  const abstract = abstractText(work.abstract_inverted_index);
  const snippet = [metadata, abstract].filter(Boolean).join(" — ");
  return {
    key: doi || id || url,
    result: { title, url, snippet, source: "OpenAlex", ...(date ? { publishedAt: date } : {}) },
  };
}

export default class OpenAlexEngine {
  name = "OpenAlex";
  bangShortcut = "openalex";
  isClientExposed = false;

  settingsSchema = [
    { key: "apiKey", label: "API key (optional)", type: "password", secret: true,
      description: "Anonymous search works without a key. A verified OpenAlex key increases your usage allowance." },
    { key: "pageSize", label: "Results per page", type: "select", options: ["20", "40", "100"], default: "20" },
    { key: "sort", label: "Sort", type: "select", options: ["relevance", "newest", "most-cited"], default: "relevance" },
    { key: "openAccessOnly", label: "Open-access results only", type: "toggle", default: "false" },
    { key: "preferOpenAccess", label: "Prefer open-access links", type: "toggle", default: "true",
      description: "Link to an available open-access copy before the DOI or publisher page." },
  ];

  #apiKey = "";
  #pageSize = 20;
  #sort = "relevance";
  #openAccessOnly = false;
  #preferOpenAccess = true;

  configure(settings = {}) {
    if (Object.hasOwn(settings, "apiKey")) this.#apiKey = text(settings.apiKey);
    if (PAGE_SIZES.has(Number(settings.pageSize))) this.#pageSize = Number(settings.pageSize);
    if (["relevance", "newest", "most-cited"].includes(settings.sort)) this.#sort = settings.sort;
    if (Object.hasOwn(settings, "openAccessOnly")) this.#openAccessOnly = enabled(settings.openAccessOnly);
    if (Object.hasOwn(settings, "preferOpenAccess")) this.#preferOpenAccess = enabled(settings.preferOpenAccess);
  }

  async executeSearch(query, page = 1, timeFilter, context) {
    const q = String(query ?? "").trim();
    if (!q) return [];
    const pageNumber = Number.isSafeInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    if (pageNumber > Math.ceil(BASIC_PAGING_LIMIT / this.#pageSize)) return [];
    const params = new URLSearchParams({ page: String(pageNumber), per_page: String(this.#pageSize), select: FIELDS.join(",") });
    const filters = [];
    const doi = /^(?:doi\s*:?\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(q)?.[1];
    if (doi) filters.push(`doi:https://doi.org/${doi}`);
    else params.set("search", q);
    if (this.#openAccessOnly) filters.push("is_oa:true");
    if (Object.hasOwn(TIME_DAYS, timeFilter)) {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - TIME_DAYS[timeFilter]);
      filters.push(`from_publication_date:${since.toISOString().slice(0, 10)}`);
    }
    if (filters.length) params.set("filter", filters.join(","));
    if (SORTS[this.#sort]) params.set("sort", SORTS[this.#sort]);

    const signal = context?.signal;
    signal?.throwIfAborted();
    let onAbort;
    const cancellation = signal && new Promise((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    cancellation?.catch(() => {});
    const wait = task => cancellation ? Promise.race([task, cancellation]) : task;
    try {
      const response = await wait((context?.fetch ?? fetch)(`${API_URL}?${params}`, {
        headers: { Accept: "application/json",
          "User-Agent": "degoog-toolkit OpenAlex/1.0 (https://github.com/SoPat712/degoog-toolkit)",
          ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}) },
        // Core injects its configured cancellation signal when context omits it.
        ...(signal ? { signal } : {}),
      }));
      signal?.throwIfAborted();
      context?.sentinel?.(response, this.name);
      if (!response.ok) {
        const status = response.status === 429 ? "rate_limited" : response.status >= 500 ? "network"
          : response.status === 400 ? "parse_error" : "blocked";
        const reason = response.status === 429 ? "rate or usage limit reached"
          : response.status === 401 || response.status === 403 ? "request refused; check API access and key activation"
            : response.status === 400 ? "query or filters rejected" : "upstream request failed";
        throw failure(context, status, `OpenAlex ${reason} (HTTP ${response.status})`, response.status);
      }
      let data;
      try { data = await wait(response.json()); }
      catch (error) {
        signal?.throwIfAborted();
        if (error?.name !== "SyntaxError") throw error;
        throw failure(context, "parse_error", "OpenAlex returned invalid JSON", response.status);
      }
      signal?.throwIfAborted();
      if (!Array.isArray(data?.results) || !Number.isSafeInteger(data?.meta?.count) || data.meta.count < 0 || data.error) {
        throw failure(context, "parse_error", "OpenAlex returned an unexpected search response", response.status);
      }
      const seen = new Set();
      const results = data.results.flatMap(work => {
        const item = resultFor(work, this.#preferOpenAccess);
        if (!item || seen.has(item.key)) return [];
        seen.add(item.key);
        return [item.result];
      });
      if (data.results.length && !results.length) {
        throw failure(context, "parse_error", "OpenAlex returned no usable research results", response.status);
      }
      context?.pagination?.({ total: Math.max(1, Math.ceil(Math.min(data.meta.count, BASIC_PAGING_LIMIT) / this.#pageSize)) });
      return results;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
