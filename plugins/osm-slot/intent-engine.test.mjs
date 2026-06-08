import assert from "node:assert/strict";
import test from "node:test";
import { analyzePlaceIntent } from "./intent-engine.mjs";

const positiveFixtures = [
  ["Tacoria", { kind: "business", searchText: "Tacoria" }],
  ["Aikou", { kind: "business", searchText: "Aikou" }],
  ["Jazams", { kind: "business", searchText: "Jazams" }],
  ["Kohls near me", { kind: "business", searchText: "Kohls", confidence: "high" }],
  ["HomeGoods", { kind: "business", searchText: "HomeGoods" }],
  ["Dollar General", { kind: "business", searchText: "Dollar General" }],
  ["Tim Hortons", { kind: "business", searchText: "Tim Hortons" }],
  ["Noodles and Company", { kind: "business", searchText: "Noodles and Company" }],
  ["Small World Coffee", { kind: "business", searchText: "Small World Coffee" }],
  ["Joe's Pizza", { kind: "business", searchText: "Joe's Pizza" }],
  ["cafes around Princeton", { kind: "category", searchText: "cafes", locationText: "Princeton" }],
  ["directions to Eiffel Tower", { kind: "landmark", searchText: "Eiffel Tower", mode: "global" }],
  ["show me museums close to downtown Boston", {
    kind: "category",
    searchText: "museums",
    locationText: "downtown Boston",
  }],
  ["Tacoria near Princeton", {
    kind: "business",
    searchText: "Tacoria",
    locationText: "Princeton",
  }],
  ["Tim Hortons near Nassau Street", {
    kind: "business",
    searchText: "Tim Hortons",
    locationText: "Nassau Street",
  }],
  ["where ulta", { kind: "business", searchText: "ulta", confidence: "high" }],
  ["kung fu tea near princeton", {
    kind: "business",
    searchText: "kung fu tea",
    locationText: "princeton",
  }],
  ["lil sweet treat near rockefeller center", {
    kind: "business",
    searchText: "lil sweet treat",
    locationText: "rockefeller center",
  }],
  ["rockefeller center", {
    kind: "landmark",
    searchText: "rockefeller center",
    mode: "global",
  }],
  ["kung fu tea", { kind: "business", searchText: "kung fu tea" }],
  ["ulta near me", { kind: "business", searchText: "ulta", confidence: "high" }],
  ["where is ulta", { kind: "business", searchText: "ulta", confidence: "high" }],
  ["where is eiffel tower", {
    kind: "landmark",
    searchText: "eiffel tower",
    mode: "global",
  }],
  ["where is deer path family ymca", {
    kind: "business",
    searchText: "deer path family ymca",
  }],
  ["where is deer path ymca", {
    kind: "business",
    searchText: "deer path ymca",
  }],
  ["rockefeller plaza", {
    kind: "landmark",
    searchText: "rockefeller plaza",
    mode: "global",
  }],
  ["Tacowala", { kind: "business", searchText: "Tacowala" }],
  ["RS Pizza Bites", { kind: "business", searchText: "RS Pizza Bites" }],
  ["IHOP", { kind: "business", searchText: "IHOP" }],
  ["doctor near me", { kind: "category", searchText: "doctor", confidence: "high" }],
  ["pizza open near me", { kind: "category", searchText: "pizza", confidence: "high" }],
  ["chipotle", { kind: "business", searchText: "chipotle" }],
  ["pancheros", { kind: "business", searchText: "pancheros" }],
  ["starbucks", { kind: "business", searchText: "starbucks" }],
];

for (const [query, expected] of positiveFixtures) {
  test(`recognizes ${query}`, () => {
    const actual = analyzePlaceIntent(query);
    assert.ok(actual);
    assert.deepEqual(
      Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]])),
      expected,
    );
  });
}

for (const query of [
  "time in Tokyo",
  "pizza calories and nutrition",
  "where to buy ketchup",
  "weather Princeton",
  "react hooks",
  "python list comprehension",
  "play minesweeper",
  "100 miles in km",
  "concrete crack near pool",
  "crack near pool",
  "dog near fence",
  "concrete crack near Princeton",
  "HomeGoods near pool",
  "restaurants near pool",
  "coffee near pool",
  "crack in concrete near pool",
  "speedtest",
  "speed test",
  "time in japan",
  "what time in tokyo",
  "weather in rome",
  "until christmas",
  "stopwatch",
  "countdown",
  "play snake",
  "minesweeper",
  "define pizza",
  "pizza recipe",
  "what is pizza",
  "where is speedtest",
  "helium",
  "Helium",
  "hydrogen",
  "oxygen",
  "argon",
  "where is helium",
]) {
  test(`rejects ${query}`, () => {
    assert.equal(analyzePlaceIntent(query), null);
  });
}
