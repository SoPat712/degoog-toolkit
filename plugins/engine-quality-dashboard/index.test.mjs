import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, mkdir, symlink, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "cheerio";
import { createStore, sharedStore, HOUR, LATENCY_EDGES } from "./store.js";
import { authorize, basePath, sessionHeaders } from "./auth.js";
import { createDataHandler, command, interceptor, routes } from "./index.js";

const run = extra => ({ engine: "Example", engineId: "example-engine", searchType: "web", page: 1, time: 100, resultCount: 10, status: "ok", cached: false, at: Date.now(), ...extra });
const request = (headers = {}, path = "snapshot") => new Request(`https://search.example/api/plugin/installed-id/${path}`, { headers });
const authResult = (data, status = 200) => Response.json(data, { status });

async function fixture(t, options = {}) {
  const base = await mkdtemp(join(tmpdir(), "engine-quality-test-"));
  const directory = join(base, "private-history");
  const store = createStore({ directory, flushMs: 60_000, ...options });
  t.after(async () => { await store.close(); await rm(base, { recursive: true, force: true }); });
  await store.load();
  return { store, directory, base };
}

test("requires an existing admin session and never contacts auth without credentials", async () => {
  let calls = 0;
  assert.equal(await authorize(request(), { fetcher: () => { calls++; } }), 401);
  assert.equal(calls, 0);
  for (const result of [{ required: true, valid: false }, { required: false, valid: true }, { valid: true }, null]) {
    assert.equal(await authorize(request({ "x-settings-token": "test-session" }), { fetcher: async () => authResult(result) }), 401);
  }
});

test("validates through canonical loopback auth, forwarding only native credentials", async () => {
  const incoming = new Request("https://untrusted-host.example/api/plugin/id/snapshot", {
    headers: { "x-settings-token": "stale-test-header", cookie: "unrelated=private; settings-token=test-cookie; other=ignored" },
  });
  assert.equal(await authorize(incoming, { port: "5555", prefix: "/search", fetcher: async (url, init) => {
    assert.equal(url, "http://127.0.0.1:5555/search/api/settings/auth");
    assert.equal(init.headers.Cookie, "settings-token=test-cookie");
    assert.equal(init.headers["x-settings-token"], "stale-test-header");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return authResult({ required: true, valid: true });
  } }), 200);
  assert.deepEqual(sessionHeaders(request({ cookie: "settings-token=test-cookie" })), { Accept: "application/json", Cookie: "settings-token=test-cookie" });
});

test("auth fails closed on cross-site requests, invalid configuration and unreachable auth", async () => {
  assert.equal(await authorize(request({ "sec-fetch-site": "cross-site", "x-settings-token": "test-session" }), { fetcher: () => assert.fail("must not fetch") }), 403);
  for (const port of ["-1", "65536", "4444@evil.example"]) {
    assert.equal(await authorize(request({ "x-settings-token": "test-session" }), { port, fetcher: () => assert.fail("invalid port must not fetch") }), 503);
  }
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => new Response("not JSON"), async () => authResult({}, 500)]) {
    assert.equal(await authorize(request({ "x-settings-token": "test-session" }), { fetcher }), 503);
  }
  assert.equal(sessionHeaders(request({ "x-settings-token": "x".repeat(513) })), null);
});

test("base paths support root, absolute public URLs and subpath installations", () => {
  assert.equal(basePath(""), ""); assert.equal(basePath("/"), "");
  assert.equal(basePath("https://search.example/degoog/"), "/degoog");
  assert.equal(basePath("/degoog/"), "/degoog");
  for (const path of ["//evil.example", "/../elsewhere", "/path?bad", "/path\\bad"]) assert.throws(() => basePath(path));
});

test("all data routes authorize before accessing history and return private responses", async () => {
  assert.deepEqual(routes.map(r => [r.method, r.path]), [["get", "snapshot"], ["get", "export"]]);
  assert.ok(routes.every(r => r.rateLimit));
  for (const status of [401, 403, 503]) {
    const response = await createDataHandler(() => assert.fail("unauthorized history access"), async () => status)(request());
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
});

test("authorized export uses the same guard and safe attachment headers", async t => {
  const { store } = await fixture(t);
  store.record(run());
  let checked = 0;
  const response = await createDataHandler(() => store, async () => { checked++; return 200; }, true)(request({}, "export?window=1h&type=web"));
  assert.equal(checked, 1); assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="engine-quality.json"');
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await response.json()).summary.live, 1);
  const invalid = await createDataHandler(() => store, async () => 200)(request({}, "snapshot?window=invalid"));
  assert.equal(invalid.status, 400);
});

