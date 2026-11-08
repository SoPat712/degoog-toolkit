import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import slot, { routes, testNameResultRelevance } from "./index.js";
import { analyzePlaceIntent } from "./intent-engine.mjs";

const refresh = routes.find((route) => route.path === "refresh").handler;
const client = await readFile(new URL("card.js", import.meta.url), "utf8");

function configure(extra = {}) {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: "40.71",
    defaultLon: "-74.0",
    defaultRadius: "10",
    useOsmGeocoder: false,
    ...extra,
  });
}

function hereItem(title, extra = {}) {
  return {
    id: `here:${title}`,
    title,
    position: { lat: 40.712, lng: -74.001 },
    distance: 300,
    address: { label: `${title}, 1 Main St, New York, NY 10001, United States`, city: "New York", postalCode: "10001" },
    categories: [{ name: "Landmark", primary: true }],
    ...extra,
  };
}

function hereFetch(items, requests = []) {
  return async (url) => {
    requests.push(new URL(url));
    return Response.json({ items });
  };
}

function withFixedNow(iso, run) {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed]));
    }
    static now() {
      return fixed;
    }
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.Date = RealDate;
    });
}

const landmarkWordPhrases = [
  "square root of 2",
  "pyramid scheme",
  "tower defense",
  "college football",
  "temple run",
  "the square",
  "beach house",
  "lake house",
  "perfect square",
  "chi square",
  "control tower",
  "square of the hypotenuse",
  "tower defense reviews",
];

test("landmark words inside ordinary phrases do not trigger Places", () => {
  for (const query of landmarkWordPhrases) {
    assert.equal(analyzePlaceIntent(query), null, query);
    assert.equal(slot.trigger(query), false, query);
  }
});

test("landmark-word phrases spend no HERE quota when execute is called directly", async () => {
  configure();
  let requests = 0;
  for (const query of landmarkWordPhrases) {
    const { html } = await slot.execute(query, {
      fetch: async () => {
        requests++;
        return Response.json({ items: [hereItem("Square")] });
      },
    });
    assert.equal(html, "", query);
  }
  assert.equal(requests, 0);
});

test("named landmarks keep their global lookup", () => {
  for (const query of [
    "eiffel tower",
    "times square",
    "golden gate bridge",
    "tower of london",
    "lake tahoe",
    "yellowstone national park",
    "penn station",
    "where is the tower",
  ]) {
    const intent = analyzePlaceIntent(query);
    assert.equal(intent?.kind, "landmark", query);
    assert.equal(intent.mode, "global", query);
  }
  assert.equal(slot.trigger("coffee near me"), true);
});

test("a name the query merely contains is not a confident match", () => {
  const near = (name, brandName = null) => ({ name, brandName, distanceMeters: 500 });
  assert.equal(testNameResultRelevance("square root of 2", near("Square"), 16000), false);
  assert.equal(testNameResultRelevance("pyramid scheme", near("Pyramid"), 16000), false);
  assert.equal(testNameResultRelevance("tower defense", near("Tower"), 16000), false);
  assert.equal(testNameResultRelevance("temple run", near("Temple"), 16000), false);
  // A name covering most of the query, or a same-length name, still matches.
  assert.equal(testNameResultRelevance("eiffel tower paris", near("Eiffel Tower"), 16000), true);
  assert.equal(testNameResultRelevance("eiffel tower", near("Tour Eiffel"), 16000), true);
  assert.equal(testNameResultRelevance("starbucks coffee", near("Starbucks", "Starbucks"), 16000), true);
});

test("global landmark search drops partial-name HERE hits", async () => {
  configure();
  const { html } = await slot.execute("times square", { fetch: hereFetch([hereItem("Times")]) });
  assert.equal(html, "");
  const match = await slot.execute("times square", { fetch: hereFetch([hereItem("Times"), hereItem("Times Square")]) });
  assert.match(match.html, /Times Square/);
  assert.doesNotMatch(match.html, /data-place-name="Times"/);
});

