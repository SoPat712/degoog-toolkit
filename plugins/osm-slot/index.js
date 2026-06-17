// Places slot plugin — local place recognition powered by the HERE Search API
// (hybrid of /browse with verified category codes and /discover free-text).

import { analyzePlaceIntent } from "./intent-engine.mjs";
import {
  createNominatimGeocoder,
  NOMINATIM_DEFAULT_ENDPOINT,
} from "./nominatim-geocoder.mjs";
function t(key, context) {
  return `{{ t:plugin-osm-slot.${key} }}`;
}

const PLUGIN_NAME = "Places";
const PLUGIN_VERSION = "4.7.5";
const PLUGIN_DESCRIPTION =
  "Local place recognition — shows nearby businesses and POIs with address, hours, phone, directions, and interactive map.";

let _settings = {};
let _fetch = (...args) => fetch(...args);
let _cache = null;
let _osmProviderIconSvg = "";

function createExtensionCache(ctx, namespace, ttlMs) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(namespace, ttlMs);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(ttlMs)
    : null;
}

async function cacheGet(cache, key) {
  return cache ? await cache.get(key) : null;
}

async function cacheSet(cache, key, value, ttlMs) {
  if (cache) await cache.set(key, value, ttlMs);
}
let _nominatimGeocoder = null;

const HERE_BROWSE = "https://browse.search.hereapi.com/v1/browse";
const HERE_DISCOVER = "https://discover.search.hereapi.com/v1/discover";
const HERE_GEOCODE = "https://geocode.search.hereapi.com/v1/geocode";

/** Result ordering: closer places win, but name similarity can reorder (e.g. YMCA vs park). */
const PLACE_RANK_DISTANCE_WEIGHT = 0.6;
const PLACE_RANK_NAME_WEIGHT = 0.4;

// HERE /geocode `types` filter (v7) — NOT the same strings as item.resultType in responses.
const HERE_GEO_TYPES_CITY = "city,area,postalCode";
const HERE_GEO_TYPES_PLACE = "place,address,street,houseNumber";

/** POI/landmark-style "near …" hints — generic suffix words, not named landmarks. */
const GEO_POI_HINT_RE =
  /\b(center|centre|plaza|square|tower|building|campus|terminal|station|airport|field|garden|market|mall|arena|stadium|museum|library|hospital|university|college|palace|bridge|park|zoo|aquarium|memorial|monument)\b/i;

// Prefer broader area hits when picking among geocode response items.
const HERE_GEO_RESULT_PRIORITY = [
  "locality",
  "administrativeArea",
  "city",
  "place",
  "postalCodePoint",
  "district",
  "street",
  "houseNumber",
];

// Verified HERE category-id map (keyword -> id). Anything not matched here
// falls through to /discover free-text search.
const HERE_CATEGORY_MAP = [
  { re: /\b(doctors?|physicians?|clinics?)\b/i, codes: "800-8000-0155,800-8000-0158" },
  { re: /\b(dentists?|dental)\b/i, codes: "800-8000-0154" },
  { re: /\b(hospitals?)\b/i, codes: "800-8000-0159" },
  { re: /\b(pharmac(?:y|ies)|drug ?stores?)\b/i, codes: "600-6400-0000" },
  { re: /\b(vets?|veterinar(?:y|ian|ians))\b/i, codes: "800-8000-0162" },
  { re: /\b(restaurants?|diners?)\b/i, codes: "100-1000-0000" },
  { re: /\b(coffee|cafe?s?|caf\u00e9s?)\b/i, codes: "100-1100-0010" },
  { re: /\b(bars?|pubs?)\b/i, codes: "200-2000-0011" },
  { re: /\b(baker(?:y|ies))\b/i, codes: "600-6300-0244" },
  { re: /\b(breweries|brewery)\b/i, codes: "300-3000-0350" },
  { re: /\b(gas ?stations?|fuel|petrol)\b/i, codes: "700-7600-0000" },
  { re: /\b(banks?)\b/i, codes: "700-7000-0107" },
  { re: /\b(hotels?|motels?)\b/i, codes: "500-5000-0053" },
  { re: /\b(gyms?|fitness)\b/i, codes: "800-8600-0191" },
  { re: /\b(librar(?:y|ies))\b/i, codes: "800-8300-0175" },
];

function _matchCategory(query) {
  for (const entry of HERE_CATEGORY_MAP) {
    if (entry.re.test(query)) return entry.codes;
  }
  return null;
}

function _configure(s) {
  _settings = {
    hereApiKey: s?.hereApiKey || "",
    defaultLat: s?.defaultLat || "",
    defaultLon: s?.defaultLon || "",
    defaultLocationLabel: s?.defaultLocationLabel || "Home",
    useBrowserGeolocation: s?.useBrowserGeolocation === true || s?.useBrowserGeolocation === "true",
    defaultRadius: s?.defaultRadius || "10",
    resultsCount: s?.resultsCount || "5",
    distanceUnit: s?.distanceUnit || "miles",
    customTileUrl: s?.customTileUrl || "",
    useOsmGeocoder: s?.useOsmGeocoder !== false && s?.useOsmGeocoder !== "false",
    nominatimEndpoint: s?.nominatimEndpoint || NOMINATIM_DEFAULT_ENDPOINT,
    debugMode: s?.debugMode === true || s?.debugMode === "true",
  };
  _resetNominatimGeocoder();
}

function _debugLog(...args) {
  if (_settings.debugMode) console.log(...args);
}

function _debugWarn(...args) {
  if (_settings.debugMode) console.warn(...args);
}

function _resetNominatimGeocoder() {
  _nominatimGeocoder = createNominatimGeocoder({
    fetch: _makeWrapFetch(_fetch, " (nominatim)"),
    cache: _cache,
    endpoint: _settings.nominatimEndpoint,
  });
}

