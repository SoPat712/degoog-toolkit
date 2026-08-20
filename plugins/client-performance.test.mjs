import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

const pluginsDir = path.resolve("plugins");
const readPlugin = (folder, file = "script.js") =>
  readFile(path.join(pluginsDir, folder, file), "utf8");

test("widget runtimes avoid work before their cards exist", async () => {
  const [calculator, color] = await Promise.all([
    readPlugin("calculator"),
    readPlugin("color-translator"),
  ]);

  const calculatorInit = calculator.slice(
    calculator.indexOf("function initAll()"),
    calculator.indexOf("function handleZoom"),
  );
  assert.match(calculatorInit, /querySelectorAll\(ROOT_SELECTOR\)/);
  assert.match(calculatorInit, /if \(roots\.length === 0\) return/);
  assert.ok(
    calculatorInit.indexOf("roots.length") <
      calculatorInit.indexOf("ensureRuntime()"),
  );

  const colorBoot = color.slice(
    color.indexOf("function boot()"),
    color.indexOf("if (document.readyState"),
  );
  assert.match(colorBoot, /querySelector\("\[data-color-translator-card\]"\)/);
  assert.match(colorBoot, /initAndLoadNames\(\)/);
  assert.match(color, /function initAndLoadNames\(\) \{\s*init\(\);\s*ensureHexToName\(\)\.then/);
});

test("streamed cards initialize from added nodes instead of rescanning the page", async () => {
  for (const folder of ["currency-slot", "unit-slot", "weather-slot", "stocks"]) {
    const source = await readPlugin(folder);
    assert.match(source, /record\.addedNodes\.forEach\(scan\)/, folder);
    assert.doesNotMatch(source, /new MutationObserver\(scan\)/, folder);
  }

  const weather = await readPlugin("weather-slot");
  const stocks = await readPlugin("stocks");
  assert.match(weather, /record\.removedNodes\.forEach\(cleanup\)/);
  assert.match(weather, /resizeObserver\.disconnect\(\)/);
  assert.match(weather, /if \(card\._wxsInit\) \{\s*bindWeatherResize\(card\)/);
  assert.match(stocks, /record\.removedNodes\.forEach\(cleanup\)/);
  assert.match(stocks, /_stocksLiveCleanup\?\.\(\)/);
  assert.match(stocks, /function initOrRebindCard/);
  assert.match(stocks, /setupLiveUpdates\(card, symbol\)/);
});

test("remaining interactive cards avoid full-page mutation rescans", async () => {
  for (const folder of ["translate-slot", "until"]) {
    const source = await readPlugin(folder);
    assert.match(source, /record\.addedNodes\.forEach/, folder);
    assert.match(source, /scan\(node\)/, folder);
    assert.doesNotMatch(source, /new MutationObserver\(init\)/, folder);
  }

  for (const folder of [
    "metronome",
    "minesweeper",
    "snake",
    "tic-tac-toe",
    "tip-calculator",
    "stopwatch",
  ]) {
    const source = await readPlugin(folder);
    const lifecycle = source.slice(
      source.indexOf("function checkWidget()"),
      source.indexOf("new MutationObserver", source.indexOf("function checkWidget()")),
    );
    assert.match(lifecycle, /isConnected\) return/, folder);
  }
});

test("weather omits unused hourly series from upstream and rendered payloads", async () => {
  const source = await readPlugin("weather-slot", "index.js");
  const hourlyVars = source.slice(
    source.indexOf("const hourlyVars"),
    source.indexOf("const dailyVars"),
  );
  const hourlyPayload = source.slice(
    source.indexOf("const hourly24"),
    source.indexOf("return {", source.indexOf("const hourly24")),
  );

  assert.doesNotMatch(hourlyVars, /"weather_code"|"precipitation",/);
  assert.doesNotMatch(
    hourlyPayload,
    /\b(?:time|precipAmt|clouds|code|icon):\s*\[\]/,
  );
  assert.match(source, /cloudsMid:/);
});

test("stock cards hydrate their initial chart and tear down removed cards", async () => {
  const [server, client, template] = await Promise.all([
    readPlugin("stocks", "index.js"),
    readPlugin("stocks"),
    readPlugin("stocks", "template.html"),
  ]);

  assert.match(server, /const \[snapshot, response\] = await Promise\.all/);
  assert.match(server, /initial_chart:/);
  assert.match(template, /data-initial-chart="\{\{initial_chart\}\}"/);
  assert.match(client, /JSON\.parse\(chart\.dataset\.initialChart/);
  assert.match(client, /chartCache\.set\(chartKey\(symbol, "1d"\)/);
});

test("Places pans existing map layers instead of rebuilding tiles per pointer move", async () => {
  const source = await readPlugin("osm-slot");
  const mouseMove = source.slice(
    source.indexOf("function onMouseMove"),
    source.indexOf("function onMouseUp"),
  );
  const touchMove = source.slice(
    source.indexOf("function onTouchMove"),
    source.indexOf("function onTouchEnd"),
  );

  assert.match(source, /function _applyDragTransform/);
  assert.match(source, /translate3d\(/);
  assert.match(mouseMove, /updateDrag\(/);
  assert.match(touchMove, /updateDrag\(/);
  assert.doesNotMatch(mouseMove, /_renderTiles\(/);
  assert.doesNotMatch(touchMove, /_renderTiles\(/);
  assert.match(source, /state\.offsetX \/ dragScale/);
});

test("Sports shares standings work and overlaps independent ESPN requests", async () => {
  const source = await readPlugin("sports-slot", "index.js");
  const handler = source.slice(
    source.indexOf("async function handleEspnQuery"),
    source.indexOf("async function executeSportsQuery"),
  );

  assert.equal(
    handler.match(/fetchEspnStandings\(sport, league\)/g)?.length,
    1,
  );
  assert.match(handler, /const standingsPromise = fetchEspnStandings/);
  assert.ok(
    [...handler.matchAll(/await Promise\.all\(/g)].length >= 2,
    "matchup and league enrichment should overlap standings",
  );
});

test("Minesweeper contains localized footer actions in narrow cards", async () => {
  const css = await readPlugin("minesweeper", "style.css");
  assert.match(css, /\.ms-card\s*\{[^}]*container-type:\s*inline-size/s);
  assert.match(css, /@container \(max-width:\s*340px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-ms-action="reset"[^}]*grid-column:\s*1 \/ -1/s);
});

test("always-loaded plugin scripts stay within a compressed transfer budget", async () => {
  let scriptTotal = 0;
  let scriptLargest = 0;
  let styleTotal = 0;
  let styleLargest = 0;
  for (const entry of await readdir(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const bytes = await readFile(path.join(pluginsDir, entry.name, "script.js"));
      const compressed = gzipSync(bytes).length;
      scriptTotal += compressed;
      scriptLargest = Math.max(scriptLargest, compressed);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      const bytes = await readFile(path.join(pluginsDir, entry.name, "style.css"));
      const compressed = gzipSync(bytes).length;
      styleTotal += compressed;
      styleLargest = Math.max(styleLargest, compressed);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  assert.ok(
    scriptTotal <= 175_000,
    `plugin scripts gzip to ${scriptTotal} bytes`,
  );
  assert.ok(
    scriptLargest <= 18_000,
    `largest plugin script gzips to ${scriptLargest} bytes`,
  );
  assert.ok(
    styleTotal <= 90_000,
    `plugin styles gzip to ${styleTotal} bytes`,
  );
  assert.ok(
    styleLargest <= 15_000,
    `largest plugin style gzips to ${styleLargest} bytes`,
  );
});
