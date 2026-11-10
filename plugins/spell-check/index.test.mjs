import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import { interceptor, plugin, slot } from "./index.js";

const readLocal = (file) => readFile(new URL(file, import.meta.url), "utf8");
const english = JSON.parse(await readLocal("./locales/en.json"))["plugin-spell-check"];

const cacheTtls = [];
await interceptor.init({
  apiBase: "/api/plugin/spell-check",
  useCache(namespace, ttlMs) {
    cacheTtls.push(ttlMs);
    const store = new Map();
    return {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
    };
  },
});
interceptor.configure({});
await slot.init({ template: await readLocal("./template.html") });

// Mirrors core's server-side {{ t:... }} pass for the English catalog.
const translate = (html) =>
  html.replace(/\{\{\s*t:plugin-spell-check\.(\w+)\s*\}\}/g, (_, key) => english[key]);

const speller = (errors, delayMs = 0) => {
  const fetch = async () => {
    fetch.calls += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(JSON.stringify(errors), { status: 200 });
  };
  fetch.calls = 0;
  return fetch;
};
const fix = (pos, len, s) => [{ pos, len, s: [s] }];
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function timed(promise) {
  const startedAt = performance.now();
  const value = await promise;
  return { value, ms: performance.now() - startedAt };
}

test("settings: one Configure card with a clamped time budget", () => {
  assert.equal(plugin.settingsSchema, undefined);
  assert.equal(slot.settingsSchema, undefined);
  assert.deepEqual(interceptor.settingsSchema.map(({ key }) => key), ["language", "timeBudgetMs"]);
  const budget = interceptor.settingsSchema.find(({ key }) => key === "timeBudgetMs");
  assert.equal(budget.type, "number");
  assert.equal(budget.default, "300");
  assert.equal(budget.min, "0");
  assert.equal(budget.max, "2000");
  assert.equal(slot.waitForResults, true, "suggestions are checked against the results");
  for (const capability of [plugin, interceptor, slot]) {
    assert.equal(capability.isClientExposed, false);
  }
  assert.ok(cacheTtls.every((ttl) => ttl >= 24 * 60 * 60 * 1000), `cache TTL ${cacheTtls}`);
});

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await flush();
};
const didYouMean = (suggestion) =>
  new RegExp(`Did you mean:\\s*<a data-spell-link href="/search\\?q=${suggestion}"`);

test("a typo is only ever suggested; the search runs as typed", async () => {
  const query = "speling test";
  const fetch = speller(fix(0, 7, "spelling"), 20);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.equal(slot.trigger(query), true);
  const { html, title } = await slot.execute(query, { results: [] });
  assert.equal(title, "");
  assert.match(translate(html), didYouMean("spelling%20test"));
  assert.match(html, /<strong><em>spelling test<\/em><\/strong>/);
  assert.doesNotMatch(translate(html), /Showing results for|Search instead/);
  assert.equal(fetch.calls, 1);

  // A cached fix is still only suggested.
  const again = speller([]);
  assert.deepEqual(await interceptor.intercept(query, { fetch: again }), { query });
  assert.equal(again.calls, 0);
  assert.match(translate((await slot.execute(query, { results: [] })).html), didYouMean("spelling%20test"));
});

test("a slow Yandex never holds the search, and the suggestion waits only the budget", async () => {
  const query = "recieve mail";
  const fetch = speller(fix(0, 7, "receive"), 1_500);
  const { value, ms } = await timed(interceptor.intercept(query, { fetch }));
  assert.deepEqual(value, { query });
  assert.ok(ms < 30, `${ms}ms`);

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let settled = null;
    const executed = slot.execute(query, { results: [] }).then((value) => (settled = value));
    await flush();
    mock.timers.tick(299);
    await flush();
    assert.equal(settled, null, "still inside the budget");
    mock.timers.tick(1);
    assert.deepEqual(await executed, { html: "" });
  } finally {
    mock.timers.reset();
  }

  // The late answer lands while results are read, so the next glance shows it.
  await new Promise((resolve) => setTimeout(resolve, 1_600));
  assert.equal(fetch.calls, 1);
  assert.match(translate((await slot.execute(query, { results: [] })).html), didYouMean("receive%20mail"));
});

test("no typo is cached, so a repeat search makes no fetch", async () => {
  const query = "correct spelling here";
  const fetch = speller([]);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.deepEqual(await interceptor.intercept(`  ${query} `, { fetch }), { query: `  ${query} ` });
  assert.equal(fetch.calls, 1);
  assert.deepEqual(await slot.execute(query, { results: [] }), { html: "" });
});

test("case-only changes are not typos", async () => {
  const query = "paris france";
  const fetch = speller(fix(0, 5, "Paris"));
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.deepEqual(await slot.execute(query, { results: [] }), { html: "" });
});

test("concurrent identical queries share one fetch", async () => {
  const query = "seperate rooms";
  const fetch = speller(fix(0, 8, "separate"), 40);
  const outcomes = await Promise.all([1, 2, 3].map(() => interceptor.intercept(query, { fetch })));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(fetch.calls, 1);
  for (const outcome of outcomes) assert.deepEqual(outcome, { query });
});

