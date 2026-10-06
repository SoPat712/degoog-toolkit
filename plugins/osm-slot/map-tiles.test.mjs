import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { load } from "cheerio";
import { DEFAULT_TILE_URL, mapTiles, tileTemplate } from "./map-tiles.mjs";
import { slot, routes } from "./index.js";

test("default maps need no key, preserve visible attribution, and use a local dark filter", async () => {
  assert.deepEqual(mapTiles(), { light: DEFAULT_TILE_URL, dark: "", filterDark: true, baseDark: false, maptiler: false, carto: false });
  const $ = load(await renderedMap());
  const map = $(".places-tile-map");
  assert.equal(map.attr("data-tile-template"), DEFAULT_TILE_URL);
  assert.equal(map.attr("data-filter-dark"), "true");
  assert.equal(map.attr("data-map-appearance"), "auto");
  assert.equal(map.find('.places-map-attribution a[href="https://www.openstreetmap.org/copyright"]').length, 1);
  assert.equal(map.find(".places-map-provider-logo").length, 0);
});

for (const style of ["streets-v2", "streets-v4", "basic-v2", "base-v4", "bright-v2", "openstreetmap", "dataviz", "dataviz-v4", "backdrop", "outdoor-v2", "winter-v2"]) {
  test(`MapTiler ${style} preserves key encoding, placeholders, tile size and parameters`, () => {
    const light = `https://api.maptiler.com/maps/${style}/256/{z}/{x}/{y}@2x.png?key=example%2Bkey&language=en`;
    const tiles = mapTiles({ customTileUrl: light });
    assert.equal(tiles.light, light);
    assert.equal(tiles.dark, light.replace(`/maps/${style}/`, `/maps/${style}-dark/`));
    assert.equal(tiles.filterDark, false);
    assert.equal(tiles.maptiler, true);
  });
}

test("unknown/custom/already-dark styles and lookalike hosts are not guessed or recolored", () => {
  for (const url of [
    "https://api.maptiler.com/maps/my-custom-id/{z}/{x}/{y}.png?key=example",
    "https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=example",
    "https://api.maptiler.com/maps/streets-v4-dark/{z}/{x}/{y}.png?key=example",
    "https://api.maptiler.com.example.test/maps/streets-v4/{z}/{x}/{y}.png",
    "https://tiles.example.test/{z}/{x}/{y}.png",
  ]) {
    assert.equal(mapTiles({ customTileUrl: url }).light, url);
    assert.equal(mapTiles({ customTileUrl: url }).dark, "");
    assert.equal(mapTiles({ customTileUrl: url }).filterDark, false);
  }
});

test("explicit dark URL overrides detection and keeps its own provider credentials", () => {
  const light = "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=day";
  const dark = "https://tiles.example.test/dark/{z}/{x}/{y}.png?key=night";
  assert.equal(mapTiles({ customTileUrl: light, customDarkTileUrl: dark }).dark, dark);
  assert.equal(mapTiles({ customDarkTileUrl: dark }).filterDark, false);
});

test("malformed templates fail safely without injecting URLs", () => {
  for (const value of [null, {}, "javascript:alert(1)", "file:///{z}/{x}/{y}", "//example.test/{z}/{x}/{y}", "https://example.test/no-coordinates", "https://user:pass@example.test/{z}/{x}/{y}"]) {
    assert.equal(tileTemplate(value), "");
    assert.equal(mapTiles({ customTileUrl: value }).light, DEFAULT_TILE_URL);
  }
});

async function renderedMap(settings = {}, refresh = false) {
  await slot.init({
    fetch: async () => Response.json({ items: [{
      id: "example", title: "Example Coffee", position: { lat: 41.9, lng: 12.5 },
      distance: 100, address: { label: "Example Street" }, categories: [{ name: "Coffee shop" }],
    }] }),
    readFile: (name) => readFile(new URL(name, import.meta.url), "utf8"),
  });
  slot.configure({ hereApiKey: "test", defaultLat: "41.9", defaultLon: "12.5", useOsmGeocoder: false, ...settings });
  if (!refresh) return (await slot.execute("coffee near me", {})).html;
  const response = await routes.find(({ path }) => path === "refresh").handler(new Request("https://degoog.test/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 41.9, lon: 12.5, query: "coffee near me", lang: "en" }),
  }));
  assert.equal(response.status, 200);
  return (await response.json()).html;
}

