import assert from "node:assert/strict";
import test from "node:test";

test("Mwmbl builds the public API request and maps v1 results", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  let requestUrl;
  let requestInit;

  const results = await engine.executeSearch("open source search", 4, "week", {
    fetch: async (url, init) => {
      requestUrl = new URL(url);
      requestInit = init;
      return {
        ok: true,
        async json() {
          return [
            {
              title: [{ value: "Mwmbl", is_bold: false }, { value: " Search" }],
              url: "https://mwmbl.org/",
              extract: [{ value: "A community-powered search engine." }],
            },
            { title: "", url: "https://example.test/no-title", extract: "" },
            { title: "ignored" },
          ];
        },
      };
    },
  });

  assert.equal(module.type, "web");
  assert.equal(requestUrl.origin, "https://api.mwmbl.org");
  assert.equal(requestUrl.pathname, "/api/v1/search/");
  assert.equal(requestUrl.searchParams.get("s"), "open source search");
  assert.equal(requestUrl.searchParams.has("page"), false);
  assert.equal(requestUrl.searchParams.has("time_range"), false);
  assert.equal(requestInit.headers.Accept, "application/json");
  assert.ok(requestInit.signal instanceof AbortSignal);
  assert.deepEqual(results, [
    {
      title: "Mwmbl Search",
      url: "https://mwmbl.org/",
      snippet: "A community-powered search engine.",
      source: "Mwmbl",
    },
    {
      title: "https://example.test/no-title",
      url: "https://example.test/no-title",
      snippet: "",
      source: "Mwmbl",
    },
  ]);
});

test("Mwmbl accepts wrapped v2-style results and configurable host URLs", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  engine.configure({ baseUrl: "https://mirror.example.test/" });
  let requestUrl;

  const results = await engine.executeSearch("mwmbl", 1, undefined, {
    fetch: async (url) => {
      requestUrl = new URL(url);
      return {
        ok: true,
        async json() {
          return {
            results: [
              {
                title: "Wrapped result",
                url: "https://example.test/result",
                description: "Wrapped description",
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(requestUrl.origin, "https://mirror.example.test");
  assert.equal(requestUrl.pathname, "/api/v1/search/");
  assert.equal(results[0].snippet, "Wrapped description");
});

test("Mwmbl skips blank searches without fetching", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  let fetchCalls = 0;

  assert.deepEqual(
    await engine.executeSearch("   ", 1, undefined, {
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("blank queries must not reach Mwmbl");
      },
    }),
    [],
  );
  assert.equal(fetchCalls, 0);
});

test("Mwmbl reports HTTP and JSON failures through degoog hooks", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const sentinelFailure = new Error("rate limited");
  let sentinelCall;

  await assert.rejects(
    engine.executeSearch("test", 1, undefined, {
      fetch: async () => ({ ok: false, status: 429 }),
      sentinel(response, engineName) {
        sentinelCall = { response, engineName };
        throw sentinelFailure;
      },
    }),
    sentinelFailure,
  );
  assert.equal(sentinelCall.response.status, 429);
  assert.equal(sentinelCall.engineName, "Mwmbl");

  const parseFailure = new Error("parse failure");
  let engineErrorCall;
  await assert.rejects(
    engine.executeSearch("test", 1, undefined, {
      fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("invalid"); } }),
      engineError(status, message, options) {
        engineErrorCall = { status, message, options };
        return parseFailure;
      },
    }),
    parseFailure,
  );
  assert.equal(engineErrorCall.status, "parse_error");
  assert.equal(engineErrorCall.options.httpStatus, 200);
  assert.equal(engineErrorCall.options.engine, "Mwmbl");
});

test("Mwmbl forwards cancellation and times out stalled requests", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const parent = new AbortController();
  const cancellation = new Error("search cancelled");
  let capturedSignal;

  const request = engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: async (_url, init) => {
      capturedSignal = init.signal;
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    },
  });
  parent.abort(cancellation);
  await assert.rejects(request, cancellation);
  assert.equal(capturedSignal.reason, cancellation);

  engine.requestTimeoutMs = 5;
  let timeoutError;
  await assert.rejects(
    engine.executeSearch("test", 1, undefined, {
      fetch: async (_url, init) => await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
      engineError(status, message, options) {
        timeoutError = { status, message, options };
        return new Error("timed out");
      },
    }),
  );
  assert.equal(timeoutError.status, "timeout");
  assert.equal(timeoutError.options.engine, "Mwmbl");
});
