import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  lineupLayoutTestHelpers,
  routes,
  slot,
  sportsDataTestHelpers,
  timelineTestHelpers,
} from "./index.js";

const {
  layoutPitchPlayers,
  getFormationRows,
  assignPlayersToFormationRows,
  getFormationRowY,
  resolveEffectiveFormation,
  namesMatch,
  applyLineupSubstitutions,
} = lineupLayoutTestHelpers;
const {
  parseSoccerCommentaryTimeline,
  resolveTimelineTeamSide,
  parseShootoutScoreText,
  extractPenaltyShootout,
} = timelineTestHelpers;

test("ESPN score objects normalize without leaking object strings", () => {
  const { normalizeEspnScoreValue } = sportsDataTestHelpers;

  assert.equal(normalizeEspnScoreValue({ displayValue: "112", value: 112 }), "112");
  assert.equal(normalizeEspnScoreValue({ value: 98 }), "98");
  assert.equal(normalizeEspnScoreValue({ score: "3" }), "3");
  assert.equal(normalizeEspnScoreValue(7), "7");
  assert.equal(normalizeEspnScoreValue(null), "—");
  assert.notEqual(normalizeEspnScoreValue({ value: 1 }), "[object Object]");
});

test("mobile scoreboard gives long team names independent columns", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");

  assert.match(css, /@container \(max-width: 480px\)/);
  assert.match(
    css,
    /grid-template-areas:\s*"home away"\s*"score score";/,
  );
  assert.match(
    css,
    /\.sports-slot__scoreboard-team-name\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*hyphens:\s*auto;/,
  );
  assert.match(
    css,
    /\.sports-slot__scoreboard-score\s*\{[^}]*grid-area:\s*score;[^}]*width:\s*100%;/,
  );
});

const ivoryCoastStarters = [
  { formationPlace: "1", position: "G" },
  { formationPlace: "2", position: "RB" },
  { formationPlace: "3", position: "LB" },
  { formationPlace: "4", position: "CM-R" },
  { formationPlace: "5", position: "CD-R" },
  { formationPlace: "6", position: "CD-L" },
  { formationPlace: "7", position: "RM" },
  { formationPlace: "8", position: "CM-L" },
  { formationPlace: "9", position: "CF-L" },
  { formationPlace: "10", position: "CF-R" },
  { formationPlace: "11", position: "LM" },
];

test("4-4-2 lineup uses shared row Y and left-to-right X ordering", () => {
  const rows = assignPlayersToFormationRows(ivoryCoastStarters, "4-4-2");
  const placed = layoutPitchPlayers(ivoryCoastStarters, "4-4-2", "home");
  const coords = new Map(placed.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));
  const defY = coords.get("3").y;
  const midY = coords.get(String(rows[2][0])).y;
  const fwdY = coords.get("9").y;

  assert.equal(coords.get("6").y, defY);
  assert.equal(coords.get("4").y, midY);
  assert.equal(coords.get("10").y, fwdY);
  assert.notEqual(defY, midY);
  assert.notEqual(midY, fwdY);

  const defXs = rows[1].map((place) => coords.get(String(place)).x);
  assert.ok(defXs.some((x) => x < 40));
  assert.ok(defXs.some((x) => x > 60));
  assert.ok(coords.get("3").x > coords.get("2").x);
  assert.ok(coords.get("11").x > coords.get("7").x);
});

test("ESPN 4-4-2 label resolves to 3-4-3 for wingback sides", () => {
  const ecuadorStarters = [...ivoryCoastStarters];
  const ecuador = resolveEffectiveFormation(ecuadorStarters, "4-4-2", "away");
  const ivoryCoast = resolveEffectiveFormation(
    ivoryCoastStarters,
    "4-4-2",
    "home",
  );

  assert.equal(ecuador.formation, "3-4-3");
  assert.equal(ecuador.rows?.[1]?.length, 3);
  assert.equal(ecuador.rows?.[2]?.length, 4);
  assert.equal(ecuador.rows?.[3]?.length, 3);
  assert.ok(ecuador.rows?.[2]?.includes(2));
  assert.ok(ecuador.rows?.[1]?.includes(3));

  assert.equal(ivoryCoast.formation, "4-4-2");
  assert.equal(ivoryCoast.rows?.[1]?.length, 4);
  assert.equal(ivoryCoast.rows?.[3]?.length, 2);

  const placed = layoutPitchPlayers(ecuadorStarters, ecuador.formation, "away", {
    rows: ecuador.rows,
  });
  const coords = new Map(placed.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));
  assert.equal(coords.get("7").y, coords.get("4").y);
  assert.equal(coords.get("9").y, coords.get("10").y);
  assert.notEqual(coords.get("2").y, coords.get("3").y);
  assert.ok(coords.get("7").y > coords.get("9").y);
});

