import assert from "node:assert/strict";
import test from "node:test";

import { routes, slot } from "./index.js";

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

