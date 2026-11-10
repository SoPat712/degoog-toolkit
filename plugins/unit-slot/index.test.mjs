import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { slot } from "./index.js";
import convert from "./convert-units.js";

await slot.init({
  template:
    '<div data-from="{{from_code}}" data-to="{{to_code}}" data-result="{{result}}"></div>',
});

test("storage queries distinguish decimal, binary, bits, and lowercase byte shorthand", async () => {
  const cases = [
    ["15 gb to mb", "GB", "MB", "15,000"],
    ["15 GB to MB", "GB", "MB", "15,000"],
    ["15 GiB to MiB", "GiB", "MiB", "15,360"],
    ["1 gib to mib", "GiB", "MiB", "1,024"],
    ["1 GB to GiB", "GB", "GiB", "0.931323"],
    ["1 GB to Gb", "GB", "Gb", "8"],
    ["8 Mb to MB", "Mb", "MB", "1"],
    ["8 b to B", "b", "B", "1"],
    ["1 kb to bytes", "KB", "B", "1,000"],
    ["1 kB to bits", "KB", "b", "8,000"],
    ["1 gibibit to mebibits", "Gib", "Mib", "1,024"],
    ["1GBtoGb", "GB", "Gb", "8"],
  ];
  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.ok(output.html.includes(`data-from="${from}"`), `${query}: source`);
    assert.ok(output.html.includes(`data-to="${to}"`), `${query}: target`);
    assert.ok(output.html.includes(`data-result="${result}"`), `${query}: ${output.html}`);
  }
});

test("data rates preserve bit/byte case and support binary rates and full names", async () => {
  const cases = [
    ["100 Mbps to MB/s", "Mb/s", "MB/s", "12.5"],
    ["100 mbps to MB/s", "Mb/s", "MB/s", "12.5"],
    ["100 MBps to Mbps", "MB/s", "Mb/s", "800"],
    ["100 mBps to Mbps", "MB/s", "Mb/s", "800"],
    ["100 MBPS to Mbps", "MB/s", "Mb/s", "800"],
    ["100MB/s to Mbps", "MB/s", "Mb/s", "800"],
    ["100MB/stoMb/s", "MB/s", "Mb/s", "800"],
    ["1 GiB/s to MiB/s", "GiB/s", "MiB/s", "1,024"],
    ["1 Gibps to MiB/s", "Gib/s", "MiB/s", "128"],
    ["100 megabits per second to megabytes per second", "Mb/s", "MB/s", "12.5"],
    ["1 bps to GB/s", "b/s", "GB/s", "1.25e-10"],
  ];
  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.ok(output.html.includes(`data-from="${from}"`), `${query}: source`);
    assert.ok(output.html.includes(`data-to="${to}"`), `${query}: target`);
    assert.ok(output.html.includes(`data-result="${result}"`), `${query}: ${output.html}`);
  }
  assert.equal(slot.trigger("100 Mbps to MB"), false);
  assert.equal(slot.trigger("internet speed 100 Mbps"), false);
});

test("browser and server conversion engines agree for every digital unit pair", async () => {
  const source = await readFile(new URL("./card.js", import.meta.url), "utf8");
  const context = vm.createContext({});
  const runtimeStart = source.indexOf("(function () {\n  var convert =");
  assert.ok(runtimeStart > 0);
  vm.runInContext(source.slice(0, runtimeStart), context);
  const browserConvert = context.convertUnits;
  for (const measure of ["digital", "dataRate"]) {
    const codes = convert().possibilities(measure);
    assert.deepEqual(Array.from(browserConvert().possibilities(measure)), codes);
    for (const from of codes) for (const to of codes) {
      const expected = convert(15).from(from).to(to);
      assert.equal(browserConvert(15).from(from).to(to), expected, `${from} → ${to}`);
    }
  }
  assert.equal(convert(1).from("GB").to("B"), 1e9);
  assert.equal(convert(1).from("GiB").to("B"), 2 ** 30);
  assert.equal(convert(100).from("Mb/s").to("MB/s"), 12.5);
});

test("loads and renders standard unit conversions", async () => {
  assert.equal(slot.trigger("100 lb to kg"), true);

  const output = await slot.execute("100 lb to kg", {
    tab: "all",
  });

  assert.match(output.html, /data-from="lb"/);
  assert.match(output.html, /data-to="kg"/);
  assert.equal(output.title, "");
});

