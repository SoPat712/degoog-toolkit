import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { slot } from "./index.js";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("HTML tag names and ambiguous bare symbols do not open the table", () => {
  for (const query of ["li element", "br element", "LI element", "b element", "p element", "th element", "u element", "Es", "es", "He", "In", "C"]) {
    assert.equal(slot.trigger(query), false, query);
  }
  for (const query of ["Li element", "Br element", "element gold", "iron element", "oxygen", "neon", "Fe", "atomic number 1"]) {
    assert.equal(slot.trigger(query), true, query);
  }
});

test("questions about a property the card shows open the table", async () => {
  for (const query of ["atomic mass of carbon", "Atomic mass of Carbon?", "melting point of iron", "boiling point of Hg", "carbon atomic mass", "electron configuration of oxygen", "atomic weight for sodium"]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of ["melting point of chocolate", "boiling point of water", "atomic mass of in", "atomic number of 6", "lead singer", "iron man"]) {
    assert.equal(slot.trigger(query), false, query);
  }
  slot.init({ template: '<div data-default-element="{{default_element}}"></div>' });
  const { html } = await slot.execute("atomic mass of carbon", {});
  assert.match(html, /data-default-element="carbon"/);
});

test("narrow cells drop element names and the phone sheet uses plain rows", async () => {
  const [css, template] = await Promise.all([read("style.css"), read("template.html")]);
  assert.match(css, /@container pt-table \(max-width: 1220px\) \{\s*\.pt-element-name \{\s*display: none;/);
  assert.match(css, /\.pt-placeholder-cell \.pt-element-sym \{[^}]*white-space: nowrap/);
  assert.doesNotMatch(template, /class="pt-info-label">[^<]*:<\/span>/);
});

test("element categories and states use plugin-prefixed classes", async () => {
  const [css, script] = await Promise.all([read("style.css"), read("card.js")]);
  const generic = /^\s*\.(?:state-[a-z]+|alkali-metal|alkaline-earth-metal|transition-metal|lanthanide|actinide|post-transition-metal|metalloid|reactive-nonmetal|noble-gas|unknown)\b/m;
  assert.doesNotMatch(css, generic);
  assert.match(css, /^\.pt-cat-unknown \{/m);
  assert.match(css, /^\.pt-state-gas \{/m);
  assert.match(script, /`pt-element pt-cat-\$\{el\.cat\}`/);
  assert.match(script, /pt-state-indicator pt-state-\$\{/);
  assert.doesNotMatch(script, /"state-indicator|`state-indicator/);
});

test("only the grid scrolls and a faded edge marks hidden columns", async () => {
  const [template, css, script] = await Promise.all([read("template.html"), read("style.css"), read("card.js")]);
  const scroller = template.indexOf("data-pt-scroller");
  assert.ok(template.indexOf("data-pt-detail-display") < scroller, "detail panel sits outside the scroller");
  assert.ok(scroller < template.indexOf("data-pt-grid"), "grid sits inside the scroller");
  assert.match(css, /\.pt-table-container\.pt-more-right \{[^}]*mask-image/);
  assert.match(css, /\.pt-table-container\.pt-more-left \{[^}]*mask-image/);
  assert.match(script, /classList\.toggle\("pt-more-right"/);
  assert.match(script, /scrollerObserver\?\.disconnect\(\)/);
});

test("temperature presets and orbital letters stay legible", async () => {
  const css = await read("style.css");
  assert.match(css, /\.pt-preset-btn \{[^}]*white-space: nowrap/);
  for (const block of ["s", "p", "d", "f"]) {
    assert.match(css, new RegExp(`\\.subshell-${block} \\{ color: color-mix\\(in srgb, var\\(--pt-[a-z]+\\) 45%, var\\(--text-primary\\)\\); \\}`));
  }
});
