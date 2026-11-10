import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { slot as weather } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const scriptSource = await readFile(new URL("./card.js", import.meta.url), "utf8");
await weather.init({ template });

test.beforeEach(() => weather.configure({ defaultCity: "" }));

test("weak weather words need a preposition or a known place", () => {
  for (const query of [
    "tequila sunrise", "jessica alba", "sunset boulevard", "nice weather", "sales forecast",
    "python forecast", "body temperature", "cold weather", "weather balloon", "before sunrise",
    "hyundai tempo", "under the weather", "weather vs climate", "weather and climate",
    "weather girl", "weather report band", "the weather network", "stormy weather",
    "weather the storm", "weather in a box", "weather in may", "el tiempo", "clima organizacional",
    "weathering steel", "best weather app", "forecast model", "temperature 20 c",
  ]) {
    assert.equal(weather.trigger(query), false, query);
  }
  for (const query of [
    "weather in rome", "rome weather", "london forecast today", "what is the weather in Rome",
    "how is the weather in Rome", "sunrise in tokyo", "tokyo sunrise", "london temperature",
    "boston forecast", "forecast for paris", "temperature in paris", "Albany, NY forecast",
    "new york weather forecast", "weather nyc", "wetter berlin",
  ]) {
    assert.equal(weather.trigger(query), true, query);
  }
});

