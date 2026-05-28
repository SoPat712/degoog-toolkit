// Places slot plugin — local place recognition with Foursquare, Yelp, Overpass, Photon, and Nominatim.

const PLUGIN_NAME = "Places";
const PLUGIN_VERSION = "2.3.0";
const PLUGIN_DESCRIPTION =
  "Local place recognition — shows nearby businesses and POIs with address, hours, phone, directions, and interactive map.";

let _settings = {};
let _fetch = (...args) => fetch(...args);
let _cache = null;

const DEFAULT_PHOTON_URL = "https://photon.komoot.io";
const FOURSQUARE_BASE = "https://places-api.foursquare.com/places/search";
const YELP_BASE = "https://api.yelp.com/v3/businesses/search";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

function _configure(s) {
  _settings = {
    foursquareApiKey: s?.foursquareApiKey || "",
    foursquareClientId: s?.foursquareClientId || "",
    foursquareClientSecret: s?.foursquareClientSecret || "",
    yelpApiKey: s?.yelpApiKey || "",
    defaultLat: s?.defaultLat || "",
    defaultLon: s?.defaultLon || "",
    defaultLocationLabel: s?.defaultLocationLabel || "Home",
    useBrowserGeolocation: s?.useBrowserGeolocation === true || s?.useBrowserGeolocation === "true",
    defaultRadius: s?.defaultRadius || "25",
    resultsCount: s?.resultsCount || "5",
    distanceUnit: s?.distanceUnit || "miles",
    photonBaseUrl: s?.photonBaseUrl || DEFAULT_PHOTON_URL,
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
      key: "foursquareApiKey",
      label: "Foursquare API key",
      type: "password",
      secret: true,
      description:
        "Optional. Provides rich business data (ratings, hours, phone) for Foursquare v3. Get one at foursquare.com/developers.",
    },
    {
      key: "foursquareClientId",
      label: "Foursquare v2 Client ID",
      type: "password",
      secret: true,
      description:
        "Optional (Legacy v2 fallback). Use with Foursquare v2 Client Secret if you do not have a v3 API key.",
    },
    {
      key: "foursquareClientSecret",
      label: "Foursquare v2 Client Secret",
      type: "password",
      secret: true,
      description:
        "Optional (Legacy v2 fallback). Use with Foursquare v2 Client ID.",
    },
    {
      key: "yelpApiKey",
      label: "Yelp API key",
      type: "password",
      secret: true,
      description:
        "Optional. Great for restaurants and bars. Get one at yelp.com/developers.",
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
      description: "Label shown in the card header, e.g. 'Home / Flemington NJ'.",
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
      placeholder: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=YOUR_KEY",
      description:
        "Optional raster tile template for the map. Supports {z}, {x}, and {y}. Leave blank to use the default OpenStreetMap embed.",
    },
    {
      key: "photonBaseUrl",
      label: "Photon base URL",
      type: "url",
      placeholder: DEFAULT_PHOTON_URL,
      default: DEFAULT_PHOTON_URL,
      description:
        "Open-data fallback geocoder. Default is Komoot's public instance.",
    },
  ],

  init(ctx) {
    if (typeof ctx?.fetch === "function") {
      _fetch = (...args) => ctx.fetch(...args);
    }
    if (typeof ctx?.createCache === "function") {
      _cache = ctx.createCache(5 * 60 * 1000); // 5 minutes
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
      Math.abs(lon) <= 180
    );
  },

  trigger(query) {
    return _looksProbablyPlaceQuery(query);
  },

  async execute(query, context) {
    // Defense-in-depth. Never trust trigger alone.
    if (!_looksProbablyPlaceQuery(query)) {
      return { html: "" };
    }

    try {
      const q = query.trim();

      const lat = parseFloat(_settings.defaultLat);
      const lon = parseFloat(_settings.defaultLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { html: "" };
      }

      const radiusMiles = parseInt(_settings.defaultRadius || "25", 10);
      const radiusMeters = radiusMiles * 1609.34;
      const limit = parseInt(_settings.resultsCount || "5", 10);
      const doFetch = typeof context?.fetch === "function" ? context.fetch : _fetch;

      const places = await _searchAllProviders(q, lat, lon, radiusMeters, limit * 2, doFetch);

      if (places.length === 0) return { html: "" };

      const top = _processPlaces(q, places, limit, {
        enforceDistanceGate: true,
        enforceConfidenceGate: true,
      });

      if (top.length === 0) {
        return { html: "" };
      }

      const html = _renderCard(
        top,
        q,
        _settings.defaultLocationLabel || "Home",
        _settings.useBrowserGeolocation
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
        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          if (request.body && typeof request.body === "object") body = request.body;
        }
        const { lat, lon, query } = body;
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
          return _jsonResponse({ error: "Invalid coordinates" }, 400);
        }

        const radiusMiles = parseInt(_settings.defaultRadius || "25", 10);
        const radiusMeters = radiusMiles * 1609.34;
        const limit = parseInt(_settings.resultsCount || "5", 10);

        const places = await _searchAllProviders(query || "", latNum, lonNum, radiusMeters, limit * 2, _fetch);

        if (places.length === 0) {
          return _jsonResponse({ html: "" });
        }

        const top = _processPlaces(query || "", places, limit, {
          enforceDistanceGate: false,
          enforceConfidenceGate: false,
        });

        const html = _renderCard(top, query || "", "your location", false);
        return _jsonResponse({ html });
      } catch (err) {
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

/* ------------------------------------------------------------------ */
/* Provider orchestration                                              */
/* ------------------------------------------------------------------ */

async function _searchAllProviders(query, lat, lon, radiusM, limit, doFetch) {
  const out = [];
  const providerCalls = [];

  // Foursquare and Yelp provide rich commercial metadata when configured.
  if (_settings.foursquareApiKey || (_settings.foursquareClientId && _settings.foursquareClientSecret)) {
    providerCalls.push(_searchFoursquare(query, lat, lon, radiusM, limit, doFetch));
  }

  if (_settings.yelpApiKey) {
    providerCalls.push(_searchYelp(query, lat, lon, radiusM, limit, doFetch));
  }

  // Overpass is always included so OSM details can improve commercial results.
  providerCalls.push(_searchOverpass(query, lat, lon, radiusM, limit, doFetch));

  const settled = await Promise.allSettled(providerCalls);
  for (const result of settled) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      out.push(...result.value);
    }
  }

  // Photon — free geocoder fallback (no key)
  if (out.length === 0) {
    try {
      const r = await _searchPhoton(query, lat, lon, radiusM, limit, doFetch);
      out.push(...r);
    } catch (_) {}
  }

  // Nominatim — free geocoder fallback (no key)
  if (out.length === 0) {
    try {
      const r = await _searchNominatim(query, lat, lon, limit, doFetch);
      out.push(...r);
    } catch (_) {}
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Individual providers                                                */
/* ------------------------------------------------------------------ */

async function _searchFoursquare(query, lat, lon, radiusM, limit, doFetch) {
  const cacheKey = `fq:${query}:${lat}:${lon}:${Math.round(radiusM)}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  let out = [];

  // V3 Flow
  if (_settings.foursquareApiKey) {
    try {
      const authHeader = _settings.foursquareApiKey.toLowerCase().startsWith("bearer ")
        ? _settings.foursquareApiKey
        : `Bearer ${_settings.foursquareApiKey}`;

      const fields = "name,location,geocodes,categories,tel,website,hours,rating,stats,fsq_id,distance,email,social_media,description,chains,price";
      const url =
        `${FOURSQUARE_BASE}?query=${encodeURIComponent(query)}` +
        `&ll=${encodeURIComponent(`${lat},${lon}`)}` +
        `&radius=${Math.round(radiusM)}` +
        `&limit=${limit}` +
        `&fields=${encodeURIComponent(fields)}`;

      const res = await doFetch(url, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
          "X-Places-Api-Version": "2025-06-17",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          for (const r of data.results) {
            const plat = r.geocodes?.main?.latitude;
            const plon = r.geocodes?.main?.longitude;
            if (plat == null || plon == null) continue;

            let phone = r.tel || null;
            let website = r.website || null;

            // Target top results to avoid slamming Overpass API (e.g. limit to first `limit` results)
            if (out.length < limit && (!phone || !website)) {
              const fallback = await _getVenueDetailsFromOverpass(r.name, plat, plon, doFetch);
              if (fallback) {
                phone = phone || fallback.phone;
                website = website || fallback.website;
              }
            }

            out.push({
              name: r.name,
              address: _fmtFsqAddress(r.location),
              lat: plat,
              lon: plon,
              distanceMeters: typeof r.distance === "number" ? r.distance : _haversine(lat, lon, plat, plon),
              phone,
              website,
              email: r.email || null,
              socialMedia: r.social_media || null,
              description: r.description || null,
              chains: (r.chains || []).map((c) => c.name).filter(Boolean),
              price: r.price || null,
              categories: (r.categories || []).map((c) => c.short_name || c.name).filter(Boolean),
              hours: r.hours ? { openNow: r.hours.open_now === true } : null,
              rating: r.rating ? r.rating / 2 : null,
              reviewCount: r.stats?.total_ratings || null,
              source: "Foursquare",
              sourceUrl: `https://foursquare.com/v/${r.fsq_id}`,
            });
          }
        }
      }
    } catch (err) {
      console.error("[places] Foursquare v3 query failed:", err);
    }
  }

  // V2 Fallback Flow (runs if v3 produced no results or wasn't configured, and we have v2 credentials)
  if (out.length === 0 && _settings.foursquareClientId && _settings.foursquareClientSecret) {
    try {
      const url = `https://api.foursquare.com/v2/venues/search` +
        `?ll=${encodeURIComponent(`${lat},${lon}`)}` +
        `&query=${encodeURIComponent(query)}` +
        `&client_id=${encodeURIComponent(_settings.foursquareClientId)}` +
        `&client_secret=${encodeURIComponent(_settings.foursquareClientSecret)}` +
        `&v=20210324` +
        `&limit=${limit}`;

      const res = await doFetch(url);
      if (res.ok) {
        const data = await res.json();
        const venues = data.response?.venues;
        if (Array.isArray(venues)) {
          for (const v of venues) {
            const plat = v.location?.lat;
            const plon = v.location?.lng;
            if (plat == null || plon == null) continue;

            let phone = null;
            let website = null;
            let rating = null;
            let reviewCount = null;
            let hours = null;
            let email = null;
            let description = null;
            let price = null;

            if (v.contact) {
              phone = v.contact.formattedPhone || v.contact.phone || null;
              email = v.contact.email || null;
            }
            if (v.url) {
              website = v.url;
            }

            // Fetch details for the first `limit` venues to keep it fast and respect quota limits
            if (out.length < limit) {
              try {
                const detailUrl = `https://api.foursquare.com/v2/venues/${v.id}` +
                  `?client_id=${encodeURIComponent(_settings.foursquareClientId)}` +
                  `&client_secret=${encodeURIComponent(_settings.foursquareClientSecret)}` +
                  `&v=20210324`;
                const detailRes = await doFetch(detailUrl);
                if (detailRes.ok) {
                  const detailData = await detailRes.json();
                  const dv = detailData.response?.venue;
                  if (dv) {
                    if (dv.contact) {
                      phone = dv.contact.formattedPhone || dv.contact.phone || phone;
                      email = dv.contact.email || email;
                    }
                    website = dv.url || dv.canonicalUrl || website;
                    if (typeof dv.rating === "number") {
                      rating = dv.rating / 2;
                    }
                    reviewCount = dv.ratingSignals || null;
                    if (dv.hours) {
                      hours = { openNow: dv.hours.isOpen === true };
                    }
                    if (dv.description) {
                      description = dv.description;
                    }
                    if (dv.price) {
                      price = dv.price.tier || null;
                    }
                  }
                }
              } catch (detailErr) {
                console.warn(`[places] Foursquare v2 detail fetch failed for ${v.id}:`, detailErr);
              }

              // Fallback to Overpass if details fetch failed/was skipped or phone/website are missing
              if (!phone || !website) {
                const fallback = await _getVenueDetailsFromOverpass(v.name, plat, plon, doFetch);
                if (fallback) {
                  phone = phone || fallback.phone;
                  website = website || fallback.website;
                }
              }
            }

            out.push({
              name: v.name,
              address: _fmtFsqAddress(v.location),
              lat: plat,
              lon: plon,
              distanceMeters: typeof v.location.distance === "number" ? v.location.distance : _haversine(lat, lon, plat, plon),
              phone,
              website,
              email,
              socialMedia: null,
              description,
              chains: [],
              price,
              categories: (v.categories || []).map((c) => c.shortName || c.name).filter(Boolean),
              hours,
              rating,
              reviewCount,
              source: "Foursquare",
              sourceUrl: `https://foursquare.com/v/${v.id}`,
            });
          }
        }
      }
    } catch (err) {
      console.error("[places] Foursquare v2 query failed:", err);
    }
  }

  _cache?.set(cacheKey, out);
  return out;
}

