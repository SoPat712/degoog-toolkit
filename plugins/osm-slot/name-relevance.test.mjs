import assert from "node:assert/strict";
import test from "node:test";
import slot, { testNameResultRelevance } from "./index.js";

const MILE = 1609.34;

test("rejects distant partial chain matches", () => {
  assert.equal(
    testNameResultRelevance(
      "jack and coke",
      {
        name: "Janie and Jack",
        brandName: "Janie and Jack",
        ontologyId: "chain:example",
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
      "jack and coke",
      {
        name: "Janie and Jack",
        brandName: "Janie and Jack",
        ontologyId: "chain:example",
        distanceMeters: 2 * MILE,
      },
      25 * MILE,
    ),
    false,
  );
});

test("keeps strong exact business matches throughout the radius", () => {
  assert.equal(
    testNameResultRelevance(
      "Aikou",
      {
        name: "Aikou",
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
      "Home Goods",
      {
        name: "HomeGoods",
        brandName: "HomeGoods",
        ontologyId: "chain:homegoods",
        distanceMeters: 3.8 * MILE,
      },
      25 * MILE,
    ),
    true,
  );
});

test("renders empty HTML when HERE only returns distant partial matches", async () => {
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: "40.494628",
    defaultLon: "-74.799765",
    defaultLocationLabel: "Home",
    searchRadius: "25",
    resultsCount: "5",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });

  const hereItems = [
    {
      id: "janie-bridgewater",
      title: "Janie and Jack",
      position: { lat: 40.5864, lng: -74.61871 },
      distance: 11.4 * MILE,
      chains: [{ id: "chain:janie-and-jack", name: "Janie and Jack" }],
      address: { label: "400 Commons Way, Bridgewater, NJ" },
    },
    {
      id: "janie-princeton",
      title: "Janie and Jack",
      position: { lat: 40.31497, lng: -74.66039 },
      distance: 14.4 * MILE,
      chains: [{ id: "chain:janie-and-jack", name: "Janie and Jack" }],
      address: { label: "3535 US Highway 1, Princeton, NJ" },
    },
  ];

  const result = await slot.execute("jack and coke", {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: hereItems }),
      text: async () => "",
    }),
  });

  assert.deepEqual(result, { html: "" });
});
