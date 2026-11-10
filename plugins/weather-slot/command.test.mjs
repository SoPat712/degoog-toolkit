import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock } from "node:test";
import test from "node:test";
import * as plugin from "./index.js";

const { default: command, slot } = plugin;
const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
await slot.init({ template });

test.beforeEach(() => slot.configure({ defaultCity: "" }));

const DAY_MS = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 10, 8);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
const days = [...Array(7).keys()];
const hours = [...Array(168).keys()];
const forecast = {
  utc_offset_seconds: 0,
  hourly_units: { visibility: "m" },
  daily_units: { visibility_mean: "m" },
  current: {
    temperature_2m: 10, apparent_temperature: 8, weather_code: 0, is_day: 1,
    relative_humidity_2m: 70, wind_speed_10m: 5, wind_gusts_10m: 9, wind_direction_10m: 90,
    pressure_msl: 1013, uv_index: 0, cloud_cover: 5, precipitation: 0, dew_point_2m: 4,
  },
  hourly: Object.fromEntries([
    ["time", hours.map((h) => iso(start + h * 3600000))],
    ...["temperature_2m", "apparent_temperature", "precipitation_probability", "wind_speed_10m",
      "wind_gusts_10m", "cloud_cover", "visibility", "relative_humidity_2m"].map((key) => [key, hours.map(() => 10)]),
  ]),
  daily: {
    time: days.map((d) => iso(start + d * DAY_MS).slice(0, 10)),
    weather_code: days.map(() => 3),
    temperature_2m_max: days.map(() => 16),
    temperature_2m_min: days.map(() => 3),
    sunrise: days.map((d) => iso(start + d * DAY_MS + 7 * 3600000)),
    sunset: days.map((d) => iso(start + d * DAY_MS + 17 * 3600000)),
    daylight_duration: days.map(() => 36000),
  },
};

function fakeFetch(places, geocoded = []) {
  return async (url) => {
    if (!String(url).includes("nominatim")) return Response.json(forecast);
    geocoded.push(new URL(url).searchParams.get("q"));
    return Response.json(places);
  };
}
const ROME = [{ lat: "41.9", lon: "12.5", addresstype: "city", address: { city: "Rome", country: "Italy" } }];

test("the bang reaches a command degoog registers, beside the slot", () => {
  // Mirrors the core loaders: commands come from default ?? command and need
  // a string trigger; slots come from slot ?? slotPlugin.
  assert.equal(plugin.command, undefined, "default export only");
  assert.equal(typeof command.trigger, "string");
  assert.equal(command.trigger, "weather");
  assert.equal(typeof command.execute, "function");
  assert.ok(command.aliases.includes("forecast"));
  assert.ok(!command.aliases.includes("tempo"), "tempo belongs to the metronome");
  assert.equal(command.isClientExposed, false);
  assert.equal(slot.isClientExposed, false);
  assert.equal(plugin.slotPlugin, slot);
  assert.equal(typeof slot.trigger, "function");
});

test("only the slot carries settings, so Settings shows one Configure row", () => {
  const owners = [...new Set(Object.values(plugin))].filter((cap) => cap?.settingsSchema);
  assert.deepEqual(owners, [slot]);
  assert.deepEqual(
    slot.settingsSchema.map(({ key }) => key),
    ["units", "windUnit", "pressureUnit", "precipUnit", "timeFormat", "defaultCity"],
  );
  // Phrases would make core add a Natural language toggle to the command card.
  assert.equal(command.naturalLanguagePhrases, undefined);
  assert.equal(command.configure, undefined);
  // Without slotPositions core adds no fallback Position field.
  assert.equal(slot.slotPositions, undefined);
});

test("!weather renders the same card the slot renders for a search", async () => {
  mock.timers.enable({ apis: ["Date"], now: start + 12 * 3600000 });
  try {
    const geocoded = [];
    const viaCommand = await command.execute("Rome", { fetch: fakeFetch(ROME, geocoded) });
    const viaSlot = await slot.execute("weather in Rome", { fetch: fakeFetch(ROME, geocoded) });
    assert.deepEqual(geocoded, ["Rome", "Rome"]);
    assert.match(viaCommand.html, /class="command-result weather-result"/);
    assert.equal(viaCommand.html, viaSlot.html);
    assert.equal(viaCommand.title, "", "the card names the place itself");
  } finally {
    mock.timers.reset();
  }
});

test("the command follows settings saved on the slot and the init fetch", async () => {
  const geocoded = [];
  await command.init({ template, fetch: fakeFetch(ROME, geocoded) });
  slot.configure({ units: "celsius" });
  const { html } = await command.execute("in Rome", {});
  assert.deepEqual(geocoded, ["Rome"], "the phrase after the bang is stripped");
  assert.match(html, /&quot;tempUnit&quot;:&quot;°C&quot;/);
  slot.configure({ units: "fahrenheit" });
  assert.match((await command.execute("Rome", {})).html, /&quot;tempUnit&quot;:&quot;°F&quot;/);
});

test("an explicit bang answers unknown cities and a missing city", async () => {
  const notFound = await command.execute("Atlantis", { fetch: fakeFetch([]) });
  assert.match(notFound.html, /t:plugin-weather-slot\.cityNotFound/);
  // The same miss from an ordinary search stays silent.
  assert.equal((await slot.execute("weather in Atlantis", { fetch: fakeFetch([]) })).html, "");

  const usage = await command.execute("", { fetch: () => assert.fail("no city, no request") });
  assert.match(usage.html, /t:plugin-weather-slot\.usage/);
  assert.equal(usage.title, "");
  // Core skips translation inside <code>, so the placeholder sits outside it.
  assert.doesNotMatch(usage.html, /<code>[^<]*\{\{ t:/);

  slot.configure({ defaultCity: "Rome" });
  const geocoded = [];
  await command.execute("", { fetch: fakeFetch(ROME, geocoded) });
  assert.deepEqual(geocoded, ["Rome"], "bare !weather uses the default city");
});
