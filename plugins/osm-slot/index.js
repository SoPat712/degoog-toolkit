// Places slot plugin — local place recognition powered by the HERE Search API
// (hybrid of /browse with verified category codes and /discover free-text).

import {
  isInformationalQuestion,
  isPlaceInLocation,
  isUtilityPluginQuery,
  PLACE_TOPIC_INFO_RE,
} from "./query-guards.js";

const PLUGIN_NAME = "Places";
const PLUGIN_VERSION = "4.5.6";
const PLUGIN_DESCRIPTION =
  "Local place recognition — shows nearby businesses and POIs with address, hours, phone, directions, and interactive map.";

let _settings = {};
let _fetch = (...args) => fetch(...args);
let _cache = null;

const HERE_BROWSE = "https://browse.search.hereapi.com/v1/browse";
const HERE_DISCOVER = "https://discover.search.hereapi.com/v1/discover";
const HERE_GEOCODE = "https://geocode.search.hereapi.com/v1/geocode";

// HERE /geocode `types` filter (v7) — NOT the same strings as item.resultType in responses.
const HERE_GEO_TYPES_CITY = "city,area,postalCode";
const HERE_GEO_TYPES_PLACE = "place,address,street,houseNumber";

/** POI/landmark-style "near …" hints — must not be biased to the user's Home coords. */
const GEO_POI_HINT_RE =
  /\b(center|centre|plaza|square|tower|building|campus|terminal|station|airport|field|garden|market|mall|arena|stadium|museum|library|hospital|university|college|palace|bridge|park|zoo|aquarium|memorial|monument|rockefeller|times\s+square|empire\s+state|world\s+trade|statue\s+of\s+liberty|central\s+park|grand\s+central|penn\s+station|union\s+station|white\s+house|golden\s+gate|space\s+needle)\b/i;

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
    defaultRadius: s?.defaultRadius || "25",
    resultsCount: s?.resultsCount || "5",
    distanceUnit: s?.distanceUnit || "miles",
    customTileUrl: s?.customTileUrl || "",
  };
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
        "Required. Powers place search (/discover, /browse) and city geocoding for queries like 'near Princeton' (/geocode). Free tier includes generous monthly Geocoding & Search requests — get a key at developer.here.com.",
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
      description: "Label shown in the card header, e.g. 'Home/Work/Chicago, IL'.",
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
      options: ["5", "10", "25", "50"],
      default: "25",
      description: "Search radius in miles.",
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
  ],

  init(ctx) {
    if (typeof ctx?.fetch === "function") {
      _fetch = (...args) => ctx.fetch(...args);
    }
    if (typeof ctx?.createCache === "function") {
      _cache = ctx.createCache(30 * 60 * 1000); // 30 minutes — repeat queries are free
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
    const plan = _classifyPlaceQuery(query);
    if (!plan) {
      return { html: "" };
    }

    try {
      const isGlobal = plan.mode === "global";
      if (!_settings.hereApiKey) {
        return { html: "" };
      }

      const radiusMiles = parseInt(_settings.defaultRadius || "25", 10);
      const radiusMeters = radiusMiles * 1609.34;
      const limit = parseInt(_settings.resultsCount || "5", 10);
      const doFetch = typeof context?.fetch === "function" ? context.fetch : _fetch;

      const wrapFetch = _makeWrapFetch(doFetch, "");

      const apiStatus = {
        here: { configured: !!_settings.hereApiKey, status: "unused", error: null, count: 0 },
        geocode: { configured: !!_settings.hereApiKey, status: "unused", error: null, source: null, label: null },
      };

      const resolved = await _resolveSearchLocation(plan, wrapFetch, apiStatus);
      if (!resolved) {
        return { html: "" };
      }
      const { lat, lon, locationLabel } = resolved;
      const q = plan.text;

      console.log(`[Places Server v${PLUGIN_VERSION}] Query: "${q}" (${plan.mode}/${plan.confidence}) at lat=${lat}, lon=${lon}${plan.placeHint ? ` [near ${plan.placeHint}]` : ""}`);

      const places = await _searchHere(q, lat, lon, radiusMeters, limit * 2, wrapFetch, apiStatus, { global: isGlobal });

      if (places.length === 0) {
        console.log(`[Places Server v${PLUGIN_VERSION}] No places found from HERE.`);
        return { html: "" };
      }

      let top = _processHerePlaces(places, radiusMeters, limit, { noRadiusFilter: isGlobal });

      if (plan.wantsOpenNow) {
        top = _filterOpenNow(top);
      }

      // Optimistic name/brand and landmark queries only render when HERE returns
      // a confident name/brand match. This keeps false positives on
      // informational/tech queries near zero.
      if (plan.confidence === "name") {
        top = top.filter((p) => _isConfidentNameMatch(q, p));
      }

      if (top.length === 0) {
        return { html: "" };
      }

      console.log(`[Places Server v${PLUGIN_VERSION}] Final ${top.length} processed places:`);
      top.forEach((p, idx) => {
        console.log(`  [${idx}] ${p.name} (${(p.distanceMeters / 1609.34).toFixed(1)} mi) - Phone: ${p.phone || "None"} - Website: ${p.website || "None"} - Source: ${p.source} - Hours: ${p.hours ? JSON.stringify(p.hours) : "None"}`);
      });

      const html = _renderCard(
        top,
        q,
        locationLabel,
        _settings.useBrowserGeolocation,
        apiStatus
      );
      return { html };
    } catch (err) {
      console.error("[places] lookup failed:", err);
      return { html: "" };
    }
  },
};