test("getFormationRows derives row sizes from any formation string", () => {
  assert.equal(getFormationRows("4-4-2")?.[1]?.length, 4);
  assert.equal(getFormationRows("4-4-2")?.[2]?.length, 4);
  assert.equal(getFormationRows("4-3-3")?.[3]?.length, 3);
  assert.equal(getFormationRows("3-4-2-1")?.[3]?.length, 2);
  assert.equal(getFormationRows("5-4-1")?.[1]?.length, 5);
  assert.equal(getFormationRows("4-2-3-1")?.length, 5);
  assert.equal(getFormationRows("4-2-3-1")?.[2]?.length, 2);
  assert.equal(getFormationRows("4-2-3-1")?.[3]?.length, 3);
});

test("5-4-1 keeps defenders deep and striker advanced on the correct half", () => {
  const starters541 = [
    { formationPlace: "1", position: "G" },
    { formationPlace: "2", position: "RWB" },
    { formationPlace: "3", position: "LWB" },
    { formationPlace: "4", position: "CB" },
    { formationPlace: "5", position: "CB" },
    { formationPlace: "6", position: "CB" },
    { formationPlace: "7", position: "RM" },
    { formationPlace: "8", position: "CM" },
    { formationPlace: "10", position: "CM" },
    { formationPlace: "11", position: "LM" },
    { formationPlace: "9", position: "CF" },
  ];

  const rows = assignPlayersToFormationRows(starters541, "5-4-1");
  assert.deepEqual(rows.map((row) => row.length), [1, 5, 4, 1]);
  assert.ok(rows[1].includes(2));
  assert.ok(rows[1].includes(6));
  assert.equal(rows[3][0], 9);

  const homePlaced = layoutPitchPlayers(starters541, "5-4-1", "home", { rows });
  const awayPlaced = layoutPitchPlayers(starters541, "5-4-1", "away", { rows });
  const homeCoords = new Map(homePlaced.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));
  const awayCoords = new Map(awayPlaced.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));

  assert.ok(homeCoords.get("1").y < homeCoords.get("4").y);
  assert.ok(homeCoords.get("4").y < homeCoords.get("9").y);
  assert.equal(homeCoords.get("9").y, 46);
  assert.equal(homeCoords.get("9").x, 50);
  assert.equal(homeCoords.get("1").y, 3);

  assert.ok(awayCoords.get("1").y > awayCoords.get("4").y);
  assert.ok(awayCoords.get("4").y > awayCoords.get("9").y);
  assert.equal(awayCoords.get("9").y, 54);
  assert.equal(awayCoords.get("9").x, 50);
  assert.equal(awayCoords.get("1").y, 97);

  assert.equal(homeCoords.get("1").y, getFormationRowY(0, rows.length, "home"));
  assert.equal(awayCoords.get("1").y, getFormationRowY(0, rows.length, "away"));
});

test("3-1-4-2 keeps pivot deep and both teams on their own half", () => {
  const ecuadorStarters = [
    { formationPlace: "1", position: "G" },
    { formationPlace: "3", position: "CD-L" },
    { formationPlace: "6", position: "CD-R" },
    { formationPlace: "21", position: "CB" },
    { formationPlace: "23", position: "CDM" },
    { formationPlace: "5", position: "CM" },
    { formationPlace: "15", position: "CM-R" },
    { formationPlace: "7", position: "LM" },
    { formationPlace: "19", position: "RM" },
    { formationPlace: "13", position: "CF" },
    { formationPlace: "9", position: "CF-R" },
  ];

  const rows = assignPlayersToFormationRows(ecuadorStarters, "3-1-4-2");
  assert.deepEqual(rows.map((row) => row.length), [1, 3, 1, 4, 2]);
  assert.deepEqual(rows[2], [23]);

  const awayPlaced = layoutPitchPlayers(ecuadorStarters, "3-1-4-2", "away", {
    rows,
  });
  const homePlaced = layoutPitchPlayers(ecuadorStarters, "3-1-4-2", "home", {
    rows,
  });
  const awayCoords = new Map(awayPlaced.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));
  const homeCoords = new Map(homePlaced.map(p => [String(p.formationPlace), { x: p.x, y: p.y }]));

  assert.ok(homeCoords.get("1").y < homeCoords.get("23").y);
  assert.ok(homeCoords.get("23").y < homeCoords.get("13").y);
  assert.ok(homeCoords.get("13").y < 50);
  assert.ok(awayCoords.get("1").y > awayCoords.get("23").y);
  assert.ok(awayCoords.get("23").y > awayCoords.get("13").y);
  assert.ok(awayCoords.get("13").y > 50);
});

