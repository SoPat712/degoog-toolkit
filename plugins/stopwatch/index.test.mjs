import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { slot } from "./index.js";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("unitless numbers start a timer only in a bare timer query", async () => {
  await slot.init({ template: "{{mode}}|{{duration_seconds}}|{{autostart}}" });
  for (const query of ["555 timer pinout", "the final countdown 1986", "countdown to christmas 2026", "egg timer 5", "timer 555 pinout"]) {
    assert.equal(slot.trigger(query), false, query);
    assert.equal((await slot.execute(query, {})).html, "", query);
  }
  for (const [query, html] of [
    ["timer 5", "timer|300|true"], ["5 timer", "timer|300|true"], ["countdown 10", "timer|600|true"],
    ["set a timer for 5", "timer|300|true"], ["minuteur 5", "timer|300|true"],
    ["timer 5 minutes", "timer|300|true"], ["10 min timer", "timer|600|true"], ["countdown 2 hours", "timer|7200|true"],
    ["timer", "timer|300|false"], ["stopwatch", "stopwatch|300|false"],
  ]) {
    assert.equal(slot.trigger(query), true, query);
    assert.equal((await slot.execute(query, {})).html, html, query);
  }
});

test("timer digits scale with the ring and the length of the readout", async () => {
  const [css, script] = await Promise.all([read("style.css"), read("card.js")]);
  assert.match(css, /\.timer-circle \{[^}]*container-type: inline-size/);
  assert.match(css, /\.timer-display \{[^}]*font-size: min\(2rem, calc\(136cqi \/ var\(--timer-chars, 8\)\)\)/);
  assert.match(script, /display\.style\.setProperty\("--timer-chars", String\(text\.length\)\)/);
});
