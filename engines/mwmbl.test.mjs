import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

test("Mwmbl builds the public API request and maps v1 results", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  let requestUrl;
  let requestInit;
  let pagination;

  const results = await engine.executeSearch("open source search", 1, "week", {
    pagination: (value) => { pagination = value; },
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
  assert.equal(engine.bangShortcut, "mw");
  assert.deepEqual(pagination, { total: 1 });
  assert.equal(requestUrl.origin, "https://api.mwmbl.org");
  assert.equal(requestUrl.pathname, "/api/v1/search/");
  assert.equal(requestUrl.searchParams.get("s"), "open source search");
  assert.equal(requestUrl.searchParams.has("page"), false);
  assert.equal(requestUrl.searchParams.has("time_range"), false);
  assert.equal(requestInit.headers.Accept, "application/json");
  assert.ok(requestInit.signal instanceof AbortSignal);
  assert.equal(requestInit.signal.aborted, false);
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

test("Mwmbl skips later pages and their retries without fetching", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const pages = [];
  let fetchCalls = 0;
  const context = {
    pagination: (value) => { pages.push(value); },
    fetch: async () => { fetchCalls += 1; throw new Error("unexpected request"); },
  };

  for (const page of [2, 2, 3, 100]) {
    assert.deepEqual(await engine.executeSearch("test", page, undefined, context), []);
  }
  assert.equal(fetchCalls, 0);
  assert.deepEqual(pages, Array.from({ length: 4 }, () => ({ total: 1 })));
  assert.deepEqual(await engine.executeSearch("test", 2), []);
});

test("Mwmbl does not fetch an already-cancelled search", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();
  const cancellation = new Error("search already cancelled");
  parent.abort(cancellation);
  let fetchCalls = 0;

  await assert.rejects(engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: async () => { fetchCalls += 1; },
  }), (error) => error === cancellation);
  assert.equal(fetchCalls, 0);
});

test("Mwmbl cancellation settles even when fetch ignores its signal", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();
  const cancellation = new Error("search cancelled");
  const request = engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: async () => new Promise(() => {}),
  });
  parent.abort(cancellation);
  await assert.rejects(request, (error) => error === cancellation);
});

test("Mwmbl cancellation settles while an uncooperative JSON body is pending", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();
  const cancellation = new Error("body cancelled");
  let bodyStarted;
  const readingBody = new Promise((resolve) => { bodyStarted = resolve; });
  const request = engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: async () => ({
      ok: true,
      json: () => { bodyStarted(); return new Promise(() => {}); },
    }),
  });
  await readingBody;
  parent.abort(cancellation);
  await assert.rejects(request, (error) => error === cancellation);
});

test("Mwmbl discards results when the transport cancels and then returns", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();
  const cancellation = new Error("cancelled before headers");
  let bodyReads = 0;

  await assert.rejects(engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: () => {
      parent.abort(cancellation);
      return { ok: true, json: async () => { bodyReads += 1; return []; } };
    },
  }), (error) => error === cancellation);
  assert.equal(bodyReads, 0);
});

test("Mwmbl leaves caching and retries to degoog", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const timeout = new DOMException("host request timed out", "TimeoutError");
  let fetchCalls = 0;
  const context = {
    fetch: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw timeout;
      return { ok: true, json: async () => [{ title: `Result ${fetchCalls}`, url: "https://example.test/" }] };
    },
  };

  await assert.rejects(engine.executeSearch("test", 1, undefined, context), /timed out/);
  assert.equal(fetchCalls, 1, "the engine must not retry a timed-out request itself");
  assert.equal((await engine.executeSearch("test", 1, undefined, context))[0].title, "Result 2");
  assert.equal((await engine.executeSearch("test", 1, undefined, context))[0].title, "Result 3");
  assert.equal(fetchCalls, 3, "host-requested retries must not return an engine-local cached result");
});

test("Mwmbl handles cancellation followed by a synchronous transport error", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();
  const cancellation = new Error("cancelled during fetch");

  await assert.rejects(engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: () => { parent.abort(cancellation); throw cancellation; },
  }), (error) => error === cancellation);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("Mwmbl removes its cancellation listener on success and failure", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  const parent = new AbortController();

  assert.deepEqual(await engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: async () => ({ ok: true, json: async () => [] }),
  }), []);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);

  const failure = new Error("transport failed");
  await assert.rejects(engine.executeSearch("test", 1, undefined, {
    signal: parent.signal,
    fetch: () => { throw failure; },
  }), (error) => error === failure);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
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

test("Mwmbl forwards host cancellation to the transport", async () => {
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
  assert.notEqual(capturedSignal, parent.signal);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(capturedSignal.reason, cancellation);
});