const pharmacy = (extra = {}) => ({
  id: "pharmacy",
  title: "Corner Pharmacy",
  position: { lat: 40.712, lng: -74.001 },
  distance: 300,
  address: { label: "Corner Pharmacy, 1 Main St, New York, NY 10001, United States", city: "New York", postalCode: "10001" },
  categories: [{ name: "Pharmacy", primary: true }],
  openingHours: [{ isOpen: true, text: ["Mon-Fri: 09:00 - 22:00", "Sat: closed", "Sun: closed"] }],
  ...extra,
});

function todayHours(html) {
  return html.match(/<span class="places-today-hours"([^>]*)>([^<]*)<\/span>/);
}

test("today's hours follow the place time zone, not the server clock", async () => {
  configure();
  // Friday 9 PM in New York is already Saturday in UTC.
  await withFixedNow("2026-11-07T02:00:00Z", async () => {
    const requests = [];
    const { html } = await slot.execute("pharmacy", {
      fetch: hereFetch([pharmacy({ timeZone: { name: "America/New_York", utcOffset: "-05:00" } })], requests),
    });
    assert.equal(requests[0].searchParams.get("show"), "tz");
    const today = todayHours(html);
    assert.equal(today[2], "{{ t:plugin-osm-slot.closesAt }} 10 PM");
    assert.doesNotMatch(today[1], /data-hours-by-day/);
  });
});

test("without a place time zone the client gets every weekday's summary", async () => {
  configure();
  await withFixedNow("2026-11-07T02:00:00Z", async () => {
    const { html } = await slot.execute("pharmacy", { fetch: hereFetch([pharmacy()]) });
    const today = todayHours(html);
    const byDay = JSON.parse(today[1].match(/data-hours-by-day="([^"]*)"/)[1].replace(/&quot;/g, '"'));
    assert.equal(byDay.length, 7);
    assert.equal(byDay[5], "{{ t:plugin-osm-slot.closesAt }} 10 PM");
    assert.equal(byDay[6], "{{ t:plugin-osm-slot.closedToday }}");
  });
});

