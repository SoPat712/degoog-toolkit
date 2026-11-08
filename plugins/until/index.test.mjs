import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import until, { parseUntilQuery } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const scriptSource = await readFile(new URL("./card.js", import.meta.url), "utf8");
const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
const civil = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

function withTimeZone(t, zone) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

// Loads card.js in a sandbox and exposes its internals for one card.
function loadClient(lang = "en") {
  const context = vm.createContext({
    window: { scopedT: () => (key) => key, setInterval() {}, clearInterval() {} },
    document: { documentElement: { lang }, readyState: "loading", addEventListener() {} },
    MutationObserver: class { observe() {} },
    Date, Intl, Number, String, Math, Map,
  });
  vm.runInContext(
    scriptSource.replace(
      "  if (document.readyState",
      "  globalThis.check = { resolveTarget, updateCard, decomposeDuration };\n  if (document.readyState",
    ),
    context,
  );
  return context.check;
}

function cardFrom(html) {
  const attr = (name) => html.match(new RegExp(`${name}="([^"]*)"`))?.[1];
  const dataset = {
    untilTarget: attr("data-until-target"),
    untilWall: attr("data-until-wall"),
    untilAnchor: attr("data-until-anchor"),
    untilDirection: attr("data-until-direction"),
    untilPrecision: attr("data-until-precision"),
    untilDays: attr("data-until-days"),
    untilRoll: attr("data-until-roll"),
  };
  const elements = {
    "[data-until-status]": { textContent: "Approaching" },
    "[data-until-relation]": { textContent: "Until" },
    "[data-until-caption]": { textContent: "" },
    "[data-until-target-label]": { textContent: "" },
  };
  const classes = new Set(html.match(/class="until-card ([^"]*)"/)?.[1].split(/\s+/));
  return {
    dataset,
    elements,
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    querySelector: (selector) => elements[selector] || null,
  };
}

test.beforeEach(() => {
  until.init({ template });
  until.configure({ topUnits: "2", holidayCalendar: "US" });
});

test("bare words that merely match a foreign holiday name do not take the slot", () => {
  for (const query of ["bank", "school", "noel", "natal", "1945", "corpus christi", "carnival", "day off", "bridge day", "sec 230", "min 5"]) {
    assert.equal(until.trigger(query), false, query);
  }
  for (const query of ["days until christmas", "christmas", "diwali", "halloween", "Thanksgiving in Canada", "days until carnival", "when is corpus christi"]) {
    assert.equal(until.trigger(query), true, query);
  }
});

test("the configured calendar's own official names still work bare", () => {
  until.configure({ holidayCalendar: "AT" });
  assert.equal(until.trigger("corpus christi"), true);
  until.configure({ holidayCalendar: "IE" });
  assert.equal(until.trigger("bank"), false, "parenthetical aliases never count");
});

test("bare names without a date stay silent instead of rendering an unavailable card", async () => {
  const now = new Date(2028, 0, 10, 12);
  assert.equal(parseUntilQuery("diwali", { now }), null);
  assert.equal(parseUntilQuery("diwali 2028", { now }).target.unavailable, true);
  assert.equal(parseUntilQuery("days until diwali", { now }).target.unavailable, true);
});

test("Election Day resolves to the next US presidential election", () => {
  const parsed = parseUntilQuery("election day", { now: new Date(2026, 10, 8, 12) });
  assert.deepEqual(civil(parsed.target.date), [2028, 11, 7]);
  const past = parseUntilQuery("when was election day", { now: new Date(2026, 10, 8, 12) });
  assert.deepEqual(civil(past.target.date), [2024, 11, 5]);
});

test("calendar targets are resolved in the reader's time zone, not the server's", async (t) => {
  withTimeZone(t, "UTC");
  // 21:00 on Dec 24 in New York is already Dec 25 on a UTC server.
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 11, 25, 2) });
  const { html } = await until.execute("days until christmas", {});
  assert.match(html, /data-until-wall="2026-12-25T00:00:00"/);
  assert.doesNotMatch(html, /data-until-anchor/);

  process.env.TZ = "America/New_York";
  const card = cardFrom(html);
  const client = loadClient();
  const target = client.resolveTarget(card);
  assert.equal(target - Date.now(), 3 * 60 * 60 * 1000, "three hours left in New York");
  client.updateCard(card);
  assert.equal(card.elements["[data-until-status]"].textContent, "Approaching");
});

test("clock times count to the reader's next occurrence", async (t) => {
  withTimeZone(t, "UTC");
  // 13:00 in New York (18:00 UTC): the server already rolled 5pm to tomorrow.
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 11, 10, 18) });
  const { html } = await until.execute("!until 5pm", {});
  assert.match(html, /data-until-wall="2026-12-11T17:00:00"/);
  assert.match(html, /data-until-anchor="clock"/);

  process.env.TZ = "America/New_York";
  const card = cardFrom(html);
  const target = loadClient().resolveTarget(card);
  assert.equal(target - Date.now(), 4 * 60 * 60 * 1000);
  assert.match(card.elements["[data-until-target-label]"].textContent, /December 10/);
});

