const INDEX_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons/index.json";
const CDN_BASE_URL = "https://cdn.jsdelivr.net/gh/selfhst/icons";
const INDEX_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 1500;
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
  #indexPromise = null;

  async #fetchIndex(context) {
    const doFetch = context?.fetch ?? fetch;
    const controller = new AbortController();
    const parentSignal = context?.signal;
    const forwardAbort = () => controller.abort(parentSignal.reason);
    if (parentSignal?.aborted) forwardAbort();
    else parentSignal?.addEventListener("abort", forwardAbort, { once: true });

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
      parentSignal?.removeEventListener("abort", forwardAbort);
    }
  }

  async #getIcons(context) {
    if (
      this.#cachedIcons &&
      Date.now() - this.#cachedAt < INDEX_CACHE_TTL_MS
    ) {
      return this.#cachedIcons;
    }
    if (!this.#indexPromise) {
      this.#indexPromise = this.#fetchIndex(context)
        .then((icons) => {
          this.#cachedIcons = icons;
          this.#cachedAt = Date.now();
          return icons;
        })
        .finally(() => {
          this.#indexPromise = null;
        });
    }
    return this.#indexPromise;
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