async function _searchYelp(query, lat, lon, radiusM, limit, doFetch) {
  const cacheKey = `yelp:${query}:${lat}:${lon}:${Math.round(radiusM)}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  const url =
    `${YELP_BASE}?term=${encodeURIComponent(query)}` +
    `&latitude=${lat}&longitude=${lon}` +
    `&radius=${Math.min(Math.round(radiusM), 40000)}` +
    `&limit=${limit}`;

  const res = await doFetch(url, {
    headers: {
      Authorization: `Bearer ${_settings.yelpApiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.businesses)) return [];

  const out = data.businesses
    .map((b) => {
      if (!b.coordinates?.latitude || !b.coordinates?.longitude) return null;
      const plat = b.coordinates.latitude;
      const plon = b.coordinates.longitude;
      const addrParts = [
        b.location?.address1,
        b.location?.city,
        b.location?.state,
        b.location?.zip_code,
      ].filter(Boolean);
      return {
        name: b.name,
        address: addrParts.join(", ") || b.location?.display_address?.join(", ") || "",
        lat: plat,
        lon: plon,
        distanceMeters: b.distance || _haversine(lat, lon, plat, plon),
        phone: b.phone || b.display_phone || null,
        website: b.url || null,
        categories: (b.categories || []).map((c) => c.title).filter(Boolean),
        hours: b.hours ? { openNow: b.hours[0]?.is_open_now === true } : null,
        rating: b.rating || null,
        reviewCount: b.review_count || null,
        source: "Yelp",
        sourceUrl: b.url || null,
      };
    })
    .filter(Boolean);

  _cache?.set(cacheKey, out);
  return out;
}

