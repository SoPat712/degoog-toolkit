import assert from "node:assert/strict";
import test from "node:test";
import { routes, slot, sportsDataTestHelpers } from "./index.js";

const lakers = { id: "13", displayName: "Los Angeles Lakers", abbreviation: "LAL" };
const celtics = { id: "2", displayName: "Boston Celtics", abbreviation: "BOS" };
const standings = { children: [{ name: "Conference", standings: { entries: [lakers, celtics].map((team) => ({ team, stats: [{ name: "wins", value: 0 }] })) } }] };
const event = {
  id: "401", date: new Date().toISOString(), competitions: [{
    status: { type: { state: "post", description: "Final", detail: "Final" } },
    competitors: [
      { homeAway: "home", team: lakers, score: "101" },
      { homeAway: "away", team: celtics, score: "99" },
    ],
  }],
};

test("standings use the correct logo routes and preserve zero-valued statistics", () => {
  slot.init({ apiBase: "/api/plugin/store-sports" });
  for (const sport of ["nba", "nfl", "mlb", "hockey", "soccer"]) {
    const row = sportsDataTestHelpers.normalizeEspnStandings(standings, sport)[0].rows[0];
    assert.match(row.logoUrl, new RegExp(`/api/plugin/store-sports/logo\\?sport=${sport}&abbr=LAL`));
    assert.equal(row.wins, "0");
  }
});

test("new matchup connectors resolve both teams and search their schedule when absent from the scoreboard", async () => {
  for (const connector of ["vs", "v", "against", "x", "contra", "-"]) {
    const calls = [];
    slot.configure({ useEspnApi: true });
    slot.init({ apiBase: "/api/plugin/store-sports", fetch: async (address) => {
      const url = new URL(address);
      calls.push(url.pathname);
      if (url.pathname.endsWith("/standings")) return Response.json(standings);
      if (url.pathname.endsWith("/scoreboard")) return Response.json({ events: [] });
      if (url.pathname.endsWith("/teams/13/schedule")) return Response.json({ events: [event] });
      if (url.pathname.endsWith("/summary")) return Response.json({});
      throw new Error(`Unexpected request ${url.pathname}`);
    } });
    const query = `lakers ${connector} celtics`;
    assert.equal(slot.trigger(query), true, query);
    const result = await slot.execute(query, {});
    assert.match(result.html, /data-sports-provider="espn"/, query);
    assert.match(result.html, /Los Angeles Lakers/);
    assert.match(result.html, /Boston Celtics/);
    assert.ok(calls.some((path) => path.endsWith("/teams/13/schedule")), query);
  }
  for (const query of ["x axis", "cats against dogs", "gardening - tips"]) assert.equal(slot.trigger(query), false, query);
});

test("ESPN scoreboard, standings, schedule and matchup failures reach configured BALLDONTLIE", async () => {
  for (const [query, failure] of [["nba score", "scoreboard"], ["lakers score", "standings"], ["lakers score", "schedule"], ["lakers against celtics", "scoreboard"], ["lakers x celtics", "schedule"]]) {
    const requests = [];
    slot.configure({ useEspnApi: true, balldontlieApiKey: "fixture-key" });
    slot.init({ apiBase: "/api/plugin/store-sports", fetch: async (address) => {
      const url = new URL(address);
      requests.push(url);
      if (url.hostname === "site.api.espn.com") {
        if (url.pathname.endsWith(`/${failure}`)) return new Response("busy", { status: 503 });
        if (url.pathname.endsWith("/standings")) return Response.json(standings);
        if (url.pathname.endsWith("/scoreboard") || url.pathname.endsWith("/schedule")) return Response.json({ events: [] });
      }
      if (url.hostname === "api.balldontlie.io") {
        if (url.pathname.endsWith("/teams")) return Response.json({ data: [
          { id: 13, full_name: lakers.displayName, abbreviation: "LAL" },
          { id: 2, full_name: celtics.displayName, abbreviation: "BOS" },
        ] });
        if (url.pathname.endsWith("/games")) return Response.json({ data: [{
          id: 401, date: new Date().toISOString(), status: "Final", period: 4,
          home_team: { id: 13, full_name: lakers.displayName, abbreviation: "LAL" },
          visitor_team: { id: 2, full_name: celtics.displayName, abbreviation: "BOS" },
          home_team_score: 101, visitor_team_score: 99,
        }] });
      }
      throw new Error(`Unexpected request ${url}`);
    } });
    const result = await slot.execute(query, {});
    assert.match(result.html, /data-sports-provider="balldontlie"/, `${query}: ${failure}`);
    assert.match(result.html, /BALLDONTLIE/);
    assert.ok(requests.some((url) => url.hostname === "api.balldontlie.io"));
  }
});

