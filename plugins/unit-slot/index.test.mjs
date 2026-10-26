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
    ["15 gb to mb", "GB", "MB", "15,000.00"],
    ["15 GB to MB", "GB", "MB", "15,000.00"],
    ["15 GiB to MiB", "GiB", "MiB", "15,360.00"],
    ["1 gib to mib", "GiB", "MiB", "1,024.00"],
    ["1 GB to GiB", "GB", "GiB", "0.931323"],
    ["1 GB to Gb", "GB", "Gb", "8.0000"],
    ["8 Mb to MB", "Mb", "MB", "1.0000"],
    ["8 b to B", "b", "B", "1.0000"],
    ["1 kb to bytes", "KB", "B", "1,000.00"],
    ["1 kB to bits", "KB", "b", "8,000.00"],
    ["1 gibibit to mebibits", "Gib", "Mib", "1,024.00"],
    ["1GBtoGb", "GB", "Gb", "8.0000"],
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
    ["100 Mbps to MB/s", "Mb/s", "MB/s", "12.5000"],
    ["100 mbps to MB/s", "Mb/s", "MB/s", "12.5000"],
    ["100 MBps to Mbps", "MB/s", "Mb/s", "800.0000"],
    ["100 mBps to Mbps", "MB/s", "Mb/s", "800.0000"],
    ["100 MBPS to Mbps", "MB/s", "Mb/s", "800.0000"],
    ["100MB/s to Mbps", "MB/s", "Mb/s", "800.0000"],
    ["100MB/stoMb/s", "MB/s", "Mb/s", "800.0000"],
    ["1 GiB/s to MiB/s", "GiB/s", "MiB/s", "1,024.00"],
    ["1 Gibps to MiB/s", "Gib/s", "MiB/s", "128.0000"],
    ["100 megabits per second to megabytes per second", "Mb/s", "MB/s", "12.5000"],
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
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
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
    ["16,093 meters to mi", "m", "mi", "9.9997"],
    ["12 ft to mi", "ft", "mi", "0.002273"],
  ];

  for (const [query, from, to, result] of cases) {
    assert.equal(slot.trigger(query), true, query);
    const output = await slot.execute(query, { tab: "all" });
    assert.match(output.html, new RegExp(`data-from="${from}"`), query);
    assert.match(output.html, new RegExp(`data-to="${to}"`), query);
    assert.match(output.html, new RegExp(`data-result="${result}"`), query);
  }
});