test("initial and location-refresh renders retain dark settings and MapTiler attribution", async () => {
  for (const refresh of [false, true]) {
    const $ = load(await renderedMap({ customTileUrl: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=test&language=en", mapAppearance: "dark" }, refresh));
    const map = $(".places-tile-map");
    assert.equal(map.attr("data-map-appearance"), "dark");
    assert.match(map.attr("data-dark-tile-template"), /streets-v4-dark/);
    assert.equal(map.find('.places-map-attribution a[href="https://www.maptiler.com/copyright/"]').length, 1);
    assert.equal(map.find('.places-map-credits img, .places-map-credits svg, .places-map-provider-logo').length, 0);
  }
  const $ = load(await renderedMap({ mapAppearance: '"><script>' }));
  assert.equal($(".places-tile-map").attr("data-map-appearance"), "auto");
});

test("map credits share a compact corner with controls instead of a full-width footer", async () => {
  for (const settings of [{}, { customTileUrl: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=test" }]) {
    const $ = load(await renderedMap(settings));
    const corner = $(".places-tile-map > .places-map-corner");
    assert.equal(corner.length, 1);
    assert.equal(corner.find(".places-zoom-controls button").length, 2);
    assert.equal(corner.find(".places-map-credits .places-map-attribution").length, 1);
    assert.equal(corner.find(".places-map-credits img, .places-map-credits svg, .places-map-provider-logo").length, 0);
  }
  const css = await readFile(new URL("style.css", import.meta.url), "utf8");
  const rule = (selector) => css.slice(css.indexOf(`${selector} {`)).split("}", 1)[0];
  assert.match(rule(".places-map-corner"), /right: 8px;[\s\S]*bottom: 6px;/);
  assert.match(rule(".places-map-corner"), /pointer-events: none/);
  assert.match(rule(".places-map-corner :is(a, button)"), /pointer-events: auto/);
  assert.match(rule(".places-map-credits"), /flex-wrap: wrap/);
  assert.match(rule(".places-map-credits"), /font-size: 10px/);
  assert.match(rule(".places-map-attribution a"), /font-size: inherit/);
  assert.match(rule(".places-map-attribution"), /background: transparent/);
  assert.doesNotMatch(rule(".places-map-attribution"), /position: absolute|inset:|left:/);
  assert.doesNotMatch(css, /places-map-provider-logo/);
  assert.doesNotMatch(rule(".places-zoom-controls"), /position: absolute|bottom:/);
});

test("custom tile maps share corner styling without inventing a provider credit", async () => {
  for (const [customTileUrl, provider] of [
    ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "CARTO"],
    ["https://tiles.example.test/{z}/{x}/{y}.png", null],
  ]) {
    const $ = load(await renderedMap({ customTileUrl }));
    const corner = $(".places-map-corner .places-map-credits");
    assert.equal(corner.length, 1);
    assert.equal(corner.find(".places-map-provider-logo").length, 0);
    assert.equal(corner.find("img, svg").length, 0);
    assert.doesNotMatch(corner.text(), /MapTiler/);
    assert.equal(corner.find('a[href="https://carto.com/attributions"]').length, provider ? 1 : 0);
    assert.equal(corner.find('a[href="https://www.openstreetmap.org/copyright"]').length, 1);
  }
});

const client = await readFile(new URL("script.js", import.meta.url), "utf8");
function browserHarness({ theme = null, systemDark = false, settings = {} } = {}) {
  const root = { getAttribute: () => theme };
  const callbacks = [];
  const media = { matches: systemDark, addEventListener: (_name, callback) => { media.change = callback; } };
  let renders = 0;
  const layer = { style: {}, set innerHTML(value) { this.html = value; renders++; } };
  const tiles = mapTiles(settings);
  const map = {
    dataset: { tileTemplate: tiles.light, darkTileTemplate: tiles.dark, filterDark: String(tiles.filterDark), baseMapDark: String(tiles.baseDark), mapAppearance: settings.mapAppearance || "auto", lat: "41.9", lon: "12.5", zoom: "13" },
    clientWidth: 512, clientHeight: 280,
    querySelector: (selector) => selector === ".places-tile-layer" ? layer : null,
  };
  let ready = false;
  const context = {
    window: { matchMedia: () => media },
    document: { documentElement: root, body: {}, addEventListener() {}, querySelectorAll: (selector) => ready && selector === ".places-tile-map[data-places-map-init]" ? [map] : [] },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(target, options) { if (target === root) { assert.deepEqual(Array.from(options.attributeFilter), ["data-theme"]); root.changed = this.callback; } } },
    requestAnimationFrame: (callback) => { callbacks.push(callback); return callbacks.length; },
  };
  vm.runInNewContext(client.replace(/\}\)\(\);\s*$/, "globalThis.testMap = { render: _renderTiles, state: _getMapState, isDark: _mapIsDark };})();"), context);
  ready = true;
  const state = context.testMap.state(map);
  const render = () => context.testMap.render(map, state);
  const flush = () => { while (callbacks.length) callbacks.shift()(); };
  return { map, layer, state, render, renders: () => renders, system: (dark) => { media.matches = dark; media.change(); flush(); }, theme: (value) => { theme = value; root.changed(); flush(); } };
}

test("default dark switching reuses loaded tiles, keeps pan/zoom, and follows system only when unforced", () => {
  const h = browserHarness();
  h.render();
  assert.equal(h.map.dataset.mapDarkened, "false");
  assert.equal(h.map.dataset.mapTheme, "light");
  const original = h.renders();
  h.state.activeIndex = 2;
  h.state.zoomFloat = 13.5;
  h.theme("dark");
  assert.equal(h.map.dataset.mapDarkened, "true");
  assert.equal(h.map.dataset.mapTheme, "dark");
  assert.equal(h.renders(), original, "Theme-only filtering must not replace image nodes");
  assert.equal(h.state.lat, 41.9);
  assert.equal(h.state.activeIndex, 2);
  assert.equal(h.state.zoomFloat, 13.5);
  h.system(false);
  assert.equal(h.map.dataset.mapDarkened, "true");
  h.theme("light");
  h.system(true);
  assert.equal(h.map.dataset.mapDarkened, "false");
  h.theme(null);
  assert.equal(h.map.dataset.mapDarkened, "true");
});

test("MapTiler theme switches replace tile URLs but preserve map state", () => {
  const h = browserHarness({ settings: { customTileUrl: "https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=test" } });
  h.render();
  h.state.activeIndex = 3;
  h.theme("dark");
  assert.match(h.layer.html, /streets-v4-dark/);
  assert.equal(h.map.dataset.mapDarkened, "false");
  assert.equal(h.map.dataset.mapTheme, "dark", "Native dark tiles must get dark controls without filtering");
  assert.equal(h.state.activeIndex, 3);
  assert.equal(h.state.lat, 41.9);
  h.theme("light");
  assert.doesNotMatch(h.layer.html, /streets-v4-dark/);
  assert.equal(h.renders(), 3);
});

test("forced appearance wins over both page and system modes", () => {
  for (const appearance of ["light", "dark"]) {
    const h = browserHarness({ theme: "dark", systemDark: true, settings: { mapAppearance: appearance } });
    h.render(); h.theme("light"); h.system(false);
    assert.equal(h.map.dataset.mapDarkened, String(appearance === "dark"));
    assert.equal(h.map.dataset.mapTheme, appearance);
  }
});

test("system dark and a known dark base URL also give controls a dark appearance", () => {
  const system = browserHarness({ systemDark: true });
  system.render();
  assert.equal(system.map.dataset.mapTheme, "dark");
  system.system(false);
  assert.equal(system.map.dataset.mapTheme, "light");
  const fixed = browserHarness({ theme: "light", settings: { customTileUrl: "https://api.maptiler.com/maps/streets-v4-dark/{z}/{x}/{y}.png?key=test" } });
  fixed.render();
  assert.equal(fixed.map.dataset.mapTheme, "dark");
  assert.equal(fixed.map.dataset.mapDarkened, "false");
  assert.equal(mapTiles({ customTileUrl: "https://example.test/maps/streets-v4-dark/{z}/{x}/{y}.png" }).baseDark, false);
});

test("map buttons and Apple glyph follow the resolved map appearance, not only the page theme", async () => {
  const css = await readFile(new URL("style.css", import.meta.url), "utf8");
  assert.match(css, /\.places-tile-map\[data-map-theme="dark"\]\s*\{[^}]*--places-map-control-bg:/);
  for (const selector of [".places-map-ext-btn", ".places-zoom-btn"]) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split("}", 1)[0];
    assert.match(rule, /background: var\(--places-map-control-bg\)/);
    assert.match(rule, /color: var\(--places-map-control-text\)/);
  }
  assert.match(css, /\.places-map-ext-apple svg path\s*\{\s*fill: var\(--places-map-control-text\)/);
  assert.doesNotMatch(css, /\[data-theme="dark"\] \.places-map-ext/);
});

test("tile fetching preserves referrers/cache and filtering cannot affect markers", async () => {
  assert.match(client, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.doesNotMatch(client, /_retry=|retryCount|Cache-Control.*no-cache/);
  const css = await readFile(new URL("style.css", import.meta.url), "utf8");
  assert.match(css, /\.places-tile-map\[data-map-darkened="true"\] \.places-tile-layer\s*\{\s*filter:/);
  assert.doesNotMatch(css, /\.places-pin-layer\s*\{[^}]*filter:/);
});