const HOUR = 60 * 60 * 1000;

// Renders on a server in serverZone at the given instant (Date timers must be
// mocked), then resolves the card in a browser in viewerZone.
async function hoursInViewer(t, query, instant, viewerZone, serverZone = "UTC") {
  process.env.TZ = serverZone;
  t.mock.timers.setTime(instant);
  const { html } = await until.execute(query, {});
  process.env.TZ = viewerZone;
  const card = cardFrom(html);
  const client = loadClient();
  const hours = (client.resolveTarget(card) - Date.now()) / HOUR;
  return { hours, html, card, client };
}

test("relative day words follow the reader's calendar day, not the server's", async (t) => {
  withTimeZone(t, "UTC");
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  // 21:00 on Thursday Dec 24 in New York is already Friday Dec 25 in UTC.
  const evening = Date.UTC(2026, 11, 25, 2);
  for (const [query, hours] of [
    ["days until tomorrow", 3],
    ["days since yesterday", -45],
    ["days until in 3 days", 51],
    ["days until next week", 147],
    ["until friday", 3],
    ["days until start of next week", 75],
  ]) {
    assert.equal((await hoursInViewer(t, query, evening, "America/New_York")).hours, hours, query);
  }
  // 05:00 on Friday Dec 25 in Tokyo is still Thursday in UTC.
  const morning = Date.UTC(2026, 11, 24, 20);
  for (const [query, hours] of [["until friday", 163], ["until saturday", 19], ["since friday", -5], ["days until tomorrow", 19]]) {
    assert.equal((await hoursInViewer(t, query, morning, "Asia/Tokyo")).hours, hours, query);
  }
});

test("holiday years follow the reader's date", async (t) => {
  withTimeZone(t, "UTC");
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  // 20:00 on Christmas Day in New York is Dec 26 on a UTC server, which
  // already counts to next year's Christmas.
  const { hours, html, card, client } = await hoursInViewer(t, "days until christmas", Date.UTC(2026, 11, 26, 1), "America/New_York");
  assert.match(html, /data-until-wall="2027-12-25T00:00:00"/, "no-JS fallback keeps the server's date");
  assert.equal(hours, -20, "the reader is still on Christmas Day");
  client.updateCard(card);
  assert.equal(card.elements["[data-until-status]"].textContent, "Arrived");
  assert.equal(card.elements["[data-until-relation]"].textContent, "Since");
  assert.match(card.elements["[data-until-target-label]"].textContent, /December 25, 2026/);
  // 21:00 on Christmas Eve in New York: the last Christmas was in 2025.
  const past = await hoursInViewer(t, "when was christmas", Date.UTC(2026, 11, 25, 2), "America/New_York");
  assert.equal(past.hours, -(364 * 24 + 21));
});

test("annual dates with a time roll over on the reader's clock", async (t) => {
  withTimeZone(t, "UTC");
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  // 18:00 UTC has passed 5pm, but it is 13:00 in New York.
  const { hours, html } = await hoursInViewer(t, "until dec 25 5pm", Date.UTC(2026, 11, 25, 18), "America/New_York");
  assert.match(html, /data-until-wall="2027-12-25T17:00:00"/);
  assert.match(html, /data-until-roll="year"/);
  assert.equal(hours, 4);
  // 18:00 UTC is 03:00 on Dec 26 in Tokyo: this year's has passed there.
  const tokyo = await hoursInViewer(t, "until dec 25 5pm", Date.UTC(2026, 11, 25, 18), "Asia/Tokyo");
  assert.equal(tokyo.hours, 365 * 24 - 10);
});

test("a browser in the server's zone agrees with the server's own target", async (t) => {
  withTimeZone(t, "UTC");
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const queries = ["days until tomorrow", "until friday", "friday 5pm countdown", "since friday", "since friday 5pm", "days until next week", "days until christmas", "when was christmas", "until dec 25 5pm", "since dec 25 5pm", "until july 6", "until 12/25", "until end of month"];
  for (const zone of ["UTC", "America/New_York"]) {
    process.env.TZ = zone;
    for (const [month, day] of [[11, 24], [11, 25], [6, 6]]) {
      for (const hour of [0, 9, 13, 18, 23]) {
        t.mock.timers.setTime(new Date(2026, month, day, hour, 30).getTime());
        for (const query of queries) {
          const { html } = await until.execute(query, {});
          const card = cardFrom(html);
          assert.equal(loadClient().resolveTarget(card), Date.parse(card.dataset.untilTarget), `${zone} ${month + 1}/${day} ${hour}:30 ${query}`);
        }
      }
    }
  }
});

