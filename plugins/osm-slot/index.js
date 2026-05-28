// Places slot plugin — local place recognition with Foursquare, Photon, and Nominatim.

const PLUGIN_NAME = "Places";
const PLUGIN_VERSION = "2.0.0";
const PLUGIN_DESCRIPTION =
  "Local place recognition — shows nearby businesses and POIs with address, hours, phone, and directions.";

let _settings = {};
let _fetch = (...args) => fetch(...args);
let _cache = null;

const DEFAULT_PHOTON_URL = "https://photon.komoot.io";
const FOURSQUARE_BASE = "https://api.foursquare.com/v3/places/search";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

function _configure(s) {
  _settings = {
    foursquareApiKey: s?.foursquareApiKey || "",
    defaultLat: s?.defaultLat || "",
    defaultLon: s?.defaultLon || "",
    defaultLocationLabel: s?.defaultLocationLabel || "Home",
    useBrowserGeolocation: s?.useBrowserGeolocation === true || s?.useBrowserGeolocation === "true",
    defaultRadius: s?.defaultRadius || "25",
    resultsCount: s?.resultsCount || "5",
    distanceUnit: s?.distanceUnit || "miles",
    photonBaseUrl: s?.photonBaseUrl || DEFAULT_PHOTON_URL,
  };
}