test("natural questions, time words and postal codes reach the right place", async () => {
  const cases = [
    ["what's the weather like in paris", "paris"],
    ["what will the weather be like in Paris", "Paris"],
    ["paris weather this weekend", "paris"],
    ["will it rain in london", "london"],
    ["will it rain tomorrow in boston", "boston"],
    ["weather in 90210", "90210"],
    ["weather in paris this weekend", "paris"],
    ["temperature in tokyo now", "tokyo"],
    ["weather in Rome tonight", "Rome"],
  ];
  for (const [query, target] of cases) {
    assert.equal(weather.trigger(query), true, query);
    let requested = "";
    await weather.execute(query, {
      fetch: async (url) => {
        requested = new URL(url).searchParams.get("q");
        return Response.json([]);
      },
    });
    assert.equal(requested, target, query);
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;
function forecast({ visibilityUnit, visibility, isDay = 0 }) {
  const start = Date.UTC(2026, 10, 8);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
  const days = [...Array(7).keys()];
  const hours = [...Array(168).keys()];
  return {
    utc_offset_seconds: 0,
    hourly_units: { visibility: visibilityUnit },
    daily_units: { visibility_mean: visibilityUnit },
    current: {
      temperature_2m: 10, apparent_temperature: 8, weather_code: 0, is_day: isDay,
      relative_humidity_2m: 70, wind_speed_10m: 5, wind_gusts_10m: 9, wind_direction_10m: 90,
      pressure_msl: 1013, uv_index: 0, cloud_cover: 5, precipitation: 0, dew_point_2m: 4,
    },
    hourly: {
      time: hours.map((h) => iso(start + h * 3600000)),
      temperature_2m: hours.map((h) => 5 + (h % 24) / 2),
      apparent_temperature: hours.map((h) => 4 + (h % 24) / 2),
      precipitation_probability: hours.map(() => 10),
      wind_speed_10m: hours.map(() => 5),
      wind_gusts_10m: hours.map(() => 9),
      cloud_cover: hours.map(() => 40),
      visibility: hours.map(() => visibility),
      relative_humidity_2m: hours.map(() => 70),
    },
    daily: {
      time: days.map((d) => iso(start + d * DAY_MS).slice(0, 10)),
      weather_code: days.map((d) => (d === 0 ? 63 : 3)),
      temperature_2m_max: days.map(() => 16),
      temperature_2m_min: days.map(() => 3),
      sunrise: days.map((d) => iso(start + d * DAY_MS + 7 * 3600000)),
      sunset: days.map((d) => iso(start + d * DAY_MS + 17 * 3600000)),
      precipitation_sum: days.map(() => 0),
      precipitation_probability_max: days.map(() => 20),
      dew_point_2m_mean: days.map((d) => 1 + d),
      pressure_msl_mean: days.map((d) => 1000 + d),
      visibility_mean: days.map(() => visibility),
      daylight_duration: days.map(() => 36000),
    },
  };
}

async function render(settings, wx) {
  weather.configure(settings);
  const { html } = await weather.execute("weather in Rome", {
    fetch: async (url) => (String(url).includes("nominatim")
      ? Response.json([{ lat: "41.9", lon: "12.5", addresstype: "city", address: { city: "Rome" } }])
      : Response.json(wx)),
  });
  const raw = html.match(/data-weather-payload="([^"]*)"/)[1];
  const payload = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  return { html, raw, payload };
}

test("visibility honours the unit Open-Meteo reports", async () => {
  // precipitation_unit=inch makes Open-Meteo answer in feet: 32,808 ft = 10 km.
  const imperial = await render(
    { units: "fahrenheit", precipUnit: "inch" },
    forecast({ visibilityUnit: "ft", visibility: 32808 }),
  );
  assert.equal(imperial.payload.current.visibility, "6.2 mi");
  const metric = await render(
    { units: "celsius", precipUnit: "mm" },
    forecast({ visibilityUnit: "m", visibility: 10000 }),
  );
  assert.equal(metric.payload.current.visibility, "10 km");
});

test("future days carry their own dew point, pressure and visibility", async () => {
  const { payload } = await render(
    { units: "celsius", precipUnit: "mm", pressureUnit: "hPa" },
    forecast({ visibilityUnit: "m", visibility: 20000 }),
  );
  assert.equal(payload.days[2].dewPoint, 3);
  assert.equal(payload.days[2].pressure, "1002");
  assert.equal(payload.days[2].visibility, "20 km");
});

class FakeElement {
  constructor() {
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; }
}

function hydrate(raw, chartWidth) {
  const parts = new Map();
  const card = new FakeElement();
  card.nodeType = 1;
  card.dataset.weatherPayload = raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  card.matches = (selector) => selector === ".weather-result";
  card.querySelector = (selector) => {
    if (!parts.has(selector)) {
      const el = new FakeElement();
      el.parentNode = new FakeElement();
      parts.set(selector, el);
    }
    return parts.get(selector);
  };
  parts.set("[data-weather-days]", null);
  card.querySelector("[data-weather-chart]").clientWidth = chartWidth;
  card.querySelector("[data-weather-chart]").clientHeight = 140;
  const document = {
    nodeType: 9,
    readyState: "complete",
    body: {},
    documentElement: {},
    createElement: () => new FakeElement(),
    createElementNS: () => new FakeElement(),
    querySelector: () => null,
    querySelectorAll: () => [card],
    addEventListener() {},
  };
  const context = vm.createContext({
    window: { innerWidth: 360, addEventListener() {}, removeEventListener() {} },
    document,
    requestAnimationFrame() {},
    MutationObserver: class { observe() {} },
  });
  vm.runInContext(scriptSource, context);
  return (selector) => card.querySelector(selector);
}

test("today's hero shows current conditions with a night icon, not the daily worst", async () => {
  const { raw } = await render({ units: "celsius" }, forecast({ visibilityUnit: "m", visibility: 10000, isDay: 0 }));
  const el = hydrate(raw, 640);
  assert.equal(el("[data-weather-desc]").textContent, "{{ t:plugin-weather-slot.wmo_0 }}");
  assert.match(el("[data-weather-icon-slot]").innerHTML, /<path d="M38 32/, "clear night renders the moon");
  assert.equal(el("[data-weather-dew]").textContent, "4°C");
});

test("narrow charts draw the full day at real size with spaced hour labels", async () => {
  const { raw } = await render({ units: "celsius" }, forecast({ visibilityUnit: "m", visibility: 10000 }));
  const el = hydrate(raw, 300);
  const [mount] = el("[data-weather-chart]").children;
  const [svg, axis] = mount.children;
  assert.equal(svg.attributes.viewBox, "0 0 300 122");
  assert.equal(mount.style.width, undefined, "no horizontal scroll strip");
  assert.equal(axis.children.length, 6);
  assert.equal(axis.children[1].textContent, "4 AM");
});

test("times follow the locale clock and the detail tiles do not repeat the hero", async () => {
  const { payload, html } = await render({ units: "celsius", timeFormat: "12h" }, forecast({ visibilityUnit: "m", visibility: 10000 }));
  assert.equal(payload.days[0].srStr, "7:00 AM");
  assert.match(payload.days[0].daylight, /^10 hr 0 min$/);
  const { payload: h24 } = await render({ units: "celsius", timeFormat: "24h" }, forecast({ visibilityUnit: "m", visibility: 10000 }));
  assert.equal(h24.days[0].srStr, "07:00");
  assert.doesNotMatch(html, /data-weather-humidity-detail/);
  assert.equal(html.match(/data-weather-daylight>([^<]*)</)?.[1], payload.days[0].daylight);
  assert.match(template, /t:plugin-weather-slot\.precipAmount/);
});

test("narrow cards keep one tab row, all seven days and no dangling eyebrow dot", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.weather-day-card:nth-child\(n\+5\)/);
  assert.doesNotMatch(css, /\.weather-tabs \{[^}]*display: grid/);
  assert.match(css, /\.weather-tabs \{[^}]*overflow-x: auto/);
  assert.doesNotMatch(template.match(/<div class="weather-eyebrow[^"]*">[\s\S]*?<\/div>/)[0], /·/);
  assert.match(scriptSource, /syncScrollHint\(daysTrack\)/);
});
