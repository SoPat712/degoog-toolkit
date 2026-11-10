import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCurrencyAliasIndex,
  extractCurrencyCodes,
  parseCurrencyQuery,
} from "./currency-aliases.js";

const CURRENCIES = {
  USD: "United States Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  CNY: "Chinese Renminbi Yuan",
  RUB: "Russian Ruble",
};

const INDEX = buildCurrencyAliasIndex(CURRENCIES);
const CODES = Object.keys(CURRENCIES);
const AMBIGUOUS = new Set(["ALL", "TRY", "MAD", "TOP"]);

test("parses named currency conversions", () => {
  const cases = [
    ["12 japanese yen to usd", 12, "JPY", "USD"],
    ["100 us dollars to eur", 100, "USD", "EUR"],
    ["50 chinese yuan to usd", 50, "CNY", "USD"],
    ["1000 russian ruble to gbp", 1000, "RUB", "GBP"],
    ["25 british pounds to japanese yen", 25, "GBP", "JPY"],
    ["100 usd to eur", 100, "USD", "EUR"],
  ];

  for (const [query, amount, from, to] of cases) {
    const parsed = parseCurrencyQuery(query, INDEX, {
      validCodes: CODES,
      ambiguousWordCodes: AMBIGUOUS,
    });
    assert.equal(parsed.amount, amount, query);
    assert.equal(parsed.from, from, query);
    assert.equal(parsed.to, to, query);
  }
});

test("prefers longer named aliases over ambiguous unit words", () => {
  const codes = extractCurrencyCodes("12 japanese yen to us dollars", INDEX, {
    validCodes: CODES,
  });
  assert.deepEqual(codes, ["JPY", "USD"]);
});

test("does not treat bare yen as a currency without a qualifier", () => {
  const parsed = parseCurrencyQuery("12 yen to usd", INDEX, {
    validCodes: CODES,
    ambiguousWordCodes: AMBIGUOUS,
  });
  assert.equal(parsed.from, null);
  assert.equal(parsed.to, "USD");
});

test("ambiguous currency codes require uppercase tokens", () => {
  const currencies = { ALL: "Albanian Lek", TRY: "Turkish Lira" };
  const index = buildCurrencyAliasIndex(currencies);
  const options = {
    validCodes: Object.keys(currencies),
    ambiguousWordCodes: new Set(["ALL", "TRY"]),
  };

  assert.deepEqual(extractCurrencyCodes("all to try", index, options), []);
  assert.deepEqual(extractCurrencyCodes("ALL to TRY", index, options), ["ALL", "TRY"]);
  assert.deepEqual(parseCurrencyQuery("ALL to TRY", index, options), {
    amount: 1,
    from: "ALL",
    to: "TRY",
  });
});

import { slot } from "./index.js";

await slot.init({
  template:
    '<div data-from="{{from_code}}" data-to="{{to_code}}" data-amount="{{amount_for_js}}"></div>',
});

test("slot triggers on named currency queries", () => {
  assert.equal(slot.trigger("12 japanese yen to usd"), true);
  assert.equal(slot.trigger("100 us dollars to eur"), true);
});

const parse = (query, codes = CODES) =>
  parseCurrencyQuery(query, INDEX, { validCodes: codes, ambiguousWordCodes: AMBIGUOUS });

test("parses scaled amounts and European grouping", () => {
  const cases = [
    ["1k usd to eur", 1000],
    ["1.5k gbp to usd", 1500],
    ["1 million usd to eur", 1e6],
    ["2.5m usd to eur", 2.5e6],
    ["1 billion jpy to usd", 1e9],
    ["1.000,50 eur to usd", 1000.5],
    ["1,000.50 eur to usd", 1000.5],
    ["1,000 usd to eur", 1000],
    ["1 000 eur to usd", 1000],
    ["1,5 eur to usd", 1.5],
  ];
  for (const [query, amount] of cases) {
    assert.equal(parse(query).amount, amount, query);
  }
});

test("reads currency symbols and bare dollars", () => {
  assert.deepEqual(
    [parse("$100 to eur").amount, parse("$100 to eur").from, parse("$100 to eur").to],
    [100, "USD", "EUR"],
  );
  assert.equal(parse("100$ to eur").from, "USD");
  assert.equal(parse("€50 to usd").from, "EUR");
  assert.equal(parse("£5 in usd").from, "GBP");
  const dollars = parse("100 euros in dollars");
  assert.equal(dollars.from, "EUR");
  assert.equal(dollars.to, "USD");
  // Qualified dollars still win over the bare word.
  const withCad = { ...CURRENCIES, CAD: "Canadian Dollar" };
  const cad = parseCurrencyQuery("100 canadian dollars to eur", buildCurrencyAliasIndex(withCad), {
    validCodes: Object.keys(withCad),
  });
  assert.equal(cad.from, "CAD");
});

test("flags an amount with a single currency as a bare conversion", () => {
  assert.equal(parse("100 usd").bareToken, "usd");
  assert.equal(parse("$100").bareToken, "USD");
  assert.equal(parse("100 usd to eur").bareToken, undefined);
  assert.equal(parse("120$ split 4").bareToken, undefined);
});

