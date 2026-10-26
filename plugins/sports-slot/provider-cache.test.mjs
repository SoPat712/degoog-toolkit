import assert from "node:assert/strict";
import test from "node:test";
import { createProviderJsonCache } from "./provider-cache.mjs";
import { slot, routes } from "./index.js";

const scoreboard = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
function memory() {
  const values = new Map(), writes = [];
  return { values, writes, get: (key) => values.get(key), set: (key, value, ttl) => { values.set(key, value); writes.push({ key, value, ttl }); } };
}

test("shared provider caches reuse data across clients, expire live data, and isolate mutations", async () => {
  const cache = memory();
  let calls = 0, now = Date.now();
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const load = async () => ({ events: [{ id: ++calls }] });
    const a = createProviderJsonCache({ cache, load }), b = createProviderJsonCache({ cache, load });
    const first = await a.get(scoreboard);
    first.data.events[0].id = "changed";
    assert.equal((await b.get(scoreboard)).data.events[0].id, 1);
    assert.equal(calls, 1);
    assert.equal(cache.writes[0].ttl, 10_000);
    now += 10_001;
    assert.equal((await a.get(scoreboard)).data.events[0].id, 2);
    assert.equal(calls, 2);
  } finally { Date.now = realNow; }
});

test("provider TTLs keep schedules/live games short and team catalogs bounded", async () => {
  const cache = memory();
  const client = createProviderJsonCache({ cache, load: async () => ({}) });
  for (const [url, ttl] of [
    [scoreboard.replace("scoreboard", "teams/13/schedule"), 10_000],
    [scoreboard.replace("scoreboard", "summary?event=123"), 10_000],
    [scoreboard.replace("scoreboard", "standings"), 900_000],
    ["https://api.balldontlie.io/v1/games?team_ids[]=13", 12_000],
    ["https://api.balldontlie.io/v1/teams", 604_800_000],
    ["https://api.football-data.org/v4/competitions/PL/teams", 604_800_000],
  ]) {
    assert.equal((await client.get(url)).ttlMs, ttl);
    assert.equal(cache.writes.at(-1).ttl, ttl);
  }
});

test("completed game summaries and historical scoreboards remain reusable three days later", async () => {
  const realNow = Date.now;
  let now = Date.UTC(2026, 9, 26, 12);
  Date.now = () => now;
  try {
    const cache = memory();
    let calls = 0;
    const final = { competitions: [{ status: { type: { state: "post", completed: true, name: "STATUS_FINAL" } } }] };
    const client = createProviderJsonCache({ cache, load: async (url) => {
      calls++;
      return url.includes("/summary?") ? { header: final } : { events: [final] };
    } });
    const summary = scoreboard.replace("scoreboard", "summary?event=123");
    const history = scoreboard + "?dates=20261020";
    assert.equal((await client.get(summary)).ttlMs, 7 * 86_400_000);
    assert.equal((await client.get(history)).ttlMs, 7 * 86_400_000);
    now += 3 * 86_400_000;
    await client.get(summary);
    await client.get(history);
    assert.equal(calls, 2);
    assert.equal((await client.get(scoreboard)).ttlMs, 15 * 60_000);
    now += 4 * 86_400_000 + 1;
    await client.get(summary);
    assert.equal(calls, 4);
  } finally { Date.now = realNow; }
});

test("upcoming schedules cache longer but expire by kickoff, then use the live interval", async () => {
  const realNow = Date.now;
  let now = Date.now();
  const kickoff = now + 5 * 60_000;
  Date.now = () => now;
  try {
    const cache = memory();
    let calls = 0;
    const client = createProviderJsonCache({ cache, load: async () => {
      calls++;
      return { events: [{ date: new Date(kickoff).toISOString(), status: { type: { state: now < kickoff ? "pre" : "in" } } }] };
    } });
    const url = scoreboard.replace("scoreboard", "teams/13/schedule");
    assert.equal((await client.get(url)).ttlMs, 5 * 60_000);
    now += 4 * 60_000;
    await client.get(url);
    assert.equal(calls, 1);
    now = kickoff;
    assert.equal((await client.get(url)).ttlMs, 10_000);
    assert.equal(calls, 2);
  } finally { Date.now = realNow; }
});

test("unknown or postponed game states never receive the completed-game lifetime", async () => {
  for (const status of [null, { type: { state: "post", completed: true, description: "Postponed" } }]) {
    const client = createProviderJsonCache({ cache: memory(), load: async () => ({ header: { status } }) });
    assert.equal((await client.get(scoreboard.replace("scoreboard", "summary?event=123"))).ttlMs, 10_000);
  }
});

test("credential changes, query parameters and canonical headers have the correct cache identities", async () => {
  const cache = memory();
  let calls = 0;
  const client = createProviderJsonCache({ cache, load: async () => ({ request: ++calls }) });
  const url = "https://api.balldontlie.io/v1/teams";
  assert.equal((await client.get(url, { headers: { Authorization: "private-key-a", Accept: "application/json" } })).data.request, 1);
  assert.equal((await client.get(url, { headers: { accept: "application/json", authorization: "private-key-a" } })).data.request, 1);
  assert.equal((await client.get(url, { headers: { Authorization: "private-key-b", Accept: "application/json" } })).data.request, 2);
  assert.equal((await client.get(url + "?page=2", { headers: { Authorization: "private-key-b" } })).data.request, 3);
  assert.doesNotMatch(JSON.stringify([...cache.values]), /private-key-[ab]/);
});

