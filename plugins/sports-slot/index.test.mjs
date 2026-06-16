import assert from "node:assert/strict";
import test from "node:test";

import { lineupLayoutTestHelpers, routes, slot, timelineTestHelpers } from "./index.js";

const { layoutPitchPlayers, getFormationRows, resolveEffectiveFormation } =
  lineupLayoutTestHelpers;
const { parseSoccerCommentaryTimeline } = timelineTestHelpers;

test("4-4-2 lineup rows use tactical X and shared row Y", () => {
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

  const coords = layoutPitchPlayers(ivoryCoastStarters, "4-4-2", "home");
  const defY = coords.get("3").y;
  const midY = coords.get("11").y;
  const fwdY = coords.get("9").y;

  assert.equal(coords.get("6").y, defY);
  assert.equal(coords.get("4").y, midY);
  assert.equal(coords.get("10").y, fwdY);
  assert.notEqual(defY, midY);
  assert.notEqual(midY, fwdY);

  assert.ok(coords.get("3").x < coords.get("6").x);
  assert.ok(coords.get("6").x < coords.get("5").x);
  assert.ok(coords.get("5").x < coords.get("2").x);

  assert.ok(coords.get("11").x < coords.get("8").x);
  assert.ok(coords.get("8").x < coords.get("4").x);
  assert.ok(coords.get("4").x < coords.get("7").x);

  assert.notEqual(coords.get("4").x, coords.get("6").x);
  assert.notEqual(coords.get("8").x, coords.get("6").x);
});

test("ESPN 4-4-2 label resolves to 3-4-3 for wingback sides", () => {
  const ecuadorStarters = [
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

  const ecuador = resolveEffectiveFormation(ecuadorStarters, "4-4-2", "away");
  const ivoryCoast = resolveEffectiveFormation(
    ivoryCoastStarters,
    "4-4-2",
    "home",
  );

  assert.equal(ecuador.formation, "3-4-3");
  assert.deepEqual(ecuador.rows?.[1], [3, 5, 6]);
  assert.deepEqual(ecuador.rows?.[3], [7, 9, 10]);

  assert.equal(ivoryCoast.formation, "4-4-2");
  assert.deepEqual(ivoryCoast.rows?.[1], [2, 3, 5, 6]);
  assert.deepEqual(ivoryCoast.rows?.[3], [9, 10]);

  const coords = layoutPitchPlayers(ecuadorStarters, ecuador.formation, "away", {
    rows: ecuador.rows,
    layoutKey: ecuador.layoutKey,
  });
  assert.equal(coords.get("7").y, coords.get("9").y);
  assert.notEqual(coords.get("2").y, coords.get("3").y);
});

test("getFormationRows covers common World Cup shapes", () => {
  assert.deepEqual(getFormationRows("4-4-2")?.[2], [4, 7, 8, 11]);
  assert.deepEqual(getFormationRows("4-3-3")?.[3], [9, 10, 11]);
  assert.deepEqual(getFormationRows("3-4-2-1")?.[3], [10, 11]);
  assert.deepEqual(getFormationRows("5-4-1")?.[1], [2, 3, 4, 5, 6]);
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