test("a successful empty ESPN response stays empty without requesting a fallback", async () => {
  slot.configure({ useEspnApi: true, balldontlieApiKey: "fixture-key" });
  slot.init({ fetch: async (address) => {
    assert.equal(new URL(address).hostname, "site.api.espn.com");
    return Response.json({ children: [], events: [] });
  } });
  const result = await slot.execute("nba score", {});
  assert.match(result.html, /data-sports-provider="espn"/);
  assert.doesNotMatch(result.html, /BALLDONTLIE/);
});

test("Cowboys vs Eagles selects the next meeting rather than an older season result", async () => {
  const cowboys = { id: "6", displayName: "Dallas Cowboys", abbreviation: "DAL" };
  const eagles = { id: "21", displayName: "Philadelphia Eagles", abbreviation: "PHI" };
  const game = (id, date, state) => ({ id, date, competitions: [{
    status: { type: { state, description: state === "pre" ? "Scheduled" : "Final" } },
    competitors: [{ homeAway: "home", team: eagles, score: "0" }, { homeAway: "away", team: cowboys, score: "0" }],
  }] });
  const season = [game("old", "2026-09-20T20:25Z", "post"), game("tonight", "2026-10-27T00:15Z", "pre"), game("later", "2026-12-20T20:25Z", "pre")];
  const calls = [];
  slot.configure({ useEspnApi: true });
  slot.init({ fetch: async (address) => {
    const url = new URL(address);
    calls.push(url);
    assert.match(url.pathname, /\/football\/nfl\//);
    if (url.pathname.endsWith("/standings")) return Response.json({ children: [{ standings: { entries: [{ team: cowboys }, { team: eagles }] } }] });
    if (url.pathname.endsWith("/scoreboard")) return Response.json({ events: [] });
    if (/\/teams\/(6|21)\/schedule$/.test(url.pathname)) return Response.json({ events: season });
    if (url.pathname.endsWith("/summary")) return Response.json({});
    throw new Error(`Unexpected request ${url}`);
  } });
  for (const query of ["cowboys vs eagles", "Cowboys vs. Eagles", "eagles against cowboys"]) {
    assert.equal(slot.trigger(query), true);
    const result = await slot.execute(query, {});
    assert.match(result.html, /data-sports-focus-event-id="tonight"/);
    assert.match(result.html, /Dallas Cowboys/);
    assert.match(result.html, /Philadelphia Eagles/);
  }
  assert.ok(calls.some((url) => url.pathname.endsWith("/teams/6/schedule")));
});

test("standings remain available when optional scoreboard and schedule requests fail", async () => {
  for (const query of ["nba standings", "lakers standings"]) {
    slot.configure({ useEspnApi: true });
    slot.init({ fetch: async (address) => new URL(address).pathname.endsWith("/standings")
      ? Response.json(standings) : new Response("busy", { status: 503 }) });
    const result = await slot.execute(query, {});
    assert.match(result.html, /data-sports-provider="espn"/, query);
    assert.match(result.html, /Los Angeles Lakers/);
    assert.match(result.html, /sport=nba&amp;abbr=LAL/);
  }
});

test("outages without a configured fallback render a provider error instead of a setup prompt", async () => {
  slot.configure({ useEspnApi: true });
  slot.init({ fetch: async () => { throw new Error("offline"); } });
  const result = await slot.execute("lakers score", {});
  assert.match(result.html, /No data/);
  assert.doesNotMatch(result.html, /Setup required|API key/);
  const refresh = routes.find((route) => route.path === "refresh");
  const response = await refresh.handler(new Request("https://example.test/refresh?query=lakers%20score"));
  assert.equal(response.status, 500);
});
