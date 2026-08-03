import assert from "node:assert/strict";
import test from "node:test";

const positiveCases = [
  ["calculator", "2+2"],
  ["calculator", "what is 2+2"],
  ["calculator", "2 plus 2"],
  ["color-translator", "#ff0000"],
  ["currency-slot", "100 usd to eur"],
  ["currency-slot", "what is 100 usd in eur"],
  ["currency-slot", "ALL to TRY"],
  ["define-slot", "define entropy"],
  ["metronome", "metronome 120 bpm"],
  ["metronome", "metronome 40 bpm"],
  ["metronome", "metronome 240 bpm"],
  ["minesweeper", "play minesweeper"],
  ["minesweeper", "play minesweeper!"],
  ["music", "radiohead discography"],
  ["music", "mirrors justin timberlake"],
  ["books", "9780140328721"],
  ["books", "book Dune"],
  ["books", "The Hobbit book"],
  ["osm-slot", "coffee near me"],
  ["papers", "doi 10.1038/nature12373"],
  ["papers", "study on climate change"],
  ["periodic-table", "periodic table"],
  ["periodic-table", "oxygen"],
  ["periodic-table", "Fe"],
  ["periodic-table", "element gold"],
  ["periodic-table", "atomic number 1"],
  ["snake", "play snake"],
  ["snake", "play snake!"],
  ["sports-slot", "lakers score"],
  ["stocks", "msft stock"],
  ["stopwatch", "stopwatch"],
  ["tic-tac-toe", "tic tac toe"],
  ["tic-tac-toe", "play a game of tic tac toe!"],
  ["tip-calculator", "tip calculator"],
  ["tip-calculator", "120$ 20% split 4 ways"],
  ["tip-calculator", "120$ 20% tip split 4 ways"],
  ["tip-calculator", "120$ split 4"],
  ["tip-calculator", "20% on 120 bill"],
  ["tip-calculator", "20 percent on 120"],
  ["tip-calculator", "10% on 50"],
  ["tmdb", "inception movie"],
  ["translate-slot", "translate hello to spanish"],
  ["time", "time in tokyo"],
  ["time", "Paris time"],
  ["time", "what time in Tokyo"],
  ["undecideds", "flip a coin"],
  ["undecideds", "random number from 1 to 20"],
  ["undecideds", "should i go yes or no"],
  ["unit-slot", "100 lb to kg"],
  ["unit-slot", "what is 100 lb in kg"],
  ["unit-slot", "how many feet in a mile"],
  ["unit-slot", "unit converter"],
  ["until", "days until christmas"],
  ["weather-slot", "weather in rome"],
  ["weather-slot", "rome weather"],
  ["weather-slot", "london forecast today"],
  ["weather-slot", "what is the weather in Rome"],
  ["weather-slot", "how is the weather in Rome"],
];

