import assert from "node:assert/strict";
import test from "node:test";

test("selfh.st Icons searches the cached public index and prefers SVG", async () => {
  const module = await import("./selfhst-icons/index.js");
  const engine = new module.default();
  let requestUrl;
  let requestInit;
  let fetchCalls = 0;

  const context = {
    fetch: async (url, init) => {
      fetchCalls += 1;
      requestUrl = new URL(url);
      requestInit = init;
      return {
        ok: true,
        async json() {
          return [
            {
              Name: "Home Assistant",
              Reference: "home-assistant",
              SVG: "Yes",
              PNG: "Yes",
              WebP: "Yes",
              Category: "Self-Hosted",
              Tags: "Automation",
            },
            {
              Name: "Plex",
              Reference: "plex",
              SVG: "No",
              PNG: "Yes",
              WebP: "Yes",
              Category: "Self-Hosted",
              Tags: "Media",
            },
          ];
        },
      };
    },
  };

  assert.equal(module.type, "images");
  assert.equal(engine.bangShortcut, "si");
  assert.deepEqual(await engine.executeSearch("home assistant", 1, "any", context), [
    {
      title: "Home Assistant",
      url: "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/home-assistant.svg",
      snippet: "Self-Hosted · Automation",
      source: "selfh.st/icons",
      thumbnail:
        "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/home-assistant.svg",
      imageUrl:
        "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/home-assistant.svg",
    },
  ]);
  assert.equal(requestUrl.href, "https://cdn.jsdelivr.net/gh/selfhst/icons/index.json");
  assert.equal(requestInit.headers.Accept, "application/json");
  assert.ok(requestInit.signal instanceof AbortSignal);

  const second = await engine.executeSearch("plex", 1, "any", context);
  assert.equal(second[0].url, "https://cdn.jsdelivr.net/gh/selfhst/icons/png/plex.png");
  assert.equal(fetchCalls, 1);
});

test("selfh.st Icons skips blank queries without fetching", async () => {
  const module = await import("./selfhst-icons/index.js");
  const engine = new module.default();
  let fetchCalls = 0;

  assert.deepEqual(
    await engine.executeSearch("   ", 1, "any", {
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("blank queries must not reach selfh.st");
      },
    }),
    [],
  );
  assert.equal(fetchCalls, 0);
});

test("selfh.st Icons paginates without repeating the first page on infinite scroll", async () => {
  const { default: Engine } = await import("./selfhst-icons/index.js");
  const engine = new Engine();
  let fetchCalls = 0;
  const context = {
    fetch: async () => {
      fetchCalls++;
      return { ok: true, json: async () => Array.from({ length: 105 }, (_, i) => ({
        Name: `Icon ${String(i).padStart(3, "0")}`,
        Reference: `icon-${i}`, SVG: "Yes",
      })) };
    },
  };
  const first = await engine.executeSearch("icon", 1, "any", context);
  const second = await engine.executeSearch("icon", 2, "any", context);
  assert.equal(first.length, 100);
  assert.equal(second.length, 5);
  assert.equal(new Set([...first, ...second].map(result => result.url)).size, 105);
  assert.deepEqual(await engine.executeSearch("icon", 3, "any", context), []);
  assert.equal((await engine.executeSearch("icon-104", 1, "any", context)).length, 1);
  assert.deepEqual(await engine.executeSearch("icon-104", 2, "any", context), [], 'single result is not repeated');
  for (const page of [0, -1, 1.5, NaN, Infinity]) {
    assert.deepEqual(await engine.executeSearch("icon", page, "any", context), []);
  }
  assert.equal(fetchCalls, 1, 'all pages share the cached public index');
});

test("selfh.st Icons reports malformed indexes through degoog hooks", async () => {
  const module = await import("./selfhst-icons/index.js");
  const engine = new module.default();
  const parseFailure = new Error("parse failure");
  let engineErrorCall;

  await assert.rejects(
    engine.executeSearch("plex", 1, "any", {
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      engineError(status, message, options) {
        engineErrorCall = { status, message, options };
        return parseFailure;
      },
    }),
    parseFailure,
  );
  assert.equal(engineErrorCall.status, "parse_error");
  assert.equal(engineErrorCall.options.httpStatus, 200);
  assert.equal(engineErrorCall.options.engine, "selfh.st Icons");
});

test("selfh.st Icons fails fast when the index stalls", async () => {
  const module = await import("./selfhst-icons/index.js");
  const engine = new module.default();
  engine.requestTimeoutMs = 5;
  const timeoutFailure = new Error("timeout failure");
  let engineErrorCall;

  await assert.rejects(
    engine.executeSearch("plex", 1, "any", {
      fetch: async () => new Promise(() => {}),
      engineError(status, message, options) {
        engineErrorCall = { status, message, options };
        return timeoutFailure;
      },
    }),
    timeoutFailure,
  );
  assert.equal(engineErrorCall.status, "timeout");
  assert.equal(engineErrorCall.options.engine, "selfh.st Icons");
});
