import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

const ENGINE_CASES = [
  {
    path: "./searxng-search/index.js",
    type: "web",
    category: "general",
  },
  {
    path: "./searxng-images/index.js",
    type: "images",
    category: "images",
  },
  {
    path: "./searxng-videos/index.js",
    type: "videos",
    category: "videos",
  },
  {
    path: "./searxng-news/index.js",
    type: "news",
    category: "news",
  },
  {
    path: "./searxng-file/index.js",
    type: "file",
    category: "files",
  },
];

for (const engineCase of ENGINE_CASES) {
  test(`${engineCase.type} engine normalizes scheme-relative media without rewriting absolute URLs`, async () => {
    const { default: Engine } = await import(engineCase.path);
    const urls = [
      "//live.staticflickr.com/123/photo.jpg",
      "http://example.test/photo.jpg?next=//unchanged",
      "https://example.test/photo.jpg?size=large#preview",
      undefined,
    ];
    for (const thumbnail of urls) {
      for (const img_src of urls) {
        const result = { title: "Photo", url: "https://example.test/page", thumbnail, img_src };
        const [mapped] = await new Engine().executeSearch("photo", 1, undefined, {
          fetch: async () => Response.json({ results: [result] }),
        });
        const absolute = (value) => value?.startsWith("//") ? `https:${value}` : value;
        assert.equal(mapped.thumbnail, absolute(thumbnail || img_src));
        assert.equal(mapped.imageUrl, absolute(img_src || thumbnail));
        assert.equal(mapped.url, result.url);
      }
    }
  });

  test(`${engineCase.type} engine builds requests and maps results`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    let requestUrl;
    let requestInit;

    engine.configure({
      baseUrl: "https://search.example.test/",
      engines: "example",
      safesearch: "2",
    });

    const results = await engine.executeSearch("test query", 2, "week", {
      lang: "en-US",
      fetch: async (url, init) => {
        requestUrl = new URL(url);
        requestInit = init;
        return {
          ok: true,
          async json() {
            return {
              results: [
                {
                  title: "Example",
                  url: "https://example.test/result",
                  content: "Result summary",
                  engine: "example",
                  thumbnail: "https://example.test/thumb.jpg",
                  img_src: "https://example.test/image.jpg",
                  duration: "3:14",
                },
                { title: "", url: "https://example.test/invalid" },
              ],
            };
          },
        };
      },
    });

    assert.equal(module.type, engineCase.type);
    assert.equal(requestUrl.origin, "https://search.example.test");
    assert.equal(requestUrl.pathname, "/search");
    assert.equal(requestUrl.searchParams.get("q"), "test query");
    assert.equal(requestUrl.searchParams.get("pageno"), "2");
    assert.equal(requestUrl.searchParams.has("categories"), false);
    assert.equal(requestUrl.searchParams.get("engines"), "example");
    assert.equal(requestUrl.searchParams.get("safesearch"), "2");
    assert.equal(requestUrl.searchParams.get("language"), "en-US");
    assert.equal(requestUrl.searchParams.get("time_range"), "week");
    assert.equal(requestInit.headers.Accept, "application/json");
    assert.equal(requestInit.signal, undefined, "let core inject its signal");
    assert.deepEqual(results, [
      {
        title: "Example",
        url: "https://example.test/result",
        snippet: "Result summary",
        source: "SearXNG:example",
        thumbnail: "https://example.test/thumb.jpg",
        imageUrl: "https://example.test/image.jpg",
        duration: "3:14",
      },
    ]);
  });

  test(`${engineCase.type} engine uses its category without engine selection`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    let requestUrl;

    await engine.executeSearch("test query", 1, "any", {
      fetch: async (url) => {
        requestUrl = new URL(url);
        return { ok: true, json: async () => ({ results: [] }) };
      },
    });

    assert.equal(requestUrl.searchParams.get("categories"), engineCase.category);
    assert.equal(requestUrl.searchParams.has("engines"), false);
  });

  test(`${engineCase.type} engine skips blank searches`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    let fetchCalls = 0;

    const results = await engine.executeSearch("   ", 1, "any", {
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("blank queries must not reach SearXNG");
      },
    });

    assert.deepEqual(results, []);
    assert.equal(fetchCalls, 0);
  });

  test(`${engineCase.type} engine reports HTTP failures through sentinel`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    const failure = new Error("rate limited");
    let sentinelCall;

    await assert.rejects(
      engine.executeSearch("test query", 1, "any", {
        fetch: async () => ({ ok: false, status: 429 }),
        sentinel(response, engineName) {
          sentinelCall = { response, engineName };
          throw failure;
        },
      }),
      failure,
    );

    assert.equal(sentinelCall.response.status, 429);
    assert.equal(sentinelCall.engineName, engine.name);
  });

  test(`${engineCase.type} engine reports invalid JSON as a parse error`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    const parseFailure = new Error("parse failure");
    let engineErrorCall;

    await assert.rejects(
      engine.executeSearch("test query", 1, "any", {
        fetch: async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new SyntaxError("invalid json");
          },
        }),
        engineError(status, message, options) {
          engineErrorCall = { status, message, options };
          return parseFailure;
        },
      }),
      parseFailure,
    );

    assert.equal(engineErrorCall.status, "parse_error");
    assert.equal(engineErrorCall.options.httpStatus, 200);
    assert.equal(engineErrorCall.options.engine, engine.name);
  });

  test(`${engineCase.type} engine propagates network failures`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    const networkFailure = new Error("connection refused");

    await assert.rejects(
      engine.executeSearch("test query", 1, "any", {
        fetch: async () => {
          throw networkFailure;
        },
      }),
      networkFailure,
    );
  });

  test(`${engineCase.type} engine lets core inject cancellation and its configured deadline`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    assert.equal(engine.requestTimeoutMs, undefined);
    for (const reason of [new Error("search abandoned"), new DOMException("configured deadline", "TimeoutError")]) {
      const host = new AbortController();
      let capturedSignal;
      const request = engine.executeSearch("test query", 1, "any", {
        fetch: (_url, init) => {
          const requestInit = { ...init };
          if (!requestInit.signal) requestInit.signal = host.signal;
          capturedSignal = requestInit.signal;
          return new Promise((_resolve, reject) => {
            requestInit.signal.addEventListener("abort", () => reject(requestInit.signal.reason), { once: true });
          });
        },
      });
      host.abort(reason);
      await assert.rejects(request, (error) => error === reason);
      assert.equal(capturedSignal, host.signal);
    }
  });

  test(`${engineCase.type} engine forwards host cancellation`, async () => {
    const module = await import(engineCase.path);
    const engine = new module.default();
    const parent = new AbortController();
    const cancellation = new Error("search cancelled");
    let capturedSignal;

    const request = engine.executeSearch("test query", 1, "any", {
      signal: parent.signal,
      fetch: async (_url, init) => {
        capturedSignal = init.signal;
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        });
      },
    });
    parent.abort(cancellation);

    await assert.rejects(request, cancellation);
    assert.equal(capturedSignal, parent.signal);
    assert.equal(capturedSignal.aborted, true);
    assert.equal(capturedSignal.reason, cancellation);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  });

  test(`${engineCase.type} engine skips already-abandoned requests`, async () => {
    const { default: Engine } = await import(engineCase.path);
    const parent = new AbortController();
    const reason = new Error("already abandoned");
    parent.abort(reason);
    let calls = 0;
    await assert.rejects(new Engine().executeSearch("test", 1, "any", {
      signal: parent.signal,
      fetch: () => { calls++; throw new Error("must not fetch"); },
    }), (error) => error === reason);
    assert.equal(calls, 0);
  });

  test(`${engineCase.type} engine cancellation wins during an uncooperative response body`, async () => {
    const { default: Engine } = await import(engineCase.path);
    const parent = new AbortController();
    const reason = new Error("abandoned body");
    let started;
    const bodyStarted = new Promise((resolve) => { started = resolve; });
    const request = new Engine().executeSearch("test", 1, "any", {
      signal: parent.signal,
      fetch: async () => ({ ok: true, json: () => { started(); return new Promise(() => {}); } }),
    });
    await bodyStarted;
    parent.abort(reason);
    await assert.rejects(request, (error) => error === reason);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  });

  test(`${engineCase.type} engine cleans up listeners on success and synchronous failure`, async () => {
    const { default: Engine } = await import(engineCase.path);
    const parent = new AbortController();
    const engine = new Engine();
    assert.deepEqual(await engine.executeSearch("test", 1, "any", {
      signal: parent.signal,
      fetch: async () => Response.json({ results: [] }),
    }), []);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
    const reason = new Error("transport aborted");
    await assert.rejects(engine.executeSearch("test", 1, "any", {
      signal: parent.signal,
      fetch: () => { parent.abort(reason); throw reason; },
    }), (error) => error === reason);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  });
}

test("engines leave result caching to degoog search orchestration", async () => {
  const module = await import("./searxng-search/index.js");
  const engine = new module.default();
  let fetchCalls = 0;

  engine.configure({ baseUrl: "https://search.example.test" });
  const context = {
    fetch: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return { results: [] };
        },
      };
    },
  };

  await engine.executeSearch("same query", 1, "any", context);
  await engine.executeSearch("same query", 1, "any", context);

  assert.equal(fetchCalls, 2);
});