test("5-4-1 is inferred when ESPN labels a back five as 3-1-4-2", () => {
  const netherlandsStarters = [
    { formationPlace: "1", position: "G" },
    { formationPlace: "2", position: "RWB" },
    { formationPlace: "3", position: "LWB" },
    { formationPlace: "5", position: "CB" },
    { formationPlace: "18", position: "CB" },
    { formationPlace: "24", position: "CB" },
    { formationPlace: "7", position: "RM" },
    { formationPlace: "8", position: "CM" },
    { formationPlace: "10", position: "CM" },
    { formationPlace: "21", position: "LM" },
    { formationPlace: "9", position: "CF" },
  ];

  const resolved = resolveEffectiveFormation(netherlandsStarters, "3-1-4-2", "home");
  assert.equal(resolved.formation, "5-4-1");
  assert.deepEqual(resolved.rows.map((row) => row.length), [1, 5, 4, 1]);
});

test("four-row formations evenly divide vertical space", () => {
  const rows = getFormationRows("4-2-3-1");
  assert.equal(rows.length, 5);

  const yValues = [0, 1, 2, 3, 4].map((index) =>
    getFormationRowY(index, rows.length, "home"),
  );
  assert.deepEqual(yValues, [3, 20, 28, 36, 44]);
  assert.equal(getFormationRowY(0, rows.length, "away"), 97);
  assert.equal(getFormationRowY(4, rows.length, "away"), 60);
  assert.equal(getFormationRowY(0, rows.length, "home"), 3);
  assert.equal(getFormationRowY(4, rows.length, "home"), 44);
});

test("refresh route renders without relying on an undefined request alias", async () => {
  slot.init({ fetch: async () => Response.json({ children: [], events: [] }) });
  slot.configure({});
  const refreshRoute = routes.find((route) => route.path === "refresh");
  assert.ok(refreshRoute);

  const response = await refreshRoute.handler(
    new Request("http://localhost/api/plugin/sports-slot/refresh?query=lakers%20score"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(typeof payload.html, "string");
  assert.ok(payload.html.length > 0);
});

test("slot trigger recognizes World Cup and matchup variations", () => {
  assert.equal(slot.trigger("world cup"), true);
  assert.equal(slot.trigger("world cup standings"), true);
  assert.equal(slot.trigger("world cup bracket"), true);
  assert.equal(slot.trigger("usa vs england"), true);
  assert.equal(slot.trigger("lakers vs celtics"), true);
  assert.equal(slot.trigger("soccer"), true);
  assert.equal(slot.trigger("nba"), true);
  assert.equal(slot.trigger("nfl"), true);
  assert.equal(slot.trigger("gardening tips"), false);
});

test("execute runs World Cup and matchup queries successfully", async () => {
  slot.init({ fetch: async () => Response.json({ children: [], events: [] }) });
  slot.configure({ useEspnApi: true });
  const wcResult = await slot.execute("world cup", {});
  assert.ok(wcResult.html);
  assert.match(wcResult.html, /FIFA World Cup/i);

  const matchupResult = await slot.execute("usa vs england", {});
  assert.ok(matchupResult.html);
  assert.match(matchupResult.html, /United States/i);
  assert.match(matchupResult.html, /England/i);

  const soccerResult = await slot.execute("soccer", {});
  assert.ok(soccerResult.html);
  assert.match(soccerResult.html, /FIFA World Cup/i);
});

test("corner commentary assigns team for timeline side", () => {
  const timeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 11,
        time: { displayValue: "45'+4'" },
        text: "Corner, Côte d'Ivoire. Conceded by Nico Schlotterbeck.",
      },
    ],
    [],
  );

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].team, "Côte d'Ivoire");
  assert.equal(timeline[0].type, "Corner");
  assert.equal(timeline[0].isPlay, false);
});

test("offside commentary assigns team for timeline side", () => {
  const timeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 4,
        time: { displayValue: "4'" },
        text: "Offside, Côte d'Ivoire. Franck Kessie is caught offside.",
      },
    ],
    [],
  );

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].team, "Côte d'Ivoire");
  assert.equal(timeline[0].athlete, "Franck Kessie");
  assert.equal(timeline[0].type, "Offside");
  assert.equal(timeline[0].isPlay, false);
});

test("offside commentary supports period and caught-offside formats", () => {
  const periodTimeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 1,
        time: { displayValue: "4'" },
        text: "Offside. Côte d'Ivoire. Franck Kessie is caught offside.",
      },
    ],
    [],
  );
  assert.equal(periodTimeline[0].team, "Côte d'Ivoire");
  assert.equal(periodTimeline[0].type, "Offside");
  assert.equal(periodTimeline[0].isPlay, false);

  const playerTimeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 2,
        time: { displayValue: "12'" },
        text: "Franck Kessie (Côte d'Ivoire) is caught offside.",
      },
    ],
    [],
  );
  assert.equal(playerTimeline[0].team, "Côte d'Ivoire");
  assert.equal(playerTimeline[0].athlete, "Franck Kessie");
  assert.equal(playerTimeline[0].type, "Offside");
  assert.equal(playerTimeline[0].isPlay, false);
});