test("identical concurrent requests coalesce, failed loads are never cached, and cache outages retain live data", async () => {
  const cache = memory();
  let calls = 0, finish;
  const client = createProviderJsonCache({ cache, load: async () => { calls++; await new Promise((resolve) => { finish = resolve; }); return { events: [] }; } });
  const first = client.get(scoreboard), second = client.get(scoreboard);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  finish();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a.data, b.data);
  a.data.events.push({ id: "mutated" });
  assert.deepEqual(b.data.events, []);
  const broken = createProviderJsonCache({ cache: memory(), load: async () => { calls++; throw new Error("503"); } });
  for (let i = 0; i < 2; i++) await assert.rejects(broken.get(scoreboard), /503/);
  assert.equal(calls, 3);
  const unavailable = createProviderJsonCache({ cache: { get: () => { throw new Error("offline"); }, set: () => { throw new Error("offline"); } }, load: async () => ({ ok: true }) });
  assert.equal((await unavailable.get(scoreboard)).data.ok, true);
});

test("Sports uses degoog's shared helper and preserves the live expiry across initial cards and refreshes", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const caches = new Map(), calls = new Map();
  const namespaces = [];
  try {
    slot.configure({ useEspnApi: true });
    await slot.init({ apiBase: "/api/plugin/sports-cache-test", useCache: (namespace) => {
      namespaces.push(namespace);
      if (!caches.has(namespace)) caches.set(namespace, memory());
      return caches.get(namespace);
    }, fetch: async (address) => {
      const path = new URL(address).pathname;
      calls.set(path, (calls.get(path) || 0) + 1);
      return Response.json(path.endsWith("/scoreboard") ? { events: [] } : {});
    } });
    const initial = await slot.execute("nba score", {});
    assert.match(initial.html, /data-refresh-after-ms="10000"/);
    assert.ok(namespaces.includes("ext:sports-slot:providers"));
    assert.ok(namespaces.includes("ext:sports-slot:logos"));
    now += 8000;
    const route = routes.find((route) => route.path === "refresh");
    const response = await route.handler(new Request("https://example.test/refresh?query=nba%20score&lang=fr"));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.retryAfterMs, 2000);
    assert.match(data.html, /data-sports-lang="fr"/);
    assert.match(data.html, /data-refresh-after-ms="2000"/);
    assert.ok([...calls.values()].every((count) => count === 1));
    now += 2001;
    await route.handler(new Request("https://example.test/refresh?query=nba%20score"));
    assert.equal(calls.get(new URL(scoreboard).pathname), 2);
    assert.equal(calls.get("/apis/v2/sports/basketball/nba/standings"), 1);
  } finally { Date.now = realNow; slot.init({}); }
});

test("legacy degoog cache helpers remain supported", async () => {
  let created = 0;
  slot.init({ createCache: () => { created++; return memory(); }, fetch: async () => Response.json({ events: [], children: [] }) });
  await slot.execute("nba score", {});
  assert.equal(created, 2);
  slot.init({});
});

test("changing a configured API key reloads its team catalog instead of reusing old team IDs", async () => {
  const caches = new Map(), teamRequests = [], gameTeams = [];
  slot.init({ useCache: (name) => {
    if (!caches.has(name)) caches.set(name, memory());
    return caches.get(name);
  }, fetch: async (address, options) => {
    const url = new URL(address), key = options.headers.Authorization;
    const id = key === "private-one" ? 13 : 42;
    if (url.pathname.endsWith("/teams")) {
      teamRequests.push(key);
      return Response.json({ data: [{ id, full_name: "Los Angeles Lakers", abbreviation: "LAL" }] });
    }
    gameTeams.push(url.searchParams.get("team_ids[]"));
    return Response.json({ data: [{ id: 1, date: new Date().toISOString(), status: "Final", period: 4,
      home_team: { id, full_name: "Los Angeles Lakers", abbreviation: "LAL" },
      visitor_team: { id: 2, full_name: "Boston Celtics", abbreviation: "BOS" }, home_team_score: 100, visitor_team_score: 99 }] });
  } });
  try {
    for (const key of ["private-one", "private-two"]) {
      slot.configure({ useEspnApi: false, balldontlieApiKey: key });
      assert.match((await slot.execute("lakers score", {})).html, /data-sports-provider="balldontlie"/);
    }
    assert.deepEqual(teamRequests, ["private-one", "private-two"]);
    assert.deepEqual(gameTeams, ["13", "42"]);
  } finally { slot.configure({}); slot.init({}); }
});

test("HTTP and JSON failures are not cached and the next request can recover", async () => {
  for (const failure of [() => new Response("busy", { status: 503 }), () => new Response("not JSON"), () => Response.json({ error: "provider failure" })]) {
    const cache = memory();
    let failed = true, calls = 0;
    slot.configure({ useEspnApi: true });
    slot.init({ useCache: () => cache, fetch: async (address) => {
      if (new URL(address).pathname.endsWith("/scoreboard")) {
        calls++;
        return failed ? failure() : Response.json({ events: [] });
      }
      return Response.json({ children: [] });
    } });
    const first = await slot.execute("nba score", {});
    assert.doesNotMatch(first.html, /data-sports-provider="espn"/);
    failed = false;
    const next = await slot.execute("nba score", {});
    assert.match(next.html, /data-sports-provider="espn"/);
    assert.equal(calls, 2);
  }
  slot.init({});
});
