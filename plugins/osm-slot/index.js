let showMode = "keyword";
let defaultZoom = 13;
let tileUrlTemplate = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const slot = {
  id: "osm-slot",
  name: "OpenStreetMap",
  description: "Shows an interactive map for location-related queries",
  position: "above-results",

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["always", "keyword"],
      description: "Always: every search. Keyword: map / where is / street-style queries (e.g. Rd, Ln) and similar.",
    },
    {
      key: "defaultZoom",
      label: "Default zoom level",
      type: "select",
      options: ["5", "8", "11", "13", "15"],
      description: "Higher = more zoomed in. 13 is a good default for cities.",
    },
    {
      key: "tileUrlTemplate",
      label: "Tile URL template",
      type: "text",
      placeholder: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=YOUR_KEY",
      description: "Optional custom tiles URL. Leave blank to use OpenStreetMap default.",
    },
  ],

  configure(settings) {
    showMode = settings?.showMode === "always" ? "always" : "keyword";
    const z = parseInt(settings?.defaultZoom ?? "13", 10);
    defaultZoom = Number.isFinite(z) ? z : 13;
    tileUrlTemplate = _normalizeTileUrl(settings?.tileUrlTemplate);
  },

  trigger(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 3) return false;
    if (showMode === "always") return true;
    if (
      /\b(map|maps|where is|where's|wheres|where\s+\d+|locate|location|city|address|addresses|street|streets|near|directions?|how far|capital of|coordinates?|postcode|zip code|zip)\b/i.test(
        q,
      )
    ) {
      return true;
    }
    return _looksLikeStreetOrAddressQuery(q);
  },

  async execute(query, context) {
    try {
      // Strip map-trigger words for cleaner geocoding
      const cleanQuery = query
        .replace(
          /\b(map|maps|where is|where's|wheres|where\s+\d+|locate|location|near me|directions?|how far|show me|find)\b/gi,
          "",
        )
        .trim();
      const searchQuery = cleanQuery.length > 2 ? cleanQuery : query.trim();

      const wordCount = searchQuery.trim().split(/\s+/).filter(Boolean).length;
      const maxWords = _maxWordsForGeocodeQuery(searchQuery);
      if (wordCount > maxWords) return { html: "" };

      // Reject queries with common non-place words
      if (/\b(alternative|how|why|what|when|best|top|list|vs|versus|review|tutorial|guide|example|free|download|install|price|cost|buy|cheap)\b/i.test(searchQuery)) {
        return { html: "" };
      }

      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=10&addressdetails=1`;
      const geoRes = await fetch(geoUrl, {
        headers: {
          "User-Agent": "degoog-osm-slot/1.0",
          "Accept-Language": "en",
        },
      });

      if (!geoRes.ok) return { html: "" };

      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) return { html: "" };

      const usable = geoData.filter((r) =>
        _isOsmGeocodeResultUsable(r, searchQuery),
      );
      if (usable.length === 0) return { html: "" };

      const ranked = _rankOsmResults(usable, searchQuery);
      const place = ranked[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const displayName = place.display_name || searchQuery;
      const shortName = _osmShortLabel(place, searchQuery);
      const zoom = _zoomForOsmResult(place, defaultZoom, searchQuery);

      const mapId = `osm-map-${Date.now()}`;
      const navCandidates = ranked.slice(0, 6).map((r) => ({
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        zoom: _zoomForOsmResult(r, defaultZoom, searchQuery),
        shortName: _osmShortLabel(r, searchQuery),
        displayName: r.display_name || searchQuery,
      }));
      const candidatesAttr = encodeURIComponent(JSON.stringify(navCandidates));

      const navBlock =
        navCandidates.length > 1
          ? `<div class="osm-slot-match-nav is-visible" aria-label="Other geocode matches">
  <button type="button" class="osm-slot-nav-btn osm-slot-nav-prev" aria-label="Previous match">‹</button>
  <span class="osm-slot-nav-meta"><span class="osm-slot-nav-cur">1</span> / ${navCandidates.length}</span>
  <button type="button" class="osm-slot-nav-btn osm-slot-nav-next" aria-label="Next match">›</button>
</div>`
          : "";

      const html = `
<div class="osm-slot-wrap slot-full-width">
  <div class="osm-slot-header">
    <svg width=\"28\" height=\"28\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"10\" cy=\"10\" r=\"10\" fill=\"rgba(255,255,255,0.12)\"/><circle cx=\"10\" cy=\"10\" r=\"5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\"/><path d=\"M10 4.5c-1.5 1.5-2.5 3.3-2.5 5.5s1 4 2.5 5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/><path d=\"M10 4.5c1.5 1.5 2.5 3.3 2.5 5.5s-1 4-2.5 5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/><line x1=\"4.5\" y1=\"10\" x2=\"15.5\" y2=\"10\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></svg>
    <span class="osm-slot-label">OpenStreetMap</span>
    <span class="osm-slot-city">${_esc(shortName)}</span>
    ${navBlock}
    <a class="osm-slot-open" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=${zoom}" target="_blank" rel="noopener noreferrer">Open in OSM ↗</a>
  </div>
  <div class="osm-map-container" id="${mapId}" data-lat="${lat}" data-lon="${lon}" data-zoom="${zoom}" data-name="${_esc(displayName)}" data-tile-url="${_esc(tileUrlTemplate)}" data-osm-candidates="${candidatesAttr}"></div>
</div>`;

      return { html };
    } catch (err) {
      return { html: "" };
    }
  },
};

export default { slot };

function _esc(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function _normalizeTileUrl(value) {
  const fallback = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!/^https?:\/\//i.test(trimmed)) return fallback;
  if (!trimmed.includes("{z}") || !trimmed.includes("{x}") || !trimmed.includes("{y}")) {
    return fallback;
  }
  return trimmed;
}

/** Street / road tokens so the slot can fire without "map" or "where is". */
const _STREET_SUFFIX_RE =
  /\b(?:st\.?|streets?|rd\.?|roads?|ave\.?|avenues?|ln\.?|lanes?|dr\.?|drives?|ct\.?|courts?|cir\.?|circles?|blvd\.?|boulevards?|pl\.?|places?|ways?|pkwy\.?|parkways?|hwy|highways?|trl\.?|trails?|ter\.?|terraces?|sq\.?|squares?|routes?|rte\.?|crt|mews|crescents?)\b/i;

function _hasStreetSuffixToken(q) {
  return _STREET_SUFFIX_RE.test(q);
}

function _looksLikeStreetOrAddressQuery(q) {
  if (_hasStreetSuffixToken(q)) return true;
  if (/\b\d{5}(-\d{4})?\b/.test(q)) return true;
  return false;
}

function _maxWordsForGeocodeQuery(s) {
  const hasDigit = /\d/.test(s);
  if (hasDigit && _hasStreetSuffixToken(s)) return 16;
  if (_hasStreetSuffixToken(s)) return 10;
  if (hasDigit) return 12;
  return 5;
}

function _isOsmGeocodeResultUsable(r, queryRaw) {
  if (!r || typeof r !== "object") return false;
  const q = (queryRaw || "").toLowerCase();
  const at = (r.addresstype || "").toLowerCase();
  const typ = (r.type || "").toLowerCase();
  const cls = (r.class || "").toLowerCase();

  const placeLike = new Set([
    "city",
    "town",
    "village",
    "municipality",
    "hamlet",
    "suburb",
    "quarter",
    "neighbourhood",
    "locality",
    "borough",
    "city_district",
    "county",
    "state",
    "country",
    "region",
    "province",
    "district",
    "postcode",
  ]);

  if (placeLike.has(at) || placeLike.has(typ) || placeLike.has(cls)) return true;

  const addressLike = new Set([
    "house",
    "building",
    "retail",
    "commercial",
    "industrial",
    "apartments",
    "terrace",
    "houseboat",
    "farm",
  ]);
  if (addressLike.has(typ) || addressLike.has(at)) return true;

  if (
    cls === "highway" &&
    (typ === "residential" ||
      typ === "living_street" ||
      typ === "pedestrian" ||
      typ === "unclassified" ||
      typ === "road" ||
      typ === "tertiary" ||
      typ === "secondary" ||
      typ === "primary")
  ) {
    return true;
  }

  const addr = r.address && typeof r.address === "object" ? r.address : null;
  if (
    addr &&
    (addr.house_number || addr.house_name) &&
    (addr.road || addr.pedestrian || addr.path || addr.footway)
  ) {
    return true;
  }
  if (addr && addr.building && (addr.road || addr.city || addr.town || addr.village)) {
    return true;
  }

  const queryLooksAddressy = _hasStreetSuffixToken(q) || /\d/.test(q);
  if (
    queryLooksAddressy &&
    (cls === "shop" || cls === "amenity" || cls === "office" || cls === "tourism") &&
    addr &&
    (addr.road || addr.city || addr.town || addr.village || addr.hamlet)
  ) {
    return true;
  }

  return false;
}

function _osmShortLabel(place, searchQuery) {
  const a = place?.address;
  if (a && typeof a === "object") {
    const house = [a.house_number, a.house_name].filter(Boolean).join(" ").trim();
    const parts = [
      house || null,
      a.road || a.pedestrian || null,
      a.suburb || a.neighbourhood || null,
      a.city || a.town || a.village || a.hamlet || null,
      a.state || a.region || null,
      a.postcode || null,
      a.country || null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.slice(0, 5).join(", ");
  }
  const dn = place.display_name || searchQuery;
  return dn
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

/** House number + road line, or explicit street suffix — use tight street zoom heuristics. */
function _queryImpliesStreetLevelMap(q) {
  const s = (q || "").trim().toLowerCase();
  if (_hasStreetSuffixToken(s)) return true;
  return /^\d+[a-z]?\s+\S/.test(s);
}

function _rankOsmResults(usable, searchQuery) {
  const scored = usable.map((r) => ({
    r,
    s: _scoreOsmCandidate(r, searchQuery),
  }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map(({ r }) => r);
}

function _scoreOsmCandidate(r, queryRaw) {
  const q = (queryRaw || "").toLowerCase().trim();
  if (!q) return 0;
  const dn = (r.display_name || "").toLowerCase();
  const addr = r.address && typeof r.address === "object" ? r.address : {};
  let score = 0;

  const at = (r.addresstype || "").toLowerCase();
  const typ = (r.type || "").toLowerCase();
  const queryWantsAddress =
    _hasStreetSuffixToken(q) || /^\d+[a-z]?\s+\S/.test(q.trim());

  if ((at === "country" || typ === "country") && queryWantsAddress) {
    score -= 120;
  }
  if ((at === "state" || typ === "state") && queryWantsAddress) {
    score -= 55;
  }

  const hn = String(addr.house_number || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  const firstNum = q.match(/^\s*(\d+[a-z]?)\b/i);
  if (firstNum && hn.some((h) => h.toLowerCase() === firstNum[1].toLowerCase())) {
    score += 85;
  }

  const road = String(addr.road || addr.pedestrian || "").toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2 && !/^\d+$/.test(w));
  for (const w of qWords) {
    if (road && road.includes(w)) score += 18;
    else if (dn.includes(w)) score += 7;
  }

  const locBlob = [
    addr.city,
    addr.town,
    addr.village,
    addr.hamlet,
    addr.suburb,
    addr.municipality,
    addr.locality,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let locBonus = 0;
  for (const w of qWords) {
    if (w.length > 3 && locBlob.includes(w)) {
      locBonus = 26;
      break;
    }
  }
  score += locBonus;

  const detailHit =
    at === "house" ||
    at === "building" ||
    at === "house_number" ||
    typ === "house" ||
    typ === "building";
  if (detailHit) score += 42;

  if ((r.class || "").toLowerCase() === "highway" && typ === "residential") {
    score += 24;
  }

  const imp = parseFloat(r.importance);
  if (Number.isFinite(imp)) score += imp * 4;

  return score;
}

function _zoomForOsmResult(place, baseZoom, searchQuery) {
  const q = searchQuery || "";
  if (_queryImpliesStreetLevelMap(q)) {
    return _zoomForStreetAddress(place, baseZoom);
  }
  return _zoomForBroadPlace(place, baseZoom);
}

function _zoomForStreetAddress(place, baseZoom) {
  const a = place?.address;
  const at = (place.addresstype || "").toLowerCase();
  const typ = (place.type || "").toLowerCase();
  if (a?.house_number && (a.road || a.pedestrian)) {
    return Math.min(19, Math.max(baseZoom, 17));
  }
  if (typ === "house" || typ === "building" || at === "building") {
    return Math.min(19, Math.max(baseZoom, 16));
  }
  if (typ === "residential" && a?.road) {
    return Math.min(18, Math.max(baseZoom, 15));
  }
  return baseZoom;
}

/** Country / state / county / city — zoom out more than a street address. */
function _zoomForBroadPlace(place, baseZoom) {
  const a = place?.address;
  const at = (place.addresstype || "").toLowerCase();
  const typ = (place.type || "").toLowerCase();

  if (at === "country" || typ === "country") return 5;
  if (at === "state" || typ === "state" || typ === "region") return 7;
  if (at === "county" || typ === "county") return 9;
  if (
    ["city", "town", "village", "municipality", "locality", "hamlet", "borough"].includes(typ) ||
    ["city", "town", "village", "municipality", "locality", "borough"].includes(at)
  ) {
    return Math.min(14, Math.max(11, baseZoom));
  }
  if (at === "suburb" || at === "neighbourhood" || typ === "suburb") {
    return Math.min(15, Math.max(11, baseZoom - 1));
  }
  if (a?.postcode && !a?.road) return 12;
  return Math.max(5, Math.min(15, baseZoom));
}
