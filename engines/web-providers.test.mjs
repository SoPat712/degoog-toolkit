import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as qwant from "./qwant/index.js";
import * as yahoo from "./yahoo/index.js";

const qwantBody = (items = []) => JSON.stringify({
  status: "success", data: { result: { items: { mainline: [{ type: "web", items }] } } },
});
// Synthetic fixtures match the result structures, not third-party page copy.
const yahooCard = (href = "https://example.test/", title = "Example &amp; test", snippet = "A <b>web</b> result.") =>
  `<div class="dd algo-sr"><div class="compTitle"><a href="${href}"><span>Brand and hostname</span><h3>${title}</h3></a></div><div class="compText"><p>${snippet}</p></div></div>`;
const yahooBody = (cards = yahooCard()) => `<html><body><div id="web">${cards}</div></body></html>`;
const validBodies = {
  Qwant: qwantBody([{ title: "Example &amp; test", url: "https://example.test/", desc: "A <b>web</b> result." }]),
  Yahoo: yahooBody(),
};

for (const module of [qwant, yahoo]) {
  const name = new module.default().name;
  test(`${name}: Store metadata, author, icon site, and Safe Search settings are present`, async () => {
    const engine = new module.default();
    assert.equal(module.type, "web");
    assert.match(module.site, /^https:\/\//);
    assert.ok(module.outgoingHosts.length);
    assert.equal(engine.isClientExposed, false);
    assert.deepEqual(engine.settingsSchema.map((setting) => setting.key), ["safeSearch"]);
    engine.configure({ safeSearch: "strict" });
    engine.configure({ safeSearch: "__proto__" });
    assert.equal(engine.safeSearch, "strict");
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
    assert.equal(manifest.engines.find((item) => item.path === `engines/${name.toLowerCase()}`).version, "1.0.0");
    const author = JSON.parse(await readFile(new URL(`./${name.toLowerCase()}/author.json`, import.meta.url)));
    assert.equal(author.name, "SoPat712");
  });

  test(`${name}: maps results, strips markup, and leaves timeout and caching to the host`, async () => {
    const engine = new module.default();
    let calls = 0;
    const context = {
      fetch: async (_url, init) => {
        assert.equal(Object.hasOwn(init, "signal"), false, "do not replace the signal injected by ctx.fetch");
        calls += 1;
        return new Response(validBodies[name]);
      },
    };
    const expected = [{ title: "Example & test", url: "https://example.test/", snippet: "A web result.", source: name }];
    assert.deepEqual(await engine.executeSearch("example", 1, undefined, context), expected);
    assert.deepEqual(await engine.executeSearch("example", 1, undefined, context), expected);
    assert.equal(calls, 2, "do not override host cache bypasses");
    const source = await readFile(new URL(`./${name.toLowerCase()}/index.js`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setTimeout\s*\(|AbortSignal\.timeout|new AbortController/);
  });

  test(`${name}: blank and pre-cancelled queries never fetch`, async () => {
    const engine = new module.default();
    let calls = 0;
    const context = { fetch: async () => { calls += 1; } };
    assert.deepEqual(await engine.executeSearch("  ", 1, undefined, context), []);
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await assert.rejects(engine.executeSearch("query", 1, undefined, { ...context, signal: controller.signal }), (error) => error === reason);
    assert.equal(calls, 0);
  });

  test(`${name}: forwards the host signal and does not retry errors`, async () => {
    const engine = new module.default();
    const controller = new AbortController();
    const reason = new DOMException("user-configured deadline", "TimeoutError");
    let calls = 0;
    await assert.rejects(engine.executeSearch("query", 1, undefined, {
      signal: controller.signal,
      fetch: async (_url, init) => {
        assert.equal(init.signal, controller.signal);
        calls += 1;
        throw reason;
      },
    }), (error) => error === reason);
    assert.equal(calls, 1);
  });

  test(`${name}: reports HTTP failures and uses degoog's error hooks`, async () => {
    for (const [httpStatus, status] of [[403, "blocked"], [429, "rate_limited"], [500, "network"]]) {
      const engine = new module.default();
      let reported;
      await assert.rejects(engine.executeSearch("query", 1, undefined, {
        fetch: async () => new Response("", { status: httpStatus }),
        engineError: (kind, message, options) => {
          reported = { kind, options };
          return Object.assign(new Error(message), { status: kind });
        },
      }), { status });
      assert.deepEqual(reported, { kind: status, options: { engine: name, httpStatus } });
    }
    const failure = new Error("sentinel rejected response");
    await assert.rejects(new module.default().executeSearch("query", 1, undefined, {
      fetch: async () => new Response("", { status: 429 }),
      sentinel: (_response, engineName) => { assert.equal(engineName, name); throw failure; },
    }), (error) => error === failure);
  });

  test(`${name}: unexpected pages are errors, not successful empty searches`, async () => {
    const engine = new module.default();
    for (const body of ["", "<html><h1>Unexpected page</h1></html>"]) {
      await assert.rejects(engine.executeSearch("query", 1, undefined, {
        fetch: async () => new Response(body),
      }), { status: "parse_error" });
    }
  });
}

test("Qwant: builds paging, locale, and Safe Search without requesting an AI answer", async () => {
  const engine = new qwant.default();
  engine.configure({ safeSearch: "strict" });
  let requested;
  let pages;
  await engine.executeSearch("  café & tea  ", 3, "week", {
    lang: "fr-FR",
    pagination: (value) => { pages = value; },
    fetch: async (url, init) => {
      requested = new URL(url);
      assert.equal(init.headers.Origin, "https://www.qwant.com");
      return new Response(qwantBody());
    },
  });
  assert.equal(requested.origin, "https://api.qwant.com");
  assert.equal(requested.pathname, "/v3/search/web");
  assert.equal(requested.searchParams.get("q"), "café & tea");
  assert.equal(requested.searchParams.get("offset"), "20");
  assert.equal(requested.searchParams.get("locale"), "fr_FR");
  assert.equal(requested.searchParams.get("safesearch"), "2");
  assert.equal(requested.searchParams.get("llm"), "false");
  assert.deepEqual(pages, { total: 3 });
  assert.deepEqual(await engine.executeSearch("query", 6, undefined, {
    fetch: () => { throw new Error("must not repeat results past the API page limit"); },
  }), []);
});

test("Qwant: excludes ads, other verticals, duplicates, and unsafe destinations", async () => {
  const body = JSON.parse(qwantBody([
    { title: "<b>Real</b> result", url: "http://example.test/", desc: "Text<script>bad()</script>" },
    { title: "Duplicate", url: "http://example.test/" },
    { title: "Unsafe", url: "javascript:alert(1)" },
  ]));
  body.data.result.items.mainline.unshift({ type: "ads", items: [{ title: "Ad", url: "https://ads.test/" }] });
  body.data.result.items.mainline.push({ type: "news", items: [{ title: "News", url: "https://news.test/" }] });
  const results = await new qwant.default().executeSearch("test", 1, undefined, { fetch: async () => Response.json(body) });
  assert.deepEqual(results, [{ title: "Real result", url: "http://example.test/", snippet: "Text", source: "Qwant" }]);
});

test("Qwant: distinguishes real challenges, API limits, and malformed responses", async () => {
  for (const [body, http, status] of [
    [{ url: "https://geo.captcha-delivery.com/captcha/?test=1" }, 403, "captcha"],
    [{ status: "error", data: { error_code: 24 } }, 200, "rate_limited"],
    [{ status: "error", data: { message: ["unavailable"] } }, 200, "network"],
    [{ status: "success", data: {} }, 200, "parse_error"],
    [JSON.parse(qwantBody([{ title: "Bad", url: "file:///etc/passwd" }])), 200, "parse_error"],
  ]) {
    await assert.rejects(new qwant.default().executeSearch("test", 1, undefined, {
      fetch: async () => Response.json(body, { status: http }),
    }), { status });
  }
  assert.deepEqual(await new qwant.default().executeSearch("test", 1, undefined, {
    fetch: async () => new Response(qwantBody()),
  }), []);
});

test("Qwant: reads browser-transport JSON wrappers without treating challenges as empty results", async () => {
  const wrap = (body) => `<html><body><pre>${body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre></body></html>`;
  const results = await new qwant.default().executeSearch("test", 1, undefined, {
    fetch: async () => new Response(wrap(validBodies.Qwant)),
  });
  assert.deepEqual(results, [{ title: "Example & test", url: "https://example.test/", snippet: "A web result.", source: "Qwant" }]);
  await assert.rejects(new qwant.default().executeSearch("test", 1, undefined, {
    fetch: async () => new Response(wrap(JSON.stringify({ url: "https://geo.captcha-delivery.com/captcha/" }))),
  }), { status: "captcha" });
  await assert.rejects(new qwant.default().executeSearch("test", 1, undefined, {
    fetch: async () => new Response("<pre>Not JSON</pre>"),
  }), { status: "parse_error" });
});

test("Yahoo: page two starts at result eight, with Safe Search and time filters", async () => {
  const engine = new yahoo.default();
  engine.configure({ safeSearch: "strict" });
  let requested;
  let preferences;
  await engine.executeSearch("café & tea", 2, "week", {
    lang: "fr-FR",
    fetch: async (url, init) => {
      requested = new URL(url);
      preferences = new URLSearchParams(init.headers.Cookie.slice(3));
      return new Response(yahooBody());
    },
  });
  assert.equal(requested.origin, "https://search.yahoo.com");
  assert.equal(requested.searchParams.get("p"), "café & tea");
  assert.equal(requested.searchParams.get("b"), "8");
  assert.equal(requested.searchParams.get("pz"), "7");
  assert.equal(requested.searchParams.get("btf"), "w");
  assert.equal(preferences.get("vm"), "r");
  assert.equal(preferences.get("vl"), "lang_fr");
});

test("Yahoo: supports both title layouts and unwraps only Yahoo tracking links", async () => {
  const destination = "https://example.test/page?q=one&next=two";
  const wrapped = `https://r.search.yahoo.com/_ylt=tracking/RV=2/RE=1/RO=10/RU=${encodeURIComponent(destination)}/RK=2/RS=signature`;
  const oldCard = `<div class="algo-sr"><div class="compTitle"><h3><a href="${wrapped}" aria-label="A &lt;b&gt;title&lt;/b&gt;">Old heading</a></h3></div><div class="compText">Snippet</div></div>`;
  const cards = oldCard + yahooCard("https://example.test/", "HTML &lt;input&gt; &amp; text") + yahooCard("javascript:alert(1)") + yahooCard("file:///etc/passwd") + yahooCard("https://example.test/") + `<div class="ads">${yahooCard("https://ads.test/")}</div>`;
  const results = await new yahoo.default().executeSearch("test", 1, undefined, { fetch: async () => new Response(yahooBody(cards)) });
  assert.deepEqual(results.map(({ title, url }) => ({ title, url })), [
    { title: "A title", url: destination },
    { title: "HTML <input> & text", url: "https://example.test/" },
  ]);
});

test("Yahoo: accepts explicit no-results notices but rejects consent and CAPTCHA pages", async () => {
  for (const [body, status] of [
    ['<form action="https://consent.yahoo.com/collect"></form>', "interstitial"],
    ['<form action="/captcha/verify"></form>', "captcha"],
  ]) {
    await assert.rejects(new yahoo.default().executeSearch("test", 1, undefined, {
      fetch: async () => new Response(body),
    }), { status });
  }
  assert.deepEqual(await new yahoo.default().executeSearch("test", 1, undefined, {
    fetch: async () => new Response(yahooBody("<p>We did not find results for this query.</p>")),
  }), []);
  const results = await new yahoo.default().executeSearch("CAPTCHA", 1, undefined, {
    fetch: async () => new Response(yahooBody(yahooCard("https://example.test/", "CAPTCHA guide", "No results found for is an error message."))),
  });
  assert.equal(results.length, 1);
});