test("resolveTimelineTeamSide resolves offside team label", () => {
  const focusGame = {
    awayTeam: "Germany",
    awayAbbr: "GER",
    homeTeam: "Ivory Coast",
    homeAbbr: "CIV",
    awayBrand: {},
    homeBrand: {},
  };

  assert.equal(
    resolveTimelineTeamSide("Côte d'Ivoire", focusGame, {
      text: "Offside, Côte d'Ivoire. Franck Kessie is caught offside.",
    }),
    "home",
  );
  assert.equal(
    resolveTimelineTeamSide("", focusGame, {
      text: "Offside. Côte d'Ivoire. Franck Kessie is caught offside.",
    }),
    "home",
  );
});

test("resolveTimelineTeamSide resolves corner team label", () => {
  const focusGame = {
    awayTeam: "Germany",
    awayAbbr: "GER",
    homeTeam: "Ivory Coast",
    homeAbbr: "CIV",
    awayBrand: {},
    homeBrand: {},
  };

  assert.equal(
    resolveTimelineTeamSide("Côte d'Ivoire", focusGame, {
      text: "Corner, Côte d'Ivoire. Conceded by Nico Schlotterbeck.",
    }),
    "home",
  );
});

test("commentary attempt blocked extracts embedded player team", () => {
  const timeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 10,
        time: { displayValue: "23'" },
        text: "Attempt blocked. Amad Diallo (Côte d'Ivoire) left footed shot from very close range is blocked. Assisted by Yan Diomande with a cross.",
      },
    ],
    [],
  );

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].team, "Côte d'Ivoire");
  assert.equal(timeline[0].athlete, "Amad Diallo");
  assert.equal(timeline[0].isPlay, false);
});

test("resolveTimelineTeamSide maps commentary country names to focus teams", () => {
  const focusGame = {
    awayTeam: "Ecuador",
    awayAbbr: "ECU",
    homeTeam: "Ivory Coast",
    homeAbbr: "CIV",
    awayBrand: {},
    homeBrand: {},
  };

  assert.equal(resolveTimelineTeamSide("Côte d'Ivoire", focusGame), "home");
  assert.equal(
    resolveTimelineTeamSide("", focusGame, {
      text: "Attempt blocked. Amad Diallo (Côte d'Ivoire) left footed shot from very close range is blocked.",
    }),
    "home",
  );
});

test("soccer commentary timeline dedupes repeated full-time markers", () => {
  const timeline = parseSoccerCommentaryTimeline(
    [
      {
        sequence: 1,
        time: { displayValue: "90'+2'" },
        text: "Second Half ends, Argentina 2, France 1.",
      },
      {
        sequence: 2,
        time: { displayValue: "90'+2'" },
        text: "Match ends, Argentina 2, France 1.",
      },
    ],
    [],
  );

  const fullTimeMarkers = timeline.filter(
    (event) => normalizeTimelineLabel(event) === "full time",
  );
  assert.equal(fullTimeMarkers.length, 1);
});

test("shootout score parser maps scoreboard text to home and away penalty totals", () => {
  const focusGame = {
    homeTeam: "Argentina",
    homeAbbr: "ARG",
    awayTeam: "France",
    awayAbbr: "FRA",
    homeBrand: {},
    awayBrand: {},
  };

  assert.deepEqual(
    parseShootoutScoreText(
      "Goal!  Argentina 3(4), France 3(2). Gonzalo Montiel converts the penalty.",
      focusGame,
    ),
    { home: 4, away: 2 },
  );

  assert.deepEqual(
    parseShootoutScoreText(
      "Goal!  Argentina 3, France 3(1). Kylian Mbappé converts the penalty.",
      focusGame,
    ),
    { home: 0, away: 1 },
  );
});

test("extractPenaltyShootout builds running five-kick shootout and summary state", () => {
  const focusGame = {
    homeTeam: "Argentina",
    homeAbbr: "ARG",
    homeTeamId: "202",
    homeShootoutScore: 4,
    awayTeam: "France",
    awayAbbr: "FRA",
    awayTeamId: "478",
    awayShootoutScore: 2,
    statusDetail: "FT-Pens",
    statusDescription: "Final Score - After Penalties",
    period: 5,
    homeBrand: {},
    awayBrand: {},
  };
  const summaryData = {
    header: {
      competitions: [
        {
          status: {
            period: 5,
            type: {
              state: "post",
              detail: "FT-Pens",
              description: "Final Score - After Penalties",
            },
          },
          competitors: [
            { homeAway: "home", shootoutScore: 4 },
            { homeAway: "away", shootoutScore: 2 },
          ],
        },
      ],
    },
    shootout: [
      {
        id: "478",
        team: "France",
        shots: [
          { id: "f1", player: "Kylian Mbappé", shotNumber: 1, didScore: true },
          { id: "f2", player: "Kingsley Coman", shotNumber: 2, didScore: false },
          { id: "f3", player: "Aurélien Tchouaméni", shotNumber: 3, didScore: false },
          { id: "f4", player: "Randal Kolo Muani", shotNumber: 4, didScore: true },
        ],
      },
      {
        id: "202",
        team: "Argentina",
        shots: [
          { id: "a1", player: "Lionel Messi", shotNumber: 1, didScore: true },
          { id: "a2", player: "Paulo Dybala", shotNumber: 2, didScore: true },
          { id: "a3", player: "Leandro Paredes", shotNumber: 3, didScore: true },
          { id: "a4", player: "Gonzalo Montiel", shotNumber: 4, didScore: true },
        ],
      },
    ],
  };

  const shootout = extractPenaltyShootout(summaryData, focusGame);

  assert.ok(shootout);
  assert.equal(shootout.complete, true);
  assert.equal(shootout.homeTotal, 4);
  assert.equal(shootout.awayTotal, 2);
  assert.equal(shootout.homeShots.length, 4);
  assert.equal(shootout.awayShots.length, 4);
  assert.equal(shootout.phaseLabel, "Shootout complete");
  assert.match(shootout.summaryText, /Argentina win 4-2/i);
});

