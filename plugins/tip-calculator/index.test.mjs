import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { slot } from "./index.js";
import { parseTipQuery } from "./parse-tip-query.js";

await slot.init({
  template:
    '<div data-bill="{{bill}}" data-tip-percent="{{tip_percent}}" data-split="{{split}}"></div>',
});
slot.configure({});

test("percentage-of queries are calculations, not tips", () => {
  for (const query of [
    "20% of 150",
    "what is 20% of 150",
    "how much is 20% of 80",
    "100 - 10%",
    "$100 + 15%",
  ]) {
    assert.equal(parseTipQuery(query), null, query);
    assert.equal(slot.trigger(query), false, query);
  }
  // An explicit tip word keeps the tip reading.
  assert.deepEqual(parseTipQuery("tip 20% of 150"), { bill: 150, tipPercent: 20, split: 1 });
});

test("a bill equal to the tip or split is not dropped", () => {
  const cases = [
    ["$20 bill 20% tip", { bill: 20, tipPercent: 20, split: 1 }],
    ["15% tip on $15", { bill: 15, tipPercent: 15, split: 1 }],
    ["$4 bill split 4 ways", { bill: 4, tipPercent: null, split: 4 }],
    ["$1000 bill 10% tip split 10 ways", { bill: 1000, tipPercent: 10, split: 10 }],
    ["20 tip on 20", { bill: 20, tipPercent: 20, split: 1 }],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(parseTipQuery(query), expected, query);
  }
});

test("keeps the canonical tip queries and rejects lookalikes", async () => {
  const positives = [
    ["120$ 20% split 4 ways", "120.00", "20", "4"],
    ["120$ 20% tip split 4 ways", "120.00", "20", "4"],
    ["120$ split 4", "120.00", "15", "4"],
    ["20% on 120 bill", "120.00", "20", "1"],
    ["20 percent on 120", "120.00", "20", "1"],
    ["10% on 50", "50.00", "10", "1"],
    ["tip calculator", "50.00", "15", "1"],
  ];
  for (const [query, bill, tip, split] of positives) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.equal(
      output.html,
      `<div data-bill="${bill}" data-tip-percent="${tip}" data-split="${split}"></div>`,
      query,
    );
  }
  for (const query of [
    "gardening tips",
    "calculator",
    "calculate",
    "20% off 120",
    "10% tax on 50",
    "about%3Adebugging%23%2Fruntime%2Fthis-firefox",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

test("a new target cancels the animation still running toward the old one", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const frames = new Map();
  let nextFrame = 1;
  const context = vm.createContext({
    requestAnimationFrame(callback) {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  });
  vm.runInContext(
    `const animationDuration = 250;
     const currentValues = { totalBill: 0 };
     const activeAnimations = { totalBill: null };
     ${extractFunction(source, "formatCurrency")}
     ${extractFunction(source, "animateValue")}`,
    context,
  );
  const flush = (timestamp) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(timestamp));
  };

  const element = { textContent: "$0.00" };
  context.animateValue("totalBill", 79, element);
  flush(0);
  flush(100);
  // Back to the value the first animation started from, mid-flight.
  context.animateValue("totalBill", 0, element);
  flush(150);
  flush(1000);
  flush(2000);
  assert.equal(element.textContent, "$0.00");
});
