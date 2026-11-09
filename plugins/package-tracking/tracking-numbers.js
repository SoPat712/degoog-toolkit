/**
 * Offline tracking-number recognition. Every numeric format is confirmed by the
 * carrier's own check digit, so overlapping lengths resolve without a network call.
 */

const UNIVERSAL_TRACKER = "17TRACK";
const universalUrl = (number) => `https://t.17track.net/en#nums=${encodeURIComponent(number)}`;

export const CARRIERS = Object.freeze({
  ups: { name: "UPS", url: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  usps: { name: "USPS", url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}` },
  fedex: { name: "FedEx", url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  dhl: {
    name: "DHL Express",
    url: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  },
  amazon: { name: "Amazon Logistics", url: (n) => `https://track.amazon.com/tracking/${encodeURIComponent(n)}` },
  royalmail: { name: "Royal Mail", url: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}` },
  canadapost: {
    name: "Canada Post",
    url: (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(n)}`,
  },
  auspost: { name: "Australia Post", url: (n) => `https://auspost.com.au/mypost/track/details/${encodeURIComponent(n)}` },
  deutschepost: {
    name: "Deutsche Post",
    url: (n) => `https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode=${encodeURIComponent(n)}`,
  },
  laposte: { name: "La Poste", url: (n) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(n)}` },
  japanpost: {
    name: "Japan Post",
    url: (n) => `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(n)}&locale=en`,
  },
});

// S10 numbers end in the ISO country of the posting operator.
const S10_OPERATORS = { US: "usps", GB: "royalmail", CA: "canadapost", AU: "auspost", DE: "deutschepost", FR: "laposte", JP: "japanpost" };
const ISO_COUNTRIES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW " +
  "BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI " +
  "FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN " +
  "IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME " +
  "MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF " +
  "PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV " +
  "SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE " +
  "YT ZA ZM ZW"
).split(" "));

// Words that may surround a number: "track 1Z…", "usps tracking 9400…", "#9400…".
const CONTEXT_WORDS = new Set([
  "a", "amazon", "awb", "check", "dhl", "express", "fedex", "find", "for", "is", "my", "no", "number",
  "num", "of", "order", "package", "parcel", "shipment", "status", "the", "trace", "track", "tracking",
  "ups", "usps", "waybill", "where",
]);
// Words that make a short, weakly checked number a tracking query.
const INTENT_WORDS = new Set([
  "amazon", "awb", "dhl", "fedex", "package", "parcel", "shipment", "trace", "track", "tracking", "ups",
  "usps", "waybill",
]);

const digitsOf = (value) => [...value].map(Number);

/** GS1 mod-10: weight 3 on the digit next to the check digit, alternating 3/1 leftward. */
export function gs1CheckDigit(body) {
  let sum = 0;
  const digits = digitsOf(body);
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) sum += digits[i] * weight;
  return (10 - (sum % 10)) % 10;
}

const gs1Valid = (number) => gs1CheckDigit(number.slice(0, -1)) === Number(number.at(-1));

/** UPS 1Z: letters map to (code - 3) mod 10; odd positions after "1Z" count double. */
export function upsValid(number) {
  if (!/^1Z[0-9A-Z]{15}[0-9]$/.test(number)) return false;
  let sum = 0;
  [...number.slice(2, 17)].forEach((char, index) => {
    const value = /\d/.test(char) ? Number(char) : (char.charCodeAt(0) - 3) % 10;
    sum += index % 2 ? value * 2 : value;
  });
  return (10 - (sum % 10)) % 10 === Number(number[17]);
}

/** FedEx Express 12: weights 3,1,7 from the left, mod 11, then mod 10. */
export function fedexExpressValid(number) {
  if (!/^\d{12}$/.test(number)) return false;
  const weights = [3, 1, 7];
  const sum = digitsOf(number.slice(0, 11)).reduce((total, digit, i) => total + digit * weights[i % 3], 0);
  return (sum % 11) % 10 === Number(number[11]);
}

/** DHL Express waybill: the serial modulo 7 is the check digit. */
export function dhlExpressValid(number) {
  if (!/^\d{10,11}$/.test(number)) return false;
  return Number(BigInt(number.slice(0, -1)) % 7n) === Number(number.at(-1));
}

/** UPU S10: weights 8,6,4,2,3,5,9,7, mod 11 (10 becomes 0, 11 becomes 5). */
export function s10Valid(number) {
  const match = number.match(/^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/);
  if (!match || !ISO_COUNTRIES.has(match[4])) return false;
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = digitsOf(match[2]).reduce((total, digit, i) => total + digit * weights[i], 0);
  const check = 11 - (sum % 11);
  return (check === 10 ? 0 : check === 11 ? 5 : check) === Number(match[3]);
}

export function luhnValid(number) {
  let sum = 0;
  digitsOf(number).reverse().forEach((digit, i) => {
    const value = i % 2 ? digit * 2 : digit;
    sum += value > 9 ? value - 9 : value;
  });
  return sum % 10 === 0;
}

// Repeated or counting digits are placeholders, not labels: 000000000000, 123456789012.
function isPatterned(number) {
  if (!/^\d+$/.test(number)) return false;
  if (/^(\d)\1+$/.test(number)) return true;
  const steps = new Set();
  for (let i = 1; i < number.length; i++) steps.add((Number(number[i]) - Number(number[i - 1]) + 10) % 10);
  return steps.size === 1 && (steps.has(1) || steps.has(9));
}

/** USPS IMpb and Delivery Confirmation numbers, with or without a 420+ZIP routing prefix. */
function uspsNumber(number) {
  const bodies = [number];
  if (number.startsWith("420")) {
    if (number.length === 30 || number.length === 34) bodies.push(number.slice(8));
    if (number.length === 34) bodies.push(number.slice(12));
  }
  for (const body of bodies) {
    if ((body.length === 22 || body.length === 26) && /^9[1-5]/.test(body) && gs1Valid(body)) return body;
    // 20-digit Delivery Confirmation numbers, printed with or without the 91 identifier.
    if (body.length === 20 && (gs1Valid(body) || gs1Valid(`91${body}`))) return body;
  }
  return "";
}

function match(carrier, number, format) {
  return { carrier, name: CARRIERS[carrier].name, number, format, url: CARRIERS[carrier].url(number) };
}

/**
 * Carriers whose format and check digit accept `number` (uppercase, no separators).
 * Short all-digit formats need `intent` (a "track"/carrier word) because their
 * check digits pass for roughly one random number in ten; DHL's ten digits also
 * need `words` to name DHL, since "track 212-555-1234" is a phone lookup.
 */
export function detectCarriers(number, { intent = false, words = new Set() } = {}) {
  if (!/^[0-9A-Z]{10,34}$/.test(number) || !/\d/.test(number)) return [];

  if (number.startsWith("1Z")) return upsValid(number) ? [match("ups", number, "ups")] : [];
  if (/^TB[ACM]\d{12}$/.test(number)) return [match("amazon", number, "amazon")];
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(number)) {
    if (!s10Valid(number)) return [];
    const operator = S10_OPERATORS[number.slice(-2)];
    return [operator
      ? match(operator, number, "s10")
      : { carrier: "post", name: "", country: number.slice(-2), number, format: "s10", url: "" }];
  }
  if (!/^\d+$/.test(number) || isPatterned(number)) return [];

  const found = [];
  const usps = uspsNumber(number);
  if (usps) {
    found.push(match("usps", number, "usps"));
    // 92-prefixed IMpb labels are also issued by FedEx Ground Economy and UPS Mail Innovations.
    if (usps.startsWith("92")) found.push(match("fedex", number, "fedex-economy"), match("ups", number, "ups-mi"));
  }
  if (number.length === 22 && number.startsWith("96") && gs1Valid(number.slice(-15))) {
    found.push(match("fedex", number, "fedex-ground-96"));
  }
  // A 12-digit number that is also a valid UPC-A barcode needs a "track" word.
  if (fedexExpressValid(number) && (intent || !gs1Valid(number))) found.push(match("fedex", number, "fedex-express"));
  // A 15-digit number that passes Luhn is more likely an IMEI.
  if (number.length === 15 && gs1Valid(number) && (intent || !luhnValid(number))) {
    found.push(match("fedex", number, "fedex-ground"));
  }
  // Ten- and eleven-digit waybills look like phone numbers unless the query names DHL.
  if (DHL_WORDS.some((word) => words.has(word)) && dhlExpressValid(number)) {
    found.push(match("dhl", number, "dhl-express"));
  }
  return found;
}

const DHL_WORDS = ["awb", "dhl", "waybill"];
const CARRIER_WORDS = { amazon: "amazon", dhl: "dhl", fedex: "fedex", ups: "ups", usps: "usps" };

/** Format for reading: UPS 1Z 999 AA1 01 2345 6784, S10 RB 123 456 785 GB, others in groups of four. */
export function formatTrackingNumber(number) {
  if (/^1Z[0-9A-Z]{16}$/.test(number)) {
    return [number.slice(0, 2), number.slice(2, 5), number.slice(5, 8), number.slice(8, 10), number.slice(10, 14), number.slice(14)].join(" ");
  }
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(number)) {
    return [number.slice(0, 2), number.slice(2, 5), number.slice(5, 8), number.slice(8, 11), number.slice(11)].join(" ");
  }
  const prefix = number.match(/^[A-Z]+/)?.[0] || "";
  const groups = number.slice(prefix.length).match(/\d{1,4}/g) || [];
  return [prefix, ...groups].filter(Boolean).join(" ");
}

/**
 * Parse "1Z…", "track 9400 1112 …", "fedex tracking 986578788855" into
 * { number, carriers, intent }, or null. Anything besides context words around
 * the number, or phone punctuation, rejects the query.
 */
export function parseTrackingQuery(value) {
  const raw = String(value || "").trim().replace(/[.?!]+$/, "");
  if (raw.length < 10 || raw.length > 120) return null;
  // Dots mean decimals, phone numbers ("212.555.1234") or domains, never a label.
  if (/[^\p{L}\p{N}\s#:,?-]/u.test(raw)) return null;

  const tokens = raw.replace(/[#:,?]/g, " ").split(/\s+/).filter(Boolean);
  const isContext = (token) => CONTEXT_WORDS.has(token.toLowerCase());
  let start = 0;
  let end = tokens.length;
  while (start < end && isContext(tokens[start])) start++;
  while (end > start && isContext(tokens[end - 1])) end--;
  const words = [...tokens.slice(0, start), ...tokens.slice(end)].map((token) => token.toLowerCase());
  const parts = tokens.slice(start, end);
  if (!parts.length || parts.some((part) => !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(part))) return null;

  const number = parts.join("").replace(/-/g, "").toUpperCase();
  if (!/^[0-9A-Z]+$/.test(number)) return null;
  const intent = words.some((word) => INTENT_WORDS.has(word));
  const named = new Set(words.map((word) => CARRIER_WORDS[word]).filter(Boolean));
  // A carrier the query names goes first when the number allows it: "fedex 9261…".
  const carriers = detectCarriers(number, { intent, words: new Set(words) })
    .map((carrier, index) => ({ carrier, rank: named.has(carrier.carrier) ? -1 : index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ carrier }) => carrier);
  return carriers.length ? { number, carriers, intent } : null;
}

export { UNIVERSAL_TRACKER, universalUrl };
