import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import NeoSearchEngine, { type, site, outgoingHosts } from "./neosearch/index.js";

const token = "a".repeat(64);
const home = () => new Response(`<html><meta content='${token}' name='xsrf-token'></html>`);
const resultsMessage = (links) => ({ lenses: [{ categories: [{ links }] }] });
const link = { title: "Home Assistant", url: "https://www.home-assistant.io/", description: "Local home automation." };
const stream = (...messages) => new Response(messages.map(JSON.stringify).join("\r\n"), {
  headers: { "Content-Type": "application/x-ndjson" },
});

function fakeFetch(search = () => stream({ location: "us", botwarning: true }, resultsMessage([link]))) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url === `${site}/` ? home() : search(url, init);
    },
  };
}

test("NeoSearch uses the current POST contract, declares its host and reports one page", async () => {
  const engine = new NeoSearchEngine();
  const mock = fakeFetch();
  const pages = [];
  const checked = [];
  const results = await engine.executeSearch("  home assistant  ", 1, "week", {
    fetch: mock.fetch, lang: "en-US", pagination: p => pages.push(p),
    sentinel: (r, name) => checked.push([r.status, name]),
  });
  assert.equal(type, "web");
  assert.equal(engine.bangShortcut, "neo");
  assert.equal(engine.isClientExposed, false);
  assert.deepEqual(outgoingHosts, ["neosearch.org"]);
  assert.deepEqual(pages, [{ total: 1 }]);
  assert.deepEqual(checked, [[200, "NeoSearch"], [200, "NeoSearch"]]);
  assert.equal(mock.calls.length, 2);
  const { url, init } = mock.calls[1];
  assert.equal(url, "https://neosearch.org/search");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["X-XSRF-TOKEN"], token);
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { q: "home assistant", generate: "auto", loc: "us" });
  for (const call of mock.calls) assert.equal(Object.hasOwn(call.init, "signal"), false);
  assert.deepEqual(results, [{ title: link.title, url: link.url, snippet: link.description, source: "NeoSearch" }]);
});

test("NeoSearch caches the public token, not query results", async () => {
  const engine = new NeoSearchEngine();
  const mock = fakeFetch();
  await engine.executeSearch("one", 1, undefined, mock);
  await engine.executeSearch("two", 1, undefined, mock);
  assert.deepEqual(mock.calls.map(c => c.url), [`${site}/`, `${site}/search`, `${site}/search`]);
  assert.equal(JSON.parse(mock.calls[2].init.body).q, "two");
});

test("NeoSearch renews an old token before its one-hour expiry", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  const engine = new NeoSearchEngine();
  const mock = fakeFetch();
  await engine.executeSearch("one", 1, undefined, mock);
  t.mock.timers.tick(46 * 60 * 1000);
  await engine.executeSearch("two", 1, undefined, mock);
  assert.equal(mock.calls.filter(c => c.url === `${site}/`).length, 2);
});

test("NeoSearch supports region overrides without guessing a country from a language", async () => {
  const engine = new NeoSearchEngine();
  const mock = fakeFetch();
  engine.configure({ country: " GB " });
  assert.deepEqual(engine.settingsSchema.map(s => s.key), ["country"]);
  await engine.executeSearch("first", 1, undefined, { ...mock, lang: "en-US" });
  assert.equal(JSON.parse(mock.calls.at(-1).init.body).loc, "gb");
  engine.configure({ country: "" });
  await engine.executeSearch("second", 1, undefined, { ...mock, lang: "pt_BR" });
  assert.equal(JSON.parse(mock.calls.at(-1).init.body).loc, "br");
  for (const lang of ["en", "not_a_locale", "es-419", undefined]) {
    engine.configure({ country: "invalid" });
    await engine.executeSearch("third", 1, undefined, { ...mock, lang });
    assert.equal(Object.hasOwn(JSON.parse(mock.calls.at(-1).init.body), "loc"), false);
  }
});

test("NeoSearch preserves group order, deduplicates and rejects unsafe links", async () => {
  const engine = new NeoSearchEngine();
  const mock = fakeFetch(() => stream({ lenses: [
    { categories: [{ links: [link, { ...link, url: "javascript:alert(1)" }, null, { ...link, url: "https://user:password@example.test" }] }] },
    { categories: [{ links: [link, { title: " <b>Second</b> &amp; last <script>bad()</script>", url: "http://example.test/", description: "", snippet: "<em>Plain</em> snippet" }] }] },
  ] }));
  const results = await engine.executeSearch("test", 1, undefined, mock);
  assert.deepEqual(results, [
    { title: link.title, url: link.url, snippet: link.description, source: "NeoSearch" },
    { title: "Second & last", url: "http://example.test/", snippet: "Plain snippet", source: "NeoSearch" },
  ]);
});

test("NeoSearch skips empty queries and later pages without network calls", async () => {
  const engine = new NeoSearchEngine();
  const mock = fakeFetch();
  for (const [query, page] of [["", 1], [" \t", 1], ["test", 2], ["test", 99]]) {
    assert.deepEqual(await engine.executeSearch(query, page, undefined, mock), []);
  }
  assert.equal(mock.calls.length, 0);
});

test("NeoSearch accepts explicit empty lenses and plugin-only searches", async () => {
  for (const response of [stream({ lenses: [] }), stream({ location: "us" }, { plugin: { name: "weather" } })]) {
    const engine = new NeoSearchEngine();
    assert.deepEqual(await engine.executeSearch("test", 1, undefined, fakeFetch(() => response)), []);
  }
});

