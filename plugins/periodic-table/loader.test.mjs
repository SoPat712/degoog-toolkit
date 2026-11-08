import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const loader = await readFile(new URL("./script.js", import.meta.url), "utf8");
const runtime = await readFile(new URL("./card.js", import.meta.url), "utf8");
const CARD = "[data-pt-widget]";

// Runs script.js against a fake DOM. import() is swapped for a recorder so the
// test can see which runtime URL the loader asks for.
function boot({ present = false, failures = 0 } = {}) {
  const imports = [];
  let notify = null;
  let watching = false;
  const card = { nodeType: 1, matches: (selector) => selector === CARD, querySelector: () => null };
  const context = vm.createContext({
    console: { warn() {} },
    document: {
      documentElement: {},
      querySelector: (selector) => (present && selector === CARD ? card : null),
    },
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe() {
        watching = true;
      }
      disconnect() {
        watching = false;
      }
    },
    loadRuntime: (url) => {
      imports.push(url);
      return imports.length <= failures ? Promise.reject(new Error("offline")) : Promise.resolve({});
    },
  });
  vm.runInContext(loader.replace("import(url)", "loadRuntime(url)"), context);
  const add = (...addedNodes) => notify([{ addedNodes }]);
  const wrapper = (inner) => ({ nodeType: 1, matches: () => false, querySelector: (selector) => (selector === CARD ? inner : null) });
  return { imports, add, card, wrapper, watching: () => watching };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("script.js stays a small loader and card.js holds the parsed runtime", () => {
  assert.ok(Buffer.byteLength(loader) < 2048, `loader is ${Buffer.byteLength(loader)} bytes`);
  assert.match(loader, /import\(url\)/);
  assert.doesNotThrow(() => new vm.Script(runtime, { filename: "card.js" }));
  for (const part of CARD.split(",")) assert.ok(runtime.includes(part.trim()), `card.js handles ${part.trim()}`);
});

test("pages without a card never download the runtime", () => {
  const page = boot();
  page.add({ nodeType: 3 }, page.wrapper(null));
  assert.deepEqual(page.imports, []);
  assert.equal(page.watching(), true);
});

test("a card already on the page loads the runtime once", () => {
  const page = boot({ present: true });
  assert.deepEqual(page.imports, ["./card.js"]);
  assert.equal(page.watching(), false);
});

test("a card streamed in after results loads the runtime once", () => {
  const page = boot();
  page.add(page.wrapper(page.card), page.card);
  assert.deepEqual(page.imports, ["./card.js"]);
  assert.equal(page.watching(), false);
});

test("a failed download retries with a fresh URL when the next card arrives", async () => {
  const page = boot({ present: true, failures: 1 });
  await settle();
  assert.deepEqual(page.imports, ["./card.js"]);
  assert.equal(page.watching(), true);
  page.add(page.card);
  assert.deepEqual(page.imports, ["./card.js", "./card.js?retry=1"]);
});