test("cards keep the street line and drop the venue name, postcode and country", async () => {
  configure();
  const items = [
    ["Stumptown Coffee Roasters", "Stumptown Coffee Roasters, 1026 SW Stark St, Portland, OR 97205, United States", "97205"],
    ["Café Lumière", "Café Lumière, 5 Rue de Rivoli, 75001 Paris, France", "75001"],
    ["Central Park", "Central Park, New York, NY 10024, United States", "10024"],
  ].map(([title, label, postalCode], index) => ({
    id: `cafe-${index}`,
    title,
    position: { lat: 40.71, lng: -74.0 },
    distance: 200 + index,
    address: { label, postalCode, city: "x" },
    categories: [{ name: "Coffee Shop", primary: true }],
  }));
  const { html } = await slot.execute("coffee near me", { fetch: hereFetch(items) });
  const addresses = [...html.matchAll(/class="places-address"[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(addresses, ["1026 SW Stark St, Portland", "5 Rue de Rivoli, Paris", "New York, NY"]);
});

test("refresh rejects unclassified queries without calling HERE", async () => {
  configure();
  let requests = 0;
  await slot.init({
    fetch: async () => {
      requests++;
      return Response.json({ items: [hereItem("Square")] });
    },
  });
  configure();
  for (const query of ["square root of 2", "ExampleGoods", "react hooks", ""]) {
    const response = await refresh(new Request("https://example.test/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 40.71, lon: -74.0, query }),
    }));
    assert.equal(response.status, 400, query);
  }
  assert.equal(requests, 0);
});

test("refresh applies the execute name gate to global landmark queries", async () => {
  await slot.init({ fetch: hereFetch([hereItem("Times")]) });
  configure();
  const response = await refresh(new Request("https://example.test/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 40.71, lon: -74.0, query: "times square" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).html, "");
});

test("the location button refreshes the original query, not the extracted text", async () => {
  configure({ useBrowserGeolocation: true });
  const { html } = await slot.execute("where is acme", { fetch: hereFetch([hereItem("Acme")]) });
  assert.match(html, /class="places-geo-btn" data-query="where is acme"/);
  configure();
});

test("near-hints keep the full landmark name and its narrower radius", async () => {
  assert.equal(analyzePlaceIntent("starbucks near penn station").locationText, "penn station");
  assert.equal(analyzePlaceIntent("coffee near seattle open now").locationText, "seattle");
  assert.equal(analyzePlaceIntent("pizza in brooklyn ny").locationText, "brooklyn ny");

  configure();
  const requests = [];
  await slot.execute("starbucks near penn station", {
    fetch: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.hostname.startsWith("geocode.")) {
        return Response.json({ items: [{
          title: "Penn Station, New York, NY, United States",
          resultType: "place",
          address: { label: "Penn Station, New York, NY, United States", city: "New York" },
          position: { lat: 40.7506, lng: -73.9935 },
        }] });
      }
      return Response.json({ items: [] });
    },
  });
  const geocode = requests.find((url) => url.hostname.startsWith("geocode."));
  assert.equal(geocode.searchParams.get("q"), "penn station");
  const discover = requests.find((url) => url.pathname === "/v1/discover");
  assert.match(discover.searchParams.get("in"), /;r=8047$/);
});

function clientHarness() {
  const listeners = [];
  const pending = [];
  let wraps = [];
  let todayEls = [];
  let observerCallback = null;
  const modal = (wrap) => ({ hidden: true, querySelectorAll: () => [], querySelector: () => null, wrap });
  const makeWrap = () => {
    const wrap = { dataset: {} };
    const dialog = modal(wrap);
    wrap.querySelector = (selector) => (selector === "[data-places-modal]" ? dialog : null);
    wrap.querySelectorAll = () => [];
    return wrap;
  };
  const document = {
    documentElement: { getAttribute: () => null },
    body: {},
    addEventListener: (type, listener) => listeners.push({ type, listener }),
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === ".places-wrap:not([data-places-modal-init])") {
        return wraps.filter((wrap) => !wrap.dataset.placesModalInit);
      }
      if (selector === ".places-today-hours[data-hours-by-day]:not([data-hours-day-init])") {
        return todayEls.filter((el) => !el.dataset.hoursDayInit);
      }
      return [];
    },
  };
  const context = {
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        if (target === document.body) observerCallback = this.callback;
      }
    },
    requestAnimationFrame: (callback) => {
      pending.push(callback);
      return pending.length;
    },
    __PLUGIN_ID__: "test",
  };
  return {
    context,
    listeners,
    addWraps: (count) => {
      wraps = wraps.concat(Array.from({ length: count }, makeWrap));
    },
    setTodayEls: (els) => {
      todayEls = els;
    },
    run: () => vm.runInNewContext(client, context),
    mutate: () => {
      observerCallback([{ removedNodes: [] }]);
      while (pending.length) pending.shift()();
    },
  };
}

test("directions modals share one document keydown listener across searches", () => {
  const harness = clientHarness();
  harness.addWraps(2);
  harness.run();
  harness.addWraps(3);
  harness.mutate();
  harness.addWraps(1);
  harness.mutate();
  assert.equal(harness.listeners.filter(({ type }) => type === "keydown").length, 1);
});

test("the client picks today's hours from the browser weekday", () => {
  const harness = clientHarness();
  const RealDate = Date;
  // Friday in the browser's own time zone.
  harness.context.Date = class extends RealDate {
    getDay() {
      return 5;
    }
  };
  const el = {
    dataset: { hoursByDay: JSON.stringify(["Closed today", "", "", "", "", "Closes 10 PM", "Closed today"]) },
    textContent: "Closed today",
  };
  harness.setTodayEls([el]);
  harness.run();
  assert.equal(el.textContent, "Closes 10 PM");
});

test("the single-column list scrolls sideways instead of slicing cards vertically", async () => {
  const css = await readFile(new URL("style.css", import.meta.url), "utf8");
  const block = css.slice(css.indexOf("@container (max-width: 779px)"));
  assert.ok(block.length > 0);
  const listRule = block.slice(block.indexOf(".places-list-col {")).split("}", 1)[0];
  assert.match(listRule, /max-height: none/);
  assert.match(listRule, /overflow-x: auto/);
  assert.match(listRule, /scroll-snap-type: x mandatory/);
  assert.match(block.slice(block.indexOf(".places-grid {")).split("}", 1)[0], /grid-auto-flow: column/);
  // No viewport rule may re-impose the vertical scroller on phones.
  assert.doesNotMatch(css.slice(css.indexOf("@media (max-width: 520px)")), /\.places-list-col\s*\{[^}]*max-height/);
});