const negativeCases = [
  ["calculator", "100 lb to kg"],
  ["calculator", "100 usd to eur"],
  ["currency-slot", "100 lb to kg"],
  ["currency-slot", "translate hello to spanish"],
  ["music", "dune book"],
  ["music", "time in tokyo"],
  ["music", "play minesweeper"],
  ["music", "javascript array methods"],
  ["books", "radiohead discography"],
  ["books", "book a flight"],
  ["books", "book hotel"],
  ["books", "I need a book"],
  ["books", "recommend a book"],
  ["currency-slot", "all to try"],
  ["define-slot", "what is weather"],
  ["define-slot", "what is time"],
  ["metronome", "metronome 20 bpm"],
  ["metronome", "metronome 241 bpm"],
  ["minesweeper", "!msx"],
  ["minesweeper", "minesweeper strategy"],
  ["minesweeper", "play minesweeper online"],
  ["osm-slot", "100 lb to kg"],
  ["osm-slot", "aapl stock"],
  ["osm-slot", "temporary"],
  ["osm-slot", "typewriter"],
  ["osm-slot", "tacoria"],
  ["osm-slot", "hermes agent"],
  ["osm-slot", "mirrors justin timberlake"],
  ["osm-slot", "Paris time"],
  ["osm-slot", "lakers score"],
  ["osm-slot", "atomic number 1"],
  ["papers", "study tips"],
  ["papers", "I need a research paper"],
  ["periodic-table", "gold"],
  ["periodic-table", "in"],
  ["periodic-table", "C"],
  ["periodic-table", "He"],
  ["periodic-table", "In"],
  ["periodic-table", "1"],
  ["snake", "!snakeoil"],
  ["snake", "snake plant"],
  ["snake", "snake game strategy"],
  ["stocks", "market shares"],
  ["stocks", "bitcoin price"],
  ["stocks", "hello world"],
  ["stocks", "gold"],
  ["stocks", "Fe"],
  ["papers", "weather in rome"],
  ["tip-calculator", "gardening tips"],
  ["tip-calculator", "calculator"],
  ["tip-calculator", "calculate"],
  ["tip-calculator", "about%3Adebugging%23%2Fruntime%2Fthis-firefox"],
  ["tip-calculator", "https%3A%2F%2Fexample.com%2Ftip%20on%2050"],
  ["tip-calculator", "20% off 120"],
  ["tip-calculator", "10% tax on 50"],
  ["tmdb", "book Dune"],
  ["tmdb", "lakers score"],
  ["tmdb", "Paris time"],
  ["translate-slot", "translate 100 lb to kg"],
  ["translate-slot", "translate 100 usd to eur"],
  ["translate-slot", "100 lb to kg"],
  ["translate-slot", "100 usd to eur"],
  ["undecideds", "120 sided dice"],
  ["undecideds", "price of d6 stock"],
  ["undecideds", "coin toss probability"],
  ["undecideds", "random number generator algorithm"],
  ["undecideds", "yes or no questions for kids"],
  ["unit-slot", "100 usd to eur"],
  ["unit-slot", "translate meter to spanish"],
  ["unit-slot", "days until christmas"],
  ["weather-slot", "weathering steel"],
  ["weather-slot", "best weather app"],
  ["weather-slot", "forecast model"],
  ["weather-slot", "temperature 20 c"],
  ["time", "execution time"],
  ["time", "screen time"],
  ["time", "runtime clock"],
  ["time", "app clock"],
  ["time", "time in c++"],
  ["time", "time for dinner"],
  ["time", "time at work"],
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
  const autoBang = await loadPlugin("auto-bang");
  const searchHistory = await loadPlugin("search-history");
  const speedtest = await loadPlugin("speedtest");

  assert.equal((autoBang.command || autoBang.default).trigger, "autobang");
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

  const matchesNaturalPhrase = (query) =>
    speedtestCommand.naturalLanguagePhrases.some((phrase) => {
      const lower = query.toLowerCase();
      return lower === phrase || lower.startsWith(`${phrase} `);
    });
  for (const query of [
    "run an internet speed test",
    "how fast is my wi-fi",
    "what is my connection speed",
    "my internet speed",
  ]) {
    assert.equal(matchesNaturalPhrase(query), true, query);
  }
});

test("result-backed slots stay silent without matching result evidence", async () => {
  const music = await loadSlot("music");
  const tmdb = await loadSlot("tmdb");
  const results = [{ title: "Unrelated result", url: "https://example.com/" }];

  assert.equal(music.trigger("all to try"), true);
  assert.deepEqual(await music.execute("all to try", { results }), {
    title: "",
    html: "",
  });

  tmdb.configure({ apiKey: "test" });
  assert.equal(tmdb.trigger("all to try"), true);
  assert.deepEqual(await tmdb.execute("all to try", { results }), { html: "" });
});

test("weather strips natural question wording before geocoding", async () => {
  const weather = await loadSlot("weather-slot");
  let requestUrl = "";
  await weather.execute("what is the weather in Rome", {
    fetch: async (url) => {
      requestUrl = String(url);
      return { ok: false };
    },
  });
  assert.equal(new URL(requestUrl).searchParams.get("q"), "Rome");
});