test("extractPenaltyShootout supports sudden-death and saved penalties from commentary fallback", () => {
  const focusGame = {
    homeTeam: "Netherlands",
    homeAbbr: "NED",
    homeTeamId: "449",
    awayTeam: "Argentina",
    awayAbbr: "ARG",
    awayTeamId: "202",
    homeBrand: {},
    awayBrand: {},
    period: 5,
  };
  const summaryData = {
    header: {
      competitions: [
        {
          status: {
            period: 5,
            type: {
              state: "in",
              detail: "Penalty Shootout",
              description: "Penalty Shootout",
            },
          },
          competitors: [
            { homeAway: "home", shootoutScore: 3 },
            { homeAway: "away", shootoutScore: 3 },
          ],
        },
      ],
    },
    commentary: [
      { text: "Penalty Shootout begins Netherlands 2, Argentina 2." },
      { text: "Penalty saved! Virgil van Dijk (Netherlands) fails to capitalise on this great opportunity." },
      { text: "Goal!  Netherlands 2, Argentina 2(1). Lionel Messi (Argentina) converts the penalty." },
      { text: "Penalty saved! Steven Berghuis (Netherlands) fails to capitalise on this great opportunity." },
      { text: "Goal!  Netherlands 2, Argentina 2(2). Leandro Paredes (Argentina) converts the penalty." },
      { text: "Goal!  Netherlands 2(1), Argentina 2(2). Teun Koopmeiners (Netherlands) converts the penalty." },
      { text: "Goal!  Netherlands 2(1), Argentina 2(3). Gonzalo Montiel (Argentina) converts the penalty." },
      { text: "Goal!  Netherlands 2(2), Argentina 2(3). Wout Weghorst (Netherlands) converts the penalty." },
      { text: "Penalty missed! Bad penalty by Enzo Fernández (Argentina) right footed shot is close, but misses to the left." },
      { text: "Goal!  Netherlands 2(3), Argentina 2(3). Luuk de Jong (Netherlands) converts the penalty." },
    ],
  };

  const shootout = extractPenaltyShootout(summaryData, focusGame);

  assert.ok(shootout);
  assert.equal(shootout.active, true);
  assert.equal(shootout.complete, false);
  assert.equal(shootout.homeShots.length, 5);
  assert.equal(shootout.awayShots.length, 4);
  assert.equal(shootout.homeTotal, 3);
  assert.equal(shootout.awayTotal, 3);
  assert.equal(shootout.homeShots[0].didScore, false);
  assert.equal(shootout.awayShots[3].didScore, false);
  assert.equal(shootout.phaseLabel, "Round 5 of 5");
});

function normalizeTimelineLabel(event) {
  return String(event.text || event.type || "")
    .trim()
    .toLowerCase();
}

test("hockey slot triggers and parses query", () => {
  assert.equal(slot.trigger("nhl"), true);
  assert.equal(slot.trigger("hockey"), true);
  assert.equal(slot.trigger("blackhawks score"), true);
});

test("namesMatch matches accented names and initials", () => {
  // Accent mismatch
  assert.ok(namesMatch({ fullName: "Damián Bobadilla", name: "Bobadilla" }, "Damian Bobadilla"));
  assert.ok(namesMatch({ fullName: "Piero Hincapié", name: "Hincapié" }, "Hincapie"));
  
  // Initials matching for duplicate surnames
  assert.ok(namesMatch({ fullName: "Juninho Bacuna", name: "J. Bacuna" }, "J. Bacuna"));
  assert.ok(namesMatch({ fullName: "Juninho Bacuna", name: "J. Bacuna" }, "j.bacuna"));
  assert.ok(namesMatch({ fullName: "Juninho Bacuna", name: "Juninho Bacuna" }, "j. bacuna"));
  assert.ok(!namesMatch({ fullName: "Leandro Bacuna", name: "L. Bacuna" }, "j. bacuna"));
});