test("Mwmbl leaves a shorter outer host deadline in force without an exposed signal", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  // Current core injects its signal only when init.signal is absent, and
  // independently races executeSearch against the user's configured timeout.
  const host = new AbortController();
  const reason = new Error("Engine timeout");
  let capturedSignal;
  const request = engine.executeSearch("test", 1, undefined, {
    fetch: (_url, init) => {
      const baseInit = { ...init };
      if (!baseInit.signal) baseInit.signal = host.signal;
      capturedSignal = baseInit.signal;
      return new Promise(() => {});
    },
  });
  const outerDeadline = new Promise((_resolve, reject) => {
    setTimeout(() => { host.abort(); reject(reason); }, 20);
  });
  await assert.rejects(Promise.race([request, outerDeadline]), (error) => error === reason);
  assert.equal(capturedSignal.aborted, false, "a hidden host signal cannot cancel our transport");
  await assert.rejects(request, { name: "TimeoutError", message: "Mwmbl timeout after 1000 ms" });
  assert.equal(capturedSignal.aborted, true, "the transport still stops at the local cap");
});

test("Mwmbl preserves a host timeout when a transport ignores cancellation", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const host = new AbortController();
  const timeoutFailure = new DOMException("settings deadline", "TimeoutError");

  const request = engine.executeSearch("uncancellable upstream", 1, undefined, {
    signal: host.signal,
    fetch: async () => new Promise(() => {}),
  });
  host.abort(timeoutFailure);
  await assert.rejects(request, (error) => error === timeoutFailure);
});

test("Mwmbl stops at one second even when fetch ignores cancellation", async () => {
  const module = await import("./mwmbl/index.js");
  const engine = new module.default();
  const parent = new AbortController();
  let capturedSignal;
  let finishFetch;
  let bodyReads = 0;
  let fetchCalls = 0;
  const start = performance.now();
  const request = engine.executeSearch("slow transport", 1, undefined, {
    signal: parent.signal,
    fetch: (_url, init) => {
      fetchCalls += 1;
      capturedSignal = init.signal;
      return new Promise((resolve) => { finishFetch = resolve; });
    },
  });
  await assert.rejects(request, { name: "TimeoutError", message: "Mwmbl timeout after 1000 ms" });
  assert.ok(performance.now() - start >= 900, "do not time out a fast response");
  assert.ok(performance.now() - start < 2000, "do not wait for the host's long timeout");
  assert.equal(capturedSignal.aborted, true);
  assert.equal(parent.signal.aborted, false);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  assert.equal(getEventListeners(capturedSignal, "abort").length, 0);
  assert.equal(fetchCalls, 1);
  finishFetch({ ok: true, json: async () => { bodyReads += 1; return []; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bodyReads, 0, "ignore a late response rather than reading its body");
});

test("Mwmbl uses one deadline for fetching and reading an uncooperative body", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const engine = new MwmblEngine();
  let capturedSignal;
  let finishBody;
  const start = performance.now();
  const request = engine.executeSearch("slow body", 1, undefined, {
    fetch: async (_url, init) => {
      capturedSignal = init.signal;
      await new Promise((resolve) => setTimeout(resolve, 650));
      return { ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) };
    },
  });
  await assert.rejects(request, { name: "TimeoutError" });
  assert.ok(performance.now() - start < 1500, "the deadline must not restart after headers");
  assert.equal(capturedSignal.aborted, true);
  finishBody([{ title: "Too late", url: "https://example.test/late" }]);
});

test("Mwmbl preserves its timeout reason when the transport throws a generic abort", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  await assert.rejects(new MwmblEngine().executeSearch("test", 1, undefined, {
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  }), { name: "TimeoutError", message: "Mwmbl timeout after 1000 ms" });
});

test("Mwmbl clears its deadline after success or failure", async () => {
  const { default: MwmblEngine } = await import("./mwmbl/index.js");
  const signals = [];
  const failure = new Error("upstream failed");
  const engine = new MwmblEngine();
  assert.deepEqual(await engine.executeSearch("empty result", 1, undefined, {
    fetch: async (_url, { signal }) => {
      signals.push(signal);
      return { ok: true, json: async () => [] };
    },
  }), []);
  await assert.rejects(engine.executeSearch("failed request", 1, undefined, {
    fetch: (_url, { signal }) => { signals.push(signal); throw failure; },
  }), (error) => error === failure);
  await new Promise((resolve) => setTimeout(resolve, 1050));
  for (const signal of signals) {
    assert.equal(signal.aborted, false, "a cleared deadline must not abort a completed request");
    assert.equal(getEventListeners(signal, "abort").length, 0);
  }
});
