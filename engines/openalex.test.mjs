import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import OpenAlex, { type, outgoingHosts } from "./openalex/index.js";

const work = {
  id: "https://openalex.org/W123", doi: "https://doi.org/10.1234/example", title: "Memory and sleep",
  publication_date: "2025-06-12", cited_by_count: 12,
  authorships: ["Alice", "Bob", "Carol", "Dan"].map(display_name => ({ author: { display_name } })),
  primary_location: { landing_page_url: "https://publisher.example/paper", source: { display_name: "Sleep Journal" } },
  best_oa_location: { landing_page_url: "https://repository.example/paper" },
  open_access: { is_oa: true },
  abstract_inverted_index: { improves: [1], Sleep: [0], memory: [2] },
};
const response = (results = [work], count = results.length) => Response.json({ meta: { count }, results });

test("OpenAlex requests projected research results with real pagination and maps metadata", async () => {
  const engine = new OpenAlex();
  engine.configure({ pageSize: "40", timeoutMs: "3000" });
  let pagination;
  const items = await engine.executeSearch("sleep deprivation memory", 2, undefined, {
    pagination: value => { pagination = value; },
    fetch: async (url, init) => {
      const request = new URL(url);
      assert.equal(request.origin, "https://api.openalex.org");
      assert.equal(request.pathname, "/works");
      assert.equal(request.searchParams.get("search"), "sleep deprivation memory");
      assert.equal(request.searchParams.get("page"), "2");
      assert.equal(request.searchParams.get("per_page"), "40");
      assert.ok(request.searchParams.get("select").includes("abstract_inverted_index"));
      assert.equal(request.searchParams.has("timeout_limit"), false);
      assert.equal(request.searchParams.has("timeout"), false);
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(Object.hasOwn(init, "signal"), false);
      return response([work, { ...work, title: "Duplicate" }, { title: "No valid URL", id: "javascript:bad" }], 123);
    },
  });
  assert.deepEqual(pagination, { total: 4 });
  assert.deepEqual(items, [{
    title: "Memory and sleep", url: "https://repository.example/paper", source: "OpenAlex", publishedAt: "2025-06-12",
    snippet: "Alice, Bob, Carol et al. · 2025 · Sleep Journal · Cited by 12 · Open access — Sleep improves memory",
  }]);
  assert.equal(type, "scientific publications");
  assert.deepEqual(outgoingHosts, ["api.openalex.org"]);
  assert.equal(engine.isClientExposed, false);
  assert.equal(engine.requestTimeoutMs, undefined);
});

test("OpenAlex supports exact DOI, date, open-access and sorting settings", async () => {
  const engine = new OpenAlex();
  engine.configure({ openAccessOnly: "true", preferOpenAccess: "false", sort: "newest" });
  for (const query of ["doi 10.1234/example", "https://doi.org/10.1234/example", "10.1234/example"]) {
    const items = await engine.executeSearch(query, 1, "week", {
      fetch: async url => {
        const params = new URL(url).searchParams;
        assert.equal(params.has("search"), false);
        assert.match(params.get("filter"), /^doi:https:\/\/doi.org\/10.1234\/example,is_oa:true,from_publication_date:\d{4}-\d{2}-\d{2}$/);
        assert.equal(params.get("sort"), "publication_date:desc");
        return response();
      },
    });
    assert.equal(items[0].url, work.doi);
  }
  engine.configure({ sort: "most-cited", openAccessOnly: false });
  await engine.executeSearch("memory", 1, undefined, {
    fetch: async url => {
      const params = new URL(url).searchParams;
      assert.equal(params.get("sort"), "cited_by_count:desc");
      assert.equal(params.has("filter"), false);
      return response();
    },
  });
});

test("OpenAlex sends an optional secret key in a header and supports clearing it", async () => {
  const engine = new OpenAlex();
  const field = engine.settingsSchema.find(item => item.key === "apiKey");
  assert.equal(field.secret, true);
  assert.equal(field.type, "password");
  engine.configure({ apiKey: "test-secret" });
  await engine.executeSearch("sleep", 1, undefined, {
    fetch: async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer test-secret");
      assert.ok(!url.includes("test-secret"));
      assert.equal(new URL(url).searchParams.has("api_key"), false);
      return response();
    },
  });
  engine.configure({ apiKey: "" });
  await engine.executeSearch("sleep", 1, undefined, {
    fetch: async (_url, init) => { assert.equal(init.headers.Authorization, undefined); return response(); },
  });
});

