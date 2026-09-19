import assert from "node:assert/strict";
import test from "node:test";
import until, { parseUntilQuery } from "./until/index.js";
import time from "./time/index.js";
import places from "./osm-slot/index.js";

const now = new Date(2026, 8, 18, 12);
const parse = (query, options = {}) => parseUntilQuery(query, { now, ...options });
const civil = target => [target.date.getFullYear(), target.date.getMonth() + 1, target.date.getDate()];
const questions = [
  ["when was ganesh chaturthi", [2026, 9, 14]],
  ["When was Ganesh Chaturti?", [2026, 9, 14]],
  ["please when was Christmas", [2025, 12, 25]],
  ["what day was Easter", [2026, 4, 5]],
  ["what date was Diwali 2026", [2026, 11, 8]],
  ["how long ago was Christmas", [2025, 12, 25]],
  ["how many days ago was Ganesh Chaturthi", [2026, 9, 14], "days"],
  ["how many weeks ago was Easter", [2026, 4, 5], "weeks"],
  ["when did Hanukkah start", [2025, 12, 14]],
  ["when did Hannukah begin", [2025, 12, 14]],
  ["when did Ganesh Chaturthi happen", [2026, 9, 14]],
  ["when did Christmas last occur", [2025, 12, 25]],
  ["when did Easter take place", [2026, 4, 5]],
  ["what date did Christmas fall on", [2025, 12, 25]],
  ["how long ago did Easter happen", [2026, 4, 5]],
  ["how many days ago did Hanukkah start", [2025, 12, 14], "days"],
  ["when was Christmas celebrated", [2025, 12, 25]],
  ["when was Christmas last", [2025, 12, 25]],
  ["when was the previous Christmas", [2025, 12, 25]],
  ["when was the most recent Easter", [2026, 4, 5]],
  ["when is the next Ganesh Chaturthi", [2027, 9, 4]],
  ["when is upcoming Christmas", [2026, 12, 25]],
  ["when will Christmas be", [2026, 12, 25]],
  ["what day will Christmas be", [2026, 12, 25]],
  ["when does Easter fall", [2027, 3, 28]],
  ["what date does Easter fall on", [2027, 3, 28]],
  ["when does Hanukkah begin", [2026, 12, 4]],
  ["when will Christmas be celebrated", [2026, 12, 25]],
  ["when will Hanukkah start", [2026, 12, 4]],
  ["when was Christmas in 2024", [2024, 12, 25]],
  ["when was Christmas last year", [2025, 12, 25]],
  ["when is Christmas this year", [2026, 12, 25]],
  ["when will Christmas be next year", [2027, 12, 25]],
  ["when will Christmas be celebrated next year", [2027, 12, 25]],
  ["when does Easter fall next year", [2027, 3, 28]],
  ["when did Easter happen in 2024", [2024, 3, 31]],
  ["when was Christmas observed 2024", [2024, 12, 25]],
  ["when was Christmas last year in Canada", [2025, 12, 25]],
  ["when was Christmas in Canada last year", [2025, 12, 25]],
  ["when was Ganesh Chaturthi celebrated in Mauritius", [2026, 9, 15]],
  ["when did Ganesh Chaturthi happen in Mauritius 2026", [2026, 9, 15]],
  ["when was Thanksgiving celebrated in Canada 2025", [2025, 10, 13]],
  // Explicit years take precedence over the question's inferred direction.
  ["when was Christmas 2027", [2027, 12, 25]],
  ["when is Christmas 2024", [2024, 12, 25]],
];

for (const [query, date, unit = "auto"] of questions) {
  test(query, () => {
    const parsed = parse(query);
    assert.ok(parsed?.target?.date, "known holiday must resolve");
    assert.deepEqual(civil(parsed.target), date);
    assert.equal(parsed.requestedUnit, unit);
    assert.equal(time.trigger(query), false, "must not also show Time");
    assert.equal(places.trigger(query), false, "must not also show Places");
  });
}

for (const query of [
  "when was Christmas invented", "when was Ganesh Chaturthi first celebrated",
  "when did Christmas start being celebrated", "how long ago was Christmas invented",
  "when did Christmas shopping begin", "when is Easter celebrated in movies",
  "when does Easter fall in popularity", "when will Christmas be cancelled",
  "when did Diwali happen in this movie", "when was Christmas in Rome",
  "when was Rome founded", "when did Rome fall", "when is my package arriving",
  "when was July 6 mentioned", "how long ago was this photo taken",
  "when will the next train be", "when was Ganesh Chaturthi in India recipes",
  "when was Christmas 2024 last year", "time in Rome",
]) test(`reject unrelated question: ${query}`, () => assert.equal(parse(query), null));

test("relative years and explicit countries preserve the chosen calendar", () => {
  const parsed = parse("when was Thanksgiving last year in Canada", { calendar: "US" });
  assert.deepEqual(civil(parsed.target), [2025, 10, 13]);
  assert.equal(parsed.target.calendar.split(".")[0], "CA");
  assert.equal(parsed.target.explicitYear, true);
  assert.deepEqual(civil(parse("when was Thanksgiving", { calendar: "CA" }).target), [2025, 10, 13]);
});

test("past and future occurrences work across New Year and on the holiday itself", () => {
  const january = new Date(2027, 0, 1, 12);
  assert.deepEqual(civil(parse("when was Christmas", { now: january }).target), [2026, 12, 25]);
  assert.deepEqual(civil(parse("when is Christmas", { now: january }).target), [2027, 12, 25]);
  assert.deepEqual(civil(parse("when was Ganesh Chaturthi", { now: new Date(2026, 8, 14, 12) }).target), [2026, 9, 14]);
});

test("missing historical dates stay unavailable, without falling forward to next year's festival", () => {
  for (const query of ["when was Ganesh Chaturthi in India 2025", "when was Ganesh Chaturthi last year", "what date was Diwali", "when was Hanukkah 1969"]) {
    assert.equal(parse(query).target.unavailable, true, query);
  }
});

test("past questions render elapsed time, while future questions render countdowns", async t => {
  t.mock.timers.enable({ apis: ["Date"], now });
  until.configure({ topUnits: "4", holidayCalendar: "US" });
  t.after(() => until.configure({ topUnits: "2", holidayCalendar: "US" }));
  const past = await until.execute("when was ganesh chaturthi", { tab: "all" });
  assert.match(past.html, /until-card--past/);
  assert.match(past.html, /plugin-until.since/);
  assert.match(past.html, /plugin-until.ago/);
  assert.match(past.html, /2026-09-14T/);
  assert.match(past.html, /data-until-top-units="4"/);
  const future = await until.execute("when will Christmas be next year", { tab: "all" });
  assert.match(future.html, /until-card--future/);
  assert.match(future.html, /2027-12-25T/);
  assert.match(future.html, /plugin-until.fromNow/);
  const missing = await until.execute("when was Ganesh Chaturthi last year", { tab: "all" });
  assert.match(missing.html, /no date has been guessed/);
  assert.doesNotMatch(missing.html, /next occurrence|data-until-target/);
});
