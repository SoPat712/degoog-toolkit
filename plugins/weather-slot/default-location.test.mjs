import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import weather from "./index.js";

const defaultCity = "Albany, NY, USA";

async function geocodeTarget(query, defaults = defaultCity) {
  weather.configure({ defaultCity: defaults });
  const targets = [];
  const result = await weather.execute(query, {
    fetch: async (url) => {
      const request = new URL(url);
      assert.equal(request.hostname, "nominatim.openstreetmap.org");
      targets.push(request.searchParams.get("q"));
      return Response.json([]);
    },
  });
  return { targets, result };
}

test("full and stripped temporal queries geocode the configured default", async () => {
  for (const query of [
    "", "weather", "weather?", "!weather", "forecast", "sunrise", "sunset",
    ...["today", "tomorrow", "now", "current"].flatMap((time) => [
      time, `weather ${time}`, `!weather ${time}`, `forecast ${time}`,
      `${time} weather`, ` WEATHER ${time.toUpperCase()}? `,
    ]),
  ]) {
    assert.deepEqual((await geocodeTarget(query)).targets, [defaultCity], query);
  }
});

test("explicit locations override the default and preserve place words and commas", async () => {
  for (const [query, target] of [
    ["Paris", "Paris"],
    ["weather in Paris", "Paris"],
    ["weather today in Paris", "Paris"],
    ["today in Paris", "Paris"],
    ["now in Paris", "Paris"],
    ["Paris weather tomorrow", "Paris"],
    ["!weather Albany, NY, USA", defaultCity],
    ["weather Current River, Ontario", "Current River, Ontario"],
    ["Current River, Ontario", "Current River, Ontario"],
    ["Tomorrow Valley, USA", "Tomorrow Valley, USA"],
    ["Current, Canada", "Current, Canada"],
  ]) {
    assert.deepEqual((await geocodeTarget(query)).targets, [target], query);
  }
});

test("missing default yields localized usage without a geocoder request", async () => {
  for (const query of ["", "weather today", "weather tomorrow", "weather now", "weather current", "today", "tomorrow", "now", "current"]) {
    const { targets, result } = await geocodeTarget(query, " ");
    assert.deepEqual(targets, [], query);
    assert.match(result.html, /t:plugin-weather-slot.usage/);
  }
});

test("temporal weather slot triggers require a default", () => {
  for (const query of ["weather", "weather today", "weather tomorrow", "weather now", "weather current", "forecast today", "today weather"]) {
    weather.configure({ defaultCity: "" });
    assert.equal(weather.trigger(query), false, query);
    weather.configure({ defaultCity });
    assert.equal(weather.trigger(query), true, query);
  }
  weather.configure({ defaultCity: "" });
  assert.equal(weather.trigger("weather Current River"), true);
  assert.equal(weather.trigger("weather in Paris"), true);
});

test("unknown explicit city does not fall back to the default", async () => {
  const { targets, result } = await geocodeTarget("Unknownville");
  assert.deepEqual(targets, ["Unknownville"]);
  assert.match(result.html, /t:plugin-weather-slot.cityNotFound/);
});

test("all shipped locales include usage, not-found text, and location guidance", async () => {
  for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    const locale = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-weather-slot"];
    for (const key of ["usage", "cityPlaceholder", "cityNotFound"]) assert.ok(locale[key], `${lang}: ${key}`);
    assert.match(locale.settings.defaultCity.description, /weather today/);
    assert.match(locale.settings.defaultCity.description, /Albany, NY, USA/);
  }
});