async function _searchOverpass(query, lat, lon, radiusM, limit, doFetch) {
  const cacheKey = `ov:${query}:${lat}:${lon}:${Math.round(radiusM)}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  const escaped = query.replace(/"/g, '\\"').replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const q = `[out:json][timeout:15];
(
  node["name"~"${escaped}",i](around:${Math.round(radiusM)},${lat},${lon});
  way["name"~"${escaped}",i](around:${Math.round(radiusM)},${lat},${lon});
  relation["name"~"${escaped}",i](around:${Math.round(radiusM)},${lat},${lon});
);
out center ${Math.max(limit * 2, 10)};
`.trim();

  const res = await doFetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": `degoog-places-slot/${PLUGIN_VERSION} (https://github.com/SoPat712/degoog-toolkit)`
    },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.elements)) return [];

  const out = data.elements
    .map((el) => {
      const tags = el.tags || {};
      const plat = el.lat ?? el.center?.lat;
      const plon = el.lon ?? el.center?.lon;
      if (plat == null || plon == null) return null;

      const categories = [];
      if (tags.amenity) categories.push(tags.amenity.replace(/_/g, " "));
      if (tags.shop) categories.push(tags.shop.replace(/_/g, " "));
      if (tags.tourism) categories.push(tags.tourism.replace(/_/g, " "));
      if (tags.leisure) categories.push(tags.leisure.replace(/_/g, " "));
      if (tags.office) categories.push(tags.office.replace(/_/g, " "));
      if (tags.craft) categories.push(tags.craft.replace(/_/g, " "));
      if (tags.healthcare) categories.push(tags.healthcare.replace(/_/g, " "));
      if (tags.cuisine) categories.push(tags.cuisine.replace(/;/g, ", "));
      if (categories.length === 0 && !tags.phone && !tags.website && !tags.opening_hours) return null;

      return {
        name: tags.name || query,
        address: _fmtOverpassAddress(tags),
        lat: plat,
        lon: plon,
        distanceMeters: _haversine(lat, lon, plat, plon),
        phone: tags.phone || null,
        website: tags.website || null,
        categories,
        hours: tags.opening_hours ? { openNow: null } : null,
        rating: null,
        reviewCount: null,
        source: "OpenStreetMap",
        sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      };
    })
    .filter(Boolean);

  _cache?.set(cacheKey, out);
  return out;
}

