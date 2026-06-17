const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const DEFAULT_USER_AGENT =
  "degoog-toolkit-places/4.6.4 (https://github.com/SoPat712/degoog-toolkit)";
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;

function normalizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_ENDPOINT;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_ENDPOINT;
    return url.toString();
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

function pickFeature(features, query) {
  if (!Array.isArray(features)) return null;
  const queryTokens = String(query || "").toLowerCase().split(/\W+/).filter((x) => x.length > 2);
  let best = null;
  let bestScore = -1;

  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    const geocoding = feature?.properties?.geocoding || {};
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = String(geocoding.label || geocoding.name || "").trim();
    const lower = label.toLowerCase();
    const matched = queryTokens.filter((token) => lower.includes(token)).length;
    const score = queryTokens.length ? matched / queryTokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = { lat, lon, label: label || query, type: geocoding.type || null };
    }
  }
  return bestScore >= 0.5 ? best : null;
}

export function createNominatimGeocoder(options = {}) {
  const doFetch = options.fetch;
  const cache = options.cache || null;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || (() => Date.now());
  const endpoint = normalizeEndpoint(options.endpoint);
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  async function geocodeUnqueued(query, requestOptions = {}) {
    const normalized = String(query || "").trim().replace(/\s+/g, " ");
    if (!normalized || typeof doFetch !== "function") return null;
    const key = `geo:nominatim:v1:${endpoint}:${normalized.toLowerCase()}`;
    const cached = cache ? await cache.get(key) : null;
    if (cached != null) {
      return cached.empty ? null : { ...cached, cached: true };
    }

    const waitMs = Math.max(0, 1000 - (now() - lastRequestAt));
    if (waitMs) await sleep(waitMs);
    lastRequestAt = now();

    const url = new URL(endpoint);
    url.searchParams.set("q", normalized);
    url.searchParams.set("format", "geocodejson");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    if (Number.isFinite(requestOptions.lat) && Number.isFinite(requestOptions.lon)) {
      const span = Number.isFinite(requestOptions.viewboxSpan)
        ? requestOptions.viewboxSpan
        : 2;
      url.searchParams.set(
        "viewbox",
        [
          requestOptions.lon - span,
          requestOptions.lat + span,
          requestOptions.lon + span,
          requestOptions.lat - span,
        ].join(","),
      );
    }

    try {
      const response = await doFetch(
        url.toString(),
        {
          headers: {
            "User-Agent": userAgent,
            "Accept-Language": requestOptions.language || "en",
          },
        },
        8000,
      );
      if (!response.ok) return null;
      const data = await response.json();
      const picked = pickFeature(data?.features, normalized);
      if (!picked) {
        if (cache) await cache.set(key, { empty: true }, NEGATIVE_TTL_MS);
        return null;
      }
      const result = { ...picked, source: "nominatim" };
      if (cache) await cache.set(key, result, POSITIVE_TTL_MS);
      return result;
    } catch {
      return null;
    }
  }

  return {
    endpoint,
    geocode(query, requestOptions = {}) {
      const task = queue.then(() => geocodeUnqueued(query, requestOptions));
      queue = task.catch(() => null);
      return task;
    },
  };
}

export const NOMINATIM_DEFAULT_ENDPOINT = DEFAULT_ENDPOINT;
export const NOMINATIM_POSITIVE_TTL_MS = POSITIVE_TTL_MS;
export const NOMINATIM_NEGATIVE_TTL_MS = NEGATIVE_TTL_MS;