test("renders on main slot path by default (above-results)", async () => {
  assert.equal(slot.trigger("12 ft to in"), true);
  const output = await slot.execute("12 ft to in", { tab: "all" });
  assert.match(output.html, /data-from="ft"/);
  assert.match(output.html, /data-to="in"/);
});

test("opens a default conversion for launcher queries", async () => {
  for (const query of ["unit converter", "convert units", "!unit"]) {
    assert.equal(slot.trigger(query), true);
    const output = await slot.execute(query, { tab: "all" });
    assert.match(output.html, /data-from="m"/);
    assert.match(output.html, /data-to="ft"/);
  }
});

test("renders comma-formatted and small length conversions", async () => {
  const cases = [
    ["16,093 meters to mi", "m", "mi", "9.99973"],
    ["12 ft to mi", "ft", "mi", "0.00227273"],
  ];

  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.match(output.html, new RegExp(`data-from="${from}"`), query);
    assert.match(output.html, new RegExp(`data-to="${to}"`), query);
    assert.match(output.html, new RegExp(`data-result="${result}"`), query);
  }
});

async function assertConversion(query, from, to, result) {
  assert.equal(slot.trigger(query), true, query);
  const output = await slot.execute(query, { tab: "all" });
  assert.ok(output.html.includes(`data-from="${from}"`), `${query}: source ${output.html}`);
  assert.ok(output.html.includes(`data-to="${to}"`), `${query}: target ${output.html}`);
  assert.ok(output.html.includes(`data-result="${result}"`), `${query}: ${output.html}`);
}

test("parses fractions, mixed numbers, leading decimals, and decimal commas", async () => {
  const cases = [
    ["1/2 cup to ml", "cup", "ml", "118.294"],
    ["3/4 cup to ml", "cup", "ml", "177.441"],
    ["1 1/2 cups to ml", "cup", "ml", "354.882"],
    ["2 1/4 inch to mm", "in", "mm", "57.15"],
    [".5 kg to lb", "kg", "lb", "1.10231"],
    ["1,5 kg to lb", "kg", "lb", "3.30693"],
    ["1,000 m to km", "m", "km", "1"],
    ["1 000 m to km", "m", "km", "1"],
    ["1,500 kg to lb", "kg", "lb", "3,306.93"],
  ];
  for (const [query, from, to, result] of cases) await assertConversion(query, from, to, result);
  assert.equal(slot.trigger("1.000,50 kg to lb"), false);
  assert.equal(slot.trigger("1/0 cup to ml"), false);
});

test("digits glued to a unit stay part of the unit", async () => {
  await assertConversion("m2 to ft2", "m2", "ft2", "10.7639");
  await assertConversion("m3 to l", "m3", "l", "1,000");
});

test("micro prefixes written with µ or μ keep their scale", async () => {
  await assertConversion("500 µg to mg", "mcg", "mg", "0.5");
  await assertConversion("500 μg to mg", "mcg", "mg", "0.5");
  await assertConversion("5 ug to mg", "mcg", "mg", "0.005");
  await assertConversion("500 µs to ms", "mu", "ms", "0.5");
  // The bundled library has no micrometre, so refuse instead of using metres.
  assert.equal(slot.trigger("1 μm to mm"), false);
});

test("fluid ounces are not split into fragments or collapsed into themselves", async () => {
  await assertConversion("1 fl oz to ml", "fl-oz", "ml", "29.5735");
  await assertConversion("8 fl oz to cups", "fl-oz", "cup", "1");
  await assertConversion("2 fluid ounces to ml", "fl-oz", "ml", "59.1471");
  await assertConversion("12 oz to ml", "fl-oz", "ml", "354.882");
});

test("how many A in B converts one B into A", async () => {
  const cases = [
    ["how many feet in a mile", "mi", "ft", "5,280"],
    ["how many ounces in a pound", "lb", "oz", "16"],
    ["how many cups in a gallon", "gal", "cup", "16"],
    ["how many days in a year", "year", "d", "365.25"],
    ["how many feet are there in a mile?", "mi", "ft", "5,280"],
    ["how many feet in 3 miles", "mi", "ft", "15,840"],
    ["how many ml in 2 cups", "cup", "ml", "473.176"],
  ];
  for (const [query, from, to, result] of cases) await assertConversion(query, from, to, result);
  assert.equal(slot.trigger("how many people in a room"), false);
  assert.equal(slot.trigger("how many calories in a cup of rice"), false);
});