async function _searchPhoton(query, lat, lon, radiusM, limit, doFetch) {
  const cacheKey = `ph:${query}:${lat}:${lon}:${Math.round(radiusM)}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  const base = (_settings.photonBaseUrl || DEFAULT_PHOTON_URL).replace(/\/$/, "");
  const url =
    `${base}/api/?q=${encodeURIComponent(query)}` +
    `&lat=${lat}&lon=${lon}&limit=${limit}`;

  const res = await doFetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.features)) return [];

  const out = data.features
    .map((f) => {
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const plon = coords[0];
      const plat = coords[1];
      const p = f.properties || {};
      return {
        name: p.name || p.street || query,
        address: _fmtPhotonAddress(p),
        lat: plat,
        lon: plon,
        distanceMeters: _haversine(lat, lon, plat, plon),
        phone: null,
        website: null,
        categories: p.osm_value ? [p.osm_value.replace(/_/g, " ")] : [],
        hours: null,
        rating: null,
        reviewCount: null,
        source: "OpenStreetMap",
        sourceUrl: p.osm_type && p.osm_id
          ? `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`
          : `https://www.openstreetmap.org/?mlat=${plat}&mlon=${plon}`,
      };
    })
    .filter(Boolean);

  _cache?.set(cacheKey, out);
  return out;
}