test("applyLineupSubstitutions swaps players correctly, including accented ones", () => {
  const starters = [
    { fullName: "Damián Bobadilla", name: "Bobadilla", formationPlace: "4", subbedOut: false, subbedIn: false },
    { fullName: "Jhon Arias", name: "Arias", formationPlace: "8", subbedOut: false, subbedIn: false },
  ];
  const subs = [
    { fullName: "Hernesto Caballero", name: "Caballero", formationPlace: "", subbedOut: false, subbedIn: false },
    { fullName: "Yaser Asprilla", name: "Asprilla", formationPlace: "", subbedOut: false, subbedIn: false },
  ];
  const commentary = [
    { text: "Substitution, Paraguay. Hernesto Caballero replaces Damian Bobadilla." },
    { text: "Substitution, Colombia. Yaser Asprilla replaces Jhon Arias." },
  ];

  applyLineupSubstitutions(starters, subs, commentary);

  // Check Paraguay substitution
  const caballero = starters.find(p => p.fullName === "Hernesto Caballero");
  const bobadilla = subs.find(p => p.fullName === "Damián Bobadilla");
  assert.ok(caballero);
  assert.ok(bobadilla);
  assert.equal(caballero.formationPlace, "4");
  assert.ok(caballero.subbedIn);
  assert.ok(bobadilla.subbedOut);

  // Check Colombia substitution
  const asprilla = starters.find(p => p.fullName === "Yaser Asprilla");
  const arias = subs.find(p => p.fullName === "Jhon Arias");
  assert.ok(asprilla);
  assert.ok(arias);
  assert.equal(asprilla.formationPlace, "8");
  assert.ok(asprilla.subbedIn);
  assert.ok(arias.subbedOut);
});

// ── Audit regressions ──────────────────────────────────────────────────

function memoryCache() {
  const values = new Map();
  return {
    values,
    get: async (key) => values.get(key),
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
    clear: async () => { values.clear(); },
  };
}

async function requestLogo(query) {
  const logoRoute = routes.find((route) => route.path === "logo");
  return logoRoute.handler(new Request(`http://localhost/api/plugin/sports-slot/logo?${query}`));
}

test("logo route never fetches non-allowlisted crests and only serves images", async () => {
  const calls = [];
  let reply = () => new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } });
  const cache = memoryCache();
  slot.init({
    apiBase: "/api/plugin/sports-slot",
    fetch: async (url) => { calls.push(String(url)); return reply(url); },
    useCache: () => cache,
  });

  for (const crest of [
    "http://169.254.169.254/latest/meta-data/",
    "https://evil.test/teamlogos/countries/500/bra.png",
    "https://crests.football-data.org.evil.test/57.png",
    "https://user@crests.football-data.org/57.png",
  ]) {
    const response = await requestLogo(`sport=soccer&abbr=BRA&crest=${encodeURIComponent(crest)}`);
    assert.equal(response.status, 404, crest);
  }
  assert.deepEqual(calls, []);

  const htmlFromAllowedHost = await requestLogo(
    `sport=soccer&abbr=ARS&crest=${encodeURIComponent("https://crests.football-data.org/57.png")}`,
  );
  assert.equal(htmlFromAllowedHost.status, 404);
  assert.equal(htmlFromAllowedHost.headers.get("x-content-type-options"), "nosniff");
  assert.equal(cache.values.size, 0, "non-image bodies are never cached");

  reply = () => new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
    headers: { "content-type": "image/svg+xml; charset=utf-8" },
  });
  const svg = await requestLogo(
    `sport=soccer&abbr=ARS&crest=${encodeURIComponent("https://crests.football-data.org/57.svg")}`,
  );
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.equal(svg.headers.get("x-content-type-options"), "nosniff");
  assert.match(svg.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);

  // Cache entries are keyed by the fetched URL, so a crest swap under the
  // same abbreviation cannot read or overwrite another team's logo.
  assert.deepEqual([...cache.values.keys()], ["image:https://crests.football-data.org/57.svg"]);

  const jersey = await requestLogo(
    `sport=jersey&src=${encodeURIComponent("https://stitcher.espn.com.evil.test/x.png")}`,
  );
  assert.equal(jersey.status, 404);
});