test("a weekday without a time counts to the next one once its day has begun", () => {
  const fridayMorning = new Date(2026, 11, 25, 9);
  assert.deepEqual(civil(parseUntilQuery("until friday", { now: fridayMorning }).target.date), [2027, 1, 1]);
  assert.deepEqual(civil(parseUntilQuery("until friday", { now: new Date(2026, 11, 25, 15) }).target.date), [2027, 1, 1]);
  const timed = parseUntilQuery("friday 5pm countdown", { now: fridayMorning }).target.date;
  assert.deepEqual([...civil(timed), timed.getHours()], [2026, 12, 25, 17]);
  assert.deepEqual(civil(parseUntilQuery("since friday", { now: fridayMorning }).target.date), [2026, 12, 25]);
});

test("dates that do not depend on today carry no per-day targets", async () => {
  for (const query of ["!until 2033-07-06", "years until 3000", "!until 5pm", "!until in 3 hours"]) {
    const { html } = await until.execute(query, {});
    assert.doesNotMatch(html, /data-until-days/, query);
  }
});

test("relative durations stay absolute instants", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 8, 12) });
  const { html } = await until.execute("!until in 3 hours", {});
  assert.doesNotMatch(html, /data-until-wall/);
  assert.equal(loadClient().resolveTarget(cardFrom(html)) - Date.now(), 3 * 60 * 60 * 1000);
});

test("tonight and this evening count forward to later today", () => {
  const now = new Date(2026, 10, 8, 15);
  for (const [query, hour] of [["until tonight", 20], ["until this evening", 18], ["hours until this afternoon", 12]]) {
    const { target } = parseUntilQuery(query, { now });
    const expectedDay = hour > 15 ? 8 : 9;
    assert.deepEqual([...civil(target.date), target.date.getHours()], [2026, 11, expectedDay, hour], query);
    assert.equal(target.anchor, "clock", query);
  }
});

test("since <weekday> counts back to the last one", () => {
  const sunday = new Date(2026, 10, 8, 12);
  assert.deepEqual(civil(parseUntilQuery("since monday", { now: sunday }).target.date), [2026, 11, 2]);
  assert.deepEqual(civil(parseUntilQuery("days since friday", { now: sunday }).target.date), [2026, 11, 6]);
  assert.deepEqual(civil(parseUntilQuery("days until monday", { now: sunday }).target.date), [2026, 11, 9]);
});

test("52 days reads as 1 month, 3 weeks on the server and the client", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 0, 1) });
  const { html } = await until.execute("time until 2026-02-22", {});
  const parts = [...html.matchAll(/data-until-part data-until-unit="(\w+)" data-until-value="(\d+)"/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(parts, [["months", 1], ["weeks", 3]]);
  // Whole-unit totals floor too, so they never contradict the main answer.
  t.mock.timers.setTime(new Date(2026, 0, 1, 0, 30).getTime());
  const { html: almost } = await until.execute("time until 2026-02-22", {});
  assert.match(almost, /data-until-value="days" data-until-detail-display="51"/);
  const client = loadClient();
  const day = 24 * 60 * 60 * 1000;
  assert.deepEqual(JSON.parse(JSON.stringify(client.decomposeDuration(52 * day, "auto", 2))), [{ unit: "months", value: 1 }, { unit: "weeks", value: 3 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(client.decomposeDuration(day + 23.5 * 3600000, "auto", 2))), [{ unit: "days", value: 1 }, { unit: "hours", value: 23 }]);
});

test("labels follow the core context.locale", async () => {
  const { html } = await until.execute("!until 2033-07-06", { locale: "de-DE" });
  assert.ok(html.includes(new Intl.DateTimeFormat("de", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(2033, 6, 6))));
});

test("status text follows the live state and the ticking answer is not an aria-live region", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 8, 16, 59, 59) });
  const { html } = await until.execute("!until 5pm", {});
  assert.match(html, /data-until-answer role="timer"/);
  assert.doesNotMatch(html, /aria-live/);
  const card = cardFrom(html);
  const client = loadClient();
  client.updateCard(card);
  assert.equal(card.elements["[data-until-status]"].textContent, "Approaching");
  t.mock.timers.tick(5000);
  client.updateCard(card);
  assert.equal(card.elements["[data-until-status]"].textContent, "Arrived");
  assert.equal(card.elements["[data-until-relation]"].textContent, "Since");
});

test("the split-flap hinge is drawn on the big digits only", () => {
  assert.match(css, /\.until-card__flap::before\s*\{[^}]*--until-hinge/);
  assert.doesNotMatch(css, /\.until-card__detail dd::(?:after|before)/);
});
