import assert from "node:assert/strict";
import test from "node:test";
import slot, { testNameResultRelevance } from "./index.js";

const MILE = 1609.34;
const TEST_LAT = "0";
const TEST_LON = "0";
const TEST_LOCATION_LABEL = "Test Center";

test("rejects distant partial chain matches", () => {
  assert.equal(
    testNameResultRelevance(
      "alpha and beta",
      {
        name: "Alpha and Company",
        brandName: "Alpha and Company",
        ontologyId: "chain:alpha-company",
        distanceMeters: 11.4 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
});

test("rejects nearby partial matches missing meaningful query tokens", () => {
  assert.equal(
    testNameResultRelevance(
      "alpha and beta",
      {
        name: "Alpha and Company",
        brandName: "Alpha and Company",
        ontologyId: "chain:alpha-company",
        distanceMeters: 2 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
});

test("rejects fuzzy title-like phrases inside unrelated long venue names", () => {
  assert.equal(
    testNameResultRelevance(
      "white collar",
      {
        name: "Formerly Main Street Wine Cellar New Hope",
        brandName: null,
        ontologyId: null,
        distanceMeters: 12.1 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
});

test("keeps strong exact business matches throughout the radius", () => {
  assert.equal(
    testNameResultRelevance(
      "Example Market",
      {
        name: "Example Market",
        brandName: null,
        ontologyId: null,
        distanceMeters: 14 * MILE,
      },
      25 * MILE,
    ),
    true,
  );
});

test("allows nearby branded fuzzy matches with full token coverage", () => {
  assert.equal(
    testNameResultRelevance(
      "Sample Goods",
      {
        name: "SampleGoods",
        brandName: "SampleGoods",
        ontologyId: "chain:sample-goods",
        distanceMeters: 3.8 * MILE,
      },
      25 * MILE,
    ),
    true,
  );
});

test("requires whole-token matches for short bare business names", () => {
  assert.equal(
    testNameResultRelevance(
      "aapl",
      {
        name: "Aap",
        brandName: null,
        ontologyId: null,
        distanceMeters: 18.8 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
  assert.equal(
    testNameResultRelevance(
      "goog",
      {
        name: "Good Goods Market",
        brandName: "Good Goods Market",
        ontologyId: "chain:good-goods-market",
        distanceMeters: 2.8 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
  assert.equal(
    testNameResultRelevance(
      "ABCD",
      {
        name: "ABCD",
        brandName: "ABCD",
        ontologyId: "chain:abcd",
        distanceMeters: 4 * MILE,
      },
      10 * MILE,
    ),
    true,
  );
  assert.equal(
    testNameResultRelevance(
      "acme",
      {
        name: "Acme Market",
        brandName: "Acme Market",
        ontologyId: "chain:acme-market",
        distanceMeters: 3 * MILE,
      },
      10 * MILE,
    ),
    true,
  );
});

test("defaults nearby searches to a 10 mile radius", () => {
  const radiusSetting = slot.settingsSchema.find(
    (field) => field.key === "defaultRadius",
  );
  assert.equal(radiusSetting?.default, "10");
  assert.deepEqual(radiusSetting?.options, ["2", "5", "10", "15", "25", "50"]);
});

test("uses the 10 mile radius when no saved radius exists", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: TEST_LAT,
    defaultLon: TEST_LON,
    defaultLocationLabel: TEST_LOCATION_LABEL,
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  let requestedRadius = "";
  const result = await slot.execute("Example Coffee near me", {
    fetch: async (url) => {
      requestedRadius = new URL(url).searchParams.get("in") || "";
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
        text: async () => "",
      };
    },
  });

  assert.match(requestedRadius, /;r=16093$/);
  assert.deepEqual(result, { html: "" });
});

test("keeps routine diagnostics disabled by default", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: TEST_LAT,
    defaultLon: TEST_LON,
    defaultLocationLabel: TEST_LOCATION_LABEL,
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  const originalLog = console.log;
  const messages = [];
  console.log = (...args) => messages.push(args);
  try {
    await slot.execute("Example Coffee near me", {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
        text: async () => "",
      }),
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(messages, []);
  const debugSetting = slot.settingsSchema.find(
    (field) => field.key === "debugMode",
  );
  assert.equal(debugSetting?.default, false);
});

test("renders empty HTML when HERE only returns distant partial matches", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: TEST_LAT,
    defaultLon: TEST_LON,
    defaultLocationLabel: TEST_LOCATION_LABEL,
    defaultRadius: "25",
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  const hereItems = [
    {
      id: "alpha-company-west",
      title: "Alpha and Company",
      position: { lat: 0.1, lng: 0.1 },
      distance: 11.4 * MILE,
      chains: [{ id: "chain:alpha-company", name: "Alpha and Company" }],
      address: { label: "100 Example Street, Example City" },
    },
    {
      id: "alpha-company-east",
      title: "Alpha and Company",
      position: { lat: -0.1, lng: -0.1 },
      distance: 14.4 * MILE,
      chains: [{ id: "chain:alpha-company", name: "Alpha and Company" }],
      address: { label: "200 Sample Avenue, Sample Town" },
    },
  ];

  const result = await slot.execute("alpha and beta", {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: hereItems }),
      text: async () => "",
    }),
  });

  assert.deepEqual(result, { html: "" });
});

test("does not render an unrelated winery for white collar", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: TEST_LAT,
    defaultLon: TEST_LON,
    defaultLocationLabel: TEST_LOCATION_LABEL,
    defaultRadius: "25",
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  const result = await slot.execute("white collar", {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "former-main-street-wine-cellar",
            title: "Formerly Main Street Wine Cellar New Hope",
            position: { lat: 0.1, lng: 0.1 },
            distance: 12.1 * MILE,
            categories: [{ name: "Winery" }],
            address: { label: "New Hope, PA 18938-1232" },
          },
        ],
      }),
      text: async () => "",
    }),
  });

  assert.deepEqual(result, { html: "" });
});

for (const [query, item] of [
  [
    "aapl",
    {
      id: "aap-example",
      title: "Aap",
      position: { lat: 0.2, lng: 0.2 },
      distance: 18.8 * MILE,
      address: { label: "300 Placeholder Road, Example City" },
    },
  ],
  [
    "goog",
    {
      id: "good-goods-market",
      title: "Good Goods Market",
      position: { lat: 0.03, lng: 0.03 },
      distance: 2.8 * MILE,
      chains: [{ id: "chain:good-goods-market", name: "Good Goods Market" }],
      address: { label: "400 Test Boulevard, Sample Town" },
    },
  ],
]) {
  test(`does not render unrelated HERE result for ${query}`, async () => {
    slot.configure({
      hereApiKey: "test-key",
      defaultLat: TEST_LAT,
      defaultLon: TEST_LON,
      defaultLocationLabel: TEST_LOCATION_LABEL,
      defaultRadius: "25",
      resultsCount: "5",
      useOsmGeocoder: false,
      useBrowserGeolocation: false,
    });

    const result = await slot.execute(query, {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ items: [item] }),
        text: async () => "",
      }),
    });

    assert.deepEqual(result, { html: "" });
  });
}

test("yields to an exact Yahoo Finance result before place lookup", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: TEST_LAT,
    defaultLon: TEST_LON,
    defaultLocationLabel: TEST_LOCATION_LABEL,
    defaultRadius: "10",
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  let fetchCalled = false;
  const result = await slot.execute("goog", {
    results: [{
      url: "https://finance.yahoo.com/quote/GOOG/",
      title: "Example Holdings (GOOG) Stock Price",
    }],
    fetch: async () => {
      fetchCalled = true;
      throw new Error("place lookup should not run");
    },
  });

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, { html: "" });
});