test("slot converts bare amounts to the default currency and keeps cross-plugin negatives", async () => {
  const requests = [];
  await slot.init({
    template:
      '<div data-from="{{from_code}}" data-to="{{to_code}}" data-amount="{{amount_for_js}}"></div>',
    fetch: async (url) => {
      requests.push(String(url));
      const parsedUrl = new URL(url);
      const base = parsedUrl.searchParams.get("base");
      const quotes = (parsedUrl.searchParams.get("quotes") || "").split(",");
      return new Response(
        JSON.stringify(quotes.map((quote) => ({ date: "2026-11-06", base, quote, rate: 2 }))),
        { status: 200 },
      );
    },
  });

  for (const query of ["100 euros in dollars", "$100 to eur", "100 usd", "1k usd to eur"]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of ["all to try", "100 all", "100 cup", "100 lb to kg", "translate hello to spanish", "120$ 20% split 4 ways"]) {
    assert.equal(slot.trigger(query), false, query);
  }

  slot.configure({ defaultTo: "GBP" });
  let output = await slot.execute("100 usd", { tab: "all" });
  assert.match(output.html, /data-from="USD" data-to="GBP" data-amount="100"/);
  slot.configure({ defaultTo: "USD" });
  output = await slot.execute("100 usd", { tab: "all" });
  assert.match(output.html, /data-from="USD" data-to="EUR"/);
  output = await slot.execute("1 million usd to eur", { tab: "all" });
  assert.match(output.html, /data-amount="1000000"/);
  assert.ok(requests.length > 0);
});

test("client guards rate races, removes stale listeners, and thins chart labels", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./card.js", import.meta.url), "utf8");
  assert.match(source, /requestId !== rateRequestId/);
  assert.doesNotMatch(source, /await fetchRate\(fromCode, toCode\);\s*if \(newRate/);
  assert.match(source, /document\.removeEventListener\("click", closePickerOnOutsideClick\)/);
  assert.match(source, /"text-anchor": idx === lastIdx \? "end" : "middle"/);
});

test("pounds means sterling only opposite a currency", () => {
  const withGbp = (query) => {
    const parsed = parse(query);
    return [parsed.from, parsed.to];
  };
  assert.deepEqual(withGbp("100 dollars to pounds"), ["USD", "GBP"]);
  assert.deepEqual(withGbp("100 pounds to dollars"), ["GBP", "USD"]);
  assert.deepEqual(withGbp("what is 100 dollars in pounds"), ["USD", "GBP"]);
  assert.deepEqual(withGbp("100 kg to pounds"), [null, null]);
  assert.deepEqual(withGbp("100 pounds to kg"), [null, null]);
  assert.equal(slot.trigger("100 dollars to pounds"), true);
  assert.equal(slot.trigger("100 kg to pounds"), false);
  assert.equal(slot.trigger("460 kg to lbs"), false);
});

test("results read like money and the typed amount is grouped", async () => {
  await slot.init({
    template:
      '<input value="{{amount}}" style="--cxs-len: {{amount_len}}"><div class="r" style="--cxs-len: {{result_len}}">{{result}}</div>',
    fetch: async (url) => {
      const parsedUrl = new URL(url);
      const base = parsedUrl.searchParams.get("base");
      const quotes = (parsedUrl.searchParams.get("quotes") || "").split(",");
      const rate = base === "JPY" ? 0.0063212 : 110.339505171;
      return new Response(
        JSON.stringify(quotes.map((quote) => ({ date: "2026-11-06", base, quote, rate }))),
        { status: 200 },
      );
    },
  });
  let output = await slot.execute("1000000 usd to eur", { tab: "all" });
  assert.match(output.html, /value="1,000,000" style="--cxs-len: 9"/);
  assert.match(output.html, /--cxs-len: 14">110,339,505.17</);
  output = await slot.execute("1 jpy to usd", { tab: "all" });
  assert.match(output.html, />0\.0063</);
  output = await slot.execute("1000 jpy to usd", { tab: "all" });
  assert.match(output.html, />6\.32</);
});

test("the card fits long numbers and keeps the chart at its drawn size", async () => {
  const { readFile } = await import("node:fs/promises");
  const [css, source, template] = await Promise.all(
    ["style.css", "card.js", "template.html"].map((file) =>
      readFile(new URL(`./${file}`, import.meta.url), "utf8"),
    ),
  );
  assert.match(css, /\.cxs-result-line \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.cxs-result \{[^}]*font-size: clamp\([^;]*var\(--cxs-len/s);
  assert.match(css, /\.cxs-chart-svg \{[^}]*height: 212px/s);
  assert.match(css, /\.cxs-quick \{[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/s);
  assert.match(source, /new ResizeObserver\(/);
  assert.match(source, /function fmtAmount\(n, code\)/);
  assert.match(template, /type="text"\s+inputmode="decimal"/);
});
