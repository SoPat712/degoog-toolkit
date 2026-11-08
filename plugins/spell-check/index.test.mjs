import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import { interceptor, plugin, routes, slot } from "./index.js";

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
await slot.init({
  template: await readLocal("./template.html"),
  apiBase: "/api/plugin/spell-check",
  readFile: readLocal,
});

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
  for (const capability of [plugin, interceptor, slot]) {
    assert.equal(capability.isClientExposed, false);
  }
  assert.ok(cacheTtls.every((ttl) => ttl >= 24 * 60 * 60 * 1000), `cache TTL ${cacheTtls}`);
});

test("a fast typo is corrected and shown as Showing results for", async () => {
  const query = "speling test";
  const fetch = speller(fix(0, 7, "spelling"), 20);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query: "spelling test" });
  assert.equal(fetch.calls, 1);
  assert.equal(slot.trigger(query), true);
  const { html, title } = await slot.execute(query);
  assert.equal(title, "");
  assert.match(translate(html), /Showing results for <strong>spelling test<\/strong>/);
  assert.match(translate(html), /Search instead for <em>speling test<\/em>/);
  assert.match(html, /href="\/search\?q=speling%20test"/);
  assert.match(html, /data-skip="\/api\/plugin\/spell-check\/skip"/);
});

test("a slow Yandex returns the typed query at the budget, then suggests", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const query = "recieve mail";
    const fetch = speller(fix(0, 7, "receive"), 1_500);
    let settled = null;
    const intercepted = interceptor.intercept(query, { fetch }).then((value) => (settled = value));
    await flush();
    mock.timers.tick(299);
    await flush();
    assert.equal(settled, null, "still inside the budget");
    mock.timers.tick(1);
    await flush();
    assert.deepEqual(await intercepted, { query });
    assert.equal(slot.trigger(query), false, "nothing to show yet");

    mock.timers.tick(1_200);
    for (let i = 0; i < 5; i += 1) await flush();
    assert.equal(fetch.calls, 1);
    assert.equal(slot.trigger(query), true);
    const { html } = await slot.execute(query);
    assert.match(translate(html), /Did you mean:\s*<a data-spell-link href="\/search\?q=receive%20mail"/);
    assert.match(html, /<strong><em>receive mail<\/em><\/strong>/);
    assert.doesNotMatch(html, /data-skip/);
  } finally {
    mock.timers.reset();
  }

  // The late answer was cached, so the next search is corrected at once.
  const again = speller([]);
  assert.deepEqual(await interceptor.intercept("recieve mail", { fetch: again }), {
    query: "receive mail",
  });
  assert.equal(again.calls, 0);
  assert.match(translate((await slot.execute("recieve mail")).html), /Showing results for/);
});

test("no typo is cached, so a repeat search makes no fetch", async () => {
  const query = "correct spelling here";
  const fetch = speller([]);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.deepEqual(await interceptor.intercept(`  ${query} `, { fetch }), { query: `  ${query} ` });
  assert.equal(fetch.calls, 1);
  assert.equal(slot.trigger(query), false);
  assert.deepEqual(await slot.execute(query), { html: "" });
});

test("case-only changes are not typos", async () => {
  const query = "paris france";
  const fetch = speller(fix(0, 5, "Paris"));
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.equal(slot.trigger(query), false);
});

test("concurrent identical queries share one fetch", async () => {
  const query = "seperate rooms";
  const fetch = speller(fix(0, 8, "separate"), 40);
  const outcomes = await Promise.all([1, 2, 3].map(() => interceptor.intercept(query, { fetch })));
  assert.equal(fetch.calls, 1);
  for (const outcome of outcomes) assert.deepEqual(outcome, { query: "separate rooms" });
});