test("qualified units map to the right unit or refuse", async () => {
  await assertConversion("1 metric ton to kg", "mt", "kg", "1,000");
  await assertConversion("1 t to kg", "mt", "kg", "1,000");
  await assertConversion("1 tonne to kg", "mt", "kg", "1,000");
  await assertConversion("1 ton to kg", "t", "kg", "907.185");
  await assertConversion("1 short ton to kg", "t", "kg", "907.185");
  for (const query of [
    "1 nautical mile to km",
    "1 imperial gallon to l",
    "1 uk pint to ml",
    "1 long ton to kg",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("everyday plural and short unit spellings resolve", async () => {
  const cases = [
    ["460 kg to lbs", "kg", "lb", "1,014.13"],
    ["460 lbs to kg", "lb", "kg", "208.652"],
    ["5 hrs to min", "h", "min", "300"],
    ["5 gals to l", "gal", "l", "18.9271"],
    ["5 qts to l", "qt", "l", "4.73176"],
    ["2 pt to cups", "pnt", "cup", "4"],
    ["5 tbsp to ml", "Tbs", "ml", "73.9338"],
    ["5 kms to mi", "km", "mi", "3.10686"],
  ];
  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.ok(output.html.includes(`data-from="${from}"`), `${query}: source`);
    assert.ok(output.html.includes(`data-to="${to}"`), `${query}: target`);
    assert.ok(output.html.includes(`data-result="${result}"`), `${query}: ${output.html}`);
  }
});

test("metric and imperial units convert with their exact definitions", () => {
  const close = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-12, `${actual} != ${expected}`);
  close(convert(5).from("mi").to("mm"), 8046720);
  close(convert(1).from("ft").to("m"), 0.3048);
  close(convert(1).from("ft2").to("m2"), 0.09290304);
  close(convert(1).from("lb").to("kg"), 0.45359237);
  close(convert(1).from("fl-oz").to("ml"), 29.5735295625);
  close(convert(1).from("gal").to("l"), 3.785411784);
  close(convert(1).from("psi").to("Pa"), 6894.757293168);
});

test("the browser copy of the converter uses the same factors", async () => {
  const ratios = (source) => [...source.matchAll(/ratio: ([^,\n}]+)/g)].map((m) => m[1].trim());
  const server = await readFile(new URL("./convert-units.js", import.meta.url), "utf8");
  const client = await readFile(new URL("./card.js", import.meta.url), "utf8");
  assert.deepEqual(ratios(client), ratios(server));
});

test("the answer, equation and amount share one number style and readable symbols", async () => {
  await slot.init({ template: await readFile(new URL("./template.html", import.meta.url), "utf8") });
  let output = await slot.execute("1234567890 bytes to gb", { tab: "all" });
  assert.match(output.html, /value="1,234,567,890" style="--uxs-amount-chars: 13"/);
  assert.match(output.html, /<output[^>]*>1\.23457<\/output>/);
  assert.match(output.html, /1,234,567,890 B = 1\.23457 GB/);
  assert.doesNotMatch(output.html, /e9/);

  output = await slot.execute("100 f to c", { tab: "all" });
  assert.match(output.html, /100 °F = 37\.7778 °C/);
  assert.match(output.html, /data-selected="F"/);

  output = await slot.execute("2 metric tons to kg", { tab: "all" });
  assert.match(output.html, /2 t = 2,000 kg/);
  assert.match(output.html, /data-selected="mt"/);

  const [css, client] = await Promise.all(
    ["style.css", "card.js"].map((file) => readFile(new URL(`./${file}`, import.meta.url), "utf8")),
  );
  assert.match(css, /\.uxs-unit-select \{[^}]*border-radius: var\(--theme-radius-pill, 999px\)/s);
  assert.match(client, /var UNIT_SYMBOLS = \{ C: "°C", F: "°F", R: "°R", mt: "t", t: "ton" \}/);
  assert.doesNotMatch(client, /compactNumber/);
});
