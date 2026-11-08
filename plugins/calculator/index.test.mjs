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

test("supports natural arithmetic wording", async () => {
  for (const query of ["what is 2+2", "2 plus 2", "8 divided by 2"]) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { lang: "en-US" });
    assert.match(output.html, /data-result="4"/, query);
  }
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

async function resultOf(query) {
  assert.equal(slot.trigger(query), true, query);
  const output = await slot.execute(query, { lang: "en-US" });
  return output.html.match(/data-result="([^"]*)"/)?.[1];
}

test("scientific notation is not read as the constant e", async () => {
  assert.equal(await resultOf("1e-9"), "1e-9");
  assert.equal(await resultOf("5e+2+1"), "501");
  assert.equal(await resultOf("3e-2*100"), "3");
  assert.equal(await resultOf("2e"), "5.4365636569");
  assert.equal(await resultOf("e^2"), "7.3890560989");
});

test("knowledge panel stays quiet for dates, brands, and bare 'what is' questions", async () => {
  for (const query of [
    "what is 1984",
    "what is x",
    "what is sin",
    "what is pi",
    "9/11",
    "7/11",
    "24/7",
    "20/20",
    "1-800",
    "what is 9/11",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
  assert.equal(await resultOf("what is 2+2"), "4");
  assert.equal(await resultOf("10/4 * 3"), "7.5");
  assert.equal(await resultOf("1/2"), "0.5");
  assert.equal(await resultOf("calc 9/11"), "0.8181818182");
});

test("recognizes percent-of, root, times, and trailing equals queries", async () => {
  assert.equal(await resultOf("10% of 200"), "20");
  assert.equal(await resultOf("√16"), "4");
  assert.equal(await resultOf("sqrt 4"), "2");
  assert.equal(await resultOf("2 x 3"), "6");
  assert.equal(await resultOf("2 + 2 ="), "4");
  for (const query of ["20% off 120", "10% on 50", "10% tax on 50", "100 lb to kg"]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("adding or subtracting a percent scales the left operand", async () => {
  assert.equal(await resultOf("100 - 10%"), "90");
  assert.equal(await resultOf("100 + 10%"), "110");
  assert.equal(await resultOf("50 + 100 - 10%"), "135");
  assert.equal(await resultOf("(100 - 10%) * 2"), "180");
  assert.equal(await resultOf("100 - 10% - 10%"), "81");
  assert.equal(await resultOf("-10%"), "-0.1");
  assert.equal(await resultOf("2*-10%"), "-0.2");
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

test("browser normalizer matches the server for notation and percent rules", async () => {
  const { default: vm } = await import("node:vm");
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const names = source.match(/var FUNCTION_NAMES =\s*("[^"]+")/)[1];
  const context = vm.createContext({});
  vm.runInContext(
    `var FUNCTION_NAMES = ${names};` +
      ["stripEquationPrefix", "applyRelativePercent", "normalizeExpression"]
        .map((name) => extractFunction(source, name))
        .join("\n"),
    context,
  );
  const Parser = safeMathParserModule.Parser;
  const evaluate = (expression) => new Parser().parse(expression).evaluate({ e: Math.E, pi: Math.PI });
  const cases = [
    ["1e-9", 1e-9],
    ["5e+2+1", 501],
    ["2e", 2 * Math.E],
    ["100 - 10%", 90],
    ["50 + 100 - 10%", 135],
    ["10% of 200", 20],
    ["2 x 3", 6],
  ];
  for (const [input, expected] of cases) {
    const value = evaluate(context.normalizeExpression(input));
    assert.ok(Math.abs(value - expected) < 1e-9, `${input}: ${value}`);
  }
});

test("client retries failed runtime downloads and drives the active calculator", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  assert.match(source, /parserLoad = null;/);
  assert.match(source, /graphEngineLoad = null;/);
  assert.doesNotMatch(source, /var root = document\.querySelector\(ROOT_SELECTOR\);/);
  assert.match(source, /active\.closest\(ROOT_SELECTOR\)/);
  assert.match(source, /lastInteractedRoot/);
});

test("equals key text contrasts with the accent in dark mode", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  const rule = css.match(/\.calc-btn--equals \{[^}]+\}/)[0];
  assert.match(rule, /color: var\(--bg, #fff\);/);
});
