import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { slot } from "./index.js";
import safeMathParserModule from "./vendor/safe-math-parser.cjs";

slot.init({
  template:
    '<div data-result="{{display_result}}" data-graph="{{graph_mode}}"></div>',
});

test("loads the parser and executes calculator queries", async () => {
  assert.equal(slot.trigger("2+2"), true);
  const output = await slot.execute("2+2", { lang: "en-US" });
  assert.match(output.html, /data-result="4"/);
  assert.match(output.html, /data-graph="false"/);
});

test("supports additional scientific functions", async () => {
  assert.equal(slot.trigger("sinh(0)+abs(-4)"), true);
  const output = await slot.execute("sinh(0)+abs(-4)", { lang: "en-US" });
  assert.match(output.html, /data-result="4"/);
});

test("supports explicit constants and multiple graph series", async () => {
  assert.equal(slot.trigger("graph 5"), true);
  assert.equal(slot.trigger("graph sin(x); cos(x); x/2"), true);

  const constant = await slot.execute("graph 5", { lang: "en-US" });
  const multiple = await slot.execute("graph sin(x); cos(x); x/2", {
    lang: "en-US",
  });

  assert.match(constant.html, /data-result=""/);
  assert.match(constant.html, /data-graph="true"/);
  assert.match(multiple.html, /data-graph="true"/);
});

test("safe parser rejects code-oriented and object traversal syntax", () => {
  const Parser = safeMathParserModule.Parser;
  const parser = new Parser();
  parser.functions.max = Math.max;

  for (const expression of [
    "constructor(1)",
    "prototype(1)",
    "__proto__(1)",
    "x.constructor",
    "x[0]",
    "x=1",
    "[1,2]",
    "'1'",
    "max.constructor(1)",
  ]) {
    assert.throws(() => parser.parse(expression), expression);
  }

  const parsed = parser.parse("max(2, 3)^2");
  assert.equal(parsed.evaluate({}), 9);
  assert.equal(parsed.toJSFunction, undefined);
  assert.throws(() => parser.parse("x").evaluate({ x: () => 1 }));
});

test("client observer initializes only newly inserted calculator roots", async () => {
  const clientScript = await readFile(
    new URL("./script.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(clientScript, /new MutationObserver\(initAll\)/);
  assert.match(clientScript, /new MutationObserver\(function \(records\)/);
  assert.match(clientScript, /record\.addedNodes/);
  assert.match(clientScript, /if \(addedRoots\.size === 0\) return/);
});