test("a budget of 0 shows only an answer Yandex already gave", async () => {
  interceptor.configure({ timeBudgetMs: "0" });
  try {
    const query = "definately maybe";
    const fetch = speller(fix(0, 10, "definitely"), 60);
    await interceptor.intercept(query, { fetch });
    const { value, ms } = await timed(slot.execute(query, { results: [] }));
    assert.deepEqual(value, { html: "" });
    assert.ok(ms < 30, `${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.match(translate((await slot.execute(query, { results: [] })).html), didYouMean("definitely%20maybe"));
  } finally {
    interceptor.configure({});
  }
});

test("the budget is clamped to 2000 ms", async () => {
  interceptor.configure({ timeBudgetMs: "99999" });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const fetch = speller(fix(0, 6, "budget"), 2_500);
    await interceptor.intercept("budgte clamp", { fetch });
    let settled = false;
    const executed = slot.execute("budgte clamp", { results: [] }).then((value) => ((settled = true), value));
    await flush();
    mock.timers.tick(1_999);
    await flush();
    assert.equal(settled, false);
    mock.timers.tick(1);
    assert.deepEqual(await executed, { html: "" });
  } finally {
    mock.timers.reset();
    interceptor.configure({});
  }
});

test("skipped query kinds make no fetch", async () => {
  const fetch = speller(fix(0, 3, "the"));
  for (const query of [
    "",
    "teh",
    "!g teh cat",
    "teh cat !w",
    '"teh cat" pictures',
    "https://example.com teh",
    "github.com teh cat",
    "www.teh cat",
    "teh cat site:reddit.com",
    "teh -cat",
    "2 + 2 = 4",
    "1234 5678 ab",
  ]) {
    assert.deepEqual(await interceptor.intercept(query, { fetch }), { query }, query);
    assert.equal(slot.trigger(query), false, query);
  }
  assert.equal(fetch.calls, 0);
});

test("a word the top results spell as typed is a name, not a typo", async () => {
  const titled = (...titles) => titles.map((title) => ({ title, url: "https://example.com" }));
  for (const [query, errors, results] of [
    ["the weeknd", fix(4, 6, "weekend"), titled("The Weeknd - Wikipedia", "The Weeknd - YouTube")],
    ["jellyfin setup", fix(0, 8, "jellyfish"), titled("Quick Start - Jellyfin", "Installation - Jellyfin")],
    ["degoog search", fix(0, 6, "de google"), titled("fccview/degoog: a search engine", "degoog - Docs")],
  ]) {
    await interceptor.intercept(query, { fetch: speller(errors) });
    await settle();
    assert.equal(slot.trigger(query), true, query);
    assert.deepEqual(await slot.execute(query, { results }), { html: "" }, query);
  }

  // Without results to read, the fix is still only a suggestion.
  assert.match(translate((await slot.execute("jellyfin setup")).html), didYouMean("jellyfish%20setup"));
  assert.match(translate((await slot.execute("the weeknd", { results: titled("Weekend - Wikipedia") })).html), didYouMean("the%20weekend"));
  // One page about the misspelling is not a name.
  const explainer = titled("Receive or Recieve – Correct Spelling Explained", "Receive Mail & Packages | USPS");
  await interceptor.intercept("recieve mail", { fetch: speller(fix(0, 7, "receive")) });
  await settle();
  assert.match(translate((await slot.execute("recieve mail", { results: explainer })).html), didYouMean("receive%20mail"));
  // A name past the top five results does not count.
  const buried = [...titled("a", "b", "c", "d", "e"), ...titled("The Weeknd - Wikipedia")];
  assert.match(translate((await slot.execute("the weeknd", { results: buried })).html), didYouMean("the%20weekend"));
});

test("only the fixes the results do not contradict are suggested", async () => {
  const query = "jellyfin hardwre";
  await interceptor.intercept(query, { fetch: speller([...fix(0, 8, "jellyfish"), ...fix(9, 7, "hardware")]) });
  await settle();
  const results = ["A Beginner's Hardware Guide to Jellyfin", "Jellyfin hardware acceleration"].map((title) => ({ title, url: "https://example.com" }));
  assert.match(translate((await slot.execute(query, { results })).html), didYouMean("jellyfin%20hardware"));
});

test("the trigger never awaits", async () => {
  const query = "pendng trigger check";
  let release;
  const fetch = async () => {
    await new Promise((resolve) => (release = resolve));
    return new Response(JSON.stringify(fix(0, 6, "pending")), { status: 200 });
  };
  await interceptor.intercept(query, { fetch });
  for (const [q, expected] of [[query, true], ["never searched query", false], ["!bang", false], ["", false]]) {
    const result = slot.trigger(q);
    assert.equal(typeof result, "boolean", q);
    assert.equal(result, expected, q);
  }
  release();
  await settle();
  assert.match(translate((await slot.execute(query, { results: [] })).html), didYouMean("pending%20trigger%20check"));
});

// Leaves the module in back-off, so it runs last.
test("a failed check suggests nothing and backs off from Yandex", async () => {
  const failing = async () => {
    failing.calls += 1;
    throw new Error("offline");
  };
  failing.calls = 0;
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.deepEqual(await interceptor.intercept("ofline check", { fetch: failing }), { query: "ofline check" });
    assert.deepEqual(await slot.execute("ofline check", { results: [] }), { html: "" });
    assert.deepEqual(await interceptor.intercept("anothr check", { fetch: failing }), { query: "anothr check" });
    const { value, ms } = await timed(slot.execute("anothr check", { results: [] }));
    assert.deepEqual(value, { html: "" });
    assert.ok(ms < 30, `${ms}ms`);
    assert.equal(failing.calls, 1);
  } finally {
    warn.mock.restore();
  }
});
