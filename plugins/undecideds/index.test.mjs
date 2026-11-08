import assert from "node:assert/strict";
import test from "node:test";

import { slot, testNormalizeRange } from "./index.js";

slot.init({
  template:
    '<div data-mode="{{active_tab}}" data-die-type="{{die_type}}"></div>',
});

test("keeps dice trigger word boundaries", () => {
  assert.equal(slot.trigger("roll d20"), true);
  assert.equal(slot.trigger("roll d20foo"), false);
});

test("rejects unsupported and incidental dice text", () => {
  assert.equal(slot.trigger("120 sided dice"), false);
  assert.equal(slot.trigger("roll d8"), false);
  assert.equal(slot.trigger("price of d6 stock"), false);
  assert.equal(slot.trigger("roll a 6 sided die"), true);
  assert.equal(slot.trigger("roll a 20 sided die"), true);
});

test("normalizes, swaps, and bounds number ranges", () => {
  assert.deepEqual(testNormalizeRange(10, -5), { min: -5, max: 10 });
  assert.deepEqual(testNormalizeRange("-99999999999", "99999999999"), {
    min: -1_000_000_000,
    max: 1_000_000_000,
  });
  assert.deepEqual(testNormalizeRange("invalid", ""), { min: 1, max: 100 });
});

test("recognizes number ranges phrased with between/and", async () => {
  for (const query of [
    "random number between 1 and 10",
    "pick a number between 1 and 10",
    "random number between 5-15",
    "random number from 1 to 20",
    "number between 1 and 10",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }

  slot.init({ template: '<div data-mode="{{active_tab}}" data-min="{{num_min}}" data-max="{{num_max}}"></div>' });
  const { html } = await slot.execute("random number between 1 and 10", {});
  assert.match(html, /data-mode="number" data-min="1" data-max="10"/);
});

test("keeps incidental decision wording out", () => {
  for (const query of [
    "random number generator algorithm",
    "random number between friends",
    "coin toss probability",
    "yes or no questions for kids",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("reduced motion stops animation without resetting result poses", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(start, -1);
  let depth = 0;
  let end = css.indexOf("{", start);
  for (let i = end; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) { end = i; break; }
  }
  const rules = css.slice(css.indexOf("{", start) + 1, end).split("}");
  for (const rule of rules) {
    const [selectors = "", body = ""] = rule.split("{");
    if (!/\btransform\s*:/.test(body)) continue;
    // The coin, d6 and yes/no wheel display their result through a transform.
    assert.doesNotMatch(selectors, /coin-entity|die-d6|wheel-spinner/, selectors.trim());
  }
});