test("NeoSearch handles arbitrary UTF-8 chunk boundaries and stops before stream completion", async () => {
  let cancelled = false;
  const bytes = new TextEncoder().encode(`${JSON.stringify({ overview: { items: [] } })}\n${JSON.stringify(resultsMessage([{ ...link, title: "Café 東京" }]))}\n`);
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1));
      // Deliberately never close: summary/plugin work must not hold up results.
    },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const engine = new NeoSearchEngine();
  const results = await engine.executeSearch("test", 1, undefined, fakeFetch(() => new Response(body)));
  assert.equal(results[0].title, "Café 東京");
  assert.equal(cancelled, true);
});

for (const [name, payload, status] of [
  ["invalid JSON", "{broken}\n", "parse_error"],
  ["HTML challenge", "<html>Verify your browser</html>", "parse_error"],
  ["missing results", JSON.stringify({ location: "us" }), "parse_error"],
  ["invalid message", "null", "parse_error"],
  ["invalid lenses", JSON.stringify({ lenses: {} }), "parse_error"],
  ["invalid categories", JSON.stringify({ lenses: [{}] }), "parse_error"],
  ["invalid links", JSON.stringify({ lenses: [{ categories: [{}] }] }), "parse_error"],
  ["upstream error", JSON.stringify({ error: "Search unavailable" }), "network"],
]) {
  test(`NeoSearch surfaces ${name} rather than reporting a successful empty search`, async () => {
    await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, fakeFetch(() => new Response(payload))), error => error.status === status);
  });
}

test("NeoSearch rejects a homepage without a valid token before posting a query", async () => {
  let calls = 0;
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, {
    fetch: async () => { calls++; return new Response('<meta name="xsrf-token" content="invalid">'); },
  }), error => error.status === "parse_error");
  assert.equal(calls, 1);
});

for (const [httpStatus, status] of [[403, "blocked"], [429, "rate_limited"], [503, "network"]]) {
  test(`NeoSearch classifies HTTP ${httpStatus} and does not retry`, async () => {
    const mock = fakeFetch(() => new Response("", { status: httpStatus }));
    await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, mock), e => e.status === status && e.httpStatus === httpStatus);
    assert.equal(mock.calls.length, 2);
  });
}

test("NeoSearch refreshes a rejected token only on the next user search", async () => {
  const engine = new NeoSearchEngine();
  let reject = true;
  const mock = fakeFetch(() => reject ? new Response("", { status: 403 }) : stream(resultsMessage([link])));
  await assert.rejects(engine.executeSearch("one", 1, undefined, mock));
  assert.equal(mock.calls.length, 2);
  reject = false;
  assert.equal((await engine.executeSearch("two", 1, undefined, mock)).length, 1);
  assert.equal(mock.calls.filter(c => c.url === `${site}/`).length, 2);
});

test("NeoSearch preserves errors thrown by core sentinel", async () => {
  const expected = new Error("core rate limit");
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, {
    ...fakeFetch(), sentinel() { throw expected; },
  }), error => error === expected);
});

test("NeoSearch uses core engineError for parse failures", async () => {
  const expected = new Error("typed failure");
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, {
    ...fakeFetch(() => new Response("broken")),
    engineError(status, _message, options) { assert.equal(status, "parse_error"); assert.equal(options.engine, "NeoSearch"); return expected; },
  }), error => error === expected);
});

test("NeoSearch refuses pre-aborted requests", async () => {
  const controller = new AbortController();
  controller.abort(new Error("gone"));
  const mock = fakeFetch();
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, { ...mock, signal: controller.signal }), e => e === controller.signal.reason);
  assert.equal(mock.calls.length, 0);
});

for (const stage of ["homepage", "homepage body", "search", "stream"]) {
  test(`NeoSearch promptly cancels a stalled ${stage} without leaking listeners`, async () => {
    const controller = new AbortController();
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const never = () => { entered(); return new Promise(() => {}); };
    let cancelled = false;
    const pending = new NeoSearchEngine().executeSearch("test", 1, undefined, {
      signal: controller.signal,
      fetch: async (url, init) => {
        assert.equal(init.signal, controller.signal);
        if (url === `${site}/`) {
          if (stage === "homepage") return never();
          if (stage === "homepage body") return { ok: true, status: 200, text: never };
          return home();
        }
        if (stage === "search") return never();
        return new Response(new ReadableStream({ pull: never, cancel() { cancelled = true; } }, { highWaterMark: 0 }));
      },
    });
    const rejection = assert.rejects(pending, e => e === controller.signal.reason);
    await ready;
    controller.abort(new Error("user deadline"));
    await rejection;
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    if (stage === "stream") assert.equal(cancelled, true);
  });
}

test("NeoSearch removes cancellation listeners after success", async () => {
  const controller = new AbortController();
  const result = await new NeoSearchEngine().executeSearch("test", 1, undefined, { ...fakeFetch(), signal: controller.signal });
  assert.equal(result.length, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("NeoSearch closes a response received after cancellation and preserves its reason", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const expected = new Error("deadline");
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, {
    signal: controller.signal,
    fetch: async () => {
      controller.abort(expected);
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    },
  }), e => e === expected);
  assert.equal(cancelled, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("NeoSearch preserves the host timeout when a transport throws a generic error", async () => {
  const controller = new AbortController();
  const expected = new Error("configured timeout");
  await assert.rejects(new NeoSearchEngine().executeSearch("test", 1, undefined, {
    signal: controller.signal,
    fetch: () => { controller.abort(expected); throw new Error("generic abort"); },
  }), e => e === expected);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