export const slot = {
  id: "osm-slot",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: true,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],

  settingsSchema: [
    {
      key: "hereApiKey",
      label: "HERE API key",
      type: "password",
      required: true,
      secret: true,
      description:
        "Required. Powers place search (/discover, /browse) and city geocoding for queries like 'near Example City' (/geocode). Free tier includes generous monthly Geocoding & Search requests — get a key at developer.here.com.",
    },
    {
      key: "defaultLat",
      label: "Default latitude",
      type: "text",
      required: true,
      placeholder: "40.7128",
      description: "Latitude of your default search center.",
    },
    {
      key: "defaultLon",
      label: "Default longitude",
      type: "text",
      required: true,
      placeholder: "-74.0060",
      description: "Longitude of your default search center.",
    },
    {
      key: "defaultLocationLabel",
      label: "Default location label",
      type: "text",
      default: "Home",
      description: "Label shown in the card header, e.g. 'Home/Work/Example City'.",
    },
    {
      key: "useBrowserGeolocation",
      label: "Ask browser for precise location",
      type: "toggle",
      default: false,
      description:
        "Show a button that lets the browser request your live location for more accurate nearby results.",
    },
    {
      key: "defaultRadius",
      label: "Search radius",
      type: "select",
      options: ["2", "5", "10", "15", "25", "50"],
      default: "10",
      description: "Maximum distance for nearby results. Defaults to 10 miles.",
    },
    {
      key: "resultsCount",
      label: "Results count",
      type: "select",
      options: ["3", "5", "10", "15", "20", "25", "30"],
      default: "5",
      description: "How many place cards to show.",
    },
    {
      key: "distanceUnit",
      label: "Distance unit",
      type: "select",
      options: ["miles", "km"],
      default: "miles",
    },
    {
      key: "customTileUrl",
      label: "Custom map tile URL",
      type: "text",
      placeholder: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      description:
        "Optional raster tile template for the map. Supports {z}, {x}, and {y}. Leave blank to use the default CartoDB Voyager map tiles.",
    },
    {
      key: "useOsmGeocoder",
      label: "Use OpenStreetMap geocoding",
      type: "toggle",
      default: true,
      description:
        "Use Nominatim to validate NLP-derived locations and as a fallback when HERE cannot geocode a place hint.",
    },
    {
      key: "nominatimEndpoint",
      label: "Nominatim endpoint",
      type: "url",
      default: NOMINATIM_DEFAULT_ENDPOINT,
      placeholder: NOMINATIM_DEFAULT_ENDPOINT,
      description:
        "Nominatim-compatible search endpoint. The public service is rate-limited to one request per second; self-hosted endpoints are supported.",
    },
    {
      key: "debugMode",
      label: "Debug mode",
      type: "toggle",
      default: false,
      description: "Log request timing and place-matching diagnostics.",
    },
  ],

  init(ctx) {
    if (typeof ctx?.fetch === "function") {
      _fetch = (...args) => ctx.fetch(...args);
    }
    _cache = createExtensionCache(
      ctx,
      "ext:osm-slot:places",
      30 * 60 * 1000,
    );
    _resetNominatimGeocoder();
    if (typeof ctx?.readFile === "function") {
      ctx
        .readFile("icons/osm-provider.svg")
        .then((svg) => {
          _osmProviderIconSvg = _normalizeMapExtIconSvg(svg, "0 0 24 24");
        })
        .catch(() => {});
    }
  },

  configure: _configure,

  isConfigured() {
    const lat = parseFloat(_settings.defaultLat);
    const lon = parseFloat(_settings.defaultLon);
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      !!_settings.hereApiKey
    );
  },

  trigger(query) {
    return _classifyPlaceQuery(query) !== null;
  },

  async execute(query, context) {
    // Defense-in-depth. Never trust trigger alone.
    if (_shouldYieldToFinanceResult(query, context?.results)) {
      return { html: "" };
    }

    const plan = _classifyPlaceQuery(query);
    if (!plan) {
      return { html: "" };
    }

    try {
      const isGlobal = plan.mode === "global";
      if (!_settings.hereApiKey) {
        return { html: "" };
      }

      const radiusMiles = _effectiveSearchRadiusMiles(plan);
      const radiusMeters = radiusMiles * 1609.34;
      const limit = parseInt(_settings.resultsCount || "5", 10);
      const doFetch = typeof context?.fetch === "function" ? context.fetch : _fetch;

      const wrapFetch = _makeWrapFetch(doFetch, "");

      const apiStatus = {
        here: { configured: !!_settings.hereApiKey, status: "unused", error: null, count: 0 },
        geocode: { configured: !!_settings.hereApiKey, status: "unused", error: null, source: null, label: null },
        osm: { configured: _settings.useOsmGeocoder, status: "unused", error: null, source: null, label: null },
      };

      const resolved = await _resolveSearchLocation(plan, wrapFetch, apiStatus);
      if (!resolved) {
        return { html: "" };
      }
      const { lat, lon, locationLabel } = resolved;
      const q = plan.text;

      _attachPlacesDebug(apiStatus, plan, query, q, { lat, lon, label: locationLabel }, radiusMiles);

      _debugLog(`[Places Server v${PLUGIN_VERSION}] Query: "${q}" (${plan.mode}/${plan.confidence}) at lat=${lat}, lon=${lon}${plan.placeHint ? ` [near ${plan.placeHint}]` : ""} radius=${radiusMiles}mi`);

      let places = await _searchHere(q, lat, lon, radiusMeters, limit * 2, wrapFetch, apiStatus, { global: isGlobal });

      let activeGlobal = isGlobal;
      if (places.length === 0 && !isGlobal && plan.confidence === "name") {
        _debugLog(`[Places Server v${PLUGIN_VERSION}] No local results found for name query. Trying global fallback search...`);
        places = await _searchHere(q, lat, lon, radiusMeters, limit * 2, wrapFetch, apiStatus, { global: true });
        if (places.length > 0) {
          plan.mode = "global";
          activeGlobal = true;
        }
      }

      if (places.length === 0) {
        _debugLog(`[Places Server v${PLUGIN_VERSION}] No places found from HERE.`);
        if (_settings.debugMode) {
          return { html: _renderDebugEmptyCard(query, locationLabel, apiStatus, context) };
        }
        return { html: "" };
      }

      let top = _processHerePlaces(places, radiusMeters, limit, {
        noRadiusFilter: activeGlobal,
        query: q,
      });

      if (plan.wantsOpenNow) {
        top = _filterOpenNow(top);
      }

      // Optimistic name/brand and landmark queries only render when HERE returns
      // a confident name/brand match. This keeps false positives on
      // informational/tech queries near zero.
      if (plan.confidence === "name") {
        top = top.filter((p) =>
          _isConfidentNameMatchForPlan(plan, q, p, radiusMeters)
        );
      }

      if (top.length === 0) {
        if (_settings.debugMode) {
          return { html: _renderDebugEmptyCard(query, locationLabel, apiStatus, context) };
        }
        return { html: "" };
      }

      _debugLog(`[Places Server v${PLUGIN_VERSION}] Final ${top.length} processed places:`);
      top.forEach((p, idx) => {
        _debugLog(`  [${idx}] ${p.name} (${(p.distanceMeters / 1609.34).toFixed(1)} mi) - Phone: ${p.phone || "None"} - Website: ${p.website || "None"} - Source: ${p.source} - Hours: ${p.hours ? JSON.stringify(p.hours) : "None"}`);
      });

      const html = _renderCard(
        top,
        q,
        locationLabel,
        _settings.useBrowserGeolocation,
        apiStatus,
        context
      );
      return { html };
    } catch (err) {
      console.error("[places] lookup failed:", err);
      return { html: "" };
    }
  },
};

export default slot;

