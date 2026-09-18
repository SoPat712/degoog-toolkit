import assert from "node:assert/strict";
import test from "node:test";
import places from "./index.js";
import { analyzePlaceIntent, registerIntentAdapter } from "./intent-engine.mjs";

const rejected = [
  "IP address", "email address", "MAC address", "phone reviews", "app reviews",
  "where is config", "where is memory stored", "where is my order", "where is pizza from",
  "where does coffee come from", "Acme Technologies", "OpenAI", "cloud services",
  "coffee benefits", "Indian holidays", "Diwali", "whens christmas", "time to hannukah",
  "Diwali in India", "where is Christmas", "hermes agent near me", "software settings address",
  "restaurant website tutorial", "pizza menu calories", "Python library near me",
];
for (const query of rejected) test(`reject locally: ${query}`, () => assert.equal(analyzePlaceIntent(query), null));

for (const [query, kind, searchText] of [
  ["vegan restaurants near me", "category", "vegan restaurants"],
  ["gluten free restaurants in Rome", "category", "gluten free restaurants"],
  ["Starbucks hours", "business", "Starbucks"],
  ["Apple Store near me", "business", "Apple Store"],
  ["libraries near me", "category", "libraries"],
  ["Tower of London", "landmark", "Tower of London"],
  ["directions to Eiffel Tower", "landmark", "Eiffel Tower"],
  ["restaurant opening hours", "category", "restaurant"],
]) test(`keep local: ${query}`, () => {
  const intent = analyzePlaceIntent(query);
  assert.ok(intent);
  assert.equal(intent.kind, kind);
  assert.equal(intent.searchText, searchText);
});

test("rejected searches make zero network requests even if execute is called directly", async () => {
  places.configure({ hereApiKey: "test-not-a-real-key", defaultLat: "40", defaultLon: "-74" });
  let requests = 0;
  for (const query of rejected) {
    const result = await places.execute(query, { fetch: async () => { requests++; throw new Error("Unexpected network access"); } });
    assert.equal(result.html, "", query);
  }
  assert.equal(requests, 0);
});

test("unambiguous cheap negatives do not invoke the NLP adapter", () => {
  let parses = 0;
  registerIntentAdapter("test", () => { parses++; throw new Error("Unexpected NLP"); });
  for (const query of ["IP address", "where is config", "Diwali", "time to hannukah", "a".repeat(101)]) {
    assert.equal(analyzePlaceIntent(query, { locale: "test" }), null);
  }
  assert.equal(parses, 0);
});
