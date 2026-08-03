import assert from "node:assert/strict";
import test from "node:test";

import { slot } from "./index.js";

await slot.init({
  template:
    '<div data-from="{{from_code}}" data-to="{{to_code}}" data-result="{{result}}"></div>',
});

test("loads and renders standard unit conversions", async () => {
  assert.equal(slot.trigger("100 lb to kg"), true);

  const output = await slot.execute("100 lb to kg", {
    tab: "all",
  });

  assert.match(output.html, /data-from="lb"/);
  assert.match(output.html, /data-to="kg"/);
  assert.equal(output.title, "");
});

test("renders on main slot path by default (above-results)", async () => {
  assert.equal(slot.trigger("12 ft to in"), true);
  const output = await slot.execute("12 ft to in", { tab: "all" });
  assert.match(output.html, /data-from="ft"/);
  assert.match(output.html, /data-to="in"/);
});

test("opens a default conversion for launcher queries", async () => {
  for (const query of ["unit converter", "convert units", "!unit"]) {
    assert.equal(slot.trigger(query), true);
    const output = await slot.execute(query, { tab: "all" });
    assert.match(output.html, /data-from="m"/);
    assert.match(output.html, /data-to="ft"/);
  }
});

test("renders comma-formatted and small length conversions", async () => {
  const cases = [
    ["16,093 meters to mi", "m", "mi", "9.9997"],
    ["12 ft to mi", "ft", "mi", "0.002273"],
  ];

  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.match(output.html, new RegExp(`data-from="${from}"`), query);
    assert.match(output.html, new RegExp(`data-to="${to}"`), query);
    assert.match(output.html, new RegExp(`data-result="${result}"`), query);
  }
});