test("OpenAlex reports HTTP failures without retrying or echoing credentials", async () => {
  for (const [httpStatus, expected] of [[400, "parse_error"], [401, "blocked"], [403, "blocked"], [429, "rate_limited"], [503, "network"]]) {
    const engine = new OpenAlex();
    engine.configure({ apiKey: "test-secret" });
    let calls = 0;
    await assert.rejects(engine.executeSearch("sleep", 1, undefined, {
      fetch: async () => { calls++; return new Response("test-secret must not be echoed", { status: httpStatus }); },
      sentinel() {},
      engineError(status, message, options) {
        assert.equal(options.engine, "OpenAlex");
        return Object.assign(new Error(message), { status, httpStatus: options.httpStatus });
      },
    }), error => error.status === expected && error.httpStatus === httpStatus && !error.message.includes("test-secret"));
    assert.equal(calls, 1);
  }
});

test("OpenAlex distinguishes malformed data from a genuinely empty search", async () => {
  for (const payload of [null, {}, { results: [] }, { meta: { count: -1 }, results: [] }, { meta: { count: 1 }, results: [{ content: "missing title and URL" }] }]) {
    await assert.rejects(new OpenAlex().executeSearch("sleep", 1, undefined, {
      fetch: async () => Response.json(payload),
    }), error => error.status === "parse_error");
  }
  await assert.rejects(new OpenAlex().executeSearch("sleep", 1, undefined, {
    fetch: async () => new Response("<html>blocked</html>"),
  }), error => error.status === "parse_error");
  assert.deepEqual(await new OpenAlex().executeSearch("unlikely term", 1, undefined, { fetch: async () => response([], 0) }), []);
});

test("OpenAlex accepts sparse works and labels retractions without fabricating abstracts", async () => {
  const items = await new OpenAlex().executeSearch("sleep", 1, undefined, {
    fetch: async () => response([{ title: "Sparse work", id: "https://openalex.org/W9", is_retracted: true, cited_by_count: 0 }]),
  });
  assert.deepEqual(items, [{ title: "Sparse work", url: "https://openalex.org/W9", snippet: "RETRACTED · Cited by 0", source: "OpenAlex" }]);
});

test("OpenAlex respects basic pagination limits and skips blank input", async () => {
  const engine = new OpenAlex();
  let calls = 0;
  const context = { fetch: async () => { calls++; return response([], 90_000); }, pagination: value => assert.deepEqual(value, { total: 500 }) };
  assert.deepEqual(await engine.executeSearch(" ", 1, undefined, context), []);
  assert.deepEqual(await engine.executeSearch("sleep", 501, undefined, context), []);
  assert.equal(calls, 0);
  await engine.executeSearch("sleep", 500, undefined, context);
  assert.equal(calls, 1);
});

test("OpenAlex forwards host cancellation with no separate timeout policy", async () => {
  for (const timeoutMs of ["1500", "3000", "9000"]) {
    const engine = new OpenAlex();
    engine.configure({ timeoutMs });
    const parent = new AbortController();
    const reason = new DOMException("configured deadline", "TimeoutError");
    const pending = engine.executeSearch("sleep", 1, undefined, {
      signal: parent.signal,
      fetch: (_url, init) => { assert.equal(init.signal, parent.signal); return new Promise(() => {}); },
    });
    parent.abort(reason);
    await assert.rejects(pending, error => error === reason);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
    assert.equal(engine.requestTimeoutMs, undefined);
  }
});

test("OpenAlex cancels response parsing and never starts an already cancelled search", async () => {
  const parent = new AbortController();
  const reason = new Error("search abandoned");
  await assert.rejects(new OpenAlex().executeSearch("sleep", 1, undefined, {
    signal: parent.signal,
    fetch: async () => ({ ok: true, json() { parent.abort(reason); throw new SyntaxError("incomplete body"); } }),
  }), error => error === reason);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  let calls = 0;
  await assert.rejects(new OpenAlex().executeSearch("sleep", 1, undefined, {
    signal: parent.signal, fetch: () => { calls++; },
  }), error => error === reason);
  assert.equal(calls, 0);
});
