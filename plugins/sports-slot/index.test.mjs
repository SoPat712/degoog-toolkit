import assert from "node:assert/strict";
import test from "node:test";

import { lineupLayoutTestHelpers, routes, slot, timelineTestHelpers } from "./index.js";

const {
  layoutPitchPlayers,
  getFormationRows,
  assignPlayersToFormationRows,
  getFormationRowY,
  resolveEffectiveFormation,
} = lineupLayoutTestHelpers;
const {
  parseSoccerCommentaryTimeline,
  parseCommentaryAthleteTeam,
  parseCommentaryEventTeam,
  resolveTimelineTeamSide,
} = timelineTestHelpers;

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
  const coords = layoutPitchPlayers(ivoryCoastStarters, "4-4-2", "home");
  const defY = coords.get("3").y;
  const midY = coords.get(String(rows[2][0])).y;
  const fwdY = coords.get("9").y;

  assert.equal(coords.get("6").y, defY);
  assert.equal(coords.get("4").y, midY);
  assert.equal(coords.get("10").y, fwdY);
  assert.notEqual(defY, midY);
  assert.notEqual(midY, fwdY);

  const defXs = rows[1].map((place) => coords.get(String(place)).x);
  assert.ok(defXs.every((x, index) => index === 0 || x >= defXs[index - 1] - 0.01));
  assert.ok(defXs[0] < defXs[defXs.length - 1]);

  const midXs = rows[2].map((place) => coords.get(String(place)).x);
  assert.ok(midXs.every((x, index) => index === 0 || x >= midXs[index - 1] - 0.01));
  assert.ok(coords.get("3").x < coords.get("2").x);
  assert.ok(coords.get("11").x < coords.get("7").x);
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

  const coords = layoutPitchPlayers(ecuadorStarters, ecuador.formation, "away", {
    rows: ecuador.rows,
  });
  assert.equal(coords.get("7").y, coords.get("4").y);
  assert.equal(coords.get("9").y, coords.get("10").y);
  assert.notEqual(coords.get("2").y, coords.get("3").y);
  assert.ok(coords.get("9").y > coords.get("7").y);
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

  const homeCoords = layoutPitchPlayers(starters541, "5-4-1", "home", { rows });
  const awayCoords = layoutPitchPlayers(starters541, "5-4-1", "away", { rows });

  assert.ok(homeCoords.get("1").y > homeCoords.get("4").y);
  assert.ok(homeCoords.get("4").y > homeCoords.get("9").y);
  assert.equal(homeCoords.get("9").y, 52);
  assert.equal(homeCoords.get("9").x, 50);

  assert.ok(awayCoords.get("1").y < awayCoords.get("4").y);
  assert.ok(awayCoords.get("4").y < awayCoords.get("9").y);
  assert.equal(awayCoords.get("9").y, 48);
  assert.equal(awayCoords.get("9").x, 50);

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

  const awayCoords = layoutPitchPlayers(ecuadorStarters, "3-1-4-2", "away", {
    rows,
  });
  const homeCoords = layoutPitchPlayers(ecuadorStarters, "3-1-4-2", "home", {
    rows,
  });

  assert.ok(awayCoords.get("1").y < awayCoords.get("23").y);
  assert.ok(awayCoords.get("23").y < awayCoords.get("13").y);
  assert.ok(awayCoords.get("13").y < 50);
  assert.ok(homeCoords.get("1").y > homeCoords.get("23").y);
  assert.ok(homeCoords.get("23").y > homeCoords.get("13").y);
  assert.ok(homeCoords.get("13").y > 50);
});

test("four-row formations evenly divide vertical space", () => {
  const rows = getFormationRows("4-2-3-1");
  assert.equal(rows.length, 5);

  const yValues = [0, 1, 2, 3, 4].map((index) =>
    getFormationRowY(index, rows.length, "home"),
  );
  assert.deepEqual(yValues, [95, 84.25, 73.5, 62.75, 52]);
  assert.equal(getFormationRowY(0, rows.length, "away"), 5);
  assert.equal(getFormationRowY(4, rows.length, "away"), 48);
});

test("refresh route renders without relying on an undefined request alias", async () => {
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

function normalizeTimelineLabel(event) {
  return String(event.text || event.type || "")
    .trim()
    .toLowerCase();
}
