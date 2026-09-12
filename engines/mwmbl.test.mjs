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
  assert.equal(requestInit.signal, undefined);
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

test("Mwmbl unwraps Markdown-linked URLs from transport responses", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();

  const results = await engine.executeSearch("ethernet settings", 1, undefined, {
    fetch: async () => ({
      ok: true,
      async json() {
        return [
          {
            url: "[https://windowsreport.com/best-ethernet-settings-for-gaming/](https://windowsreport.com/best-ethernet-settings-for-gaming/)",
            title: [
              { value: "Best " },
              { value: "Ethernet", is_bold: true },
              { value: " Settings For Gaming" },
            ],
            extract: [
              { value: "Get fast speed and low ping with the best " },
              { value: "Ethernet", is_bold: true },
              { value: " settings." },
            ],
            source: "mwmbl",
          },
        ];
      },
    }),
  });

  assert.deepEqual(results, [
    {
      title: "Best Ethernet Settings For Gaming",
      url: "https://windowsreport.com/best-ethernet-settings-for-gaming/",
      snippet: "Get fast speed and low ping with the best Ethernet settings.",
      source: "Mwmbl",
    },
  ]);
});

test("Mwmbl upgrades HTTP crawl URLs before degoog marks results insecure", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();

  const results = await engine.executeSearch("alt linux", 1, undefined, {
    fetch: async () => ({
      ok: true,
      async json() {
        return [
          {
            url: "http://packages.altlinux.org/en/c10f1/srpms/ethtool/",
            title: "Ethernet settings tools",
          },
          {
            url: "[http://example.test/legacy](http://example.test/legacy)",
            title: "Legacy result",
          },
        ];
      },
    }),
  });

  assert.equal(results[0].url, "https://packages.altlinux.org/en/c10f1/srpms/ethtool/");
  assert.equal(results[1].url, "https://example.test/legacy");
});

test("Mwmbl maps the same payload through native direct fetch", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const originalFetch = globalThis.fetch;
  let requestedUrl;

  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      async json() {
        return [
          {
            url: "[https://example.test/direct](https://example.test/direct)",
            title: "Direct result",
          },
        ];
      },
    };
  };

  try {
    const results = await engine.executeSearch("direct fetch");
    assert.equal(requestedUrl.pathname, "/api/v1/search/");
    assert.equal(results[0].url, "https://example.test/direct");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("Mwmbl forwards host cancellation without imposing its own deadline", async () => {
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
  assert.equal(capturedSignal, parent.signal);
  assert.equal(capturedSignal.reason, cancellation);
});

test("Mwmbl lets transport-backed requests follow the host timeout policy", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const hostSignal = new AbortController().signal;

  const results = await engine.executeSearch("slow transport", 1, undefined, {
    signal: hostSignal,
    // 4play may wait for a browser session; the host controls its deadline.
    fetch: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: true,
        async json() {
          return [{ title: "Delayed result", url: "https://example.test/result" }];
        },
      };
    },
  });

  assert.equal(results[0].title, "Delayed result");
});