test("NHL logos are proxied from ESPN's nhl path and other sports stay intact", async () => {
  const calls = [];
  slot.init({
    apiBase: "/api/plugin/sports-slot",
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    },
  });

  const hockeyUrl = sportsDataTestHelpers.getLogoUrlForTeam("hockey", "TOR");
  assert.equal(hockeyUrl, "/api/plugin/sports-slot/logo?sport=hockey&abbr=TOR");
  const hockey = await requestLogo("sport=hockey&abbr=TOR");
  assert.equal(hockey.status, 200);
  assert.equal(hockey.headers.get("content-type"), "image/png");
  const nba = await requestLogo("sport=nba&abbr=LAL");
  assert.equal(nba.status, 200);
  assert.deepEqual(calls, [
    "https://a.espncdn.com/i/teamlogos/nhl/500/tor.png",
    "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
  ]);
  assert.equal((await requestLogo(`sport=nba&abbr=${encodeURIComponent("../../x?y")}`)).status, 404);
  assert.equal(
    sportsDataTestHelpers.getLogoUrlForTeam("soccer", "BRA", "https://evil.test/bra.png"),
    "/api/plugin/sports-slot/logo?sport=soccer&abbr=BRA",
  );
});

test("toggle settings accept the string values degoog saves", () => {
  const { configureSharedSettings, isDebugMode, isEspnEnabled } = sportsDataTestHelpers;
  try {
    configureSharedSettings({ useEspnApi: "false", debugMode: "false" });
    assert.equal(isEspnEnabled(), false);
    assert.equal(isDebugMode(), false);
    configureSharedSettings({ useEspnApi: "true", debugMode: "true" });
    assert.equal(isEspnEnabled(), true);
    assert.equal(isDebugMode(), true);
    configureSharedSettings({ useEspnApi: false, debugMode: true });
    assert.equal(isEspnEnabled(), false);
    assert.equal(isDebugMode(), true);
    configureSharedSettings({});
    assert.equal(isEspnEnabled(), true);
    assert.equal(isDebugMode(), false);
  } finally {
    configureSharedSettings({});
  }
});