test("fresh failures, successful empty results and cache hits use separate denominators", async t => {
  const { store } = await fixture(t);
  store.record(run());
  store.record(run({ time: 3100, resultCount: 0, status: "timeout" }));
  store.record(run({ time: 200, resultCount: 0 }));
  store.record(run({ cached: true, time: 900_000, resultCount: 1000 }));
  const data = store.snapshot();
  assert.equal(data.summary.live, 3); assert.equal(data.summary.cached, 1);
  assert.equal(data.summary.failed, 1); assert.equal(data.summary.ok, 2); assert.equal(data.summary.empty, 1);
  assert.ok(Math.abs(data.summary.failRate - 100 / 3) < 1e-10); assert.equal(data.summary.emptyRate, 50);
  assert.equal(data.summary.avgMs, 3400 / 3); assert.equal(data.summary.avgResults, 5);
  assert.equal(data.summary.maxMs, 3100);
  assert.deepEqual(data.summary.statuses, { ok: 2, timeout: 1 });
  assert.equal(data.rows[0].lastFailure.status, "timeout");
});

test("cache-only history has no live latency, failure or result-rate measurements", async t => {
  const { store } = await fixture(t); store.record(run({ cached: true }));
  const { summary } = store.snapshot();
  for (const key of ["failRate", "emptyRate", "avgMs", "maxMs", "avgResults", "p50", "p95"]) assert.equal(summary[key], null, key);
});

test("approximate percentiles include slow failures and expose histogram overflow", async t => {
  const { store } = await fixture(t);
  store.record(run({ time: 101 })); store.record(run({ time: 700_000, status: "network", resultCount: 0 }));
  const { summary } = store.snapshot();
  assert.deepEqual(summary.p50, { ms: 250, overflow: false });
  assert.deepEqual(summary.p95, { ms: 700_000, overflow: true });
  assert.ok(LATENCY_EDGES.includes(1500)); assert.ok(LATENCY_EDGES.includes(3000));
});

