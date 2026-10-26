import { createHash } from "node:crypto";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const USER_AGENT = "degoog-toolkit/1.0 (+https://github.com/SoPat712/degoog-toolkit)";
const TIMEOUT_MS = 4000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const POSITIVE_TTL_MS = 6 * 60 * MINUTE_MS;
const NEGATIVE_TTL_MS = 5 * MINUTE_MS;
const CACHE_VERSION = "books:hardcover:v1";

// Shared by all clients in this process. Cache hits do not spend request quota.
let requestTimes = [];
let quotaDay = -1;
let dayRequests = 0;
let cooldownUntil = 0;

function failure(reason) {
  const error = new Error(`Hardcover ${reason}`);
  error.reason = reason;
  return error;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reserveRequest() {
  const now = Date.now();
  const today = Math.floor(now / DAY_MS);
  if (today !== quotaDay) {
    quotaDay = today;
    dayRequests = 0;
  }
  requestTimes = requestTimes.filter((time) => time > now - MINUTE_MS);
  if (now < cooldownUntil || requestTimes.length >= 30 || dayRequests >= 4500) {
    throw failure("limit");
  }
  requestTimes.push(now);
  dayRequests += 1;
}

function applyCooldown(response) {
  const now = Date.now();
  const retryAfter = response.headers?.get?.("retry-after");
  let delay = MINUTE_MS;
  if (typeof retryAfter === "string" && retryAfter.trim()) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(parsed)) delay = parsed;
  }
  // Honor seconds and HTTP-date values, with a one-second to fifteen-minute bound.
  cooldownUntil = Math.max(cooldownUntil, now + Math.max(1000, Math.min(delay, 15 * MINUTE_MS)));
}

const text = (value, limit = 2000) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const strings = (value) => Array.isArray(value)
  ? [...new Set(value.filter((item) => typeof item === "string").map((item) => text(item)).filter(Boolean))].slice(0, 100)
  : [];
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

function safeImageUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function normalize(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const title = text(document.title);
  if (!title) return null;
  const slug = text(document.slug);
  const position = number(document.featured_series_position) ?? text(document.featured_series_position, 80);
  return {
    title,
    subtitle: text(document.subtitle),
    author_name: strings(document.author_names),
    first_publish_year: number(document.release_year),
    number_of_pages_median: number(document.pages),
    ratings_average: number(document.rating),
    ratings_count: number(document.ratings_count),
    subject: strings(document.genres),
    isbn: strings(document.isbns),
    _source: "Hardcover",
    ...(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ? { _url: `https://hardcover.app/books/${slug}` } : {}),
    _coverUrl: safeImageUrl(document.image?.url),
    _description: text(document.description, 8000),
    _series: strings(document.series_names)[0] || "",
    _seriesPosition: position,
    _moods: strings(document.moods),
    _warnings: strings(document.content_warnings),
    _readers: number(document.users_count) ?? 0,
    _ebook: document.has_ebook === true,
    _audiobook: document.has_audiobook === true,
    _compilation: document.compilation === true,
  };
}

function copyDocs(docs) {
  return docs.map((doc) => ({
    ...doc,
    author_name: [...doc.author_name],
    subject: [...doc.subject],
    isbn: [...doc.isbn],
    _moods: [...doc._moods],
    _warnings: [...doc._warnings],
  }));
}

function queryFor(parsed) {
  const perPage = parsed.kind === "author" ? 16 : parsed.kind === "isbn" ? 3 : 5;
  const fields = parsed.kind === "author" ? "author_names" : parsed.kind === "isbn" ? "isbns" : "";
  return `{ search(query: ${JSON.stringify(parsed.term)}, query_type: "Book", per_page: ${perPage}, page: 1${fields ? `, fields: "${fields}", weights: "1"` : ""}) { results } }`;
}

export function createHardcoverClient() {
  let token = "";
  let tokenDigest = "";
  let authBlocked = false;
  const inFlight = new Map();

  return {
    configure(value) {
      const next = typeof value === "string" ? value.trim().replace(/^Bearer(?:\s+|$)/i, "").replace(/\s+/g, "") : "";
      if (next === "__SET__") return;
      // Saving the same token keeps an authentication block; changing/clearing it resets it.
      if (next === token) return;
      token = next;
      tokenDigest = next ? digest(next) : "";
      authBlocked = false;
    },

    isConfigured() {
      return Boolean(token);
    },

    async search(parsed, fetcher, cache) {
      if (!token) return [];
      if (authBlocked) throw failure("auth");
      if (!parsed || !["title", "author", "isbn"].includes(parsed.kind) || typeof parsed.term !== "string" || !parsed.term.trim()) return [];
      const snapshot = token;
      const key = `${CACHE_VERSION}:${tokenDigest}:${parsed.kind}:${digest(parsed.term)}`;
      if (inFlight.has(key)) return copyDocs(await inFlight.get(key));

      const pending = (async () => {
        try {
          const cached = await cache?.get?.(key);
          if (Array.isArray(cached)) return copyDocs(cached);
        } catch {
          // A cache outage must not prevent a live lookup.
        }
        if (snapshot === token && authBlocked) throw failure("auth");
        reserveRequest();
        const controller = new AbortController();
        let timer;
        try {
          const work = (async () => {
            const response = await fetcher(ENDPOINT, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${snapshot}`,
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
              },
              body: JSON.stringify({ query: queryFor(parsed) }),
              signal: controller.signal,
            });
            if (response.status === 401 || response.status === 403) {
              if (snapshot === token) authBlocked = true;
              throw failure("auth");
            }
            if (response.status === 429) {
              applyCooldown(response);
              throw failure("limit");
            }
            if (!response.ok) throw failure("unavailable");
            const payload = await response.json();
            if (payload?.errors && (!Array.isArray(payload.errors) || payload.errors.length)) throw failure("unavailable");
            let results = payload?.data?.search?.results;
            if (typeof results === "string") results = JSON.parse(results);
            if (!Array.isArray(results?.hits)) throw failure("unavailable");
            return results.hits.map((hit) => normalize(hit?.document)).filter(Boolean);
          })();
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(failure("unavailable"));
            }, TIMEOUT_MS);
          });
          const docs = await Promise.race([work, timeout]);
          clearTimeout(timer);
          try {
            await cache?.set?.(key, copyDocs(docs), docs.length ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
          } catch {
            // Public search results remain usable if the cache cannot be written.
          }
          return docs;
        } catch (error) {
          throw failure(["auth", "limit"].includes(error?.reason) ? error.reason : "unavailable");
        } finally {
          clearTimeout(timer);
        }
      })();
      inFlight.set(key, pending);
      try {
        return copyDocs(await pending);
      } finally {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      }
    },
  };
}
