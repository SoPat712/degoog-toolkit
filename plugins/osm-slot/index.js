let showMode = "keyword";
let defaultZoom = 13;

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
      description: "Always: every search. Keyword: only when query contains 'map' or 'where is' etc.",
    },
    {
      key: "defaultZoom",
      label: "Default zoom level",
      type: "select",
      options: ["5", "8", "11", "13", "15"],
      description: "Higher = more zoomed in. 13 is a good default for cities.",
    },
  ],

  configure(settings) {
    showMode = settings?.showMode === "always" ? "always" : "keyword";
    const z = parseInt(settings?.defaultZoom ?? "13", 10);
    defaultZoom = Number.isFinite(z) ? z : 13;
  },

  trigger(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 3) return false;
    if (showMode === "always") return true;
    return /\b(map|maps|where is|where's|locate|location|city|address|street|near|directions?|how far|capital of|coordinates?)\b/i.test(q);
  },

  async execute(query, context) {
    try {
      // Strip map-trigger words for cleaner geocoding
      const cleanQuery = query
        .replace(/\b(map|maps|where is|where's|locate|location|near me|directions?|how far)\b/gi, "")
        .trim();
      const searchQuery = cleanQuery.length > 2 ? cleanQuery : query.trim();

      // Reject queries that look like sentences or questions (more than 3 words)
      const wordCount = searchQuery.trim().split(/\s+/).length;
      if (wordCount > 4) return { html: "" };

      // Reject queries with common non-place words
      if (/\b(alternative|how|why|what|when|best|top|list|vs|versus|review|tutorial|guide|example|free|download|install|price|cost|buy|cheap)\b/i.test(searchQuery)) {
        return { html: "" };
      }

      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5&addressdetails=1`;
      const geoRes = await fetch(geoUrl, {
        headers: {
          "User-Agent": "degoog-osm-slot/1.0",
          "Accept-Language": "en",
        },
      });

      if (!geoRes.ok) return { html: "" };

      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) return { html: "" };

      // Only accept actual cities, towns, villages, countries — reject everything else
      const validTypes = new Set([
        "city", "town", "village", "municipality", "hamlet",
        "suburb", "quarter", "neighbourhood", "county", "state",
        "country", "region", "province", "district",
      ]);

      const place = geoData.find(r =>
        validTypes.has(r.addresstype) || validTypes.has(r.type) || validTypes.has(r.class)
      );

      if (!place) return { html: "" };
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const displayName = place.display_name || searchQuery;
      const shortName = place.address
        ? [
            place.address.city || place.address.town || place.address.village || place.address.county,
            place.address.country,
          ]
            .filter(Boolean)
            .join(", ")
        : displayName.split(",").slice(0, 2).join(",");

      const mapId = `osm-map-${Date.now()}`;

      const html = `
<div class="osm-slot-wrap">
  <div class="osm-slot-header">
    <svg width=\"28\" height=\"28\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"10\" cy=\"10\" r=\"10\" fill=\"rgba(255,255,255,0.12)\"/><circle cx=\"10\" cy=\"10\" r=\"5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\"/><path d=\"M10 4.5c-1.5 1.5-2.5 3.3-2.5 5.5s1 4 2.5 5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/><path d=\"M10 4.5c1.5 1.5 2.5 3.3 2.5 5.5s-1 4-2.5 5.5\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/><line x1=\"4.5\" y1=\"10\" x2=\"15.5\" y2=\"10\" stroke=\"rgba(255,255,255,0.85)\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></svg>
    <span class="osm-slot-label">OpenStreetMap</span>
    <span class="osm-slot-city">${_esc(shortName)}</span>
    <a class="osm-slot-open" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=${defaultZoom}" target="_blank" rel="noopener noreferrer">Open in OSM ↗</a>
  </div>
  <div class="osm-map-container" id="${mapId}" data-lat="${lat}" data-lon="${lon}" data-zoom="${defaultZoom}" data-name="${_esc(shortName)}"></div>
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
