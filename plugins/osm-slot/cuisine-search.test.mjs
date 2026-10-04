import assert from "node:assert/strict";
import test from "node:test";
import places, { routes } from "./index.js";

const refresh = routes.find((route) => route.path === "refresh").handler;
const restaurant = {
  id: "test-restaurant",
  title: "Golden Wok",
  position: { lat: 0, lng: 0 },
  distance: 200,
  address: { label: "Test location" },
  categories: [{ id: "100-1000-0000", name: "Restaurant" }],
  foodTypes: [{ name: "Chinese" }],
};

async function initialize(items = [restaurant]) {
  const requests = [];
  await places.init({
    fetch: async (url) => {
      requests.push(new URL(url));
      return Response.json({ items });
    },
  });
  places.configure({
    hereApiKey: "test-key",
    defaultLat: "0",
    defaultLon: "0",
    useOsmGeocoder: false,
    useBrowserGeolocation: false,
  });
  return requests;
}

for (const query of ["chinese food", "chinese restaurants", "vegan restaurants"]) {
  test(`${query} retains its qualifiers and doesn't require them in venue names`, async () => {
    const requests = await initialize();
    assert.equal(places.trigger(`${query} near me`), true);
    const { html } = await places.execute(`${query} near me`, {});
    assert.match(html, /Golden Wok/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, "/v1/discover");
    assert.equal(requests[0].searchParams.get("q"), query);
    assert.equal(requests[0].searchParams.has("categories"), false);
  });
}

test("Use my location refresh preserves cuisine results too", async () => {
  const requests = await initialize();
  const response = await refresh(new Request("https://example.test/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "chinese restaurants near me", lat: 0, lon: 0 }),
  }));
  assert.equal(response.status, 200);
  assert.match((await response.json()).html, /Golden Wok/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/v1/discover");
  assert.equal(requests[0].searchParams.get("q"), "chinese restaurants");
});

test("unqualified restaurants still use the category browse endpoint", async () => {
  const requests = await initialize();
  assert.match((await places.execute("restaurants near me", {})).html, /Golden Wok/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/v1/browse");
  assert.equal(requests[0].searchParams.get("categories"), "100-1000-0000");
});

test("named restaurants keep their name filter and free-text search", async () => {
  const requests = await initialize([restaurant, { ...restaurant, id: "named", title: "Golden Chinese Restaurant" }]);
  const { html } = await places.execute("Golden Chinese Restaurant near me", {});
  assert.match(html, /Golden Chinese Restaurant/);
  assert.doesNotMatch(html, /Golden Wok/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/v1/discover");
  assert.equal(requests[0].searchParams.get("q"), "Golden Chinese Restaurant");
});
