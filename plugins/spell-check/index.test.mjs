import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { interceptor, routes, slot } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
await interceptor.init({ apiBase: "/api/plugin/spell-check" });
interceptor.configure({});
slot.init({ template, apiBase: "/api/plugin/spell-check" });

const speller = (errors, delayMs = 0) => async () => {
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  return new Response(JSON.stringify(errors), { status: 200 });
};
const tehFix = [{ pos: 0, len: 3, s: ["the"] }];

async function timed(promise) {
  const startedAt = Date.now();
  const value = await promise;
  return { value, ms: Date.now() - startedAt };
}

test("glance trigger answers at once for queries the interceptor never checks", async () => {
  for (const query of ["hello", "!help me", ""]) {
    const { value, ms } = await timed(slot.trigger(query));
    assert.equal(value, false, query);
    assert.ok(ms < 50, `${query}: ${ms}ms`);
  }
});

test("glance trigger answers at once after the interceptor kept the query", async () => {
  const query = "correct spelling here";
  assert.deepEqual(await interceptor.intercept(query, { fetch: speller([]) }), { query });
  const { value, ms } = await timed(slot.trigger(query));
  assert.equal(value, false);
  assert.ok(ms < 50, `${ms}ms`);
});

test("glance trigger gives up quickly when no check is running", async () => {
  const { value, ms } = await timed(slot.trigger("never intercepted query"));
  assert.equal(value, false);
  assert.ok(ms < 1000, `${ms}ms`);
});

test("glance trigger waits for an in-flight correction", async () => {
  const query = "teh dog";
  const intercepted = interceptor.intercept(query, { fetch: speller(tehFix, 80) });
  assert.equal(await slot.trigger(query), true);
  assert.deepEqual(await intercepted, { query: "the dog" });
  const { html } = await slot.execute(query);
  assert.match(html, /Showing results for <strong>the dog<\/strong>/);
});

test("Search instead clears the correction banner for the original query", async () => {
  const query = "teh cat";
  const fetch = speller(tehFix);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query: "the cat" });
  assert.equal(await slot.trigger(query), true);

  // The route forgets the skip after 30 s; unref that timer so the test exits.
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (...args) => {
    const timer = realSetTimeout(...args);
    timer.unref?.();
    return timer;
  };
  try {
    await routes[0].handler(
      new Request("http://degoog.test/skip", { method: "POST", body: JSON.stringify({ q: query }) }),
    );
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.equal(await slot.trigger(query), false);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });

  const { value, ms } = await timed(slot.trigger(query));
  assert.equal(value, false);
  assert.ok(ms < 50, `${ms}ms`);
  assert.deepEqual(await slot.execute(query), { html: "" });
});
