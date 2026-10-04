export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Explicit pairs from MapTiler's published MAP_STYLE_CONFIG. Never guess a
// counterpart for a custom style ID, satellite map, or third-party hostname.
const MAPTILER_DARK_STYLES = new Map([
  ["streets-v2", "streets-v2-dark"],
  ["streets-v4", "streets-v4-dark"],
  ["basic-v2", "basic-v2-dark"],
  ["base-v4", "base-v4-dark"],
  ["bright-v2", "bright-v2-dark"],
  ["openstreetmap", "openstreetmap-dark"],
  ["dataviz", "dataviz-dark"],
  ["dataviz-v4", "dataviz-v4-dark"],
  ["backdrop", "backdrop-dark"],
  ["outdoor-v2", "outdoor-v2-dark"],
  ["winter-v2", "winter-v2-dark"],
]);

/** Validate an XYZ image template without fetching it or exposing its key. */
export function tileTemplate(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    return ["{z}", "{x}", "{y}"].every((part) => raw.includes(part)) ? raw : "";
  } catch {
    return "";
  }
}

/** Resolve templates once on the server; appearance is chosen in the browser. */
export function mapTiles(settings = {}) {
  const light = tileTemplate(settings.customTileUrl) || DEFAULT_TILE_URL;
  let dark = tileTemplate(settings.customDarkTileUrl);
  const url = new URL(light);
  if (!dark && url.hostname === "api.maptiler.com") {
    const style = url.pathname.match(/^\/maps\/([^/]+)\//)?.[1];
    const counterpart = MAPTILER_DARK_STYLES.get(style);
    // Replace only the style segment, preserving the key, other parameters,
    // retina suffix, tile-size segment, and literal {z}/{x}/{y} placeholders.
    if (counterpart) dark = light.replace(/^(https?:\/\/[^/]+\/maps\/)[^/]+\//i, `$1${counterpart}/`);
  }
  return {
    light,
    dark,
    filterDark: !dark && url.hostname === "tile.openstreetmap.org",
    maptiler: [light, dark].some((value) => value && new URL(value).hostname === "api.maptiler.com"),
    carto: [light, dark].some((value) => value && /(^|\.)basemaps\.cartocdn\.com$/.test(new URL(value).hostname)),
  };
}
