import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";

test("everyday words that are also color names need color intent", () => {
  for (const query of [
    "rust", "ruby", "coffee", "salmon", "chocolate", "lemon", "mint", "wine",
    "gold", "champagne", "vanilla", "amber", "sage", "jasmine", "light",
    "medium", "pale", "red", "orange", "absolute zero", "fire brick",
    "white smoke", "little boy blue", "color", "hex color",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("color intent opens the card for any named color", () => {
  for (const query of [
    "salmon color", "color salmon", "salmon hex", "colour salmon",
    "salmon colour", "rust color code", "red color", "gold hex code",
    "wine rgb",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
});

test("unambiguous color names and literal values still open bare", () => {
  for (const query of [
    "chartreuse", "fuchsia", "teal", "cornflowerblue", "cornflower blue",
    "dark slate gray", "midnight blue", "navy blue", "light coral",
    "papayawhip", "antiquewhite1", "#ff0000", "ff0000", "abc hex",
    "rgb(1, 2, 3)", "hsl(120 50% 50%)",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
  assert.equal(slot.trigger("abc"), false);
});

test("an intent-suffixed query renders the same color as the prefixed form", async () => {
  slot.init({ template: "" });
  const suffixed = await slot.execute("salmon color", {});
  const prefixed = await slot.execute("color salmon", {});
  assert.ok(suffixed.html.length > 0);
  assert.equal(suffixed.html, prefixed.html);
  assert.deepEqual(await slot.execute("salmon", {}), { title: "", html: "" });
});