async function _searchNominatim(query, lat, lon, limit, doFetch) {
  const cacheKey = `nm:${query}:${lat}:${lon}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  const url =
    `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}` +
    `&format=json&limit=${limit}&addressdetails=1` +
    `&lat=${lat}&lon=${lon}`;

  const res = await doFetch(url, {
    headers: {
      "User-Agent": `degoog-places-slot/${PLUGIN_VERSION}`,
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  const out = data
    .map((r) => {
      const plat = parseFloat(r.lat);
      const plon = parseFloat(r.lon);
      if (!Number.isFinite(plat) || !Number.isFinite(plon)) return null;
      return {
        name: r.name || r.display_name?.split(",")[0]?.trim() || query,
        address: _fmtNominatimAddress(r),
        lat: plat,
        lon: plon,
        distanceMeters: _haversine(lat, lon, plat, plon),
        phone: null,
        website: null,
        categories: r.type ? [r.type.replace(/_/g, " ")] : [],
        hours: null,
        rating: null,
        reviewCount: null,
        source: "OpenStreetMap",
        sourceUrl: `https://www.openstreetmap.org/?mlat=${plat}&mlon=${plon}`,
      };
    })
    .filter(Boolean);

  _cache?.set(cacheKey, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Normalization & dedupe                                              */
/* ------------------------------------------------------------------ */

function _dedupeAndMergePlaces(places) {
  const out = [];
  for (const p of places) {
    const norm = _normalizeName(p.name);
    let existing = null;
    for (const e of out) {
      const dist = _haversine(p.lat, p.lon, e.lat, e.lon);
      const eNorm = _normalizeName(e.name);
      const nameSimilar =
        norm === eNorm ||
        (norm.length > 4 && eNorm.includes(norm)) ||
        (eNorm.length > 4 && norm.includes(eNorm));
      const samePhone = p.phone && e.phone && p.phone === e.phone;
      const sameWebsite = p.website && e.website && p.website === e.website;
      if (dist < 75 && (nameSimilar || samePhone || sameWebsite)) {
        existing = e;
        break;
      }
    }
    if (existing) {
      if (!existing.phone && p.phone) existing.phone = p.phone;
      if (!existing.website && p.website) existing.website = p.website;
      if (!existing.email && p.email) existing.email = p.email;
      if (!existing.description && p.description) existing.description = p.description;
      if (!existing.price && p.price) existing.price = p.price;
      if (existing.rating == null && p.rating != null) {
        existing.rating = p.rating;
        existing.reviewCount = p.reviewCount;
      }
      if (p.categories && p.categories.length) {
        const cats = new Set([...existing.categories, ...p.categories]);
        existing.categories = Array.from(cats);
      }
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

function _processPlaces(query, rawPlaces, limit, options = {}) {
  const deduped = _dedupeAndMergePlaces(rawPlaces);
  const q = _normalizeName(query);
  const words = _wordCount(query);

  const closestDistance = Math.min(
    ...deduped
      .map((p) => p.distanceMeters ?? Infinity)
      .filter((d) => isFinite(d))
  );

  if (options.enforceDistanceGate && words === 1 && closestDistance > 35 * 1609.34) {
    return [];
  }

  const scored = deduped.map((place) => {
    const name = _normalizeName(place.name);
    const score = _tokenOverlapScore(q, name);

    let distanceConfidence = 1;
    const distKm = (place.distanceMeters ?? Infinity) / 1000;

    if (distKm > 50) {
      distanceConfidence = score > 0.9 ? 1 : 0.3;
    } else if (distKm > 25) {
      distanceConfidence = 0.7 + (0.3 * Math.max(0, 1 - (distKm - 25) / 50));
    } else if (distKm > 10) {
      distanceConfidence = 0.85 + (0.15 * Math.max(0, 1 - (distKm - 10) / 15));
    } else {
      distanceConfidence = 1;
    }

    return {
      ...place,
      _matchScore: score,
      _distanceConfidence: distanceConfidence,
      _compositeScore: score * distanceConfidence,
    };
  });

  const filtered = scored.filter((place) => {
    if (options.enforceConfidenceGate) {
      if (place._matchScore < 0.55) return false;
      if (closestDistance > 40 * 1000 && place._matchScore < 0.75) return false;

      const hasLocation = place.address || (place.lat && place.lon);
      const hasBusinessData = place.categories?.length || place.phone || place.website;

      if (!hasLocation || !hasBusinessData) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
  });

  return filtered.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function _renderCard(places, query, locationLabel, showGeoBtn) {
  const unit = _settings.distanceUnit || "miles";
  const unitAbbr = unit === "km" ? "km" : "mi";

  const cards = places
    .map((p, index) => {
      const distVal = unit === "km" ? p.distanceMeters / 1000 : p.distanceMeters / 1609.34;
      const dist = distVal < 0.1 ? "<0.1" : distVal.toFixed(1);
      const displayAddress = _shortAddress(p.address);

      const stars = p.rating
        ? `<span class="places-stars">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}</span>` +
          `<span class="places-rating-num">${p.rating.toFixed(1)}</span>`
        : "";
      const reviews = p.reviewCount ? `<span class="places-review-count">(${p.reviewCount})</span>` : "";
      const ratingHtml = stars ? `<span class="places-rating">${stars}${reviews}</span>` : "";

      const hoursHtml = p.hours
        ? p.hours.openNow === true
          ? `<span class="places-hours places-hours-open">Open now</span>`
          : p.hours.openNow === false
            ? `<span class="places-hours places-hours-closed">Closed</span>`
            : ""
        : "";

      const catsHtml = p.categories
        .slice(0, 3)
        .map((c) => `<span class="places-category">${_esc(c)}</span>`)
        .join("") || "";

      const priceHtml = p.price ? `<span class="places-price">${"$".repeat(p.price)}</span>` : "";

      const descHtml = p.description
        ? `<p class="places-description" title="${_esc(p.description)}">${_esc(p.description.substring(0, 100))}${p.description.length > 100 ? "…" : ""}</p>`
        : "";

      return `
<div
  class="places-card${index === 0 ? " places-card-selected" : ""}"
  data-place-card
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
  <div class="places-meta">
    ${ratingHtml}
    ${hoursHtml}
    ${catsHtml}
    ${priceHtml}
  </div>
  <p class="places-address" title="${_esc(p.address)}">${_esc(displayAddress)}</p>
  ${descHtml}
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
<div class="places-wrap slot-full-width">
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
  const mapPlace = places.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!mapPlace) return "";

  const tileUrl = (_settings.customTileUrl && _isTileTemplate(_settings.customTileUrl))
    ? _settings.customTileUrl
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  const viewUrl =
    "https://www.openstreetmap.org/" +
    `?mlat=${encodeURIComponent(mapPlace.lat)}` +
    `&mlon=${encodeURIComponent(mapPlace.lon)}` +
    `#map=15/${encodeURIComponent(mapPlace.lat)}/${encodeURIComponent(mapPlace.lon)}`;

  return `
    <aside
      class="places-map"
      data-map-panel
      data-lat="${_esc(String(mapPlace.lat))}"
      data-lon="${_esc(String(mapPlace.lon))}"
      data-place-name="${_esc(mapPlace.name)}"
      aria-label="Map centered on ${_esc(mapPlace.name)}"
    >
      <div
        class="places-tile-map"
        data-tile-template="${_esc(tileUrl)}"
        data-lat="${_esc(String(mapPlace.lat))}"
        data-lon="${_esc(String(mapPlace.lon))}"
        data-zoom="15"
        role="img"
        aria-label="Map for ${_esc(mapPlace.name)}"
      >
        <div class="places-tile-layer"></div>
        <span class="places-map-pin" aria-hidden="true"></span>
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
/* Conservative place query gate                                       */
/* ------------------------------------------------------------------ */

const LOCAL_INTENT_RE =
  /\b(near me|nearby|nearest|closest|locations?|address|directions?|hours?|open now|phone|menu|reservations?|reviews?|in [a-z .'-]+|near [a-z .'-]+)\b/i;

const PLACE_CATEGORY_RE =
  /\b(restaurant|restaurants|tavern|tap|bar|grill|cafe|coffee|pizza|diner|bakery|brewery|pub|pharmacy|grocery|supermarket|market|bank|hotel|motel|gas station|store|shop|salon|gym|doctor|dentist|hospital|urgent care|auto|car wash|costco|target|walmart|home depot|lowe'?s|starbucks|mcdonald'?s|chipotle|domino'?s)\b/i;

// Known chains/brands that are unambiguously physical places (can trigger as single words with local intent nearby).
const KNOWN_CHAIN_RE =
  /\b(costco|target|walmart|starbucks|mcdonald'?s|burger\s*king|wendy'?s|taco\s*bell|chipotle|domino'?s|pizza\s*hut|papa\s*john'?s|subway|dunkin'?|dunkin\s*donuts|kfc|five\s*guys|shake\s*shack|in-n-out|chick-fil-a|panera|olive\s*garden|red\s*lobster|longhorn|texas\s*roadhouse|cracker\s*barrel|ihop|denny'?s|applebee'?s|chili'?s|outback|buffalo\s*wild\s*wings|home\s*depot|lowe'?s|menards|best\s*buy|staples|office\s*depot|petco|petsmart|whole\s*foods|trader\s*joe'?s|kroger|safeway|albertsons|publix|wegmans|cvs|walgreens|rite\s*aid|sheetz|wawa|buc-ee'?s|flying\s*j|love'?s|pilot|speedway|shell|bp|exxon|mobil|sunoco|citgo|marathon|7-eleven|circle\s*k|royal\s*farms)\b/i;

const NON_PLACE_RE =
  /\b(how to|what is|why|when|who|reddit|github|docs|documentation|install|download|error|fix|linux|macos|windows|npm|pip|python|javascript|typescript|docker|nginx|proxmox|ai|llm|model|qwen|claude|gpt|gemini|ollama|benchmark|review|vs|price|best)\b/i;

const GENERAL_INFO_RE =
  /\b(tutorial|course|book|pdf|lyrics|chords|movie|show|cast|actor|actress|season|episode|news|wiki|wikipedia|definition|meaning|synonym|antonym|pronunciation|translate|translation|weather|forecast|stock|chart|price|convert|converter|calculator|calculate|history|biography|photo|image|picture|wallpaper|video|youtube|song|album|lyrics|map|maps|recipe|ingredients|cooking)\b/i;

const TECH_SCIENCE_RE =
  /\b(react|angular|vue|svelte|node|npm|pip|python|javascript|typescript|golang|rust|java|c\+\+|c#|php|html|css|sql|git|docker|kubernetes|aws|azure|gcp|api|json|xml|csv|yaml|markdown|github|gitlab|bitbucket|stackoverflow|mdn|w3schools|npm|package|library|framework|module|class|function|object|array|string|number|boolean|null|undefined|regexp|regex|compiler|interpreter|theory|theorem|equation|formula|chemical|molecule|atom|cell|organism|species|evolution|math|physics|chemistry|biology)\b/i;

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

function _looksProbablyPlaceQuery(rawQuery) {
  const query = _normalizeQuery(rawQuery);
  const lower = query.toLowerCase();
  const words = _wordCount(query);

  if (!query || query.length < 3) return false;
  if (query.length > 80) return false;
  if (URL_OR_CODE_RE.test(query)) return false;

  // Explicit local intent always gets a chance, unless it looks like code.
  if (LOCAL_INTENT_RE.test(lower)) return true;

  // Obvious informational/software/scientific/tech searches should not trigger.
  if (NON_PLACE_RE.test(lower) || GENERAL_INFO_RE.test(lower) || TECH_SCIENCE_RE.test(lower)) {
    return false;
  }

  // Single-word queries: let distance gate decide.
  if (words === 1) {
    return true;
  }

  // Multi-word queries: 2 to 6 words.
  if (words >= 2 && words <= 6) {
    return true;
  }

  return false;
}

function _normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "and")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function _tokenSet(value) {
  return new Set(_normalizeName(value).split(" ").filter(Boolean));
}

function _tokenOverlapScore(a, b) {
  const aa = _tokenSet(a);
  const bb = _tokenSet(b);
  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  for (const token of aa) {
    if (bb.has(token)) overlap++;
  }

  return overlap / Math.min(aa.size, bb.size);
}

// Scored, filtered, and sorted by composite scoring in _processPlaces.

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

function _fmtFsqAddress(loc) {
  if (!loc) return "";
  const parts = [
    loc.address,
    loc.locality || loc.city,
    loc.region || loc.state,
    loc.postcode || loc.postalCode,
    loc.country,
  ].filter(Boolean);
  return parts.join(", ");
}

async function _getVenueDetailsFromOverpass(name, lat, lon, doFetch) {
  if (!name) return null;
  const escaped = name.replace(/"/g, '\\"').replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const q = `[out:json][timeout:10];
(
  node["name"~"${escaped}",i](around:150,${lat},${lon});
  way["name"~"${escaped}",i](around:150,${lat},${lon});
  relation["name"~"${escaped}",i](around:150,${lat},${lon});
);
out tags center 5;`.trim();

  try {
    const res = await doFetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `degoog-places-slot/${PLUGIN_VERSION} (https://github.com/SoPat712/degoog-toolkit)`
      },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        const tags = el.tags || {};
        const phone = tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null;
        const website = tags.website || tags["contact:website"] || tags.url || null;
        if (phone || website) {
          return { phone, website };
        }
      }
    }
  } catch (err) {
    console.warn(`[places] Overpass details fetch failed for ${name}:`, err);
  }
  return null;
}

function _fmtOverpassAddress(tags) {
  const parts = [
    tags["addr:housenumber"] ? `${tags["addr:housenumber"]} ${tags["addr:street"] || ""}` : tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
    tags["addr:country"],
  ].filter(Boolean);
  return parts.join(", ");
}

function _fmtPhotonAddress(p) {
  const parts = [
    p.name && p.name !== p.street ? p.name : null,
    p.housenumber ? `${p.housenumber} ${p.street || ""}` : p.street,
    p.district || p.borough,
    p.city || p.town || p.village || p.municipality,
    p.state,
    p.postcode,
    p.country,
  ].filter(Boolean);
  return parts.join(", ");
}

function _fmtNominatimAddress(r) {
  const a = r.address;
  if (a && typeof a === "object") {
    const parts = [
      [a.house_number, a.house_name].filter(Boolean).join(" ") || null,
      a.road || a.pedestrian || null,
      a.suburb || a.neighbourhood || null,
      a.city || a.town || a.village || a.hamlet || null,
      a.state || a.region || null,
      a.postcode || null,
      a.country || null,
    ].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return r.display_name || "";
}