function _shouldYieldToFinanceResult(query, results) {
  if (!Array.isArray(results)) return false;

  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/[?!.,;:]+$/g, "");
  if (!/^[a-z][a-z0-9.-]{0,11}$/.test(normalizedQuery)) return false;

  return results.slice(0, 3).some((result) => {
    try {
      const url = new URL(String(result?.url || ""));
      if (url.hostname.toLowerCase().replace(/^www\./, "") !== "finance.yahoo.com") {
        return false;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const quoteIndex = parts.findIndex(
        (part) => part.toLowerCase() === "quote",
      );
      if (quoteIndex === -1) return false;
      const symbol = decodeURIComponent(parts[quoteIndex + 1] || "")
        .toLowerCase();
      return symbol === normalizedQuery;
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export const routes = [
  {
    method: "post",
    path: "refresh",
    handler: async (request) => {
      try {
        if (!_settings.hereApiKey) {
          return _jsonResponse({ error: "Plugin not configured" }, 503);
        }

        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          if (request.body && typeof request.body === "object") body = request.body;
        }
        const query = body.query || "";
        const wrapFetch = _makeWrapFetch(_fetch, " (refresh)");

        const plan = _classifyPlaceQuery(query);
        const searchText = plan ? plan.text : query;
        const isGlobal = plan ? plan.mode === "global" : false;

        const radiusMiles = _effectiveSearchRadiusMiles(plan);
        const radiusMeters = radiusMiles * 1609.34;
        const limit = parseInt(_settings.resultsCount || "5", 10);

        // Coordinate resolution, in priority order:
        //   1. Precise browser coords from "Use my location".
        //   2. Explicit "near Example City" geocoded via HERE Geocoding API.
        //   3. Server-side IP geolocation.
        //   4. Configured default location.
        let latNum = parseFloat(body.lat);
        let lonNum = parseFloat(body.lon);
        let locationLabel = "your location";
        let geoStatus = null;
        let osmStatus = null;
        const hasBrowserCoords = Number.isFinite(latNum) && Number.isFinite(lonNum);

        if (hasBrowserCoords) {
          locationLabel = "your location";
        } else if (plan?.placeHint) {
          geoStatus = {
            configured: !!_settings.hereApiKey,
            status: "unused",
            error: null,
            source: null,
            label: null,
          };
          osmStatus = {
            configured: _settings.useOsmGeocoder,
            status: "unused",
            error: null,
            source: null,
            label: null,
          };
          const geo = await _geocodePlaceHint(plan.placeHint, wrapFetch, geoStatus, {
            osmStatus,
            preferNominatim: plan.validationRequired === true,
          });
          if (geo) {
            latNum = geo.lat;
            lonNum = geo.lon;
            locationLabel = geo.label || plan.placeHint;
            _debugLog(
              `[Places Server] Refresh geocoded "${plan.placeHint}" via ${geo.source}: ${latNum},${lonNum}`,
            );
          } else {
            _debugWarn(`[Places Server] Refresh could not geocode "${plan.placeHint}"`);
            return _jsonResponse({ html: "" });
          }
        }

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
          const clientIp = _clientIpFromRequest(request);
          const ipGeo = await _ipGeolocate(wrapFetch, clientIp);
          if (ipGeo) {
            latNum = ipGeo.lat;
            lonNum = ipGeo.lon;
            locationLabel = "your area";
            _debugLog(`[Places Server] Refresh resolved via IP geo (${ipGeo.source}): ${latNum},${lonNum}`);
          } else {
            const dLat = parseFloat(_settings.defaultLat);
            const dLon = parseFloat(_settings.defaultLon);
            if (Number.isFinite(dLat) && Number.isFinite(dLon)) {
              latNum = dLat;
              lonNum = dLon;
              locationLabel = _settings.defaultLocationLabel || "Home";
              _debugLog(`[Places Server] Refresh fell back to configured location: ${latNum},${lonNum}`);
            } else {
              return _jsonResponse({ error: "Could not determine location" }, 422);
            }
          }
        }

        _debugLog(`[Places Server] Refresh Query: "${searchText}" (${plan ? plan.mode : "raw"}) at lat=${latNum}, lon=${lonNum} radius=${radiusMiles}mi`);

        const apiStatus = {
          here: { configured: !!_settings.hereApiKey, status: "unused", error: null, count: 0 },
          geocode: { configured: !!_settings.hereApiKey, status: "unused", error: null, source: null, label: null },
          osm: { configured: _settings.useOsmGeocoder, status: "unused", error: null, source: null, label: null },
        };

        if (plan?.placeHint && geoStatus?.status === "success") {
          Object.assign(apiStatus.geocode, geoStatus);
        }
        if (plan?.placeHint && osmStatus?.status !== "unused") {
          Object.assign(apiStatus.osm, osmStatus);
        }

        _attachPlacesDebug(
          apiStatus,
          plan,
          query,
          searchText,
          { lat: latNum, lon: lonNum, label: locationLabel },
          radiusMiles,
        );

        const places = await _searchHere(searchText, latNum, lonNum, radiusMeters, limit * 2, wrapFetch, apiStatus, { global: isGlobal });

        if (places.length === 0) {
          _debugLog(`[Places Server] No places found for refresh query.`);
          return _jsonResponse({ html: "" });
        }

        let top = _processHerePlaces(places, radiusMeters, limit, {
          noRadiusFilter: isGlobal,
          query: searchText,
        });

        if (plan?.wantsOpenNow) {
          top = _filterOpenNow(top);
        }

        if (isGlobal) {
          top = top.filter((p) => _isConfidentNameMatch(searchText, p));
        } else if (plan?.confidence === "name") {
          top = top.filter((p) =>
            _isConfidentNameMatchForPlan(plan, searchText, p, radiusMeters)
          );
        }

        if (top.length === 0) {
          return _jsonResponse({ html: "" });
        }

        _debugLog(`[Places Server] Final ${top.length} processed places (refresh):`);
        top.forEach((p, idx) => {
          _debugLog(`  [${idx}] ${p.name} (${(p.distanceMeters / 1609.34).toFixed(1)} mi) - Phone: ${p.phone || "None"} - Website: ${p.website || "None"} - Source: ${p.source} - Hours: ${p.hours ? JSON.stringify(p.hours) : "None"}`);
        });

        const html = _renderCard(top, searchText, locationLabel, false, apiStatus, null);
        return _jsonResponse({ html });
      } catch (err) {
        console.error("[places] refresh failed:", err);
        return _jsonResponse({ html: "" });
      }
    },
  },
];

function _jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function _makeWrapFetch(doFetch, tag) {
  return async (url, init = {}, timeoutMs = 15000) => {
    const controller = init.signal ? null : new AbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    const mergedInit = { ...init };
    if (controller) mergedInit.signal = controller.signal;
    const startFetch = _settings.debugMode ? Date.now() : 0;
    const safeUrl = _settings.debugMode ? _redactRequestUrl(url) : "";
    _debugLog(`[Places Performance v${PLUGIN_VERSION}] Fetch starting${tag}: ${safeUrl} (Timeout: ${timeoutMs}ms)`);
    try {
      const response = await doFetch(url, mergedInit);
      _debugLog(`[Places Performance v${PLUGIN_VERSION}] Fetch completed${tag}: ${safeUrl} in ${Date.now() - startFetch}ms (Status: ${response.status})`);
      return response;
    } catch (err) {
      if (err?.name === "AbortError") {
        _debugWarn(`[Places Performance v${PLUGIN_VERSION}] Fetch timed out${tag}: ${safeUrl} (gave up after ${timeoutMs / 1000} seconds)`);
      } else {
        _debugWarn(`[Places Performance v${PLUGIN_VERSION}] Fetch failed${tag}: ${safeUrl} in ${Date.now() - startFetch}ms:`, err);
      }
      throw err;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Server-side IP geolocation (refresh fallback)                       */
/* ------------------------------------------------------------------ */

function _isPublicIp(ip) {
  if (!ip) return false;
  const s = ip.trim();
  if (s === "::1" || s === "127.0.0.1") return false;
  if (/^(10|127)\./.test(s)) return false;
  if (/^192\.168\./.test(s)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return false;
  if (/^(::ffff:)?(10|127|192\.168|169\.254)\./i.test(s)) return false;
  if (/^(fe80|fc|fd)/i.test(s)) return false; // link-local / unique-local IPv6
  return true;
}

// Best public client IP from proxy headers, or "" to geolocate the server egress.
function _clientIpFromRequest(request) {
  try {
    const xff = request.headers.get("x-forwarded-for") || "";
    const candidates = xff.split(",").map((s) => s.trim()).filter(Boolean);
    candidates.push(request.headers.get("x-real-ip") || "");
    for (const ip of candidates) {
      if (_isPublicIp(ip)) return ip;
    }
  } catch (_) {
    /* headers unavailable */
  }
  return "";
}

// Resolve approximate { lat, lon, source } from an IP via free, no-key, CORS-free
// services (called server-side). Tries several providers; returns null if all fail.
async function _ipGeolocate(doFetch, clientIp) {
  const ipPath = clientIp ? `/${encodeURIComponent(clientIp)}` : "";
  const providers = [
    {
      url: `https://free.freeipapi.com/api/json${ipPath}`,
      pick: (d) => ({ lat: Number(d.latitude), lon: Number(d.longitude) }),
    },
    {
      url: `https://ipwho.is${ipPath || "/"}`,
      pick: (d) => (d && d.success !== false ? { lat: Number(d.latitude), lon: Number(d.longitude) } : null),
    },
    {
      url: `http://ip-api.com/json${ipPath}`,
      pick: (d) => (d && d.status === "success" ? { lat: Number(d.lat), lon: Number(d.lon) } : null),
    },
  ];

  for (const provider of providers) {
    try {
      const res = await doFetch(provider.url, {}, 5000);
      if (!res.ok) continue;
      const data = await res.json();
      const r = provider.pick(data);
      if (r && Number.isFinite(r.lat) && Number.isFinite(r.lon) && !(r.lat === 0 && r.lon === 0)) {
        return { lat: r.lat, lon: r.lon, source: provider.url };
      }
    } catch (_) {
      /* try the next provider */
    }
  }
  return null;
}

function _hereGeocodeLabel(item, fallback) {
  const addr = item?.address || {};
  if (typeof addr.label === "string" && addr.label.trim()) return addr.label.trim();
  if (typeof item?.title === "string" && item.title.trim()) return item.title.trim();
  const parts = [addr.city, addr.state, addr.county, addr.countryName]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const seen = new Set();
  const deduped = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }
  return deduped.join(", ") || fallback;
}

/** Max search radius when "near …" hints a POI/landmark (not a city/town). */
const POI_HINT_RADIUS_MILES = 5;

function _effectiveSearchRadiusMiles(plan) {
  const configured = parseInt(_settings.defaultRadius || "10", 10);
  if (plan?.placeHint && _looksLikePoiGeocodeHint(plan.placeHint)) {
    return Math.min(configured, POI_HINT_RADIUS_MILES);
  }
  return configured;
}

function _redactRequestUrl(url) {
  return String(url || "").replace(
    /([?&](?:apiKey|key|access_token|token)=)[^&]+/gi,
    "$1…",
  );
}

function _attachPlacesDebug(apiStatus, plan, rawQuery, searchText, center, radiusMiles) {
  if (!apiStatus || !_settings.debugMode) return;
  apiStatus.debug = {
    originalQuery: rawQuery,
    searchText,
    placeHint: plan?.placeHint || null,
    planMode: plan?.mode || null,
    planConfidence: plan?.confidence || null,
    planKind: plan?.kind || null,
    planEvidence: plan?.evidence || [],
    searchRadiusMiles: radiusMiles,
  };
  apiStatus.searchCenter = {
    lat: center.lat,
    lon: center.lon,
    label: center.label,
  };
}

function _looksLikePoiGeocodeHint(hint) {
  return GEO_POI_HINT_RE.test(String(hint || "").trim());
}

/** Generic POI-type word groups (not landmark names) for geocode title matching. */
const GEO_NAME_TYPE_GROUPS = [
  ["center", "centre", "plaza", "plz", "square", "sq"],
  ["station", "terminal"],
  ["building", "tower"],
  ["park", "garden", "field"],
];

function _geocodeTokensMatch(a, b) {
  if (a === b) return true;
  for (const group of GEO_NAME_TYPE_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

function _titlePrimarySegment(title) {
  const text = String(title || "").trim();
  const idx = text.indexOf(",");
  return idx === -1 ? text : text.slice(0, idx).trim();
}

function _geocodeHintMatchScore(hint, title) {
  const q = _normalizeMatchText(hint);
  const full = _normalizeMatchText(title);
  const primary = _normalizeMatchText(_titlePrimarySegment(title));
  if (!q || !full) return 0;
  if (full.includes(q) || primary.includes(q)) {
    return Math.min(q.length, primary.length || full.length) >= 3 ? 0.95 : 0;
  }

  const qTokens = q.split(" ").filter(Boolean);
  if (qTokens.length === 0) return 0;

  const primaryWords = primary.split(" ").filter(Boolean);
  const wordMatchesToken = (word, token) => {
    if (_geocodeTokensMatch(word, token)) return true;
    if (token.length >= 5 && word.length >= 5) {
      return word.startsWith(token.slice(0, 5)) || token.startsWith(word.slice(0, 5));
    }
    return false;
  };

  if (qTokens.length > 1) {
    const firstAnchored = primaryWords.some((word) => wordMatchesToken(word, qTokens[0]));
    if (!firstAnchored) {
      return _nameMatchScore(hint, _titlePrimarySegment(title)) * 0.35;
    }
  }

  let matched = 0;
  for (const token of qTokens) {
    if (primaryWords.some((word) => wordMatchesToken(word, token))) {
      matched += 1;
    }
  }
  const primaryScore = matched / qTokens.length;
  const fullScore = _nameMatchScore(hint, title);
  return Math.max(primaryScore, primaryScore * 0.75 + fullScore * 0.25);
}

function _pickHereGeocodeItem(items, hint) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const poiHint = _looksLikePoiGeocodeHint(hint);
  let best = null;
  let bestScore = -1;

  for (const item of items) {
    if (!item?.position) continue;
    const label = _hereGeocodeLabel(item, hint);
    const title = item.title || label;
    let score = poiHint
      ? Math.max(_geocodeHintMatchScore(hint, title), _geocodeHintMatchScore(hint, label))
      : Math.max(_nameMatchScore(hint, label), _nameMatchScore(hint, title));
    if (poiHint) {
      if (item.resultType === "place") score += 0.15;
      if (item.resultType === "locality" || item.resultType === "administrativeArea") {
        score -= 0.45;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  const minScore = poiHint ? 0.55 : 0.45;
  if (best && bestScore >= minScore) return best;
  if (poiHint) return null;

  for (const type of HERE_GEO_RESULT_PRIORITY) {
    const hit = items.find((item) => item?.resultType === type && item?.position);
    if (hit) return hit;
  }
  return items.find((item) => item?.position) || null;
}

async function _fetchHereGeocodeItems(hint, doFetch, types, options = {}) {
  const apiKey = _settings.hereApiKey;
  if (!apiKey) return null;

  const useBias = options.useBias !== false;
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 5, 1), 20);
  const biasLat = parseFloat(_settings.defaultLat);
  const biasLon = parseFloat(_settings.defaultLon);
  let url =
    `${HERE_GEOCODE}?q=${encodeURIComponent(hint)}` +
    `&limit=${limit}` +
    `&lang=en-US` +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  if (types) {
    url += `&types=${encodeURIComponent(types)}`;
  }
  if (useBias && Number.isFinite(biasLat) && Number.isFinite(biasLon)) {
    url += `&at=${encodeURIComponent(`${biasLat},${biasLon}`)}`;
  }

  const res = await doFetch(url, {}, 8000);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`HTTP status ${res.status}${errText ? `: ${errText}` : ""}`);
    err.status = res.status;
    err.body = errText;
    throw err;
  }

  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function _geocodeHere(hint, doFetch, apiStatus) {
  const apiKey = _settings.hereApiKey;
  if (!apiKey) {
    if (apiStatus) {
      apiStatus.status = "error";
      apiStatus.error = "Missing HERE API key";
    }
    return null;
  }

  const cacheKey = `geo:here:v5:${hint.toLowerCase()}`;
  const cached = await cacheGet(_cache, cacheKey);
  if (cached) {
    if (apiStatus) {
      apiStatus.status = "success";
      apiStatus.source = cached.source;
      apiStatus.label = cached.label;
      apiStatus.lat = cached.lat;
      apiStatus.lon = cached.lon;
      apiStatus.cached = true;
    }
    return cached;
  }

  const poiHint = _looksLikePoiGeocodeHint(hint);
  const attempts = poiHint
    ? [{ types: null, mode: "poi/open", useBias: true, limit: 10 }]
    : [
        { types: HERE_GEO_TYPES_CITY, mode: "city/area", useBias: true, limit: 5 },
        { types: HERE_GEO_TYPES_PLACE, mode: "place/address", useBias: true, limit: 5 },
        { types: null, mode: "open", useBias: true, limit: 5 },
      ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      _debugLog(
        `[Places Server v${PLUGIN_VERSION}] HERE geocode (${attempt.mode}) for "${hint}"`,
      );
      const items = await _fetchHereGeocodeItems(hint, doFetch, attempt.types, {
        useBias: attempt.useBias,
        limit: attempt.limit,
      });
      const item = _pickHereGeocodeItem(items, hint);
      if (!item?.position) continue;

      const lat = parseFloat(item.position.lat);
      const lon = parseFloat(item.position.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const out = {
        lat,
        lon,
        label: _hereGeocodeLabel(item, hint),
        source: "here-geocode",
      };
      await cacheSet(_cache, cacheKey, out);
      if (apiStatus) {
        apiStatus.status = "success";
        apiStatus.source = out.source;
        apiStatus.label = out.label;
        apiStatus.lat = lat;
        apiStatus.lon = lon;
        apiStatus.mode = attempt.mode;
        apiStatus.query = hint;
      }
      return out;
    } catch (err) {
      lastError = err;
      if (err.status === 400 && attempt.types) continue;
      _debugWarn(`[Places] HERE geocode (${attempt.mode}) failed for "${hint}":`, err);
    }
  }

  if (apiStatus) {
    apiStatus.status = "error";
    apiStatus.error = lastError?.message || "No geocode results";
  }
  return null;
}

function _pickHereDiscoverItem(items, hint) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const poiHint = _looksLikePoiGeocodeHint(hint);
  let best = null;
  let bestScore = -1;

  for (const item of items) {
    if (!item?.position) continue;
    const title = item.title || item.address?.label || "";
    const score = poiHint
      ? Math.max(_geocodeHintMatchScore(hint, title), _nameMatchScore(hint, title))
      : _nameMatchScore(hint, title);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  const minScore = poiHint ? 0.55 : 0.45;
  return best && bestScore >= minScore ? best : null;
}

/** Last-resort place-hint resolution — one Discover call when /geocode cannot pick a match. */
async function _discoverPlaceHintFallback(hint, doFetch, apiStatus) {
  const apiKey = _settings.hereApiKey;
  if (!apiKey) return null;

  const biasLat = parseFloat(_settings.defaultLat);
  const biasLon = parseFloat(_settings.defaultLon);
  if (!Number.isFinite(biasLat) || !Number.isFinite(biasLon)) return null;

  const url =
    `${HERE_DISCOVER}?q=${encodeURIComponent(hint)}` +
    `&at=${encodeURIComponent(`${biasLat},${biasLon}`)}` +
    `&limit=3` +
    `&lang=en-US` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  try {
    _debugLog(
      `[Places Server v${PLUGIN_VERSION}] HERE discover fallback for "${hint}"`,
    );
    const res = await doFetch(url, {}, 8000);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP status ${res.status}${errText ? `: ${errText}` : ""}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const item = _pickHereDiscoverItem(items, hint);
    if (!item?.position) return null;

    const lat = parseFloat(item.position.lat);
    const lon = parseFloat(item.position.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const out = {
      lat,
      lon,
      label: (item.title || item.address?.label || hint).trim(),
      source: "here-discover",
    };
    await cacheSet(_cache, `geo:here:v5:${hint.toLowerCase()}`, out);
    if (apiStatus) {
      apiStatus.status = "success";
      apiStatus.source = out.source;
      apiStatus.label = out.label;
      apiStatus.lat = lat;
      apiStatus.lon = lon;
      apiStatus.mode = "discover-fallback";
      apiStatus.query = hint;
    }
    return out;
  } catch (err) {
    _debugWarn(`[Places] HERE discover fallback failed for "${hint}":`, err);
    if (apiStatus && apiStatus.status !== "success") {
      apiStatus.status = "error";
      apiStatus.error = err.message;
    }
    return null;
  }
}

async function _geocodeNominatim(hint, apiStatus) {
  if (!_settings.useOsmGeocoder) return null;
  if (!_nominatimGeocoder) {
    _nominatimGeocoder = createNominatimGeocoder({
      fetch: _makeWrapFetch(_fetch, " (nominatim)"),
      cache: _cache,
      endpoint: _settings.nominatimEndpoint,
    });
  }

  try {
    const lat = parseFloat(_settings.defaultLat);
    const lon = parseFloat(_settings.defaultLon);
    const result = await _nominatimGeocoder.geocode(hint, {
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
      language: "en",
    });
    if (!result) {
      if (apiStatus) {
        apiStatus.status = "empty";
        apiStatus.error = "No matching OpenStreetMap location";
      }
      return null;
    }
    const out = {
      lat: result.lat,
      lon: result.lon,
      label: result.label || hint,
      source: "nominatim",
    };
    if (apiStatus) {
      apiStatus.status = "success";
      apiStatus.source = out.source;
      apiStatus.label = out.label;
      apiStatus.lat = out.lat;
      apiStatus.lon = out.lon;
      apiStatus.cached = result.cached === true;
    }
    return out;
  } catch (err) {
    if (apiStatus) {
      apiStatus.status = "error";
      apiStatus.error = err.message;
    }
    return null;
  }
}

/** Forward-geocode a location hint through HERE with a Nominatim fallback. */
async function _geocodePlaceHint(hint, doFetch, apiStatus, options = {}) {
  const trimmed = String(hint || "").trim();
  if (!trimmed) return null;
  const osmStatus = options.osmStatus || null;

  // New NLP-derived relations are deliberately validated by OSM before a HERE
  // place-search request. Explicit legacy "near …" flows still prefer HERE.
  if (options.preferNominatim && _settings.useOsmGeocoder) {
    return _geocodeNominatim(trimmed, osmStatus);
  }

  try {
    const here = await _geocodeHere(trimmed, doFetch, apiStatus);
    if (here) return here;
    const discovered = await _discoverPlaceHintFallback(trimmed, doFetch, apiStatus);
    if (discovered) return discovered;
    return _geocodeNominatim(trimmed, osmStatus);
  } catch (err) {
    _debugWarn(`[Places] HERE geocode failed for "${trimmed}":`, err);
    if (apiStatus && apiStatus.status === "unused") {
      apiStatus.status = "error";
      apiStatus.error = err.message;
    }
    const discovered = await _discoverPlaceHintFallback(trimmed, doFetch, apiStatus);
    if (discovered) return discovered;
    return _geocodeNominatim(trimmed, osmStatus);
  }
}

async function _resolveSearchLocation(plan, doFetch, apiStatus) {
  let lat = parseFloat(_settings.defaultLat);
  let lon = parseFloat(_settings.defaultLon);
  let locationLabel = _settings.defaultLocationLabel || "Home";

  if (plan?.placeHint) {
    const geoStatus = apiStatus?.geocode || null;
    const geo = await _geocodePlaceHint(plan.placeHint, doFetch, geoStatus, {
      osmStatus: apiStatus?.osm || null,
      preferNominatim: plan.validationRequired === true,
    });
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      locationLabel = geo.label || plan.placeHint;
    } else {
      _debugWarn(`[Places] Could not geocode "${plan.placeHint}" — not searching at default location`);
      return null;
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, locationLabel };
}

/* ------------------------------------------------------------------ */
/* HERE Search                                                         */
/* ------------------------------------------------------------------ */

/**
 * HERE discover often misses YMCA branches unless "Family" appears in the query
 * (e.g. "example family club" should outrank "Example Park").
 * Only expands when YMCA is paired with other name tokens — bare "ymca" stays put.
 */
function _expandHereQuery(query) {
  const q = _normalizeQuery(query);
  const lower = q.toLowerCase();
  if (!/\bymca\b/i.test(lower) || /\bfamily\b/i.test(lower)) return q;

  const tokens = q.split(/\s+/).filter(Boolean);
  const hasBranchTokens = tokens.some((t) => t.toLowerCase() !== "ymca");
  if (!hasBranchTokens) return q;

  return q.replace(/\bymca\b/i, "family ymca").replace(/\s+/g, " ").trim();
}

async function _searchHere(query, lat, lon, radiusM, limit, doFetch, apiStatus, opts = {}) {
  query = _expandHereQuery(query);
  const apiKey = _settings.hereApiKey;
  if (!apiKey) {
    if (apiStatus?.here) {
      apiStatus.here.status = "error";
      apiStatus.here.error = "Missing HERE API key";
    }
    return [];
  }

  const radius = Math.max(1, Math.round(radiusM));
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 100);
  const isGlobal = opts.global === true;
  // Category codes only matter for the local /browse path.
  const codes = isGlobal ? null : _matchCategory(query);
  const mode = isGlobal ? "discover-global" : (codes ? "browse" : "discover");

  // Quota behaviour: every novel (query, location, mode) costs at most one HERE
  // request. Results — INCLUDING empty arrays (negative results) — are cached for
  // 30 min, so repeated identical/missed queries are free and don't burn the
  // 5,000/month Discover allowance. Only transient network/4xx errors skip the cache.
  const cacheKey = `here:${mode}:${query}:${lat}:${lon}:${radius}:${cappedLimit}`;
  const cached = await cacheGet(_cache, cacheKey);
  if (cached) {
    if (apiStatus?.here) {
      apiStatus.here.status = "success";
      apiStatus.here.count = cached.length;
      apiStatus.here.cached = true;
      apiStatus.here.mode = mode;
      apiStatus.here.query = query;
      apiStatus.here.endpoint = codes ? "browse" : "discover";
      apiStatus.here.center = { lat, lon };
      apiStatus.here.radiusMeters = radius;
      apiStatus.here.radiusMiles = Math.round((radius / 1609.34) * 10) / 10;
    }
    return cached;
  }

  // foodTypes (cuisine), openingHours, contacts and chains are all returned by
  // HERE by default — no `show` param needed (show=foodTypes is rejected as 400).
  let url;
  if (isGlobal) {
    // Global landmark lookup: /discover with at-only (NO in=circle) so far-away
    // landmarks resolve, ranked by global relevance.
    url =
      `${HERE_DISCOVER}?q=${encodeURIComponent(query)}` +
      `&at=${encodeURIComponent(`${lat},${lon}`)}` +
      `&limit=${cappedLimit}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
  } else if (codes) {
    // /browse accepts at + in=circle + categories together.
    url =
      `${HERE_BROWSE}?at=${encodeURIComponent(`${lat},${lon}`)}` +
      `&in=${encodeURIComponent(`circle:${lat},${lon};r=${radius}`)}` +
      `&categories=${encodeURIComponent(codes)}` +
      `&limit=${cappedLimit}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
  } else {
    // /discover 400s if both at + in=circle are passed; use in=circle alone.
    url =
      `${HERE_DISCOVER}?q=${encodeURIComponent(query)}` +
      `&in=${encodeURIComponent(`circle:${lat},${lon};r=${radius}`)}` +
      `&limit=${cappedLimit}` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
  }

  try {
    _debugLog(
      `[Places Performance v${PLUGIN_VERSION}] HERE API request (${mode}) for "${query}"`
    );
    const res = await doFetch(url, {}, 10000);
    if (!res.ok) {
      const errText = await res.text();
      const msg = `HTTP status ${res.status}: ${errText}`;
      console.error(`[places] HERE ${mode} returned error: ${msg}`);
      if (apiStatus?.here) {
        apiStatus.here.status = "error";
        apiStatus.here.error = msg;
      }
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const out = items.map((item) => _mapHereItem(item, lat, lon)).filter(Boolean);

    if (apiStatus?.here) {
      apiStatus.here.status = "success";
      apiStatus.here.count = out.length;
      apiStatus.here.mode = mode;
      apiStatus.here.query = query;
      apiStatus.here.endpoint = codes ? "browse" : "discover";
      apiStatus.here.center = { lat, lon };
      apiStatus.here.radiusMeters = radius;
      apiStatus.here.radiusMiles = Math.round((radius / 1609.34) * 10) / 10;
      if (_settings.debugMode) {
        apiStatus.here.request = _redactRequestUrl(url);
      }
      if (codes) apiStatus.here.categories = codes;
    }

    await cacheSet(_cache, cacheKey, out);
    return out;
  } catch (err) {
    console.error("[places] HERE search failed:", err);
    if (apiStatus?.here) {
      apiStatus.here.status = "error";
      apiStatus.here.error = err.message;
    }
    return [];
  }
}

function _mapHereItem(item, lat, lon) {
  if (!item || !item.position) return null;
  const plat = item.position.lat;
  const plon = item.position.lng;
  if (plat == null || plon == null) return null;

  const contact = Array.isArray(item.contacts) ? item.contacts[0] : null;
  const phone = contact?.phone?.[0]?.value || null;
  const website = contact?.www?.[0]?.value || null;

  const categories = [];
  if (Array.isArray(item.categories)) {
    for (const c of item.categories) {
      if (c && c.primary && c.name) categories.push(c.name);
    }
  }
  const chainName = item.chains?.[0]?.name || null;
  if (chainName && !categories.includes(chainName)) categories.push(chainName);
  // Brand signals used by the optimistic name-query confidence gate.
  const ontologyId = item.chains?.[0]?.id || item.ontologyId || null;

  // Cuisine names (restaurants). show=foodTypes adds item.foodTypes[].name.
  const foodTypes = [];
  if (Array.isArray(item.foodTypes)) {
    for (const f of item.foodTypes) {
      if (f && f.name && !foodTypes.includes(f.name)) foodTypes.push(f.name);
    }
  }

  let hours = null;
  const oh = Array.isArray(item.openingHours) ? item.openingHours[0] : null;
  if (oh) {
    const text = Array.isArray(oh.text) ? oh.text.filter(Boolean) : null;
    hours = {
      openNow: typeof oh.isOpen === "boolean" ? oh.isOpen : null,
      text: text && text.length ? text : null, // FULL week array
      display: text && text.length ? text.join(", ") : null, // joined (legacy)
      status: null,
    };
  }

  const distanceMeters =
    typeof item.distance === "number" ? item.distance : _haversine(lat, lon, plat, plon);

  return {
    id: item.id || null,
    name: item.title || "",
    address: item.address?.label || "",
    lat: plat,
    lon: plon,
    distanceMeters,
    phone,
    website,
    categories,
    foodTypes,
    hours,
    rating: null,
    reviewCount: null,
    price: null,
    description: null,
    brandName: chainName,
    ontologyId,
    source: "HERE",
    sourceUrl: `https://wego.here.com/?map=${plat},${plon},16,normal`,
  };
}

/* ------------------------------------------------------------------ */
/* Processing                                                          */
/* ------------------------------------------------------------------ */

function _processHerePlaces(rawPlaces, radiusM, limit, opts = {}) {
  const maxDist = radiusM * 1.1;
  const skipRadius = opts.noRadiusFilter === true;
  const candidates = [];
  const seenIds = new Set();

  for (const p of rawPlaces) {
    if (!p) continue;
    // Drop anything well beyond the configured radius (skipped for global landmark lookups).
    if (!skipRadius && Number.isFinite(p.distanceMeters) && p.distanceMeters > maxDist) continue;

    // Dedupe by HERE id.
    if (p.id) {
      if (seenIds.has(p.id)) continue;
    }

    // Dedupe by name + proximity (same business returned twice).
    const norm = String(p.name || "").toLowerCase().trim();
    let isDuplicate = false;
    for (const e of candidates) {
      const eNorm = String(e.name || "").toLowerCase().trim();
      if (
        norm &&
        norm === eNorm &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Number.isFinite(e.lat) &&
        Number.isFinite(e.lon) &&
        _haversine(p.lat, p.lon, e.lat, e.lon) < 100
      ) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    if (p.id) seenIds.add(p.id);
    candidates.push(p);
  }

  let ranked = candidates;
  if (opts.query && ranked.length > 1) {
    ranked = _rankPlacesByQuery(ranked, opts.query, radiusM);
  }

  return ranked.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function _pickPrimaryCategoryLabel(place) {
  const food = (place.foodTypes || [])[0];
  if (food) return String(food).trim();
  for (const raw of place.categories || []) {
    const label = String(raw || "").trim();
    if (!label) continue;
    if (label.length <= 36) return label;
  }
  const first = String((place.categories || [])[0] || "").trim();
  if (!first) return null;
  return first.length > 36 ? `${first.slice(0, 33)}…` : first;
}

function _mapProviderUrls(lat, lon, name) {
  const latStr = String(lat);
  const lonStr = String(lon);
  const label = String(name || "Location").trim();
  return {
    osm:
      "https://www.openstreetmap.org/" +
      `?mlat=${encodeURIComponent(latStr)}` +
      `&mlon=${encodeURIComponent(lonStr)}` +
      `#map=15/${encodeURIComponent(latStr)}/${encodeURIComponent(lonStr)}`,
    google: "https://www.google.com/maps?q=" + encodeURIComponent(`${latStr},${lonStr}`),
    apple:
      "https://maps.apple.com/?ll=" +
      encodeURIComponent(`${latStr},${lonStr}`) +
      "&q=" +
      encodeURIComponent(label || `${latStr},${lonStr}`),
  };
}

function _normalizeMapExtIconSvg(svg, viewBox = "0 0 24 24") {
  return String(svg || "")
    .replace(/<\?xml[^?]*\?>\s*/i, "")
    .replace(/<svg\b[^>]*>/i, `<svg class="places-map-ext-icon" viewBox="${viewBox}" width="18" height="18" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">`);
}

function _mapProviderIconSvg(provider) {
  const iconAttrs =
    'class="places-map-ext-icon" width="18" height="18" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"';

  if (provider === "google") {
    return `<svg ${iconAttrs} viewBox="1 0 22 24">
      <defs>
        <clipPath id="places-gmaps-pin">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </clipPath>
      </defs>
      <g clip-path="url(#places-gmaps-pin)">
        <rect x="0" y="0" width="12" height="10" fill="#4285F4"/>
        <rect x="12" y="0" width="12" height="10" fill="#FBBC04"/>
        <rect x="0" y="10" width="12" height="14" fill="#EA4335"/>
        <rect x="12" y="10" width="12" height="14" fill="#34A853"/>
      </g>
      <circle cx="12" cy="9" r="2.35" fill="#FFFFFF"/>
    </svg>`;
  }
  if (provider === "osm") {
    if (_osmProviderIconSvg) return _osmProviderIconSvg;
    return `<svg ${iconAttrs} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="5" fill="#7EBC6F"/>
      <path fill="#CEEEAB" d="M4 6.5c1.8 1.2 3.8.8 5.5-.8 1.6-1.5 3.8-1.2 5.2.2 1.5 1.5 2.8 3.8 2.5 5.8-.3 2-2 3.5-3.8 3.2-1.5-.2-2.8-1.2-4.2-.8-1.5.5-2.8 1.8-3.5 3.2-.8 1.6-.5 3.5.3 4.8.8 1.2 2 2 3.5 1.8 1.2-.2 2.2-1 3.2-2 1.2-1.2 2-2.8 2.2-4.5.2-1.5-.2-3-1.2-4.2-.8-1-2-1.8-3.2-2-1-.2-2 .2-2.8.8-.5.4-1 .9-1.5 1.2z"/>
      <circle cx="16.75" cy="16.75" r="4.25" fill="#2D3335"/>
      <circle cx="16.75" cy="16.75" r="3" fill="#87D531"/>
      <path fill="#2D3335" d="m19.1 19.1 3.4 3.4-1.1 1.1-3.4-3.4z"/>
    </svg>`;
  }
  return `<svg ${iconAttrs} viewBox="0 0 24 24">
      <path fill="#1d1d1f" d="M17.05 13.05c-.03-2.54 2.08-3.75 2.1-3.77-1.28-1.85-3.25-2.1-3.97-2.13-1.68-.18-3.28 1-4.13 1-.85 0-2.18-.97-3.58-.94-1.84.03-3.55 1.08-4.49 2.73-1.91 3.31-.49 8.21 1.38 10.9 1.38 2.63 2.79 2.63 3.58 2.79.89-.05 1.9-.89 3.58-.89 1.48 0 2.13.89 3.58.86 1.48-.03 2.42-1.34 3.33-2.65 1.05-1.53 1.48-3 1.5-3.08-.04-.01-2.88-1.1-2.9-4.38zM15.34 5.25c.76-.93 1.29-2.21 1.15-3.5-1.11.05-2.45.74-3.25 1.65-.72.83-1.34 2.15-1.18 3.43 1.25.1 2.53-.64 3.28-1.58z"/>
    </svg>`;
}

function _renderMapExtLinks(lat, lon, name, context) {
  const urls = _mapProviderUrls(lat, lon, name);
  return `
        <div class="places-map-extlinks" data-map-extlinks>
          <a class="places-map-ext-btn places-map-ext-osm" data-map-ext="osm" href="${_esc(urls.osm)}" target="_blank" rel="noopener noreferrer" aria-label="${_esc(t("openInOsm", context))}" title="${_esc(t("openInOsm", context))}">
            ${_mapProviderIconSvg("osm")}
          </a>
          <a class="places-map-ext-btn places-map-ext-google" data-map-ext="google" href="${_esc(urls.google)}" target="_blank" rel="noopener noreferrer" aria-label="${_esc(t("openInGoogle", context))}" title="${_esc(t("openInGoogle", context))}">
            ${_mapProviderIconSvg("google")}
          </a>
          <a class="places-map-ext-btn places-map-ext-apple" data-map-ext="apple" href="${_esc(urls.apple)}" target="_blank" rel="noopener noreferrer" aria-label="${_esc(t("openInApple", context))}" title="${_esc(t("openInApple", context))}">
            ${_mapProviderIconSvg("apple")}
          </a>
        </div>`;
}

function _renderCard(places, query, locationLabel, showGeoBtn, apiStatus, context) {
  const unit = _settings.distanceUnit || "miles";
  const unitAbbr = unit === "km" ? "km" : "mi";

  const cards = places
    .map((p, index) => {
      const distVal = unit === "km" ? p.distanceMeters / 1000 : p.distanceMeters / 1609.34;
      const dist = distVal < 0.1 ? "<0.1" : distVal.toFixed(1);
      const displayAddress = _shortAddress(p.address);
      const categoryLabel = _pickPrimaryCategoryLabel(p);
      const weekText = p.hours && Array.isArray(p.hours.text) && p.hours.text.length ? p.hours.text : null;

      const metaParts = [];
      if (categoryLabel) {
        metaParts.push(`<span class="places-meta-type">${_esc(categoryLabel)}</span>`);
      }
      if (p.hours) {
        const openNow = p.hours.openNow;
        if (openNow === true) {
          metaParts.push(`<span class="places-hours places-hours-open">${_esc(t("open", context))}</span>`);
        } else if (openNow === false) {
          metaParts.push(`<span class="places-hours places-hours-closed">${_esc(t("closed", context))}</span>`);
        }
        const today = _todayHoursSummary(p.hours);
        let summary = "";
        if (today) {
          if (today.allDay) summary = t("open24h", context);
          // Time must sit outside {{ t:… }} — degoog resolves placeholders after render.
          else if (openNow === true && today.close) summary = `${t("closesAt", context)} ${today.close}`;
          else if (openNow === false && today.open) summary = `${t("opensAt", context)} ${today.open}`;
          else if (today.open && today.close) summary = `${today.open} – ${today.close}`;
          else if (today.closed) summary = t("closedToday", context);
        }
        if (summary) {
          metaParts.push(`<span class="places-today-hours">${_esc(summary)}</span>`);
        }
      }
      const metaHtml = metaParts.length
        ? `<p class="places-meta">${metaParts.join('<span class="places-meta-sep" aria-hidden="true"> · </span>')}</p>`
        : "";

      const weekHtml = weekText
        ? `<div class="places-week" data-week-hours hidden>${weekText
            .map((line) => `<div class="places-week-row">${_esc(_formatHoursLineDisplay(line))}</div>`)
            .join("")}</div>`
        : "";

      const hoursToggleHtml = weekText
        ? `<button type="button" class="places-hours-toggle" data-hours-toggle aria-expanded="false">${_esc(t("seeHours", context))}</button>`
        : "";

      return `
<div
  class="places-card${index === 0 ? " places-card-selected" : ""}"
  data-place-card
  data-place-index="${index}"
  data-lat="${_esc(String(p.lat))}"
  data-lon="${_esc(String(p.lon))}"
  data-place-name="${_esc(p.name)}"
  tabindex="0"
  role="button"
  aria-label="Show ${_esc(p.name)} on the map"
>
  <div class="places-card-main">
    <div class="places-card-copy">
      <div class="places-card-title-row">
        <h3 class="places-name">${_esc(p.name)}</h3>
        <span class="places-distance">${dist} ${unitAbbr}</span>
      </div>
      ${metaHtml}
      <p class="places-address" title="${_esc(p.address)}">${_esc(displayAddress)}</p>
      ${hoursToggleHtml}
      ${weekHtml}
    </div>
  </div>
  <div class="places-actions">
    <a class="places-action-btn places-action-call${p.phone ? "" : " places-disabled"}" ${p.phone ? `href="tel:${_esc(p.phone)}"` : ""} title="${_esc(t("call", context))}" aria-label="${_esc(t("call", context))}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    </a>
    <a class="places-action-btn places-action-website${p.website ? "" : " places-disabled"}" ${p.website ? `href="${_esc(p.website)}" target="_blank" rel="noopener noreferrer"` : ""} title="${_esc(t("website", context))}" aria-label="${_esc(t("website", context))}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    </a>
    <button class="places-action-btn places-action-directions${(p.lat && p.lon) ? "" : " places-disabled"}" ${(p.lat && p.lon) ? `data-directions-btn data-place-name="${_esc(p.name)}" data-lat="${p.lat}" data-lon="${p.lon}" data-address="${_esc(p.address)}"` : ""} type="button" title="${_esc(t("directions", context))}" aria-label="${_esc(t("directions", context))}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
      </svg>
    </button>
  </div>
</div>`;
    })
    .join("");

  const geoBtn = showGeoBtn
    ? `<button type="button" class="places-geo-btn" data-query="${_esc(query)}">${_esc(t("useMyLocation", context))}</button>`
    : "";
  const mapHtml = _renderMap(places, context);
  const osmAttribution =
    apiStatus?.osm?.status === "success"
      ? `<div class="places-osm-attribution">${_esc(t("locationResolvedByOsm", context))} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></div>`
      : "";
  const debugAttributes = _settings.debugMode
    ? ` data-places-debug="true" data-places-apis="${_esc(JSON.stringify(apiStatus || {}))}"`
    : "";

  return `
<div class="places-wrap slot-full-width" data-places-version="${PLUGIN_VERSION}"${debugAttributes}>
  <div class="places-header">
    <span class="places-label">${_esc(t("places", context))}</span>
    <span class="places-subhead">${t("nearLabel", context)} ${_esc(locationLabel)}</span>
    ${geoBtn}
  </div>
  <div class="places-layout">
    <div class="places-list-col">
      <div class="places-grid">
        ${cards}
      </div>
    </div>
    ${mapHtml}
  </div>
  ${osmAttribution}
  <div class="places-modal" data-places-modal hidden>
    <div class="places-modal-backdrop" data-modal-close></div>
    <div class="places-modal-content">
      <div class="places-modal-header">
        <span class="places-modal-title">${_esc(t("getDirections", context))}</span>
        <button class="places-modal-close-btn" data-modal-close type="button">&times;</button>
      </div>
      <div class="places-modal-body">
        <a class="places-modal-option" data-modal-option="apple" href="#" target="_blank" rel="noopener noreferrer">Apple Maps</a>
        <a class="places-modal-option" data-modal-option="google" href="#" target="_blank" rel="noopener noreferrer">Google Maps</a>
        <a class="places-modal-option" data-modal-option="osm" href="#" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </div>
    </div>
  </div>
</div>`;
}

function _renderDebugEmptyCard(query, locationLabel, apiStatus, context) {
  const debugAttributes = ` data-places-debug="true" data-places-apis="${_esc(JSON.stringify(apiStatus || {}))}"`;
  return `
<div class="places-wrap slot-full-width" data-places-version="${PLUGIN_VERSION}"${debugAttributes}>
  <div class="places-header">
    <span class="places-label">${_esc(t("places", context))} (Debug Mode)</span>
    <span class="places-subhead">${t("nearLabel", context)} ${_esc(locationLabel)}</span>
  </div>
  <div class="places-debug-empty" style="padding: 24px; text-align: center; color: var(--text-muted, #777); font-size: 14px; background: rgba(0,0,0,0.02); border-radius: 8px; margin-top: 12px; border: 1px dashed var(--border-color, #ccc);">
    <strong>Debug Info:</strong> No matching places found from HERE maps for query "${_esc(query)}".
  </div>
</div>`;
}

function _renderMap(places, context) {
  const located = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (located.length === 0) return "";

  // One point per displayed place; index matches the card order.
  const points = places
    .map((p, index) => ({ index, lat: p.lat, lon: p.lon, name: p.name }))
    .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));
  const pointsJson = JSON.stringify(points);

  const tileUrl = (_settings.customTileUrl && _isTileTemplate(_settings.customTileUrl))
    ? _settings.customTileUrl
    : "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

  // Initial center = center of the bounds covering all pins.
  const bounds = _mapBounds(located);
  const centerLat = (parseFloat(bounds.minLat) + parseFloat(bounds.maxLat)) / 2;
  const centerLon = (parseFloat(bounds.minLon) + parseFloat(bounds.maxLon)) / 2;
  const firstName = points[0]?.name || "";

  return `
    <aside
      class="places-map"
      data-map-panel
      data-place-name="${_esc(firstName)}"
      data-lat="${_esc(String(centerLat))}"
      data-lon="${_esc(String(centerLon))}"
      aria-label="Map of ${points.length} result${points.length === 1 ? "" : "s"}"
    >
      <div
        class="places-tile-map"
        data-tile-template="${_esc(tileUrl)}"
        data-lat="${_esc(String(centerLat))}"
        data-lon="${_esc(String(centerLon))}"
        data-zoom="15"
        data-fit-bounds="1"
        data-places-points="${_esc(pointsJson)}"
        role="img"
        aria-label="Map of nearby results"
      >
        ${_renderMapExtLinks(centerLat, centerLon, firstName, context)}
        <div class="places-tile-layer"></div>
        <div class="places-pin-layer"></div>
        <div class="places-zoom-controls">
          <button class="places-zoom-btn" data-zoom-in type="button" aria-label="Zoom in">+</button>
          <button class="places-zoom-btn" data-zoom-out type="button" aria-label="Zoom out">−</button>
        </div>
      </div>
    </aside>`;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function _tileToLatLon(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

/* ------------------------------------------------------------------ */
/* Opening-hours summary (best-effort, server-local weekday)           */
/* ------------------------------------------------------------------ */

const _DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function _fmtHourLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (!Number.isFinite(h)) return null;
  if (h === 24 && min === "00") return null; // midnight close — skip a label
  h = h % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return min === "00" ? `${h12} ${ampm}` : `${h12}:${min} ${ampm}`;
}

function _dayPartIncludesToday(dayPart, todayIdx) {
  const segments = String(dayPart || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (seg.includes("-")) {
      const [a, b] = seg.split("-").map((s) => s.trim());
      const ai = _DOW_ABBR.indexOf(a);
      const bi = _DOW_ABBR.indexOf(b);
      if (ai === -1 || bi === -1) continue;
      let i = ai;
      // Walk the (possibly week-wrapping) range inclusively.
      for (let guard = 0; guard < 8; guard += 1) {
        if (i === todayIdx) return true;
        if (i === bi) break;
        i = (i + 1) % 7;
      }
    } else if (_DOW_ABBR.indexOf(seg) === todayIdx) {
      return true;
    }
  }
  return false;
}

// Returns null (can't parse) or { allDay } | { closed } | { open, close }.
function _todayHoursSummary(hours) {
  if (!hours || !Array.isArray(hours.text) || hours.text.length === 0) return null;
  const todayIdx = new Date().getDay();

  for (const line of hours.text) {
    const ci = String(line).indexOf(":");
    if (ci === -1) continue;
    const dayPart = line.slice(0, ci).trim();
    const timePart = line.slice(ci + 1).trim();
    if (!_dayPartIncludesToday(dayPart, todayIdx)) continue;

    if (/24\s*\/\s*7/i.test(timePart) || /\b00:00\s*-\s*24:00\b/.test(timePart)) {
      return { allDay: true };
    }
    if (/closed/i.test(timePart)) {
      return { closed: true };
    }
    const range = timePart.split(",")[0].split("-").map((s) => s.trim());
    if (range.length === 2) {
      return { open: _fmtHourLabel(range[0]), close: _fmtHourLabel(range[1]) };
    }
    return null;
  }
  // If no line matches today's weekday, assume the place is closed today.
  return { closed: true };
}

function _formatHoursLineDisplay(line) {
  let out = String(line || "").trim();
  if (!out) return out;
  // Normalize spacing around ranges.
  out = out.replace(/\s*-\s*/g, " - ");
  // Convert 24h time ranges to AM/PM for easier first-glance reading.
  out = out.replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g, (_m, a, b) => {
    const aa = _fmtHourLabel(a) || a;
    const bb = _fmtHourLabel(b) || b;
    return `${aa} - ${bb}`;
  });
  return out;
}

function _normalizeQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ");
}

// Plans a query for Places triggering. Returns null (no trigger) or:
//   { mode: "local"|"global", confidence: "any"|"name", text: <search text> }
//   - mode "local"  -> radius-bound /browse or /discover near the user.
//   - mode "global" -> /discover with at-only (no radius) so landmarks resolve.
//   - confidence "name" -> render only on a confident HERE name/brand match.
function _classifyPlaceQuery(rawQuery) {
  const intent = analyzePlaceIntent(rawQuery);
  if (!intent) return null;

  return {
    mode: intent.mode,
    confidence:
      intent.mode === "global" || intent.kind === "business"
        ? "name"
        : "any",
    text: intent.searchText,
    placeHint: intent.locationText,
    wantsOpenNow: intent.qualifiers.openNow,
    validationRequired: intent.validationRequired === true,
    kind: intent.kind,
    evidence: intent.evidence,
  };
}

function _filterOpenNow(places) {
  return (places || []).filter((p) => p?.hours?.openNow === true);
}

function _looksProbablyPlaceQuery(rawQuery) {
  return _classifyPlaceQuery(rawQuery) !== null;
}

function _normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _levenshteinDistance(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[bl];
}

/** 0..1 character similarity via normalized Levenshtein ratio. */
function _charSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 2) return a === b ? 1 : 0;
  const ratio = 1 - _levenshteinDistance(a, b) / maxLen;
  return ratio >= 0.5 ? ratio : 0;
}

/** 0..1 similarity between two single tokens (exact, substring, prefix, Levenshtein). */
function _tokenMatchScore(qTok, nTok) {
  if (!qTok || !nTok) return 0;
  if (qTok === nTok) return 1;

  const qLen = qTok.length;
  const nLen = nTok.length;
  const shorter = qLen <= nLen ? qTok : nTok;
  const longer = qLen <= nLen ? nTok : qTok;
  if (longer.includes(shorter) && shorter.length >= 3) {
    return 0.88 + 0.12 * (shorter.length / longer.length);
  }

  const minLen = Math.min(qLen, nLen);
  if (minLen >= 4 && qTok.slice(0, 4) === nTok.slice(0, 4)) {
    return 0.72 + 0.18 * _charSimilarity(qTok, nTok);
  }
  if (minLen <= 2) return 0;

  return _charSimilarity(qTok, nTok);
}

/** Best one-to-one token alignment score (query tokens drive the average). */
function _alignTokenScore(qTokens, nTokens) {
  if (!qTokens.length || !nTokens.length) return 0;

  const used = new Uint8Array(nTokens.length);
  let total = 0;

  for (const qt of qTokens) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < nTokens.length; i++) {
      if (used[i]) continue;
      const score = _tokenMatchScore(qt, nTokens[i]);
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && best > 0) used[bestIdx] = 1;
    total += best;
  }

  return total / qTokens.length;
}

// 0..1 fuzzy similarity between a query and a place name — token alignment plus
// character-level Levenshtein so the intended business beats a partial place match.
function _fuzzyNameMatchScore(query, name) {
  const q = _normalizeMatchText(query);
  const n = _normalizeMatchText(name);
  if (!q || !n) return 0;
  if (q === n) return 1;

  const qTokens = q.split(" ").filter(Boolean);
  const nTokens = n.split(" ").filter(Boolean);
  if (!qTokens.length || !nTokens.length) return 0;

  const compactQuery = qTokens.join("");
  const compactName = nTokens.join("");
  if (compactQuery === compactName && compactQuery.length >= 3) {
    return 1;
  }

  if (
    _containsWholeTokenSequence(nTokens, qTokens) ||
    _containsWholeTokenSequence(qTokens, nTokens)
  ) {
    return Math.min(q.length, n.length) >= 3 ? 0.97 : 0;
  }

  const forward = _alignTokenScore(qTokens, nTokens);
  const reverse = _alignTokenScore(nTokens, qTokens);
  const tokenScore = Math.max(forward, reverse * 0.92);
  const charScore = _charSimilarity(q.replace(/\s+/g, ""), n.replace(/\s+/g, ""));
  const tokenBalance =
    Math.min(qTokens.length, nTokens.length) /
    Math.max(qTokens.length, nTokens.length);
  const unmatchedTokenPenalty = 0.55 + tokenBalance * 0.45;

  return Math.min(
    1,
    Math.max(
      tokenScore,
      tokenScore * 0.7 + charScore * 0.3,
      charScore * 0.82,
    ) * unmatchedTokenPenalty,
  );
}

function _containsWholeTokenSequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function _placeNameMatchScore(query, place) {
  if (!place) return 0;
  const nameScore = _fuzzyNameMatchScore(query, place.name || "");
  const brandScore = place.brandName ? _fuzzyNameMatchScore(query, place.brandName) : 0;
  return Math.max(nameScore, brandScore);
}

function _distanceRankScore(distanceMeters, radiusM, minDist, maxDist) {
  if (!Number.isFinite(distanceMeters)) return 0;
  // Prefer radius-based scaling so 100 m vs 120 m both stay "close" and name can break ties.
  if (Number.isFinite(radiusM) && radiusM > 0) {
    return Math.max(0, 1 - Math.min(1, distanceMeters / radiusM));
  }
  if (!Number.isFinite(minDist) || !Number.isFinite(maxDist) || maxDist <= minDist) return 1;
  return 1 - (distanceMeters - minDist) / (maxDist - minDist);
}

function _rankPlacesByQuery(places, query, radiusM) {
  if (!Array.isArray(places) || places.length <= 1 || !query) return places;

  const distances = places.map((p) => p.distanceMeters).filter(Number.isFinite);
  const minDist = distances.length ? Math.min(...distances) : 0;
  const maxDist = distances.length ? Math.max(...distances) : 0;

  return [...places].sort((a, b) => {
    const aDist = _distanceRankScore(a.distanceMeters, radiusM, minDist, maxDist);
    const bDist = _distanceRankScore(b.distanceMeters, radiusM, minDist, maxDist);
    const aName = _placeNameMatchScore(query, a);
    const bName = _placeNameMatchScore(query, b);
    const aComposite = PLACE_RANK_DISTANCE_WEIGHT * aDist + PLACE_RANK_NAME_WEIGHT * aName;
    const bComposite = PLACE_RANK_DISTANCE_WEIGHT * bDist + PLACE_RANK_NAME_WEIGHT * bName;
    if (bComposite !== aComposite) return bComposite - aComposite;
    if (bDist !== aDist) return bDist - aDist;
    return bName - aName;
  });
}

// 0..1 similarity between a query and a place name (used for confidence gates).
function _nameMatchScore(query, name) {
  return _fuzzyNameMatchScore(query, name);
}

function _isConfidentNameMatchForPlan(plan, query, place, radiusMeters) {
  if (!place) return false;
  if (_isShortSingleTokenQuery(query)) {
    return _hasExactShortNameOrBrandMatch(query, place);
  }
  const nameScore = _nameMatchScore(query, place.name);
  const brandScore = place.brandName ? _nameMatchScore(query, place.brandName) : 0;
  const score = Math.max(nameScore, brandScore);
  if (plan?.placeHint) return score >= 0.7;
  return _isConfidentNameMatch(query, place, radiusMeters);
}

// A place is a confident match for an optimistic name query when its name (or
// brand) closely matches the query. Weak HERE chain/ontology matches must also
// be nearby and cover most meaningful query tokens.
function _isConfidentNameMatch(query, place, radiusMeters) {
  if (!place) return false;
  if (_isShortSingleTokenQuery(query)) {
    return _hasExactShortNameOrBrandMatch(query, place);
  }
  const nameScore = _nameMatchScore(query, place.name);
  const brandScore = place.brandName ? _nameMatchScore(query, place.brandName) : 0;
  const score = Math.max(nameScore, brandScore);
  if (score >= 0.7) return true;
  if (score < 0.5 || !(place.brandName || place.ontologyId)) return false;
  if (!Number.isFinite(place.distanceMeters) || !Number.isFinite(radiusMeters)) {
    return false;
  }

  const coverage = _meaningfulQueryTokenCoverage(query, [
    place.name,
    place.brandName,
  ]);
  const weakMatchMaxDistance = Math.min(radiusMeters * 0.2, 5 * 1609.34);
  if (coverage >= 0.75 && place.distanceMeters <= weakMatchMaxDistance) {
    return true;
  }
  return false;
}

function _isShortSingleTokenQuery(query) {
  const normalized = _normalizeMatchText(query);
  return Boolean(normalized && !normalized.includes(" ") && normalized.length <= 5);
}

function _hasExactShortNameOrBrandMatch(query, place) {
  const normalizedQuery = _normalizeMatchText(query);
  if (!normalizedQuery) return false;
  return [place?.name, place?.brandName]
    .filter(Boolean)
    .some((name) => {
      const normalizedName = _normalizeMatchText(name);
      return (
        normalizedName === normalizedQuery ||
        normalizedName.startsWith(`${normalizedQuery} `)
      );
    });
}

function _meaningfulQueryTokenCoverage(query, candidateNames) {
  const ignored = new Set(["and", "the", "of", "at", "in", "on"]);
  const queryTokens = _normalizeMatchText(query)
    .split(" ")
    .filter((token) => token && !ignored.has(token));
  if (!queryTokens.length) return 0;

  const candidateTokens = _normalizeMatchText(
    (candidateNames || []).filter(Boolean).join(" "),
  )
    .split(" ")
    .filter(Boolean);
  if (!candidateTokens.length) return 0;

  let matched = 0;
  for (const queryToken of queryTokens) {
    const best = candidateTokens.reduce(
      (score, candidateToken) =>
        Math.max(score, _tokenMatchScore(queryToken, candidateToken)),
      0,
    );
    if (best >= 0.72) matched += 1;
  }
  return matched / queryTokens.length;
}

export function testNameResultRelevance(query, place, radiusMeters) {
  return _isConfidentNameMatch(query, place, radiusMeters);
}

function _shortAddress(address) {
  if (typeof address !== "string") return "";

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 2) return address;

  const compact = parts.filter((part) => !_looksPostalCode(part) && !_looksCountry(part));
  if (compact.length >= 2) return compact.slice(-2).join(", ");

  return parts.slice(0, 2).join(", ");
}

function _looksPostalCode(part) {
  return /^[A-Z]?\d[A-Z\d]?[-\s]?\d[A-Z]{0,2}$/i.test(part) || /^\d{4,10}(-\d{3,6})?$/.test(part);
}

function _looksCountry(part) {
  return /^(united states|usa|us|united kingdom|uk|canada|australia|new zealand)$/i.test(part);
}

function _isTileTemplate(url) {
  return (
    /^https?:\/\//i.test(url) &&
    url.includes("{z}") &&
    url.includes("{x}") &&
    url.includes("{y}")
  );
}

function _mapBounds(places) {
  const points = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLatRaw = Math.min(...lats);
  const maxLatRaw = Math.max(...lats);
  const minLonRaw = Math.min(...lons);
  const maxLonRaw = Math.max(...lons);
  const latPad = Math.max(0.01, (maxLatRaw - minLatRaw) * 0.25);
  const lonPad = Math.max(0.01, (maxLonRaw - minLonRaw) * 0.25);

  return {
    minLat: Math.max(-90, minLatRaw - latPad).toFixed(6),
    maxLat: Math.min(90, maxLatRaw + latPad).toFixed(6),
    minLon: Math.max(-180, minLonRaw - lonPad).toFixed(6),
    maxLon: Math.min(180, maxLonRaw + lonPad).toFixed(6),
  };
}

function _haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function _esc(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
