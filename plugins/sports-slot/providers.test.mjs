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

// Fallback providers: score queries focus a final from the last day, a live
// game still wins, and otherwise the next game leads. Responses follow the
// documented football-data.org v4 and BALLDONTLIE shapes.
const HOUR = 3600 * 1000;
const at = (offsetHours) => new Date(Date.now() + offsetHours * HOUR).toISOString();
function focusOf(html) {
  const board = html.slice(html.indexOf("sports-slot__scoreboard sports-slot__scoreboard--horizontal"));
  const state = board.match(/sports-slot__scoreboard--(live|final|scheduled|warning)\b/)?.[1];
  const [home, away] = [...board.matchAll(/sports-slot__score-val">([^<]*)</g)].slice(0, 2).map((match) => match[1]);
  return `${state} ${home}-${away}`;
}

const bdlLakers = { id: 14, full_name: "Los Angeles Lakers", abbreviation: "LAL" };
const bdlCeltics = { id: 2, full_name: "Boston Celtics", abbreviation: "BOS" };
function nbaGame(id, offsetHours, statusState, [home, away] = [0, 0]) {
  const datetime = at(offsetHours);
  return {
    id, date: datetime.slice(0, 10), datetime, postseason: false, postponed: false, time: "",
    status: { final: "Final", scheduled: "7:00 pm ET", in_progress: "3rd Qtr" }[statusState],
    status_state: statusState,
    period: { final: 4, scheduled: 0, in_progress: 3 }[statusState],
    home_team: bdlLakers, visitor_team: bdlCeltics, home_team_score: home, visitor_team_score: away,
  };
}
function useBalldontlie(teams, games) {
  slot.configure({ useEspnApi: "false", balldontlieApiKey: "fixture-key" });
  slot.init({ fetch: async (address) => {
    const url = new URL(address);
    assert.equal(url.hostname, "api.balldontlie.io");
    if (url.pathname.endsWith("/teams")) return Response.json({ data: teams });
    if (url.pathname.endsWith("/games")) return Response.json({ data: games });
    throw new Error(`Unexpected request ${url}`);
  } });
}

test("BALLDONTLIE score queries focus last night's final, live games and otherwise the next game", async () => {
  const teams = [bdlLakers, bdlCeltics];
  useBalldontlie(teams, [nbaGame(1, -10, "final", [110, 104]), nbaGame(2, 48, "scheduled")]);
  assert.equal(focusOf((await slot.execute("lakers score", {})).html), "final 110-104");
  assert.match((await slot.execute("lakers score", {})).html, /Latest result/);
  assert.equal(focusOf((await slot.execute("lakers schedule", {})).html), "scheduled 0-0");
  assert.equal(focusOf((await slot.execute("nba scores", {})).html), "final 110-104");
  assert.equal(focusOf((await slot.execute("lakers vs celtics", {})).html), "final 110-104");

  useBalldontlie(teams, [nbaGame(1, -20, "final", [110, 104]), nbaGame(3, -1, "in_progress", [70, 68]), nbaGame(2, 48, "scheduled")]);
  assert.equal(focusOf((await slot.execute("lakers score", {})).html), "live 70-68");

  useBalldontlie(teams, [nbaGame(1, -30, "final", [110, 104]), nbaGame(2, 48, "scheduled")]);
  assert.equal(focusOf((await slot.execute("lakers score", {})).html), "scheduled 0-0", "a final over a day old yields to the next game");
});

// Documented MLB game shape: away_team rather than visitor_team, runs in
// *_team_data, and ESPN-style status codes.
const mlbTeam = (id, abbreviation, location, name, league, division) => ({
  id, slug: `${location}-${name}`.toLowerCase().replace(/\s+/g, "-"), abbreviation,
  display_name: `${location} ${name}`, short_display_name: name, name, location, league, division,
});
const mlbYankees = mlbTeam(19, "NYY", "New York", "Yankees", "American", "East");
const mlbDodgers = mlbTeam(14, "LAD", "Los Angeles", "Dodgers", "National", "West");
const mlbRedSox = mlbTeam(2, "BOS", "Boston", "Red Sox", "American", "East");
function mlbGame(id, offsetHours, statusState, [home, away] = [0, 0], visitors = mlbDodgers) {
  const played = statusState !== "scheduled";
  const side = (runs) => ({ hits: played ? runs + 3 : 0, runs, errors: 0, inning_scores: played ? [runs] : [] });
  return {
    id, season: 2026, postseason: false, season_type: "regular", date: at(offsetHours),
    venue: "Yankee Stadium", attendance: 0, conference_play: false,
    home_team_name: mlbYankees.display_name, away_team_name: visitors.display_name,
    home_team: mlbYankees, away_team: visitors,
    home_team_data: side(home), away_team_data: side(away),
    status: { final: "STATUS_FINAL", scheduled: "STATUS_SCHEDULED", in_progress: "STATUS_IN_PROGRESS" }[statusState],
    status_state: statusState, period: played ? 9 : 0, clock: 0, display_clock: "0:00", scoring_summary: [],
  };
}

test("BALLDONTLIE MLB cards read away_team and runs, and STATUS_FINAL is final, not live", async () => {
  const teams = [mlbYankees, mlbDodgers, mlbRedSox];
  useBalldontlie(teams, [mlbGame(5, -10, "final", [11, 4]), mlbGame(6, 48, "scheduled")]);
  const score = (await slot.execute("yankees score", {})).html;
  assert.equal(focusOf(score), "final 11-4");
  assert.match(score, /sports-slot__scoreboard-team-name">New York Yankees</);
  assert.match(score, /sports-slot__scoreboard-team-name">Los Angeles Dodgers</);
  assert.doesNotMatch(score, /scoreboard-team-name">Away</);
  assert.equal(focusOf((await slot.execute("yankees schedule", {})).html), "scheduled 0-0");

  // The status code alone is enough when status_state is missing.
  const { status_state: _omitted, ...withoutState } = mlbGame(5, -10, "final", [11, 4]);
  useBalldontlie(teams, [withoutState, mlbGame(6, 48, "scheduled")]);
  assert.equal(focusOf((await slot.execute("yankees score", {})).html), "final 11-4");
});

test("live BALLDONTLIE MLB cards show the inning from period, with older inning fields as a fallback", async () => {
  const teams = [mlbYankees, mlbDodgers];
  const live = { ...mlbGame(10, -1, "in_progress", [2, 1]), period: 5 };
  useBalldontlie(teams, [live, mlbGame(6, 48, "scheduled")]);
  const html = (await slot.execute("yankees score", {})).html;
  assert.equal(focusOf(html), "live 2-1");
  assert.match(html, /5th Inning/);
  assert.doesNotMatch(html, /0:00/, "the baseball clock is always zero");

  const { period: _period, display_clock: _clock, ...legacy } = live;
  useBalldontlie(teams, [{ ...legacy, inning_half: "Top", inning_state: "5th" }]);
  assert.match((await slot.execute("yankees score", {})).html, /Top 5th/);
});

test("BALLDONTLIE MLB matchups find games between away_team and home_team", async () => {
  useBalldontlie([mlbYankees, mlbDodgers, mlbRedSox], [
    mlbGame(7, -6, "final", [3, 2]),
    mlbGame(8, -30, "final", [9, 1], mlbRedSox),
    mlbGame(9, 24, "scheduled"),
  ]);
  const result = (await slot.execute("yankees vs dodgers", {})).html;
  assert.equal(focusOf(result), "final 3-2");
  assert.match(result, /New York Yankees vs Los Angeles Dodgers/);
  assert.doesNotMatch(result, /No recent or upcoming meeting/);
});

const fdArsenal = { id: 57, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS", crest: "" };
const fdChelsea = { id: 61, name: "Chelsea FC", shortName: "Chelsea", tla: "CHE", crest: "" };
// The longest name in the league: team lookup used to land on it for any club.
const fdBrighton = { id: 397, name: "Brighton & Hove Albion FC", shortName: "Brighton Hove", tla: "BHA", crest: "" };
function soccerMatch(id, offsetHours, status, [home, away] = [null, null]) {
  return {
    id, utcDate: at(offsetHours), status, matchday: 11, stage: "REGULAR_SEASON",
    competition: { code: "PL", name: "Premier League" },
    homeTeam: fdArsenal, awayTeam: fdChelsea, score: { fullTime: { home, away } },
  };
}
function useFootballData(matches) {
  slot.configure({ useEspnApi: "false", footballDataApiKey: "fixture-key" });
  slot.init({ fetch: async (address) => {
    const url = new URL(address);
    assert.equal(url.hostname, "api.football-data.org");
    if (url.pathname.endsWith("/competitions/PL/teams")) return Response.json({ teams: [fdBrighton, fdChelsea, fdArsenal] });
    if (url.pathname.endsWith("/competitions/PL/standings")) return Response.json({ standings: [] });
    if (url.pathname.endsWith("/teams/57/matches") || url.pathname.endsWith("/competitions/PL/matches")) {
      return Response.json({ matches });
    }
    throw new Error(`Unexpected request ${url}`);
  } });
}

test("football-data.org score queries focus a recent result, live matches and otherwise the next fixture", async () => {
  useFootballData([soccerMatch(1, -10, "FINISHED", [2, 1]), soccerMatch(2, 48, "TIMED")]);
  assert.equal(focusOf((await slot.execute("arsenal score", {})).html), "final 2-1");
  assert.equal(focusOf((await slot.execute("arsenal fixtures", {})).html), "scheduled —-—");
  assert.equal(focusOf((await slot.execute("premier league scores", {})).html), "final 2-1");

  // Extra time and shootouts are still live.
  useFootballData([soccerMatch(1, -20, "FINISHED", [2, 1]), soccerMatch(3, -2, "EXTRA_TIME", [1, 1]), soccerMatch(2, 48, "TIMED")]);
  assert.equal(focusOf((await slot.execute("arsenal score", {})).html), "live 1-1");

  useFootballData([soccerMatch(1, -30, "FINISHED", [2, 1]), soccerMatch(2, 48, "TIMED")]);
  assert.equal(focusOf((await slot.execute("arsenal score", {})).html), "scheduled —-—");
});

test("football-data.org matchups pick tonight's result or the next meeting, not the earliest in the window", async () => {
  const season = [soccerMatch(1, -40 * 24, "FINISHED", [3, 0]), soccerMatch(2, -6, "FINISHED", [2, 1]), soccerMatch(3, 30 * 24, "TIMED")];
  useFootballData(season);
  assert.equal(focusOf((await slot.execute("arsenal vs chelsea", {})).html), "final 2-1");
  useFootballData([season[0], soccerMatch(2, -30, "FINISHED", [2, 1]), season[2]]);
  assert.equal(focusOf((await slot.execute("arsenal vs chelsea", {})).html), "scheduled —-—");
});
