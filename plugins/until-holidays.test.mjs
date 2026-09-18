import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import until, { parseUntilQuery } from "./until/index.js";
import time from "./time/index.js";
import places from "./osm-slot/index.js";
import { calendars, names } from "./until/vendor/date-holidays/catalog.mjs";

const now = new Date(2026, 8, 18, 12);
const parse = (query, options = {}) => parseUntilQuery(query, { now, ...options });
const civil = target => [target.date.getFullYear(), target.date.getMonth() + 1, target.date.getDate()];

for (const [query, expected] of [
  ["whens christmas", [2026, 12, 25]], ["when is christmas", [2026, 12, 25]],
  ["when’s Christmas?", [2026, 12, 25]], ["what date is Christmas", [2026, 12, 25]],
  ["how long to easter", [2027, 3, 28]], ["how many days left before Easter", [2027, 3, 28]],
  ["diwali", [2026, 11, 8]], ["boxing day", [2026, 12, 26]],
  ["ganesh chaturti", [2027, 9, 4]], ["days to arbor day", [2027, 4, 30]],
  ["time to hannukah", [2026, 12, 4]], ["days since easter", [2026, 4, 5]],
  ["when is Easter 2028", [2028, 4, 16]], ["Orthodox Easter 2026", [2026, 4, 12]],
  ["Thanksgiving in Canada 2026", [2026, 10, 12]],
  ["Thanksgiving 2026 in Canada", [2026, 10, 12]],
  ["Thanksgiving 2026", [2026, 11, 26]],
  ["Independence Day in India 2026", [2026, 8, 15]],
  ["Independence Day 2026", [2026, 7, 4]], // Not the substitute day, July 3.
  ["Diwali in India 2027", [2027, 10, 29]],
  ["Ganesh Chaturthi in Mauritius 2026", [2026, 9, 15]],
  ["Pongal in India 2026", [2026, 1, 14]], ["Makar Sankranti in India 2026", [2026, 1, 14]],
  ["Holi in India 2027", [2027, 3, 23]], ["Raksha Bandhan in India 2027", [2027, 8, 17]],
  ["Onam", [2027, 9, 12]], ["Pongal", [2027, 1, 15]],
  ["Gudi Padwa", [2027, 4, 7]], ["days to Baisakhi", [2027, 4, 14]],
  ["Guru Nanak Jayanti", [2026, 11, 24]], ["Day of the Dead", [2026, 11, 1]],
]) test(query, () => assert.deepEqual(civil(parse(query).target), expected));

for (const query of ["time in rome", "Christmas recipes", "Diwali photos", "when is Christmas celebrated in movies", "days to Christmas shopping", "until July 6 recipes", "when is my package arriving", "Ganesh Chaturthi history", "a".repeat(1000), "__proto__", "toString"]) {
  test(`does not steal ${query.slice(0, 60)}`, () => assert.equal(parse(query), null));
}

test("broad catalog is bundled and supports multiple world traditions", () => {
  assert.equal(Object.keys(calendars).filter(id => !id.includes(".")).length, 206);
  assert.ok(Object.keys(names).length > 3000);
  for (const query of ["Juneteenth", "Purim", "Passover", "Yom Kippur", "Rosh Hashanah", "Sukkot", "Sigd", "Vesak", "Lunar New Year", "Qingming Festival", "Bastille Day", "Canada Day", "Waitangi Day", "Day of the Dead", "Holi", "Onam", "Guru Nanak's Birthday", "Nowruz"]) {
    assert.ok(parse(query)?.target, query);
  }
});

test("calendar setting disambiguates names and explicit country wins", () => {
  assert.deepEqual(civil(parse("Thanksgiving 2026", { calendar: "CA" }).target), [2026, 10, 12]);
  assert.deepEqual(civil(parse("Thanksgiving in US 2026", { calendar: "CA" }).target), [2026, 11, 26]);
  assert.equal(parse("Christmas").target.calendar, "US");
});

test("missing regional/year data does not invent a date or silently change region", async () => {
  for (const q of ["Diwali in India 2040", "Ganesh Chaturthi in India 2040", "Hanukkah 2200", "Arbor Day in Japan 2026"]) {
    assert.equal(parse(q)?.target?.unavailable, true, q);
    assert.match((await until.execute(q, { tab: "all" })).html, /no date has been guessed/);
  }
});

test("holiday day itself stays in this year instead of jumping to next year at midnight", () => {
  assert.deepEqual(civil(parse("Christmas", { now: new Date(2026, 11, 25, 15) }).target), [2026, 12, 25]);
});

test("Time and Places yield to holiday queries but Rome still works", () => {
  for (const q of ["time to hannukah", "Hanukkah time", "time in Hanukkah", "whens christmas", "diwali", "days to arbor day", "Ganesh Chaturthi", "Diwali in India"]) {
    assert.equal(time.trigger(q), false, `Time: ${q}`);
    assert.equal(places.trigger(q), false, `Places: ${q}`);
  }
  assert.equal(time.trigger("time in rome"), true);
  assert.equal(time.trigger("Rome time"), true);
  assert.equal(time.trigger("time in Christmas Island"), true);
});

test("existing absolute dates and commands remain supported", () => {
  for (const q of ["years until 3000", "days until July 6th, 2033", "weeks until tomorrow", "!until 5pm", "days since 2020-01-01"]) {
    assert.ok(parse(q, { allowTargetOnly: q.startsWith("!") })?.target?.date, q);
  }
});

test("custom settings and all template placeholders remain intact", async () => {
  until.init({ template: await readFile(new URL("./until/template.html", import.meta.url), "utf8") });
  until.configure({ topUnits: "4", holidayCalendar: "IN" });
  const rendered = await until.execute("when is diwali", { tab: "all" });
  assert.match(rendered.html, /India/);
  assert.match(rendered.html, /data-until-top-units="4"/);
  assert.doesNotMatch(rendered.html, /\{\{holiday_note\}\}/);
  assert.match((await until.execute("Hanukkah", { tab: "all" })).html, /local sunset/);
  assert.deepEqual((await until.execute("Diwali", { tab: "images" })), { title: "", html: "" });
  until.configure({ topUnits: "2", holidayCalendar: "US" });
});