test("history persists privately, reloads, and never stores queries, URLs, IPs or error text", async t => {
  const { store, directory } = await fixture(t);
  store.record(run({ status: "blocked", httpStatus: 403, resultCount: 0, query: "PRIVATE_QUERY", errorReason: "PRIVATE_ERROR https://secret.example/?token=PRIVATE_TOKEN", results: [{ url: "PRIVATE_URL" }], clientIp: "PRIVATE_IP" }));
  await store.flush();
  const raw = await readFile(store.file, "utf8");
  assert.doesNotMatch(raw, /PRIVATE_|secret\.example|errorReason|clientIp|"query"/);
  assert.equal((await stat(store.file)).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  const copy = createStore({ directory }); await copy.load();
  assert.equal(copy.snapshot().summary.failed, 1); assert.equal(copy.snapshot().rows[0].lastFailure.httpStatus, 403);
  await copy.close();
});

test("engine IDs and search types are distinct; type filtering and retention stay accurate", async t => {
  let clock = Date.UTC(2026, 9, 26, 12, 5);
  const { store } = await fixture(t, { now: () => clock });
  store.record(run({ status: "timeout" }));
  store.record(run({ engineId: "other", searchType: "images", resultCount: 20 }));
  assert.equal(store.snapshot({ type: "images" }).summary.live, 1);
  assert.deepEqual(store.snapshot().types, ["images", "web"]);
  store.configure({ retentionHours: "1" });
  clock += 3 * HOUR;
  store.record(run({ cached: true, at: 0 }));
  const data = store.snapshot({ window: "24h" });
  assert.equal(data.summary.live, 0); assert.equal(data.summary.cached, 1);
  assert.equal(data.rows[0].lastFailure, null); assert.equal(data.rows.length, 1);
  assert.equal(data.windowClamped, true);
  await store.flush();
  assert.equal(JSON.parse(await readFile(store.file, "utf8")).entries[0].buckets.length, 1);
});

test("corrupt and symlinked history is preserved and pauses collection", async t => {
  const base = await mkdtemp(join(tmpdir(), "engine-quality-invalid-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  for (const kind of ["corrupt", "symlink"]) {
    const directory = join(base, kind); await mkdir(directory);
    const file = join(directory, "history.json");
    const outside = join(base, "outside.txt"); await writeFile(outside, "must remain unchanged");
    if (kind === "symlink") await symlink(outside, file); else await writeFile(file, "{broken");
    const store = createStore({ directory }); await store.load();
    assert.equal(store.snapshot().storage.ready, false); assert.match(store.snapshot().storage.error, /preserved/);
    assert.equal(store.record(run()), false); await store.flush();
    assert.equal(await readFile(outside, "utf8"), "must remain unchanged");
    if (kind === "corrupt") assert.equal(await readFile(file, "utf8"), "{broken");
    await store.close();
  }
});

test("concurrent recording during an atomic write remains dirty until safely persisted", async t => {
  const { store, directory } = await fixture(t);
  store.record(run()); const first = store.flush();
  store.record(run()); const second = store.flush();
  await Promise.all([first, second]); await store.flush();
  const copy = createStore({ directory }); await copy.load();
  assert.equal(copy.snapshot().summary.live, 2); assert.equal(store.snapshot().storage.pending, false);
  await copy.close();
});

test("failed writes remain visible and preserve dirty counters for recovery", async t => {
  const { store, directory, base } = await fixture(t);
  store.record(run());
  const savedFolder = join(base, "original-folder"); await rename(directory, savedFolder);
  await writeFile(directory, "not a folder");
  await store.flush();
  assert.match(store.snapshot().storage.error, /could not be saved/); assert.equal(store.snapshot().storage.pending, true);
  await rm(directory); await rename(savedFolder, directory);
  await store.flush();
  assert.equal(store.snapshot().storage.error, null); assert.equal(store.snapshot().storage.pending, false);
  assert.equal(JSON.parse(await readFile(store.file, "utf8")).entries[0].buckets[0].live, 1);
});

test("invalid reports cannot create arbitrary state; capacity limits are visible", async t => {
  const { store } = await fixture(t);
  for (const invalid of [null, {}, run({ time: NaN }), run({ resultCount: -1 }), run({ cached: "true" })]) assert.equal(store.record(invalid), false);
  for (let i = 0; i < 257; i++) store.record(run({ engineId: `id-${i}` }));
  assert.equal(store.snapshot().rows.length, 256); assert.equal(store.snapshot().storage.dropped, 1);
});

test("one shared writer survives repeated capability initialization and plugin refreshes", async t => {
  const base = await mkdtemp(join(tmpdir(), "engine-quality-shared-"));
  const one = sharedStore(join(base, "data")), two = sharedStore(join(base, "data", "."));
  t.after(async () => { await one.close(); await rm(base, { recursive: true, force: true }); });
  assert.equal(one, two); await one.load(); one.record(run()); await two.flush();
  assert.equal(two.snapshot().summary.live, 1);
});

test("dashboard owns one configure schema and only returns a public shell", async () => {
  assert.ok(command.settingsSchema.some(f => f.key === "retentionHours"));
  assert.ok(command.settingsSchema.some(f => f.key === "recordingEnabled"));
  assert.equal(interceptor.settingsSchema, undefined);
  assert.equal(command.isClientExposed, false); assert.equal(interceptor.isClientExposed, false);
  assert.equal(command.trigger, "eq"); assert.deepEqual(command.aliases || [], []);
  const result = command.execute("24h");
  assert.equal(result.title, ""); assert.doesNotMatch(result.html, /"live":|"failed":|"engineId":/);
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|eval\(/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /degoog-settings-token/);
  assert.match(source, /degoog-results-settled/);
  assert.match(source, /record\.addedNodes/);
});

test("native capability lifecycle loads saved configuration and can pause recording", async t => {
  const base = await mkdtemp(join(tmpdir(), "engine-quality-lifecycle-"));
  const previous = process.env.DEGOOG_DATA_DIR;
  process.env.DEGOOG_DATA_DIR = base;
  const current = sharedStore(join(base, "engine-quality-dashboard"));
  t.after(async () => {
    await current.close();
    if (previous === undefined) delete process.env.DEGOOG_DATA_DIR; else process.env.DEGOOG_DATA_DIR = previous;
    await rm(base, { recursive: true, force: true });
  });
  const context = { apiBase: "/api/plugin/store-installed-id", template: await readFile(new URL("./template.html", import.meta.url), "utf8") };
  await interceptor.init(context);
  interceptor.observe(run()); assert.equal(current.snapshot().summary.live, 0);
  await command.init(context);
  command.configure({ retentionHours: "6", defaultWindow: "6h", recordingEnabled: "true" });
  interceptor.observe(run());
  assert.equal(current.snapshot().summary.live, 1); assert.equal(current.snapshot().retentionHours, 6);
  const html = command.execute("").html;
  assert.match(html, /data-window="6h"/); assert.match(html, /data-api-base="\/api\/plugin\/store-installed-id"/);
  assert.doesNotMatch(html, /"live":|"failed":/);
  command.configure({ recordingEnabled: "false" }); interceptor.observe(run());
  assert.equal(current.snapshot().summary.live, 1);
  command.configure({ recordingEnabled: "true" }); interceptor.configure({ disabled: "true" }); interceptor.observe(run());
  assert.equal(current.snapshot().summary.live, 1);
  interceptor.configure({ disabled: "false" }); interceptor.observe(run());
  assert.equal(current.snapshot().summary.live, 2);
});

test("localized labels preserve interactive controls and required dashboard elements", async () => {
  const $ = load(await readFile(new URL("./template.html", import.meta.url), "utf8"));
  assert.equal($("[data-eq-text]").find("button, input, select, textarea, a").length, 0);
  for (const attr of ["refresh", "export", "type", "sort", "search", "live", "rows", "summary", "access", "locked", "content", "plot", "chart", "tooltip"]) {
    assert.equal($(`[data-eq-${attr}]`).length, 1, attr);
  }
  assert.equal($(".eq-dashboard__select").length, 2);
  assert.equal($(".eq-dashboard__select svg[aria-hidden='true']").length, 2);
  assert.equal($("[data-eq-live]").next().hasClass("eq-dashboard__switch"), true);
  assert.equal($(".eq-dashboard__toolbar-controls [data-eq-type]").length, 1);
  assert.equal($(".eq-dashboard__toolbar-controls [data-eq-live]").length, 1);
  assert.equal($("[data-eq-plot] [data-eq-chart]").length, 1);
  assert.equal($("[data-eq-plot] [data-eq-tooltip][role='tooltip'][hidden]").length, 1);
});
