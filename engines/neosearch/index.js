import { load } from "cheerio";

export const type = "web";
export const site = "https://neosearch.org";
export const outgoingHosts = ["neosearch.org"];

// Neosearch issues public search tokens for one hour. Refresh before expiry.
const TOKEN_TTL_MS = 45 * 60 * 1000;
const MAX_STREAM_BYTES = 4 * 1024 * 1024;

function fail(context, status, message, httpStatus) {
  const options = { engine: "NeoSearch", httpStatus };
  if (context?.engineError) return context.engineError(status, message, options);
  return Object.assign(new Error(message), { name: "SentinelBreach", status, ...options });
}

function checkResponse(response, context) {
  context?.sentinel?.(response, "NeoSearch");
  if (!response.ok) {
    const status = response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked";
    throw fail(context, status, `NeoSearch returned HTTP ${response.status}`, response.status);
  }
}

function plainText(value) {
  if (typeof value !== "string") return "";
  const $ = load(value, null, false);
  $("script, style").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function webUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function mapLenses(lenses, context) {
  const malformed = () => fail(context, "parse_error", "NeoSearch returned an unexpected results format");
  if (!Array.isArray(lenses)) throw malformed();
  const results = [];
  const seen = new Set();
  for (const lens of lenses) {
    if (!Array.isArray(lens?.categories)) throw malformed();
    for (const category of lens.categories) {
      if (!Array.isArray(category?.links)) throw malformed();
      for (const link of category.links) {
        const url = webUrl(link?.url);
        const title = plainText(link?.title);
        if (!url || !title || seen.has(url)) continue;
        seen.add(url);
        results.push({ title, url, snippet: plainText(link.description) || plainText(link.snippet), source: "NeoSearch" });
      }
    }
  }
  return results;
}

/** Read the complete lenses message without waiting for summaries or plugins. */
async function readResults(response, context, wait) {
  const reader = response.body?.getReader();
  if (!reader) throw fail(context, "parse_error", "NeoSearch returned no result stream", response.status);
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  let pluginOnly = false;
  const parseLine = (line) => {
    if (!line.trim()) return null;
    let data;
    try { data = JSON.parse(line); }
    catch { throw fail(context, "parse_error", "NeoSearch returned invalid streamed JSON", response.status); }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw fail(context, "parse_error", "NeoSearch returned an invalid stream message", response.status);
    }
    if (data.error) throw fail(context, "network", "NeoSearch reported an upstream search error", response.status);
    if (data.plugin?.name) pluginOnly = true;
    return Object.hasOwn(data, "lenses") ? mapLenses(data.lenses, context) : null;
  };
  try {
    while (true) {
      const { done, value } = await wait(reader.read());
      context?.signal?.throwIfAborted();
      bytes += value?.byteLength ?? 0;
      if (bytes > MAX_STREAM_BYTES) throw fail(context, "parse_error", "NeoSearch result stream is too large", response.status);
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const results = parseLine(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (results !== null) return results;
      }
      if (done) {
        const results = parseLine(buffer);
        if (results !== null) return results;
        // Instant tools, such as weather, can intentionally replace web results.
        if (pluginOnly) return [];
        throw fail(context, "parse_error", "NeoSearch stream ended before web results arrived", response.status);
      }
    }
  } finally {
    // Some transports have slow cancellation acknowledgements; don't delay results.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export default class NeoSearchEngine {
  name = "NeoSearch";
  bangShortcut = "neo";
  isClientExposed = false;
  #token;
  #country = "";

  settingsSchema = [{
    key: "country",
    label: "Search region",
    type: "text",
    default: "",
    placeholder: "us",
    description: "Optional two-letter country code, such as us or gb. Blank uses the search language's region, or Neosearch's default. Use Fetch for direct requests and set the deadline with Timeout (ms). The public service limits daily searches.",
  }];

  configure(settings = {}) {
    if (typeof settings.country === "string") {
      const country = settings.country.trim().toLowerCase();
      if (!country || /^[a-z]{2}$/.test(country)) this.#country = country;
    }
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    context?.pagination?.({ total: 1 });
    const text = String(query ?? "").trim();
    if (!text || page > 1) return [];

    const signal = context?.signal;
    signal?.throwIfAborted();
    let onAbort;
    const cancellation = signal && new Promise((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    cancellation?.catch(() => {});
    const wait = (task) => cancellation ? Promise.race([task, cancellation]) : task;
    const doFetch = context?.fetch ?? fetch;
    const request = (url, options) => wait(Promise.resolve(doFetch(url, options)).then((response) => {
      // A transport may finish after the caller's deadline has already won the race.
      if (signal?.aborted) {
        response.body?.cancel().catch(() => {});
        signal.throwIfAborted();
      }
      return response;
    }));
    const init = signal ? { signal } : {};
    let response;
    try {
      if (!this.#token || Date.now() >= this.#token.expires) {
        response = await request(`${site}/`, { ...init, headers: { Accept: "text/html" } });
        checkResponse(response, context);
        const html = await wait(response.text());
        signal?.throwIfAborted();
        const value = load(html)('meta[name="xsrf-token"]').attr("content")?.trim();
        if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
          throw fail(context, "parse_error", "NeoSearch homepage is missing its search token", response.status);
        }
        this.#token = { value, expires: Date.now() + TOKEN_TTL_MS };
      }
      signal?.throwIfAborted();
      const token = this.#token;
      let loc = this.#country || undefined;
      if (!loc && context?.lang) {
        try { loc = new Intl.Locale(context.lang.replace(/_/g, "-")).region?.toLowerCase(); }
        catch { /* Leave location detection to Neosearch for unknown language tags. */ }
      }
      if (loc && !/^[a-z]{2}$/.test(loc)) loc = undefined;
      response = await request(`${site}/search`, {
        ...init,
        method: "POST",
        headers: { Accept: "application/x-ndjson", "Content-Type": "application/json", "X-XSRF-TOKEN": token.value },
        body: JSON.stringify({ q: text, generate: "auto", ...(loc ? { loc } : {}) }),
      });
      // Refresh on the next user request, without silently retrying this search.
      if (response.status === 403 && this.#token === token) this.#token = undefined;
      checkResponse(response, context);
      signal?.throwIfAborted();
      return await readResults(response, context, wait);
    } catch (error) {
      signal?.throwIfAborted();
      throw error;
    } finally {
      // Also close a body received just as the caller cancels, before parsing starts.
      response?.body?.cancel().catch(() => {});
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
