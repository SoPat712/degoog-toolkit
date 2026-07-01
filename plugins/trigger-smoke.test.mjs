import assert from "node:assert/strict";
import test from "node:test";

const positiveCases = [
  ["calculator", "2+2"],
  ["color-translator", "#ff0000"],
  ["currency-slot", "100 usd to eur"],
  ["define-slot", "define entropy"],
  ["metronome", "metronome 120 bpm"],
  ["minesweeper", "play minesweeper"],
  ["osm-slot", "coffee near me"],
  ["periodic-table", "periodic table"],
  ["snake", "play snake"],
  ["sports-slot", "lakers score"],
  ["stocks", "msft stock"],
  ["stopwatch", "stopwatch"],
  ["tic-tac-toe", "tic tac toe"],
  ["tip-calculator", "tip calculator"],
  ["tip-calculator", "120$ 20% split 4 ways"],
  ["tip-calculator", "120$ 20% tip split 4 ways"],
  ["tip-calculator", "120$ split 4"],
  ["tip-calculator", "20% on 120 bill"],
  ["tip-calculator", "20 percent on 120"],
  ["tip-calculator", "10% on 50"],
  ["tmdb", "inception movie"],
  ["translate-slot", "translate hello to spanish"],
  ["undecideds", "flip a coin"],
  ["unit-slot", "100 lb to kg"],
  ["unit-slot", "unit converter"],
  ["until", "days until christmas"],
  ["weather-slot", "weather in rome"],
];

const negativeCases = [
  ["calculator", "100 lb to kg"],
  ["calculator", "100 usd to eur"],
  ["currency-slot", "100 lb to kg"],
  ["currency-slot", "translate hello to spanish"],
  ["osm-slot", "100 lb to kg"],
  ["osm-slot", "aapl stock"],
  ["osm-slot", "temporary"],
  ["osm-slot", "typewriter"],
  ["osm-slot", "tacoria"],
  ["stocks", "market shares"],
  ["stocks", "bitcoin price"],
  ["tip-calculator", "gardening tips"],
  ["tip-calculator", "calculator"],
  ["tip-calculator", "calculate"],
  ["translate-slot", "100 lb to kg"],
  ["translate-slot", "100 usd to eur"],
  ["undecideds", "120 sided dice"],
  ["undecideds", "price of d6 stock"],
  ["unit-slot", "100 usd to eur"],
  ["unit-slot", "translate meter to spanish"],
  ["unit-slot", "days until christmas"],
  ["weather-slot", "weathering steel"],
];

const moduleCache = new Map();

async function loadPlugin(folder) {
  if (!moduleCache.has(folder)) {
    moduleCache.set(folder, import(`./${folder}/index.js`));
  }
  return moduleCache.get(folder);
}

async function loadSlot(folder) {
  const module = await loadPlugin(folder);
  return module.slot || module.slotPlugin || module.default;
}

test("all plugin entrypoints load", async () => {
  const folders = [...new Set([
    ...positiveCases.map(([folder]) => folder),
    "search-history",
    "speedtest",
  ])];

  for (const folder of folders) {
    await assert.doesNotReject(loadPlugin(folder), folder);
  }
});

test("all slot plugins recognize a canonical query", async () => {
  for (const [folder, query] of positiveCases) {
    const slot = await loadSlot(folder);
    assert.equal(slot.trigger(query), true, `${folder}: ${query}`);
  }
});

test("slot plugins reject known cross-plugin conflicts", async () => {
  for (const [folder, query] of negativeCases) {
    const slot = await loadSlot(folder);
    assert.equal(slot.trigger(query), false, `${folder}: ${query}`);
  }
});

test("command plugins expose their expected triggers", async () => {
  const searchHistory = await loadPlugin("search-history");
  const speedtest = await loadPlugin("speedtest");

  assert.equal((searchHistory.command || searchHistory.default).trigger, "history");
  assert.deepEqual(
    (searchHistory.command || searchHistory.default).settingsSchema.map((field) => field.key),
    ["maxEntries"],
  );
  const speedtestCommand = speedtest.command || speedtest.default;
  assert.equal(speedtestCommand.trigger, "speed");
  assert.ok(speedtestCommand.aliases.includes("speedtest"));
  assert.deepEqual(
    speedtestCommand.settingsSchema.map((field) => field.key),
    ["debugMode"],
  );
});