export default slot;

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

        const radiusMiles = parseInt(_settings.defaultRadius || "25", 10);
        const radiusMeters = radiusMiles * 1609.34;
        const limit = parseInt(_settings.resultsCount || "5", 10);

        // Coordinate resolution, in priority order:
        //   1. Precise browser coords from "Use my location".
        //   2. Explicit "near Princeton" (etc.) geocoded via HERE Geocoding API.
        //   3. Server-side IP geolocation.
        //   4. Configured default location.
        let latNum = parseFloat(body.lat);
        let lonNum = parseFloat(body.lon);
        let locationLabel = "your location";
        const hasBrowserCoords = Number.isFinite(latNum) && Number.isFinite(lonNum);

        if (hasBrowserCoords) {
          locationLabel = "your location";
        } else if (plan?.placeHint) {
          const geoStatus = {
            configured: !!_settings.hereApiKey,
            status: "unused",
            error: null,
            source: null,
            label: null,
          };
          const geo = await _geocodePlaceHint(plan.placeHint, wrapFetch, geoStatus);
          if (geo) {
            latNum = geo.lat;
            lonNum = geo.lon;
            locationLabel = geo.label || plan.placeHint;
            console.log(
              `[Places Server] Refresh geocoded "${plan.placeHint}" via ${geo.source}: ${latNum},${lonNum}`,
            );
          } else {
            console.warn(`[Places Server] Refresh could not geocode "${plan.placeHint}"`);
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
            console.log(`[Places Server] Refresh resolved via IP geo (${ipGeo.source}): ${latNum},${lonNum}`);
          } else {
            const dLat = parseFloat(_settings.defaultLat);
            const dLon = parseFloat(_settings.defaultLon);
            if (Number.isFinite(dLat) && Number.isFinite(dLon)) {
              latNum = dLat;
              lonNum = dLon;
              locationLabel = _settings.defaultLocationLabel || "Home";
              console.log(`[Places Server] Refresh fell back to configured location: ${latNum},${lonNum}`);
            } else {
              return _jsonResponse({ error: "Could not determine location" }, 422);
            }
          }
        }

        console.log(`[Places Server] Refresh Query: "${searchText}" (${plan ? plan.mode : "raw"}) at lat=${latNum}, lon=${lonNum}`);

        const apiStatus = {
          here: { configured: !!_settings.hereApiKey, status: "unused", error: null, count: 0 },
        };

        const places = await _searchHere(searchText, latNum, lonNum, radiusMeters, limit * 2, wrapFetch, apiStatus, { global: isGlobal });

        if (places.length === 0) {
          console.log(`[Places Server] No places found for refresh query.`);
          return _jsonResponse({ html: "" });
        }

        let top = _processHerePlaces(places, radiusMeters, limit, { noRadiusFilter: isGlobal });

        if (plan?.wantsOpenNow) {
          top = _filterOpenNow(top);
        }

        if (isGlobal) {
          top = top.filter((p) => _isConfidentNameMatch(searchText, p));
        }

        if (top.length === 0) {
          return _jsonResponse({ html: "" });
        }

        console.log(`[Places Server] Final ${top.length} processed places (refresh):`);
        top.forEach((p, idx) => {
          console.log(`  [${idx}] ${p.name} (${(p.distanceMeters / 1609.34).toFixed(1)} mi) - Phone: ${p.phone || "None"} - Website: ${p.website || "None"} - Source: ${p.source} - Hours: ${p.hours ? JSON.stringify(p.hours) : "None"}`);
        });

        const html = _renderCard(top, searchText, locationLabel, false, apiStatus);
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
  return (url, init = {}, timeoutMs = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const mergedInit = { ...init };
    if (!mergedInit.signal) {
      mergedInit.signal = controller.signal;
    }
    const startFetch = Date.now();
    console.log(`[Places Performance v${PLUGIN_VERSION}] Fetch starting${tag}: ${url} (Timeout: ${timeoutMs}ms)`);
    return doFetch(url, mergedInit)
      .then((res) => {
        clearTimeout(id);
        console.log(`[Places Performance v${PLUGIN_VERSION}] Fetch completed${tag}: ${url} in ${Date.now() - startFetch}ms (Status: ${res.status})`);
        return res;
      })
      .catch((err) => {
        clearTimeout(id);
        if (err.name === "AbortError") {
          console.warn(`[Places Performance v${PLUGIN_VERSION}] Fetch timed out${tag}: ${url} (gave up after ${timeoutMs / 1000} seconds)`);
        } else {
          console.warn(`[Places Performance v${PLUGIN_VERSION}] Fetch failed${tag}: ${url} in ${Date.now() - startFetch}ms:`, err);
        }
        throw err;
      });
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

/* ------------------------------------------------------------------ */
/* "near …" place hint parsing + HERE forward geocoding                */
/* ------------------------------------------------------------------ */

// Trailing "near Princeton" / "near Princeton, NJ" — not "near me".
const NEAR_PLACE_RE =
  /\bnear\s+(?!me\b|by\b|here\b|my(?:\s+location)?\b)([a-z0-9][a-z0-9 .,''-]{1,80})\s*$/i;

function _splitNearPlace(query) {
  const normalized = _normalizeQuery(query);
  const match = NEAR_PLACE_RE.exec(normalized);
  if (!match) {
    return { searchText: normalized, placeHint: null };
  }
  const placeHint = match[1].trim().replace(/[,.]$/, "");
  const searchText = normalized.slice(0, match.index).replace(/\s+/g, " ").trim();
  if (!placeHint || placeHint.length < 2) {
    return { searchText: normalized, placeHint: null };
  }
  return { searchText, placeHint };
}

function _attachPlaceHint(plan, rawQuery) {
  if (!plan) return null;
  const split = _splitNearPlace(plan.text || _normalizeQuery(rawQuery));
  const text = _cleanSearchText(split.searchText) || split.searchText;
  return { ...plan, text, placeHint: split.placeHint };
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

function _looksLikePoiGeocodeHint(hint) {
  return GEO_POI_HINT_RE.test(String(hint || "").trim());
}

function _pickHereGeocodeItem(items, hint) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const poiHint = _looksLikePoiGeocodeHint(hint);
  let best = null;
  let bestScore = -1;

  for (const item of items) {
    if (!item?.position) continue;
    const label = _hereGeocodeLabel(item, hint);
    let score = _nameMatchScore(hint, label);
    if (item.title) {
      score = Math.max(score, _nameMatchScore(hint, item.title));
    }
    if (poiHint) {
      if (item.resultType === "place") score += 0.15;
      if (item.resultType === "locality" || item.resultType === "administrativeArea") {
        score -= 0.35;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore >= 0.45) return best;

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
  const biasLat = parseFloat(_settings.defaultLat);
  const biasLon = parseFloat(_settings.defaultLon);
  let url =
    `${HERE_GEOCODE}?q=${encodeURIComponent(hint)}` +
    `&limit=5` +
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

  const cacheKey = `geo:here:v2:${hint.toLowerCase()}`;
  const cached = _cache?.get(cacheKey);
  if (cached) {
    if (apiStatus) {
      apiStatus.status = "success";
      apiStatus.source = cached.source;
      apiStatus.label = cached.label;
      apiStatus.cached = true;
    }
    return cached;
  }

  const poiHint = _looksLikePoiGeocodeHint(hint);
  const attempts = poiHint
    ? [
        { types: "place", mode: "poi/place", useBias: false },
        { types: null, mode: "poi/open", useBias: false },
      ]
    : [
        { types: HERE_GEO_TYPES_CITY, mode: "city/area", useBias: true },
        { types: HERE_GEO_TYPES_PLACE, mode: "place/address", useBias: true },
        { types: null, mode: "open", useBias: true },
      ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      console.log(
        `[Places Server v${PLUGIN_VERSION}] HERE geocode (${attempt.mode}) for "${hint}"`,
      );
      const items = await _fetchHereGeocodeItems(hint, doFetch, attempt.types, {
        useBias: attempt.useBias,
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
      _cache?.set(cacheKey, out);
      if (apiStatus) {
        apiStatus.status = "success";
        apiStatus.source = out.source;
        apiStatus.label = out.label;
        apiStatus.mode = attempt.mode;
      }
      return out;
    } catch (err) {
      lastError = err;
      // Invalid parameter on a typed request — skip to the next strategy.
      if (err.status === 400 && attempt.types) continue;
      console.warn(`[Places] HERE geocode (${attempt.mode}) failed for "${hint}":`, err);
    }
  }

  if (apiStatus) {
    apiStatus.status = "error";
    apiStatus.error = lastError?.message || "No geocode results";
  }
  return null;
}

/** Forward-geocode a trailing "near …" hint via HERE Geocoding & Search API v7. */
async function _geocodePlaceHint(hint, doFetch, apiStatus) {
  const trimmed = String(hint || "").trim();
  if (!trimmed) return null;

  try {
    const here = await _geocodeHere(trimmed, doFetch, apiStatus);
    if (here) return here;
  } catch (err) {
    console.warn(`[Places] HERE geocode failed for "${trimmed}":`, err);
    if (apiStatus && apiStatus.status === "unused") {
      apiStatus.status = "error";
      apiStatus.error = err.message;
    }
  }

  return null;
}

async function _resolveSearchLocation(plan, doFetch, apiStatus) {
  let lat = parseFloat(_settings.defaultLat);
  let lon = parseFloat(_settings.defaultLon);
  let locationLabel = _settings.defaultLocationLabel || "Home";

  if (plan?.placeHint) {
    const geoStatus = apiStatus?.geocode || null;
    const geo = await _geocodePlaceHint(plan.placeHint, doFetch, geoStatus);
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      locationLabel = geo.label || plan.placeHint;
    } else {
      console.warn(`[Places] Could not geocode "${plan.placeHint}" — not searching at default location`);
      return null;
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, locationLabel };
}

/* ------------------------------------------------------------------ */
/* HERE Search                                                         */
/* ------------------------------------------------------------------ */

async function _searchHere(query, lat, lon, radiusM, limit, doFetch, apiStatus, opts = {}) {
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
  const cached = _cache?.get(cacheKey);
  if (cached) {
    if (apiStatus?.here) {
      apiStatus.here.status = "success";
      apiStatus.here.count = cached.length;
      apiStatus.here.cached = true;
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
    console.log(
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
    }

    _cache?.set(cacheKey, out);
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
  const out = [];
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
    for (const e of out) {
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
    out.push(p);
    // Keep HERE's relevance order; stop once we have enough.
    if (out.length >= limit) break;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function _renderCard(places, query, locationLabel, showGeoBtn, apiStatus) {
  const unit = _settings.distanceUnit || "miles";
  const unitAbbr = unit === "km" ? "km" : "mi";

  const cards = places
    .map((p, index) => {
      const distVal = unit === "km" ? p.distanceMeters / 1000 : p.distanceMeters / 1609.34;
      const dist = distVal < 0.1 ? "<0.1" : distVal.toFixed(1);
      const displayAddress = _shortAddress(p.address);

      // Primary info line: Open/Closed badge + today's hours summary.
      const weekText = p.hours && Array.isArray(p.hours.text) && p.hours.text.length ? p.hours.text : null;
      let primaryHtml = "";
      if (p.hours) {
        const openNow = p.hours.openNow;
        const badge = openNow === true
          ? `<span class="places-hours places-hours-open">Open</span>`
          : openNow === false
            ? `<span class="places-hours places-hours-closed">Closed</span>`
            : "";

        const today = _todayHoursSummary(p.hours);
        let summary = "";
        if (today) {
          if (today.allDay) summary = "Open 24 hours";
          else if (openNow === true && today.close) summary = `Closes ${today.close}`;
          else if (openNow === false && today.open) summary = `Opens ${today.open}`;
          else if (today.open && today.close) summary = `${today.open} – ${today.close}`;
          else if (today.closed) summary = "Closed today";
        }
        const summaryHtml = summary
          ? `<span class="places-today-hours">${_esc(summary)}</span>`
          : "";
        if (badge || summaryHtml) {
          primaryHtml = `<div class="places-primary">${badge}${summaryHtml}</div>`;
        }
      }

      // Tags on their OWN line: cuisine (foodTypes) first, then categories.
      const tagList = [];
      const seenTags = new Set();
      const pushTag = (t) => {
        const key = String(t || "").toLowerCase().trim();
        if (key && !seenTags.has(key)) {
          seenTags.add(key);
          tagList.push(t);
        }
      };
      (p.foodTypes || []).forEach(pushTag);
      (p.categories || []).forEach(pushTag);
      const tagsHtml = tagList.length
        ? `<div class="places-tags">${tagList
            .slice(0, 4)
            .map((c) => `<span class="places-category">${_esc(c)}</span>`)
            .join("")}</div>`
        : "";

      const weekHtml = weekText
        ? `<div class="places-week">${weekText
            .map((t) => `<div class="places-week-row">${_esc(_formatHoursLineDisplay(t))}</div>`)
            .join("")}</div>`
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
  <div class="places-card-header">
    <h3 class="places-name">${_esc(p.name)}</h3>
    <span class="places-distance">${dist} ${unitAbbr}</span>
  </div>
  ${primaryHtml}
  ${weekHtml}
  ${tagsHtml}
  <p class="places-address" title="${_esc(p.address)}">${_esc(displayAddress)}</p>
  <div class="places-actions">
    <div class="places-action-item">
      <a class="places-circle-btn places-action-call${p.phone ? "" : " places-disabled"}" ${p.phone ? `href="tel:${_esc(p.phone)}"` : ""} title="Call" aria-label="Call">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
      </a>
      <span class="places-action-text">Call</span>
    </div>
    <div class="places-action-item">
      <a class="places-circle-btn places-action-website${p.website ? "" : " places-disabled"}" ${p.website ? `href="${_esc(p.website)}" target="_blank" rel="noopener noreferrer"` : ""} title="Website" aria-label="Website">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      </a>
      <span class="places-action-text">Website</span>
    </div>
    <div class="places-action-item">
      <button class="places-circle-btn places-action-directions${(p.lat && p.lon) ? "" : " places-disabled"}" ${(p.lat && p.lon) ? `data-directions-btn data-place-name="${_esc(p.name)}" data-lat="${p.lat}" data-lon="${p.lon}" data-address="${_esc(p.address)}"` : ""} type="button" title="Directions" aria-label="Directions">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
        </svg>
      </button>
      <span class="places-action-text">Directions</span>
    </div>
  </div>
</div>`;
    })
    .join("");

  const geoBtn = showGeoBtn
    ? `<button type="button" class="places-geo-btn" data-query="${_esc(query)}">Use my location</button>`
    : "";
  const mapHtml = _renderMap(places);

  return `
<div class="places-wrap slot-full-width" data-places-version="${PLUGIN_VERSION}" data-places-apis="${_esc(JSON.stringify(apiStatus || {}))}">
  <div class="places-header">
    <span class="places-label">Places</span>
    <span class="places-subhead">near ${_esc(locationLabel)}</span>
    ${geoBtn}
  </div>
  <div class="places-layout">
    <div class="places-grid">
      ${cards}
    </div>
    ${mapHtml}
  </div>
  <div class="places-modal" data-places-modal hidden>
    <div class="places-modal-backdrop" data-modal-close></div>
    <div class="places-modal-content">
      <div class="places-modal-header">
        <span class="places-modal-title">Get directions</span>
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

function _renderMap(places) {
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

  const viewUrl =
    "https://www.openstreetmap.org/" +
    `?mlat=${encodeURIComponent(centerLat)}` +
    `&mlon=${encodeURIComponent(centerLon)}` +
    `#map=13/${encodeURIComponent(centerLat)}/${encodeURIComponent(centerLon)}`;

  return `
    <aside
      class="places-map"
      data-map-panel
      data-place-name="${_esc(firstName)}"
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
        <div class="places-tile-layer"></div>
        <div class="places-pin-layer"></div>
        <div class="places-zoom-controls">
          <button class="places-zoom-btn" data-zoom-in type="button" aria-label="Zoom in">+</button>
          <button class="places-zoom-btn" data-zoom-out type="button" aria-label="Zoom out">−</button>
        </div>
      </div>
      <a class="places-map-link" data-map-link href="${_esc(viewUrl)}" target="_blank" rel="noopener noreferrer">View larger map</a>
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

/* ------------------------------------------------------------------ */
/* Conservative place query gate                                       */
/* ------------------------------------------------------------------ */

const LOCAL_INTENT_RE =
  /\b(near me|nearby|nearest|closest|locations?|address|directions?|hours?|open now|phone|menu|reservations?|reviews?|near [a-z .'-]+)\b/i;

const PLACE_CATEGORY_RE =
  /\b(restaurants?|taverns?|taps?|bars?|grills?|cafes?|coffee|pizza|pizzerias?|diners?|baker(?:y|ies)|brewer(?:y|ies)|pubs?|tacos?|taquerias?|burritos?|mexican|sushi|ramen|chinese|thai|indian|bbq|barbecue|wings?|seafood|steakhouses?|delis?|pharmac(?:y|ies)|drug\s*stores?|grocer(?:y|ies)|supermarkets?|markets?|banks?|hotels?|motels?|gas\s+stations?|fuel|stores?|shops?|salons?|gyms?|fitness|doctors?|physicians?|clinics?|dentists?|dental|hospitals?|urgent\s+care|vets?|veterinar(?:y|ian|ians)|auto|car\s+wash)\b/i;

// Known chains/brands that are unambiguously physical places (can trigger as single words with local intent nearby).
const KNOWN_CHAIN_RE =
  /\b(costco|target|walmart|starbucks|mcdonald'?s|burger\s*king|wendy'?s|taco\s*bell|chipotle|domino'?s|pizza\s*hut|papa\s*john'?s|subway|dunkin'?|dunkin\s*donuts|kfc|five\s*guys|shake\s*shack|in-n-out|chick-fil-a|panera|olive\s*garden|red\s*lobster|longhorn|texas\s*roadhouse|cracker\s*barrel|ihop|denny'?s|applebee'?s|chili'?s|outback|buffalo\s*wild\s*wings|home\s*depot|lowe'?s|menards|best\s*buy|staples|office\s*depot|petco|petsmart|whole\s*foods|trader\s*joe'?s|kroger|safeway|albertsons|publix|wegmans|cvs|walgreens|rite\s*aid|sheetz|wawa|buc-ee'?s|flying\s*j|love'?s|pilot|speedway|shell|bp|exxon|mobil|sunoco|citgo|marathon|7-eleven|circle\s*k|royal\s*farms|kung\s*fu\s*tea|gong\s*cha|sharetea|boba\s*guys|panda\s*express|jack\s*in\s*the\s*box|raising\s*cane'?s?|auntie\s*anne'?s?|cinnabon|jamba\s*juice|smoothie\s*king)\b/i;

const NON_PLACE_RE =
  /\b(how to|how many|how much|what is|why|when|who|reddit|github|docs|documentation|install|download|error|fix|linux|macos|windows|npm|pip|python|javascript|typescript|docker|nginx|proxmox|ai|llm|model|qwen|claude|gpt|gemini|ollama|benchmark|review|vs|price)\b/i;

const GENERAL_INFO_RE =
  /\b(tutorial|course|book|pdf|lyrics|chords|movie|show|cast|actor|actress|season|episode|news|wiki|wikipedia|definition|meaning|synonym|antonym|pronunciation|translate|translation|weather|forecast|stock|chart|price|convert|converter|calculator|calculate|history|biography|photo|image|picture|wallpaper|video|youtube|song|album|lyrics|map|maps|recipe|ingredients|cooking)\b/i;

// Shopping / product wording — not a place lookup (saves Discover quota on "where to buy …").
const CONSUMER_PRODUCT_RE =
  /\b(ketchup|mustard|mayo|mayonnaise|sauce|soda|cola|pepsi|coke|coca[\s-]?cola|amazon|ebay|walmart|target|costco|buy|order|shipping|coupon|deal|deals|cheap|price|prices|iphone|android|laptop|tablet|gpu|cpu|ram|ssd|shirt|shoes|sneakers|hoodie|dress|pants|jeans)\b/i;

// Landmarks / POI types that justify a global (at-only) discover lookup.
const LANDMARK_HINT_RE =
  /\b(castle|palace|museum|monument|memorial|park|national park|bridge|tower|stadium|arena|airport|beach|mountain|volcano|lake|river|falls|waterfall|cathedral|basilica|temple|mosque|synagogue|zoo|aquarium|university|college|capitol|parliament|pyramid|ruins|fort|fortress|lighthouse|observatory|planetarium|amusement park|theme park|boardwalk|pier|harbor|harbour|plaza|square)\b/i;

const TECH_SCIENCE_RE =
  /\b(react|angular|vue|svelte|node|npm|pip|python|javascript|typescript|golang|rust|java|c\+\+|c#|php|html|css|sql|git|docker|kubernetes|aws|azure|gcp|api|json|xml|csv|yaml|markdown|github|gitlab|bitbucket|stackoverflow|mdn|w3schools|npm|package|library|framework|module|class|function|object|array|string|number|boolean|null|undefined|regexp|regex|compiler|interpreter|theory|theorem|equation|formula|chemical|molecule|atom|cell|organism|species|evolution|math|physics|chemistry|biology)\b/i;

// Medical / pharmacology / biochemistry — not local place lookups.
const SCIENCE_MEDICAL_RE =
  /\b(channel|blocker|blockers|receptor|receptors|agonist|antagonist|inhibitor|inhibitors|enzyme|enzymes|protein|proteins|peptide|peptides|neuron|neurons|neural|pharmacology|pharmacokinetic|pharmacokinetics|dosage|clinical|syndrome|pathology|antibody|antibodies|antigen|genome|chromosome|mutation|pathway|metabolite|hormone|cytokine|kinase|transcript|mrna|electrolyte|anesthesia|analgesic|antibiotic|antiviral|vaccine|steroid|opioid|benzodiazepine|ssri|nsaid|toxicity|diagnosis|symptom|symptoms|treatment|therapeutic|medication|medications|prescription|anatomy|physiology|histology|immunology|oncology|cardiology|neurology|psychiatry|epidemiology|biochemistry|biophysics)\b/i;

const URL_OR_CODE_RE =
  /https?:\/\/|www\.|[{}[\]<>]|=>|==|!=|\/etc\/|\.js\b|\.ts\b|\.py\b|\.sh\b|@[a-z0-9_-]+/i;

function _normalizeQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ");
}

function _wordCount(query) {
  return _normalizeQuery(query).split(/\s+/).filter(Boolean).length;
}

function _hasCityOrZipHint(query) {
  return /\b\d{5}(?:-\d{4})?\b/.test(query) || /\b[A-Z]{2}\b/.test(query);
}

// Words that, on their own, are too generic/non-commercial to optimistically
// treat as a brand/business name. Keeps the name-query relaxation honest.
const GENERIC_NAME_STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "are", "was", "what", "when", "where",
  "why", "how", "who", "yes", "no", "ok", "okay", "hello", "hi", "hey",
  "good", "bad", "new", "old", "free", "love", "life", "time", "day", "today",
  "tomorrow", "yesterday", "now", "here", "there", "this", "that", "them",
  "thanks", "please", "help", "info", "about", "home", "work", "name",
  // Very generic nouns/adjectives frequently searched in non-local contexts.
  "best", "top", "cheap", "near", "local", "nearby", "open", "closed", "hours",
  "menu", "price", "prices", "review", "reviews", "rating", "ratings",
  "address", "location", "locations", "directions", "phone", "website",
  "news", "wiki", "wikipedia", "video", "videos", "image", "images", "photo",
  "photos", "map", "maps", "weather", "forecast", "translate", "calculator",
  "converter", "stock", "stocks", "crypto", "bitcoin", "play", "game", "games",
  // Broad topic words that should not trigger Places.
  "music", "movie", "movies", "show", "shows", "book", "books", "recipe",
  "recipes", "game", "games", "school", "college", "university", "hospitality",
  "software", "hardware", "app", "apps", "website", "websites",
  // Common animals/colors/objects that often collide with road names/business names.
  "snake", "wolf", "fox", "bear", "eagle", "hawk", "deer", "dog", "cat",
  "red", "blue", "green", "black", "white", "orange", "purple", "yellow",
  "hill", "ridge", "valley", "river", "lake", "road", "street", "avenue",
  // Game/animal terms that often collide with utility plugins and should not
  // trigger Places as optimistic single-word business-name searches.
  "snake", "minesweeper", "tictactoe", "tic", "tac", "toe",
  // Utility / companion-plugin triggers — never treat as a business name.
  "speedtest", "speed", "stopwatch", "countdown", "metronome", "time", "timezone",
  "clock", "until", "coinflip", "yesno", "dice", "translate", "stocks", "stock",
  "bitcoin", "crypto", "calculator", "calc", "graph", "plot", "tip", "tips",
]);

// Queries that should never trigger Places (handled by game plugins instead).
const GAME_QUERY_RE =
  /\b(tic[\s-]?tac[\s-]?toe|tictactoe|tic-tac-toe|minesweeper|play\s+snake|snake\s+game|play\s+tic|play\s+tictactoe|play\s+tic[\s-]?tac[\s-]?toe|solitaire|sudoku|wordle|chess|checkers|pong|pacman)\b/i;

// Leading "where is / where's / where can i find ..." phrasing. Stripped before
// searching; if the remainder is a proper place/landmark name (not a local
// category) the search goes GLOBAL so far-away landmarks resolve.
const WHERE_IS_RE = /^(where(?:'s|s| is| are| can i (?:find|get|buy)| to find))\s+/i;
const WHERE_PLAIN_RE = /^where\s+/i;
const LEADING_ARTICLE_RE = /^(the|a|an)\s+/i;

// Suffixes common in independent business / restaurant names (allows shorter single-word names).
const BUSINESS_NAME_SUFFIX_RE =
  /(?:wala|house|grill|cafe|caf\u00e9|kitchen|bistro|cantina|taqueria|pizzeria|bakery|brewery|deli|shop|store|mart|express|junction|corner|palace|terrace|garden|spot|hub|bar|pub|diner|sushi|ramen|bbq|bites?|bowl|bowls|bro|bros|co|company|group)$/i;

function _isBlockedNonPlaceQuery(lower) {
  if (KNOWN_CHAIN_RE.test(lower)) return false;
  return (
    NON_PLACE_RE.test(lower) ||
    GENERAL_INFO_RE.test(lower) ||
    TECH_SCIENCE_RE.test(lower) ||
    SCIENCE_MEDICAL_RE.test(lower)
  );
}

/** Worth a HERE call: explicit place-seeking intent, not just a category keyword. */
function _hasStrongPlaceIntent(lower) {
  const hasLocalIntent = LOCAL_INTENT_RE.test(lower);
  const hasCategory = PLACE_CATEGORY_RE.test(lower);
  const hasChain = KNOWN_CHAIN_RE.test(lower);
  const hasLocationHint = _hasCityOrZipHint(lower);
  const hasCategoryInLocation = isPlaceInLocation(lower);

  if (hasChain) return true;
  if (hasLocalIntent) return true;
  if (hasCategoryInLocation) return true;
  if (hasCategory && hasLocationHint) return true;
  return false;
}

// Classifies the (already where-is-stripped) text against the local signals.
//   "strong" -> category / local-intent / known-chain / city-zip; render any nearby result.
//   "name"   -> short, plausible brand/business name; render ONLY on a confident HERE match.
//   null     -> no local signal.
function _classifyLocalText(text) {
  const query = _normalizeQuery(text);
  const lower = query.toLowerCase();

  if (!query || query.length < 3) return null;
  if (query.length > 80) return null;
  if (URL_OR_CODE_RE.test(query)) return null;
  if (isUtilityPluginQuery(query)) return null;

  const hasCategory = PLACE_CATEGORY_RE.test(lower);

  // Real place-seeking queries beat generic informational wording ("best buy near me").
  if (_hasStrongPlaceIntent(lower)) return "strong";

  if (hasCategory && (PLACE_TOPIC_INFO_RE.test(lower) || GENERAL_INFO_RE.test(lower))) {
    return null;
  }

  // Plausible independent business names ("Tacowala", "RS Pizza Bites") before category-only reject.
  if (_looksLikeNameQuery(query)) return "name";

  if (hasCategory) return null;

  if (_isBlockedNonPlaceQuery(lower)) return null;

  return null;
}

// Plans a query for Places triggering. Returns null (no trigger) or:
//   { mode: "local"|"global", confidence: "any"|"name", text: <search text> }
//   - mode "local"  -> radius-bound /browse or /discover near the user.
//   - mode "global" -> /discover with at-only (no radius) so landmarks resolve.
//   - confidence "name" -> render only on a confident HERE name/brand match.
function _classifyPlaceQuery(rawQuery) {
  const query = _normalizeQuery(rawQuery);
  if (!query || query.length > 80) return null;
  if (isUtilityPluginQuery(query)) return null;
  if (GAME_QUERY_RE.test(query)) return null;
  const wantsOpenNow = /\bopen(?:\s+now)?\b/i.test(query);

  // Handle explicit "where is …" place lookups before the generic
  // informational-question gate (which also matches leading "where").
  const whereMatch = WHERE_IS_RE.exec(query) || WHERE_PLAIN_RE.exec(query);

  if (whereMatch) {
    // Strip the "where is" prefix (and a leading article) before searching.
    let text = query.slice(whereMatch[0].length).replace(LEADING_ARTICLE_RE, "").trim();
    text = _cleanSearchText(text);
    if (text.length < 3) return null;
    if (URL_OR_CODE_RE.test(text)) return null;
    if (isUtilityPluginQuery(text)) return null;

    const lower = text.toLowerCase();
    if (CONSUMER_PRODUCT_RE.test(lower) && !_hasStrongPlaceIntent(lower)) {
      return null;
    }
    if (_isBlockedNonPlaceQuery(lower) && !_hasStrongPlaceIntent(lower)) {
      return null;
    }

    // Local category/intent/chain/zip remainder -> stay local (e.g. "nearest pharmacy").
    if (_hasStrongPlaceIntent(lower)) {
      return _attachPlaceHint({ mode: "local", confidence: "any", text, wantsOpenNow }, query);
    }

    // Global discover is quota-expensive — only for landmark-style remainders.
    if (LANDMARK_HINT_RE.test(lower)) {
      return _attachPlaceHint({ mode: "global", confidence: "name", text, wantsOpenNow }, query);
    }

    // Business/brand names after "where …" stay local (radius-bound discover).
    if (_looksLikeNameQuery(text)) {
      return _attachPlaceHint({ mode: "local", confidence: "name", text, wantsOpenNow }, query);
    }

    return null;
  }

  if (isInformationalQuestion(query)) return null;

  const local = _classifyLocalText(query);
  const cleaned = _cleanSearchText(query);
  if (local === "strong") {
    return _attachPlaceHint(
      { mode: "local", confidence: "any", text: cleaned || query, wantsOpenNow },
      query,
    );
  }
  if (local === "name") {
    return _attachPlaceHint(
      { mode: "local", confidence: "name", text: cleaned || query, wantsOpenNow },
      query,
    );
  }
  return null;
}

function _tokenLooksNameLike(token) {
  const lower = token.toLowerCase();
  if (GENERIC_NAME_STOPWORDS.has(lower)) return false;
  if (PLACE_CATEGORY_RE.test(token) && !KNOWN_CHAIN_RE.test(token)) return false;
  if (BUSINESS_NAME_SUFFIX_RE.test(token)) return true;
  if (/^[A-Z]{2,}$/.test(token)) return true;
  if (/^[A-Za-z]+(?:'s|'|s)$/i.test(token) && lower.length >= 4) return true;
  if (lower.length >= 6) return true;
  if (lower.length >= 4 && /[A-Z]/.test(token.slice(1))) return true;
  return false;
}

/** Multi-word brands with all short tokens ("kung fu tea", "gong cha"). */
function _looksLikeCompactBrandName(tokens) {
  const meaningful = tokens.filter((t) => !GENERIC_NAME_STOPWORDS.has(t.toLowerCase()));
  if (meaningful.length < 2) return false;
  if (!meaningful.every((t) => t.length >= 2 && /^[a-z0-9][a-z0-9'’&.-]*$/i.test(t))) {
    return false;
  }
  return meaningful.join("").length >= 7;
}

function _looksLikeNameQuery(query) {
  const normalized = _normalizeQuery(query);
  if (isUtilityPluginQuery(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 4) return false;
  if (SCIENCE_MEDICAL_RE.test(normalized.toLowerCase())) return false;
  if (PLACE_TOPIC_INFO_RE.test(normalized.toLowerCase())) return false;

  for (const token of tokens) {
    // Name tokens: letters/digits plus internal apostrophes/hyphens/ampersands/dots.
    if (!/^[a-z0-9][a-z0-9'’&.-]*$/i.test(token)) return false;
  }

  const compact = tokens.join("");
  if (compact.length < 3) return false;

  if (tokens.every((t) => GENERIC_NAME_STOPWORDS.has(t.toLowerCase()))) return false;

  if (tokens.length === 1) {
    if (PLACE_CATEGORY_RE.test(tokens[0]) && !KNOWN_CHAIN_RE.test(tokens[0])) return false;
    return _tokenLooksNameLike(tokens[0]);
  }

  // Multi-word: allow short initials ("RS Pizza Bites") when a non-category token reads like a name.
  const nonCategoryTokens = tokens.filter(
    (t) => !PLACE_CATEGORY_RE.test(t) || KNOWN_CHAIN_RE.test(t),
  );
  if (nonCategoryTokens.length === 0) return false;
  if (nonCategoryTokens.some((t) => _tokenLooksNameLike(t))) return true;
  return _looksLikeCompactBrandName(nonCategoryTokens);
}

function _cleanSearchText(text) {
  return String(text || "")
    .replace(/\bopen\s+now\b/gi, " ")
    .replace(/\bopen\b/gi, " ")
    .replace(/\bnear\s+me\b/gi, " ")
    .replace(/\bnearby\b/gi, " ")
    .replace(/\bclosest\b/gi, " ")
    .replace(/\bnearest\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// 0..1 similarity between a query and a place name, combining substring
// containment with token overlap so "tim hortons" matches "Tim Hortons" and
// "starbucks" matches "STARBUCKS" but random words do not.
function _nameMatchScore(query, name) {
  const q = _normalizeMatchText(query);
  const n = _normalizeMatchText(name);
  if (!q || !n) return 0;
  if (q === n) return 1;

  const qTokens = q.split(" ").filter(Boolean);
  const nTokens = new Set(n.split(" ").filter(Boolean));
  if (qTokens.length === 0 || nTokens.size === 0) return 0;

  // Full containment of the query phrase within the name (or vice versa).
  if (n.includes(q) || q.includes(n)) {
    return Math.min(q.length, n.length) >= 3 ? 0.95 : 0;
  }

  let matched = 0;
  for (const t of qTokens) {
    if (nTokens.has(t)) {
      matched += 1;
    } else if (t.length >= 5) {
      // Allow a near-token match for longer words (minor spelling drift).
      for (const nt of nTokens) {
        if (nt.length >= 5 && (nt.startsWith(t.slice(0, 5)) || t.startsWith(nt.slice(0, 5)))) {
          matched += 0.8;
          break;
        }
      }
    }
  }
  return matched / qTokens.length;
}

// A place is a confident match for an optimistic name query when its name (or
// brand) closely matches the query. A HERE chain/ontology brand signal lowers
// the bar slightly. Radius is already enforced by _processHerePlaces.
function _isConfidentNameMatch(query, place) {
  if (!place) return false;
  const nameScore = _nameMatchScore(query, place.name);
  const brandScore = place.brandName ? _nameMatchScore(query, place.brandName) : 0;
  const score = Math.max(nameScore, brandScore);
  if (score >= 0.7) return true;
  if (score >= 0.5 && (place.brandName || place.ontologyId)) return true;
  return false;
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