export const slot = {
  id: "osm-slot",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],

  settingsSchema: [
    {
      key: "foursquareApiKey",
      label: "Foursquare API key",
      type: "password",
      secret: true,
      description:
        "Optional. Provides rich business data (ratings, hours, phone). Get one at foursquare.com/developers.",
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
      options: ["3", "5", "10"],
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
    const q = query.trim().toLowerCase();
    if (q.length < 2) return false;

    // Local-intent keywords always pass through to execute.
    if (/(near me|locations?|hours?|address|phone|open now|directions?)/i.test(q)) {
      return true;
    }

    // Brand / place-like queries: short, not questions, not code.
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 8) return false;

    if (/^(what|how|why|when|where|who|is|are|does|do|can|should|would|could|will|did|has|have|was|were)\b/i.test(q)) {
      return false;
    }
    if (/\?\s*$/.test(q)) return false;
    if (/^https?:\/\//.test(q)) return false;
    if (/\b(error|exception|stack trace|debug|console\.log|npm|pip|git|python|javascript|java|cpp|c\+\+|rust|golang|docker|kubernetes|sql)\b/i.test(q)) {
      return false;
    }
    if (/\b(calculator|calculate|convert|conversion|percent|currency|exchange|stock|weather|forecast|define|meaning|synonym|translate)\b/i.test(q)) {
      return false;
    }

    return true;
  },

  async execute(query, context) {
    try {
      const q = query.trim();
      const qLower = q.toLowerCase();

      const lat = parseFloat(_settings.defaultLat);
      const lon = parseFloat(_settings.defaultLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { html: "" };
      }

      const localIntentRe = /\b(near me|locations?|hours?|address|phone|open now|directions?)\b/i;
      const hasLocalIntent = localIntentRe.test(qLower);

      let searchQuery = q.replace(localIntentRe, "").trim();
      if (searchQuery.length < 2) searchQuery = q;

      if (!hasLocalIntent && _isClearlyNonPlaceQuery(searchQuery)) {
        return { html: "" };
      }

      const radiusMiles = parseInt(_settings.defaultRadius || "25", 10);
      const radiusMeters = radiusMiles * 1609.34;
      const limit = parseInt(_settings.resultsCount || "5", 10);
      const doFetch = typeof context?.fetch === "function" ? context.fetch : _fetch;

      let places = [];

      if (_settings.foursquareApiKey) {
        places = await _searchFoursquare(searchQuery, lat, lon, radiusMeters, limit * 2, doFetch);
      }

      if (places.length === 0) {
        places = await _searchPhoton(searchQuery, lat, lon, radiusMeters, limit * 2, doFetch);
      }

      if (places.length === 0) {
        places = await _searchNominatim(searchQuery, lat, lon, limit * 2, doFetch);
      }

      if (places.length === 0) return { html: "" };

      places = _dedupePlaces(places);
      places = _rankPlaces(places, searchQuery);

      // For brand queries without local intent, require at least one business-like result.
      if (!hasLocalIntent) {
        const hasBusiness = places.some(
          (p) => p.source === "Foursquare" || p.phone || p.website || p.categories.length > 0
        );
        if (!hasBusiness) return { html: "" };
      }

      places = places.slice(0, limit);

      const html = _renderCard(
        places,
        searchQuery,
        _settings.defaultLocationLabel || "Home",
        _settings.useBrowserGeolocation
      );
      return { html };
    } catch (err) {
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
          // some proxies may pre-parse
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

        let places = [];
        if (_settings.foursquareApiKey) {
          places = await _searchFoursquare(query || "", latNum, lonNum, radiusMeters, limit * 2, _fetch);
        }
        if (places.length === 0) {
          places = await _searchPhoton(query || "", latNum, lonNum, radiusMeters, limit * 2, _fetch);
        }
        if (places.length === 0) {
          places = await _searchNominatim(query || "", latNum, lonNum, limit * 2, _fetch);
        }

        if (places.length === 0) {
          return _jsonResponse({ html: "" });
        }

        places = _dedupePlaces(places);
        places = _rankPlaces(places, query || "");
        places = places.slice(0, limit);

        const html = _renderCard(places, query || "", "your location", false);
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
/* Providers                                                           */
/* ------------------------------------------------------------------ */

async function _searchFoursquare(query, lat, lon, radiusM, limit, doFetch) {
  const cacheKey = `fq:${query}:${lat}:${lon}:${Math.round(radiusM)}:${limit}`;
  const cached = _cache?.get(cacheKey);
  if (cached) return cached;

  const fields = "name,location,geocodes,categories,tel,website,hours,rating,stats,fsq_id,distance";
  const url =
    `${FOURSQUARE_BASE}?query=${encodeURIComponent(query)}` +
    `&ll=${encodeURIComponent(`${lat},${lon}`)}` +
    `&radius=${Math.round(radiusM)}` +
    `&limit=${limit}` +
    `&fields=${encodeURIComponent(fields)}`;

  const res = await doFetch(url, {
    headers: {
      Authorization: _settings.foursquareApiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.results)) return [];

  const out = data.results
    .map((r) => {
      const plat = r.geocodes?.main?.latitude;
      const plon = r.geocodes?.main?.longitude;
      if (plat == null || plon == null) return null;
      return {
        name: r.name,
        address: _fmtFsqAddress(r.location),
        lat: plat,
        lon: plon,
        distanceMeters: typeof r.distance === "number" ? r.distance : _haversine(lat, lon, plat, plon),
        phone: r.tel || null,
        website: r.website || null,
        categories: (r.categories || []).map((c) => c.short_name || c.name).filter(Boolean),
        hours: r.hours ? { openNow: r.hours.open_now === true } : null,
        rating: r.rating ? r.rating / 2 : null,
        reviewCount: r.stats?.total_ratings || null,
        source: "Foursquare",
        sourceUrl: `https://foursquare.com/v/${r.fsq_id}`,
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

function _dedupePlaces(places) {
  const out = [];
  for (const p of places) {
    const norm = _normalizeName(p.name);
    let dup = false;
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
        dup = true;
        break;
      }
    }
    if (!dup) out.push(p);
  }
  return out;
}

function _rankPlaces(places, queryRaw) {
  const q = (queryRaw || "").toLowerCase().trim();
  const qNorm = _normalizeName(q);

  return places
    .map((p) => {
      let score = 0;
      const pNorm = _normalizeName(p.name);

      if (pNorm === qNorm) score += 100;
      else if (pNorm.startsWith(qNorm)) score += 80;
      else if (pNorm.includes(qNorm)) score += 60;

      if (p.distanceMeters != null) {
        score += Math.max(0, 50 - p.distanceMeters / 1000);
      }

      if (p.hours?.openNow === true) score += 30;
      else if (p.hours?.openNow === false) score -= 5;

      if (p.source === "Foursquare") score += 20;
      else if (p.source === "Yelp") score += 15;
      else if (p.source === "Apple Maps") score += 10;

      if (p.rating) score += Math.min(25, p.rating * 5);
      if (p.reviewCount) score += Math.min(10, p.reviewCount / 50);

      if (p.phone) score += 4;
      if (p.website) score += 4;
      if (p.hours) score += 4;

      return { place: p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.place);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function _renderCard(places, query, locationLabel, showGeoBtn) {
  const unit = _settings.distanceUnit || "miles";
  const unitAbbr = unit === "km" ? "km" : "mi";

  const cards = places
    .map((p) => {
      const distVal = unit === "km" ? p.distanceMeters / 1000 : p.distanceMeters / 1609.34;
      const dist = distVal < 0.1 ? "<0.1" : distVal.toFixed(1);

      const stars = p.rating
        ? `<span class="places-stars">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}</span>` +
          `<span class="places-rating-num">${p.rating.toFixed(1)}</span>`
        : "";
      const reviews = p.reviewCount ? `<span class="places-review-count">(${p.reviewCount})</span>` : "";
      const ratingHtml = stars ? `<span class="places-rating">${stars}${reviews}</span>` : "";

      const hoursHtml = p.hours
        ? p.hours.openNow
          ? `<span class="places-hours places-hours-open">Open now</span>`
          : `<span class="places-hours places-hours-closed">Closed</span>`
        : "";

      const catsHtml = p.categories
        .slice(0, 3)
        .map((c) => `<span class="places-category">${_esc(c)}</span>`)
        .join("") || "";

      const phoneHtml = p.phone
        ? `<a class="places-action" href="tel:${_esc(p.phone)}">Call</a>`
        : "";
      const websiteHtml = p.website
        ? `<a class="places-action" href="${_esc(p.website)}" target="_blank" rel="noopener noreferrer">Website</a>`
        : "";

      const appleUrl = `https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lon}`;
      const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + p.address)}`;

      return `
<div class="places-card">
  <div class="places-card-header">
    <h3 class="places-name">${_esc(p.name)}</h3>
    <span class="places-distance">${dist} ${unitAbbr}</span>
  </div>
  <div class="places-meta">
    ${ratingHtml}
    ${hoursHtml}
    ${catsHtml}
  </div>
  <p class="places-address">${_esc(p.address)}</p>
  <div class="places-actions">
    ${websiteHtml}
    ${phoneHtml}
    <a class="places-action places-action-maps" href="${_esc(appleUrl)}" target="_blank" rel="noopener noreferrer">Apple Maps</a>
    <a class="places-action places-action-maps" href="${_esc(googleUrl)}" target="_blank" rel="noopener noreferrer">Google Maps</a>
  </div>
</div>`;
    })
    .join("");

  const geoBtn = showGeoBtn
    ? `<button type="button" class="places-geo-btn" data-query="${_esc(query)}">Use my location</button>`
    : "";

  return `
<div class="places-wrap slot-full-width">
  <div class="places-header">
    <span class="places-label">Places</span>
    <span class="places-subhead">near ${_esc(locationLabel)}</span>
    ${geoBtn}
  </div>
  <div class="places-grid">
    ${cards}
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function _isClearlyNonPlaceQuery(q) {
  const lower = q.toLowerCase();
  if (/^(what|how|why|when|where|who|is|are|does|do|can|should|would|could|will|did|has|have|was|were)\b/i.test(lower)) return true;
  if (/\b(calculator|calculate|convert|conversion|percent|currency|exchange|stock|weather|forecast|define|meaning|synonym|translate|tip|gratuity|split bill)\b/i.test(lower)) return true;
  if (/\b(error|exception|stack trace|debug|console\.log|npm|pip|git|python|javascript|java|cpp|c\+\+|rust|golang|docker|kubernetes|sql)\b/i.test(lower)) return true;
  return false;
}

function _normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    loc.postcode,
    loc.country,
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
