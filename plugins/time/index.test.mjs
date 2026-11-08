import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import time from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");

function memoryCache() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.get(key) ?? null; },
    async set(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    async clear() { store.clear(); },
  };
}

function geocoder(results) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(new URL(url).searchParams.get("name"));
    return Response.json({ results });
  };
  return { calls, fetch };
}

let cache = memoryCache();
test.beforeEach(async () => {
  cache = memoryCache();
  await time.init({ template, useCache: () => cache });
  time.configure({});
});

test("ordinary '<word> time' phrases are not places", () => {
  for (const query of [
    "prime time", "adventure time", "half time", "alarm clock", "world clock",
    "time in spanish", "daylight saving time", "daylight savings time", "real time",
    "tea time", "lead time", "time in a bottle", "local time",
  ]) {
    assert.equal(time.trigger(query), false, query);
  }
  for (const query of ["time in tokyo", "Paris time", "what time in Tokyo", "Austin time"]) {
    assert.equal(time.trigger(query), true, query);
  }
});

test("US zone names resolve without geocoding", async () => {
  const { calls, fetch } = geocoder([]);
  for (const [query, zone] of [
    ["eastern time", "America/New_York"],
    ["time in EST", "America/New_York"],
    ["eastern standard time", "America/New_York"],
    ["central time", "America/Chicago"],
    ["mountain time", "America/Denver"],
    ["pacific time", "America/Los_Angeles"],
    ["PT time", "America/Los_Angeles"],
  ]) {
    assert.equal(time.trigger(query), true, query);
    const { html } = await time.execute(query, { fetch, locale: "en-US" });
    assert.match(html, new RegExp(`data-timezone="${zone}"`), query);
  }
  assert.deepEqual(calls, []);
  const { html } = await time.execute("eastern time", { fetch, locale: "en-US" });
  assert.match(html, /Time in Eastern Time/);
});

test("unresolved searches render nothing and cache the miss", async () => {
  const { calls, fetch } = geocoder([]);
  assert.deepEqual(await time.execute("Nowhereville time", { fetch }), { title: "", html: "" });
  assert.deepEqual(await time.execute("Nowhereville time", { fetch }), { title: "", html: "" });
  assert.deepEqual(calls, ["Nowhereville"]);
});

test("an explicit !time still explains an unknown place", async () => {
  const { fetch } = geocoder([]);
  const { html } = await time.execute("!time Nowhereville", { fetch });
  assert.match(html, /Could not find a timezone for &quot;Nowhereville&quot;/);
});

test("ordinary searches need an exact, inhabited geocoder match", async () => {
  const fuzzy = geocoder([{ name: "Spanish Town", country: "Jamaica", population: 145000, timezone: "America/Jamaica", feature_code: "PPLA" }]);
  assert.deepEqual(await time.execute("Spanish Townx time", { fetch: fuzzy.fetch }), { title: "", html: "" });

  const hamlet = geocoder([{ name: "Prime", country: "Nowhere", population: 12, timezone: "UTC", feature_code: "PPL" }]);
  assert.deepEqual(await time.execute("time in Prime Hollow", { fetch: hamlet.fetch }), { title: "", html: "" });

  const city = geocoder([{ name: "Austin", country: "United States", population: 961855, timezone: "America/Chicago", feature_code: "PPLA" }]);
  const { html } = await time.execute("Austin time", { fetch: city.fetch, locale: "en-US" });
  assert.match(html, /data-timezone="America\/Chicago"/);
  assert.match(html, /Time in Austin, United States/);

  const bang = geocoder([{ name: "Prime Hollow", country: "Nowhere", population: 12, timezone: "UTC", feature_code: "PPL" }]);
  assert.match((await time.execute("!time Prime Hollow", { fetch: bang.fetch })).html, /data-timezone="UTC"/);
});

test("the clock restarts after a back/forward-cache restore and when a tab is shown again", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const listeners = { window: {}, document: {} };
  const on = (bucket) => (type, handler) => { (bucket[type] ||= []).push(handler); };
  const intervals = new Set();
  let nextId = 1;
  const clock = { textContent: "" };
  const card = {
    nodeType: 1,
    isConnected: true,
    dataset: { timezone: "UTC", hour12: "false", timeLive: "true" },
    matches: () => true,
    querySelector: (selector) => (selector === "[data-time-clock]" ? clock : null),
    querySelectorAll: () => [],
  };
  const document = {
    nodeType: 9,
    hidden: false,
    readyState: "complete",
    documentElement: { lang: "en" },
    addEventListener: on(listeners.document),
    querySelectorAll: () => [card],
  };
  const window = {
    addEventListener: on(listeners.window),
    setInterval: () => { const id = nextId++; intervals.add(id); return id; },
    clearInterval: (id) => intervals.delete(id),
  };
  const context = vm.createContext({
    window, document, Date, Intl,
    Node: { ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  vm.runInContext(source, context);
  assert.equal(intervals.size, 1);

  listeners.window.pagehide.shift()({ persisted: true });
  assert.equal(intervals.size, 0);
  clock.textContent = "stale";
  listeners.window.pageshow[0]({ persisted: true });
  assert.equal(intervals.size, 1, "ticker restarts after bfcache restore");
  assert.notEqual(clock.textContent, "stale");

  document.hidden = true;
  listeners.document.visibilitychange[0]();
  assert.equal(intervals.size, 0, "hidden tabs pause");
  document.hidden = false;
  clock.textContent = "stale";
  listeners.document.visibilitychange[0]();
  assert.equal(intervals.size, 1);
  assert.notEqual(clock.textContent, "stale");
});
