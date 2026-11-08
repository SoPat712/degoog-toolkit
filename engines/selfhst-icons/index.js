const INDEX_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons/index.json";
const CDN_BASE_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons";
const INDEX_CACHE_TTL_MS = 60 * 60 * 1000;
const INDEX_RETRY_MS = 5 * 60 * 1000;
// Backstop for the shared index download only. Each search's own deadline is
// core's engine timeout, which reaches it through context.signal.
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESULTS = 100;

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const hasFormat = (value) => String(value ?? "").toLowerCase() === "yes";

const normalizeIcon = (item) => {
  if (!item || typeof item !== "object") return null;
  const name = typeof item.Name === "string" ? item.Name.trim() : "";
  const reference =
    typeof item.Reference === "string" ? item.Reference.trim() : "";
  if (!name || !reference) return null;

  const format = hasFormat(item.SVG)
    ? "svg"
    : hasFormat(item.PNG)
      ? "png"
      : hasFormat(item.WebP)
        ? "webp"
        : null;
  if (!format) return null;

  const tags = typeof item.Tags === "string" ? item.Tags.trim() : "";
  const imageUrl = `${CDN_BASE_URL}/${format}/${encodeURIComponent(reference)}.${format}`;
  return {
    name,
    reference,
    category: typeof item.Category === "string" ? item.Category.trim() : "",
    tags,
    imageUrl,
    searchText: normalizeText([name, reference, tags].join(" ")),
  };
};

/** Settle with the caller's cancellation without cancelling shared work. */
const untilAborted = (promise, signal) => {
  if (!signal) return promise;
  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
};

const scoreIcon = (icon, terms) => {
  if (!terms.every((term) => icon.searchText.includes(term))) return -1;

  const name = normalizeText(icon.name);
  const reference = normalizeText(icon.reference);
  return terms.reduce((score, term) => {
    if (reference === term || name === term) return score + 1000;
    if (reference.startsWith(term)) return score + 300;
    if (name.startsWith(term)) return score + 250;
    return score + 100;
  }, 0);
};

export const type = "images";
export const outgoingHosts = ["cdn.jsdelivr.net"];

class SelfhstIconsEngine {
  name = "selfh.st Icons";
  bangShortcut = "si";
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  #cachedIcons = null;
  #cachedAt = 0;
  #retryAt = 0;
  #indexPromise = null;

  async #fetchIndex(context) {
    const doFetch = context?.fetch ?? fetch;
    // Concurrent searches share this download, so it must not use the first
    // caller's signal. Passing our own also stops ctx.fetch injecting it.
    const controller = new AbortController();

    let timedOut = false;
    let timeoutId;
    const timeoutPromise = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        const timeoutError = new Error(
          `${this.name} index request timed out`,
        );
        controller.abort(timeoutError);
        reject(timeoutError);
      }, this.requestTimeoutMs);
    });

    let response;
    try {
      response = await Promise.race([
        doFetch(INDEX_URL, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
      if (typeof context?.sentinel === "function") {
        context.sentinel(response, this.name);
      } else if (!response.ok) {
        throw new Error(`${this.name} upstream returned HTTP ${response.status}`);
      }

      const payload = await Promise.race([response.json(), timeoutPromise]);
      if (!Array.isArray(payload)) {
        throw new SyntaxError(`${this.name} index was not an array`);
      }
      return payload.flatMap((item) => {
        const icon = normalizeIcon(item);
        return icon ? [icon] : [];
      });
    } catch (error) {
      if (timedOut) {
        if (typeof context?.engineError === "function") {
          throw context.engineError(
            "timeout",
            `${this.name} index request timed out`,
            { engine: this.name },
          );
        }
        throw new Error(`${this.name} index request timed out`, {
          cause: error,
        });
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
    }
  }

  async #getIcons(context) {
    const stale = this.#cachedIcons;
    if (
      stale &&
      (Date.now() - this.#cachedAt < INDEX_CACHE_TTL_MS ||
        Date.now() < this.#retryAt)
    ) {
      return stale;
    }
    if (!this.#indexPromise) {
      this.#indexPromise = this.#fetchIndex(context)
        .then(
          (icons) => {
            this.#cachedIcons = icons;
            this.#cachedAt = Date.now();
            return icons;
          },
          (error) => {
            this.#retryAt = Date.now() + INDEX_RETRY_MS;
            throw error;
          },
        )
        .finally(() => {
          this.#indexPromise = null;
        });
      // Every waiting search may have been cancelled before this settles.
      this.#indexPromise.catch(() => {});
    }
    try {
      return await untilAborted(this.#indexPromise, context?.signal);
    } catch (error) {
      if (context?.signal?.aborted || !stale) throw error;
      // Keep serving the last good index; the CDN is retried after a pause.
      return stale;
    }
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const pageNumber = Number(page);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return [];
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    const icons = await this.#getIcons(context);
    return icons
      .map((icon) => ({ icon, score: scoreIcon(icon, terms) }))
      .filter(({ score }) => score >= 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.icon.name.localeCompare(right.icon.name),
      )
      .slice((pageNumber - 1) * MAX_RESULTS, pageNumber * MAX_RESULTS)
      .map(({ icon }) => ({
        title: icon.name,
        url: icon.imageUrl,
        snippet: [icon.category, icon.tags].filter(Boolean).join(" · "),
        source: "selfh.st/icons",
        thumbnail: icon.imageUrl,
        imageUrl: icon.imageUrl,
      }));
  }
}

export default SelfhstIconsEngine;