test("everyday phrases that contain team codes, nicknames or countries do not trigger", () => {
  for (const query of [
    "whats new today",
    "what was the score",
    "as of today",
    "mil to mm table",
    "liv golf results",
    "heat wave today",
    "eagles live in concert",
    "thunder storm tonight",
    "wild game recipes",
    "usa today",
    "iran latest news",
    "brazil election results",
    "japan vs korea history",
    "heat vs cold",
    "lions vs tigers",
    "new york score",
    "fifa 25 ratings",
    "world series of poker",
    "super bowl halftime show",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("explicit sports queries still trigger, including bare league and title names", () => {
  for (const query of [
    "lakers score",
    "did the lakers win",
    "heat game tonight",
    "giants score",
    "brazil score",
    "usa vs england",
    "real madrid vs barcelona",
    "golden state score",
    "psg score",
    "lal nba score",
    "nba finals",
    "super bowl",
    "premier league",
    "champions league",
    "stanley cup final",
    "who won the super bowl",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
  assert.equal(sportsDataTestHelpers.parseQuery("did the lakers win")?.team?.canonicalName, "Los Angeles Lakers");
  assert.equal(sportsDataTestHelpers.parseQuery("nba finals")?.sport, "nba");
});

test("only FIFA phrasing maps to the World Cup card", () => {
  for (const query of ["rugby world cup", "cricket world cup", "world cup of hockey", "t20 world cup"]) {
    assert.equal(slot.trigger(query), false, query);
  }
  assert.equal(sportsDataTestHelpers.parseQuery("fifa world cup 2026")?.kind, "worldCup");
  assert.equal(sportsDataTestHelpers.parseQuery("world cup usa")?.team?.canonicalName, "United States");
});

test("one-sided or cross-sport matchups do not throw", async () => {
  slot.init({ fetch: async () => Response.json({ children: [], events: [] }) });
  slot.configure({});
  for (const query of ["ind vs aus", "lakers vs yankees", "germany x"]) {
    assert.equal(slot.trigger(query), false, query);
    const result = await slot.execute(query, {});
    assert.doesNotMatch(result.html || "", /provider request failed/i, query);
  }
  const parsed = sportsDataTestHelpers.parseQuery("lakers vs celtics");
  assert.equal(parsed.intent, "matchup");
  assert.ok(parsed.left && parsed.right);
  assert.notEqual(sportsDataTestHelpers.parseQuery("lakers score last night v")?.intent, "matchup");
});

const lal = { id: "13", displayName: "Los Angeles Lakers", abbreviation: "LAL" };
const bos = { id: "2", displayName: "Boston Celtics", abbreviation: "BOS" };
function espnGame(id, state, date) {
  return {
    id, date: new Date(date).toISOString(), competitions: [{
      id, date: new Date(date).toISOString(),
      status: { type: { state, completed: state === "post", description: state === "post" ? "Final" : "Scheduled" } },
      competitors: [
        { homeAway: "home", team: lal, score: state === "pre" ? undefined : "110" },
        { homeAway: "away", team: bos, score: state === "pre" ? undefined : "104" },
      ],
    }],
  };
}
function nbaFetch({ events, summary = {} }) {
  return async (url) => {
    const href = String(url);
    if (href.includes("/standings")) {
      return Response.json({ children: [{ name: "West", standings: { entries: [lal, bos].map((team) => ({ team, stats: [] })) } }] });
    }
    if (href.includes("/schedule")) return Response.json({ events });
    if (href.includes("/summary")) return Response.json(summary);
    return Response.json({ events: [] });
  };
}

test("score queries focus last night's final instead of the next game", async () => {
  const now = Date.now();
  const H = 3600 * 1000;
  slot.init({ fetch: nbaFetch({ events: [espnGame("final", "post", now - 10 * H), espnGame("next", "pre", now + 48 * H)] }) });
  slot.configure({});
  const score = await slot.execute("lakers score", {});
  assert.match(score.html, /data-sports-default-event-id="final"/);
  const schedule = await slot.execute("lakers schedule", {});
  assert.match(schedule.html, /data-sports-default-event-id="next"/);

  const { pickEspnAutoFocusGame, normalizeEspnEvent } = sportsDataTestHelpers;
  const stale = [espnGame("old", "post", now - 30 * H), espnGame("next", "pre", now + 48 * H)]
    .map((event) => normalizeEspnEvent(event, "nba"));
  assert.equal(pickEspnAutoFocusGame(stale, { intent: "score", now }).id, "next");
});

test("NBA cards look up stats by league key so the Stats tab appears", async () => {
  slot.init({
    fetch: nbaFetch({
      events: [espnGame("final", "post", Date.now() - 3600 * 1000)],
      summary: {
        boxscore: {
          teams: [
            { team: bos, statistics: [{ name: "rebounds", displayValue: "40" }] },
            { team: lal, statistics: [{ name: "rebounds", displayValue: "45" }] },
          ],
        },
      },
    }),
  });
  slot.configure({});
  const result = await slot.execute("lakers score", {});
  assert.match(result.html, /data-tab="stats"/);
  assert.match(result.html, /Rebounds/);
  assert.doesNotMatch(result.html, /Possession/);
});

test("game times ship as instants that script.js formats in the viewer's timezone", async () => {
  const previousTz = process.env.TZ;
  const start = "2026-11-08T00:30:00.000Z";
  try {
    process.env.TZ = "UTC";
    slot.init({ fetch: nbaFetch({ events: [espnGame("next", "pre", start)] }) });
    slot.configure({});
    const result = await slot.execute("lakers schedule", {});
    // Server fallback is in the server's zone (UTC here)...
    assert.match(
      result.html,
      new RegExp(`<time class="sports-slot__local-time" datetime="${start}" data-sports-time="display">Sun, Nov 8, 12:30\\sAM</time>`),
    );
    assert.match(result.html, new RegExp(`data-sports-today="${start}"`));

    // ...and the client re-renders it for a New York viewer.
    process.env.TZ = "America/New_York";
    const text = await localizeWithScript(start, "display");
    assert.equal(text.time.replace(/\s/g, " "), "Sat, Nov 7, 7:30 PM");
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

async function localizeWithScript(datetime, style) {
  const vm = await import("node:vm");
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  class HTMLElement {}
  const timeNode = {
    dataset: { sportsTime: style },
    textContent: "",
    getAttribute: (name) => (name === "datetime" ? datetime : null),
  };
  const todayNode = { dataset: { sportsToday: datetime }, hidden: false };
  const panel = Object.assign(new HTMLElement(), {
    dataset: { sportsLang: "en-US", sportsQuery: "lakers schedule" },
    matches: () => true,
    querySelector: () => null,
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === "time[data-sports-time]") return [timeNode];
      if (selector === "[data-sports-today]") return [todayNode];
      return [];
    },
  });
  const document = {
    readyState: "complete",
    documentElement: { lang: "en" },
    body: { contains: () => true },
    querySelectorAll: (selector) => (selector.startsWith(".sports-slot[") ? [panel] : []),
  };
  const window = { setInterval: () => 1, clearInterval() {}, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, {
    __PLUGIN_ID__: "sports-slot",
    window,
    document,
    HTMLElement,
    MutationObserver: class { observe() {} },
  });
  return { time: timeNode.textContent, todayHidden: todayNode.hidden };
}

test("schedule cards, narrow grids and light-mode result colours stay readable", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.sports-slot__split-pane--games \.sports-slot__mini-games--grid\s*\{[^}]*align-content:\s*start;/,
  );
  assert.doesNotMatch(css, /minmax\(300px,\s*1fr\)/);
  assert.match(css, /--sports-success-text:\s*color-mix\(in srgb, var\(--success\) 62%, #000\)/);
  assert.match(css, /html\[data-theme="dark"\] \.sports-slot\s*\{\s*--sports-success-text:\s*var\(--success\);/);
  for (const selector of [".sports-slot__mini-game-status--final", ".sports-slot__form-item--w .sports-slot__form-result"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*color:\\s*var\\(--sports-success-text\\)`));
  }
});
