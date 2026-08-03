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