test("a budget of 0 never waits and only suggests", async () => {
  interceptor.configure({ timeBudgetMs: "0" });
  try {
    const query = "definately maybe";
    const fetch = speller(fix(0, 10, "definitely"), 60);
    const { value, ms } = await timed(interceptor.intercept(query, { fetch }));
    assert.deepEqual(value, { query });
    assert.ok(ms < 30, `${ms}ms`);
    assert.equal(slot.trigger(query), false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(slot.trigger(query), true);
    assert.match(translate((await slot.execute(query)).html), /Did you mean:/);

    // Even a cached correction is only suggested.
    const again = speller([]);
    assert.deepEqual(await interceptor.intercept(query, { fetch: again }), { query });
    assert.equal(again.calls, 0);
    await flush();
    assert.match(translate((await slot.execute(query)).html), /Did you mean:/);
  } finally {
    interceptor.configure({});
  }
});

test("the budget is clamped to 2000 ms", async () => {
  interceptor.configure({ timeBudgetMs: "99999" });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const fetch = speller(fix(0, 6, "budget"), 2_500);
    let settled = false;
    const intercepted = interceptor
      .intercept("budgte clamp", { fetch })
      .then((value) => ((settled = true), value));
    await flush();
    mock.timers.tick(1_999);
    await flush();
    assert.equal(settled, false);
    mock.timers.tick(1);
    assert.deepEqual(await intercepted, { query: "budgte clamp" });
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

test("Search instead keeps the corrected-away word from then on", async () => {
  const query = "sonarr docker";
  const fetch = speller(fix(0, 6, "sonar"));
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query: "sonar docker" });
  assert.equal(slot.trigger(query), true);

  const response = await routes[0].handler(
    new Request("http://degoog.test/skip", { method: "POST", body: JSON.stringify({ q: query }) }),
  );
  assert.equal(response.status, 204);
  assert.equal(slot.trigger(query), false);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.equal(slot.trigger(query), false);
  assert.deepEqual(await slot.execute(query), { html: "" });

  // Later searches, from the cache, and other queries with the word stay as typed.
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query });
  assert.equal(slot.trigger(query), false);
  const other = "Sonarr indexers";
  assert.deepEqual(await interceptor.intercept(other, { fetch: speller(fix(0, 6, "sonar")) }), {
    query: other,
  });
  assert.equal(slot.trigger(other), false);
  assert.equal(fetch.calls, 1);
});

test("names more than one slip away are suggested, not auto-corrected", async () => {
  for (const [query, errors, suggestion] of [
    ["jellyfin setup", fix(0, 8, "jellyfish"), "jellyfish%20setup"],
    ["degoog search", fix(0, 6, "de google"), "de%20google%20search"],
  ]) {
    assert.deepEqual(await interceptor.intercept(query, { fetch: speller(errors) }), { query }, query);
    assert.equal(slot.trigger(query), true, query);
    const html = translate((await slot.execute(query)).html);
    assert.match(html, new RegExp(`Did you mean:\\s*<a data-spell-link href="/search\\?q=${suggestion}"`), query);
  }
});

test("only the one-slip fixes of a query are applied", async () => {
  const query = "jellyfin hardwre";
  const fetch = speller([...fix(0, 8, "jellyfish"), ...fix(9, 7, "hardware")]);
  assert.deepEqual(await interceptor.intercept(query, { fetch }), { query: "jellyfin hardware" });
  assert.match(translate((await slot.execute(query)).html), /Showing results for <strong>jellyfin hardware<\/strong>/);
});

test("the trigger never awaits", async () => {
  const query = "pendng trigger check";
  let release;
  const fetch = async () => {
    await new Promise((resolve) => (release = resolve));
    return new Response(JSON.stringify(fix(0, 6, "pending")), { status: 200 });
  };
  interceptor.configure({ timeBudgetMs: "0" });
  try {
    await interceptor.intercept(query, { fetch });
    for (const q of [query, "never searched query", "!bang", ""]) {
      const result = slot.trigger(q);
      assert.equal(typeof result, "boolean", q);
      assert.equal(result, false, q);
    }
    release();
    for (let i = 0; i < 5; i += 1) await flush();
    assert.equal(slot.trigger(query), true);
  } finally {
    interceptor.configure({});
  }
});

// Leaves the module in back-off, so it runs last.
test("a failed check searches as typed and backs off from Yandex", async () => {
  const failing = async () => {
    failing.calls += 1;
    throw new Error("offline");
  };
  failing.calls = 0;
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.deepEqual(await interceptor.intercept("ofline check", { fetch: failing }), { query: "ofline check" });
    const { value, ms } = await timed(interceptor.intercept("anothr check", { fetch: failing }));
    assert.deepEqual(value, { query: "anothr check" });
    assert.ok(ms < 30, `${ms}ms`);
    assert.equal(failing.calls, 1);
  } finally {
    warn.mock.restore();
  }
});
