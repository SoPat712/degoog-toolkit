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

test("picker and conversion phrasings open the card", async () => {
  for (const query of [
    "color picker", "Colour picker", "hex color picker", "pick a color", "hex to rgb",
    "hex to rgb #00ff00", "convert #00ff00 to rgb", "#00ff00 to rgb", "teal to hex", "red in rgb",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of ["color wheel", "100 usd to eur", "time to hex", "fire in hex", "10 to rgb", "picker"]) {
    assert.equal(slot.trigger(query), false, query);
  }
  slot.init({ template: "" });
  assert.match((await slot.execute("color picker", {})).html, /#1A73E8/);
  assert.match((await slot.execute("hex to rgb #00ff00", {})).html, /rgb\(0, 255, 0\)/);
});

test("unnamed colors show the nearest name instead of None", async () => {
  const { readFile } = await import("node:fs/promises");
  slot.init({ template: await readFile(new URL("./template.html", import.meta.url), "utf8") });
  const named = await slot.execute("#008080", {});
  assert.match(named.html, /<span>teal<\/span>/);
  const unnamed = await slot.execute("rgb(10, 200, 30)", {});
  assert.doesNotMatch(unnamed.html, /None/);
  assert.match(unnamed.html, /<span>≈ [a-z]+<\/span>/);
});

test("platform code rows wrap, fold on narrow cards and use a modern mono face", async () => {
  const { readFile } = await import("node:fs/promises");
  const [template, css] = await Promise.all(["./template.html", "./style.css"].map((f) => readFile(new URL(f, import.meta.url), "utf8")));
  const more = template.slice(template.indexOf("data-clrtr-more-rows"), template.indexOf("data-clrtr-more "));
  assert.equal((more.match(/<textarea class="clrtr-value clrtr-value--code"/g) || []).length, 6);
  assert.doesNotMatch(more, /<input/);
  assert.match(css, /\.clrtr-card:not\(\.clrtr-show-more\) \.clrtr-more-rows \{\s*display: none;/);
  assert.doesNotMatch(css, /var\(--font-mono, monospace\)/);
  assert.match(css, /ui-monospace, "Roboto Mono", SFMono-Regular, Menlo, monospace/);
});
