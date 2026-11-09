import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";
import {
  detectCarriers,
  formatTrackingNumber,
  parseTrackingQuery,
} from "./tracking-numbers.js";

const carriersOf = (query) => parseTrackingQuery(query)?.carriers.map(({ carrier }) => carrier) ?? null;

// Real-format samples whose check digits follow each carrier's published algorithm.
const VALID = [
  ["1Z5R89390357567127", ["ups"]],
  ["1Z879E930346834440", ["ups"]],
  ["1z 410 e7w 03 9275 1591", ["ups"]],
  ["986578788855", ["fedex"]],
  ["4771 7908 1230", ["fedex"]],
  ["0414 4176 0228 964", ["fedex"]],
  ["9611020987654312345672", ["fedex"]],
  ["9400 1112 0620 6406 2607 87", ["usps"]],
  ["9405803699300124287899", ["usps"]],
  ["9505 5110 6960 5048 6006 24", ["usps"]],
  ["0307 1790 0005 2348 3741", ["usps"]],
  ["9101 1234 5678 9000 0000 13", ["usps"]],
  ["7196 9010 7560 0307 7385", ["usps"]],
  ["420787459400111206206406260787", ["usps"]],
  ["dhl 3318810025", ["dhl"]],
  ["DHL tracking 73891051146", ["dhl"]],
  ["RB123456785US", ["usps"]],
  ["RB123456785GB", ["royalmail"]],
  ["EE123456785JP", ["japanpost"]],
  ["TBA123456789012", ["amazon"]],
];

const INVALID_CHECK_DIGITS = [
  "1Z5R89390357567128", "1Z1111111111111111", "996578788855", "0414 4176 0228 965",
  "9611020987654312345673", "9400 1112 0620 6406 2607 88", "0307 1790 0005 2348 3742",
  "9101 1234 5678 9000 0000 14", "7196 9010 7560 0307 7386", "dhl 3318810026",
  "RB123456786US", "RB123456785XX", "TBB123456789012",
];

const ORDINARY = [
  "1234567890", "123456789012", "000000000000", "9999999999", "2024", "3.14159265358979",
  "2125551234", "212-555-1234", "(212) 555-1234", "+1 212 555 1234", "212.555.1234",
  "track 212-555-1234", "track 2125551234", "call 2125551234", "phone 4155552671",
  "036000291452", "4111 1111 1111 1111", "490154203237518", "20240101120000",
  "track my package", "ups tracking", "1Z5R89390357567127 stolen", "usps.com 9400111206206406260787",
  "order 113-4567890-1234567", "isbn 9780140328721", "9780140328721",
];

test("recognizes real-format numbers alone or after track/carrier words", () => {
  for (const [query, carriers] of VALID) assert.deepEqual(carriersOf(query), carriers, query);
  for (const query of ["track 1Z5R89390357567127", "tracking 986578788855", "usps tracking number 9400111206206406260787",
    "where is my package 9400111206206406260787", "fedex 986578788855 status", "#1Z5R89390357567127"]) {
    assert.ok(carriersOf(query)?.length, query);
  }
});

test("rejects wrong check digits", () => {
  for (const query of INVALID_CHECK_DIGITS) assert.equal(parseTrackingQuery(query), null, query);
});

test("ordinary numbers, barcodes, card numbers and phone numbers do not trigger", () => {
  for (const query of ORDINARY) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("short numbers need a carrier or track word, and DHL needs DHL", () => {
  // 3318810025 passes DHL's mod 7, but ten digits alone are a phone number.
  assert.equal(parseTrackingQuery("3318810025"), null);
  assert.equal(parseTrackingQuery("track 3318810025"), null);
  assert.deepEqual(carriersOf("awb 3318810025"), ["dhl"]);
  // 360002914751 is a valid UPC-A barcode and a valid FedEx number.
  assert.deepEqual(detectCarriers("360002914751"), []);
  assert.equal(slot.trigger("360002914751"), false);
  assert.deepEqual(carriersOf("track 360002914751"), ["fedex"]);
});

test("numbers still ambiguous after the checksum list every plausible carrier", () => {
  assert.deepEqual(carriersOf("9261292700768711948021"), ["usps", "fedex", "ups"]);
  assert.deepEqual(carriersOf("fedex 9261292700768711948021"), ["fedex", "usps", "ups"]);
});

test("formats numbers the way carriers print them", () => {
  assert.equal(formatTrackingNumber("1Z5R89390357567127"), "1Z 5R8 939 03 5756 7127");
  assert.equal(formatTrackingNumber("RB123456785GB"), "RB 123 456 785 GB");
  assert.equal(formatTrackingNumber("9400111206206406260787"), "9400 1112 0620 6406 2607 87");
  assert.equal(formatTrackingNumber("TBA123456789012"), "TBA 1234 5678 9012");
});

test("renders a self-contained card with the official and universal links", async () => {
  slot.init({});
  const { title, html } = await slot.execute("track 1Z5R89390357567127", {});
  assert.equal(title, "");
  assert.match(html, /class="pkgtrack-card"/);
  assert.match(html, /pkgtrack-carrier">UPS</);
  assert.match(html, />1Z 5R8 939 03 5756 7127</);
  assert.match(html, /class="pkgtrack-pill pkgtrack-pill-primary" href="https:\/\/www\.ups\.com\/track\?tracknum=1Z5R89390357567127"/);
  assert.match(html, /href="https:\/\/t\.17track\.net\/en#nums=1Z5R89390357567127"/);
  assert.match(html, /\{\{ t:plugin-package-tracking\.trackOn \}\} UPS/);
  assert.match(html, /<button type="button" class="pkgtrack-copy" data-pkgtrack-copy="1Z5R89390357567127"/);
  assert.doesNotMatch(html, /pkgtrack-alternatives/);
});

test("ambiguous and unmapped postal numbers render their alternatives", async () => {
  const ambiguous = (await slot.execute("9261292700768711948021", {})).html;
  assert.match(ambiguous, /pkgtrack-carrier">USPS</);
  assert.match(ambiguous, /pkgtrack-alternatives/);
  assert.match(ambiguous, /fedextrack\/\?trknbr=9261292700768711948021/);
  assert.match(ambiguous, /ups\.com\/track\?tracknum=9261292700768711948021/);

  // China Post has no deep link here, so 17TRACK becomes the primary pill.
  const post = (await slot.execute("RR123456785CN", { locale: "en" })).html;
  assert.match(post, /postalService \}\} · China</);
  assert.match(post, /pkgtrack-pill-primary" href="https:\/\/t\.17track\.net/);
  assert.equal((await slot.execute("hello world", {})).html, "");
});
