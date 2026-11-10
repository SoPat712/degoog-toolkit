import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseNewsQuery, renderPlaceholder, slot } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const runtime = await readFile(new URL("./card.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./card.css", import.meta.url), "utf8");

// card.js keeps story selection as pure functions ahead of its DOM boot;
// swapping the boot call for a hook runs them without a page.
const marker = "\n  boot();\n";
assert.ok(runtime.includes(marker), "card.js boots through a single boot() call");
const sandbox = vm.createContext({ URL });
vm.runInContext(runtime.replace(marker, "\n  globalThis.__stories = stories;\n"), sandbox);
const stories = sandbox.__stories;
// vm objects come from another realm, so compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));

const NOW = Date.parse("2026-11-09T18:00:00Z");
const HOUR = 3_600_000;
const WINDOW = 48 * HOUR;
const ENGINES = ["Degoog", "Bing News", "Brave News", "SearXNG News", "RSS News", "Brave", "DuckDuckGo"];
const proxied = (url) => (typeof url === "string" && url.startsWith("/api/proxy/") && !/url=data%3A/i.test(url) ? url : "");

function reset(settings = {}, searchTypes = async () => ["web", "images", "news"]) {
  slot.configure(settings);
  slot.init({ template, searchTypes });
}

test.beforeEach(() => reset());

// Distinct headlines that never collapse as near-duplicates.
const HEADLINES = [
  "Ukraine budget talks stall in parliament",
  "Grain exports resume through Black Sea ports",
  "Energy grid repairs continue before winter",
  "Envoy visits Kyiv ahead of summit",
  "Court rules on border dispute appeal",
  "Aid package clears key Senate vote",
  "Drone factory expands production lines",
  "Farmers protest new import quotas",
  "Railway link reopens after repairs",
  "Students return to rebuilt schools",
  "Hospital receives generators from donors",
  "Ceasefire monitors report quiet night",
];

// News results the way core returns them: date-only publishedAt, signed
// thumbnails, and engine names mixed with publishers in `sources`.
function newsResult(i, { title, day = "2026-11-09", image = true, publisher = `Paper ${i}` } = {}) {
  return {
    title: title ?? HEADLINES[i % HEADLINES.length],
    url: `https://news${i}.example/2026/11/09/story-${i}`,
    snippet: "Story.",
    source: "Degoog",
    sources: ["Degoog", publisher, "SearXNG:brave.news", "Brave"],
    publishedAt: day,
    ...(image ? { thumbnail: `/api/proxy/image?url=https%3A%2F%2Fimg.example%2F${i}.jpg&sig=x` } : {}),
    favicon: `/api/proxy/favicon?domain=news${i}.example&sig=x`,
  };
}

const pick = (results, options = {}) =>
  stories.pickStories(results, { query: "ukraine talks", explicit: false, windowMs: WINDOW, engines: ENGINES, proxied, now: NOW, ...options });

test("trigger asks only for short topic searches", () => {
  for (const query of [
    "nasa", "taylor swift", "stock market", "ukraine", "world series", "olympic games",
    "2026 elections", "bundestag",
  ]) {
    assert.deepEqual(parseNewsQuery(query), { query, explicit: false }, query);
  }
  for (const query of ["nasa news", "latest on mars", "breaking", "who won the world series", "nachrichten berlin", "乌克兰新闻"]) {
    assert.equal(parseNewsQuery(query)?.explicit, true, query);
  }
  for (const query of [
    "", "ai", "!g nasa", "nasa !n", "nasa.gov", "https://example.com", "2+2", "x = 3",
    "100 usd to eur", "all to try", "5 km in miles", "120$ 20% split 4 ways", "#ff0000",
    "what is the capital of france", "how to tie a tie", "weather in rome", "time in tokyo",
    "Paris time", "cat pictures", "dune trailer", "python tutorial", "best laptop deals",
    "pizza recipe", "hello lyrics", "radiohead discography", "book Dune", "inception movie",
    "msft stock", "lakers score", "play minesweeper", "element gold", "define entropy",
    "coffee near me", "one two three four five six seven eight nine",
  ]) {
    assert.equal(parseNewsQuery(query), null, query);
  }
});

test("explicit mode looks only when the search mentions news", () => {
  assert.equal(parseNewsQuery("nasa", "explicit"), null);
  assert.deepEqual(parseNewsQuery("nasa news", "explicit"), { query: "nasa news", explicit: true });
  slot.configure({ triggerMode: "explicit" });
  assert.equal(slot.trigger("ukraine"), false);
  assert.equal(slot.trigger("ukraine headlines"), true);
});

test("the slot renders only a hidden, escaped placeholder", async () => {
  const rendered = await slot.execute(`ukraine "talks" & aid $& $1`, { locale: "de-DE" });
  assert.equal(rendered.title, "");
  const html = rendered.html;
  assert.match(html, /^<section class="tstories" data-slot-bare [^>]* hidden>/);
  assert.match(html, /data-tstories-query="ukraine &quot;talks&quot; &amp; aid \$&amp; \$1"/);
  assert.doesNotMatch(html, /"talks"/);
  assert.match(html, /data-tstories-hours="48"/);
  assert.match(html, /data-tstories-explicit="0"/);
  assert.match(html, /data-tstories-locale="de-DE"/);
  assert.match(html, /href="search\?q=ukraine\+%22talks%22\+%26\+aid\+%24%26\+%241&amp;type=news" data-tstories-more/);
  assert.match(renderPlaceholder({ query: "<b>", explicit: true }, '"><x'), /data-tstories-query="&lt;b&gt;"[^>]*data-tstories-locale="&quot;&gt;&lt;x"/);
  assert.match(html, /\{\{ t:plugin-top-stories\.heading \}\}/);
  assert.match(html, /\{\{ t:plugin-top-stories\.more \}\}/);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.doesNotMatch(html, /https?:\/\//);

  slot.configure({ freshHours: "12" });
  assert.match((await slot.execute("nasa news")).html, /data-tstories-hours="12"[^>]*data-tstories-explicit="1"/);
  slot.configure({ freshHours: "999" });
  assert.match(renderPlaceholder({ query: "nasa", explicit: false }), /data-tstories-hours="48"/);
});

test("the slot stays silent without news engines, for bangs and on errors", async () => {
  assert.deepEqual(await slot.execute("!n nasa"), { html: "" });
  assert.deepEqual(await slot.execute("weather in rome"), { html: "" });

  reset({}, async () => ["web", "images"]);
  assert.deepEqual(await slot.execute("ukraine"), { html: "" });

  // An unknown catalog does not hide the block; card.js removes it if the
  // news search comes back empty.
  reset({}, async () => { throw new Error("catalog unavailable"); });
  assert.match((await slot.execute("ukraine")).html, /class="tstories"/);
});

test("date-only publish times sit at noon UTC and never in the future", () => {
  assert.equal(stories.publishedTime("2026-11-08", NOW), Date.parse("2026-11-08T12:00:00Z"));
  assert.equal(stories.publishedTime("2026-11-09", Date.parse("2026-11-09T03:00:00Z")), Date.parse("2026-11-09T03:00:00Z"));
  assert.equal(stories.publishedTime("2026-11-12", NOW), 0);
  assert.equal(stories.publishedTime("2026-11-09T16:30:00Z", NOW), Date.parse("2026-11-09T16:30:00Z"));
  assert.equal(stories.publishedTime("", NOW), 0);
  assert.equal(stories.publishedTime("yesterday", NOW), 0);

  const fresh = (day) => stories.isFresh({ published: stories.publishedTime(day, NOW) }, NOW, WINDOW);
  assert.equal(fresh("2026-11-09"), true);
  assert.equal(fresh("2026-11-08"), true);
  assert.equal(fresh("2026-11-07"), false);
});

test("publisher names skip engine labels and fall back to the site", () => {
  const name = (sources, url = "https://www.reuters.com/a") => stories.publisherName({ sources }, ENGINES, url);
  assert.equal(name(["Degoog", "CNBC", "SearXNG:brave.news", "Brave"]), "CNBC");
  assert.equal(name(["RSS News · NYT > U.S. News", "NYTimes"]), "NYTimes");
  assert.equal(name(["SearXNG:duckduckgo news", "DuckDuckGo"]), "reuters.com");
  assert.equal(stories.publisherName({ source: "Axios" }, ENGINES, "https://axios.com/a"), "Axios");
});

test("publisher tails come off headlines, other tails stay", () => {
  const strip = (title, source, url) => stories.stripPublisher(title, source, url);
  assert.equal(strip("Trump Veers Back Into Claims of Rigged Election - The New York Times", "NYTimes", "https://www.nytimes.com/a"), "Trump Veers Back Into Claims of Rigged Election");
  assert.equal(strip("Stock Market Today: Dow, S&P Live Updates - Bloomberg", "Bloomberg", "https://www.bloomberg.com/a"), "Stock Market Today: Dow, S&P Live Updates");
  assert.equal(strip("Bitcoin holds near $75,000 after tech stock rout | Fortune", "fortune.com", "https://fortune.com/a"), "Bitcoin holds near $75,000 after tech stock rout");
  assert.equal(strip("Mercado Bitcoin begins post-hack reopening — TradingView News", "TradingView", "https://www.tradingview.com/a"), "Mercado Bitcoin begins post-hack reopening");
  assert.equal(strip("2026 California midterm election results – The UCSD Guardian", "UCSD Guardian", "https://ucsdguardian.org/a"), "2026 California midterm election results");
  assert.equal(strip("Senate passes the budget - what it means for NASA", "NASA", "https://www.nasa.gov/a"), "Senate passes the budget - what it means for NASA");
  assert.equal(strip("Lakers beat Celtics - Round Two", "ESPN", "https://www.espn.com/a"), "Lakers beat Celtics - Round Two");
  assert.equal(strip("Short - CNN", "CNN", "https://cnn.com/a"), "Short - CNN");
  assert.equal(strip("Markets react as analysts weigh the long-term impact", "BBC", "https://www.bbc.co.uk/a"), "Markets react as analysts weigh the long-term impact");
});

test("fresh, distinct stories pass with a pictured featured story", () => {
  const results = [
    newsResult(0, { image: false }),
    newsResult(1),
    newsResult(2, { title: `${HEADLINES[1]}, officials say` }),
    { ...newsResult(3), url: "https://www.news1.example/2026/11/09/story-1/" },
    newsResult(4, { day: "2026-10-01" }),
    newsResult(5),
    newsResult(6),
    newsResult(7),
    newsResult(8, { title: "Ukraine peace talks resume this week in Abu Dhabi" }),
    { title: "Bad link", url: "javascript:alert(1)", publishedAt: "2026-11-09" },
    newsResult(9, { title: "Ukraine <script>alert(1)</script> talks" }),
  ];
  const picked = plain(pick(results));
  assert.equal(picked.lead.url, "https://news1.example/2026/11/09/story-1");
  assert.equal(picked.lead.source, "Paper 1");
  assert.match(picked.lead.image, /^\/api\/proxy\/image/);
  assert.equal(picked.lead.dateOnly, true);
  assert.deepEqual(picked.list.map((story) => story.url), [
    "https://news0.example/2026/11/09/story-0",
    "https://news5.example/2026/11/09/story-5",
    "https://news6.example/2026/11/09/story-6",
  ]);
  assert.equal(picked.list[0].thumb, "");
  assert.equal(picked.list[0].favicon, "/api/proxy/favicon?domain=news0.example&sig=x");
});

test("without a picture to feature, every story goes in the list", () => {
  const results = Array.from({ length: 6 }, (_, i) => newsResult(i, { image: false }));
  const picked = plain(pick(results));
  assert.equal(picked.lead, null);
  assert.deepEqual(picked.list.map((story) => story.url), results.slice(0, 4).map((result) => result.url));
});

test("a featured picture that fails hands the lead to the next pictured story", () => {
  const picked = pick([newsResult(0), newsResult(1, { image: false }), newsResult(2), newsResult(3), newsResult(4), newsResult(5)]);
  Object.assign(picked.lead, { image: "", thumb: "" });
  const again = plain(stories.splitLead(picked.pool));
  assert.equal(again.lead.url, "https://news2.example/2026/11/09/story-2");
  assert.deepEqual(again.list.map((story) => story.url), [
    "https://news0.example/2026/11/09/story-0",
    "https://news1.example/2026/11/09/story-1",
    "https://news3.example/2026/11/09/story-3",
  ]);
});

test("evergreen, thin, stale and everyday-word searches stay hidden", () => {
  const ten = (day = "2026-11-09") => Array.from({ length: 10 }, (_, i) => newsResult(i, { day }));
  assert.ok(pick(ten()));

  // Mostly old coverage at the top: an evergreen topic.
  const evergreen = ten().map((result, i) => (i < 6 ? { ...result, publishedAt: "2026-09-01" } : result));
  assert.equal(pick(evergreen), null);
  // An explicit news search skips the share check but still needs three.
  assert.ok(pick(evergreen, { explicit: true }));
  assert.equal(pick(ten("2026-09-01"), { explicit: true }), null);
  // Fewer than six results cannot show that the topic is fresh.
  assert.equal(pick(ten().slice(0, 5)), null);
  assert.ok(pick(ten().slice(0, 5), { explicit: true }));
  assert.equal(pick(ten().slice(0, 2), { explicit: true }), null);

  // One word must read as a name mid-sentence ("NASA"), not an everyday word.
  const titled = (word) => HEADLINES.slice(0, 10).map((headline, i) => newsResult(i, {
    title: `${headline} as ${word} watchers react`,
  }));
  assert.ok(pick(titled("NASA"), { query: "nasa" }));
  assert.equal(pick(titled("coffee"), { query: "coffee" }), null);
  assert.equal(pick([], { explicit: true }), null);
  assert.equal(pick(null, { explicit: true }), null);
});

test("name detection and duplicate titles match the old feed rules", () => {
  const story = (title) => ({ title });
  assert.equal(stories.looksLikeName("nasa", [
    story("Astronaut applications open as NASA expands crew"),
    story("Why NASA picked a new lander"),
    story("NASA Is Looking for Astronauts to Live on the Moon"),
  ]), true);
  assert.equal(stories.looksLikeName("coffee", [
    story("Why your coffee costs more this year"),
    story("New shop brings coffee and pastries to Main Street"),
  ]), false);
  assert.equal(stories.similarTitles("Taylor Swift attends Chiefs game", "Swift attends the Chiefs game again"), true);
  assert.equal(stories.similarTitles("Taylor Swift attends Chiefs game", "Knicks guard apologizes to fans"), false);
  const ranked = [1, 2, 3, 400, 900, 3000].map((hours) => ({ published: NOW - hours * HOUR }));
  assert.equal(stories.freshShare(ranked, NOW, WINDOW), 0.5);
  assert.equal(stories.freshShare([], NOW, WINDOW), 0);
});

test("relative times follow the page locale in whole days for dates", () => {
  const day = (value) => ({ published: stories.publishedTime(value, NOW), dateOnly: true });
  assert.equal(stories.relativeTime(day("2026-11-09"), NOW, "en-US"), "Today");
  assert.equal(stories.relativeTime(day("2026-11-08"), NOW, "en-US"), "Yesterday");
  assert.equal(stories.relativeTime(day("2026-11-06"), NOW, "en-US"), "3 days ago");
  assert.equal(stories.relativeTime(day("2026-11-08"), NOW, "de-DE"), "Gestern");
  assert.equal(stories.relativeTime({ published: NOW - 3 * HOUR, dateOnly: false }, NOW, "en-US"), "3 hours ago");
  assert.equal(stories.relativeTime({ published: NOW - 5 * 60_000, dateOnly: false }, NOW, "de-DE"), "Vor 5 Minuten");
  // An invalid tag falls back to the browser's locale instead of throwing.
  assert.match(stories.relativeTime({ published: NOW - 3 * HOUR, dateOnly: false }, NOW, "not a locale!"), /3/);
});

test("the runtime stays same-origin, caches per query and loads its own styles", () => {
  assert.match(runtime, /fetch\(`\$\{basePath\(\)\}\/api\/search`/);
  assert.match(runtime, /method: "POST"/);
  assert.match(runtime, /JSON\.stringify\(\{ query, type: "news" \}\)/);
  assert.match(runtime, /x-search-nonce/);
  assert.match(runtime, /pathname\.startsWith\(`\$\{basePath\(\)\}\/api\/proxy\/`\)/);
  assert.match(runtime, /degoog-results-ready/);
  assert.match(runtime, /\/plugins\/\$\{encodeURIComponent\(__PLUGIN_ID__\)\}\/card\.css/);
  // Failed searches leave the cache so a re-rendered placeholder retries, and
  // a placeholder that was off the page when its search finished fills on return.
  assert.match(runtime, /newsCache\.delete\(key\)/);
  assert.match(runtime, /const handled = new WeakSet\(\)/);
  assert.match(runtime, /handled\.delete\(root\)/);
  assert.doesNotMatch(runtime, /https?:\/\//);
});

test("styles follow the shared card contract", () => {
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, "colors come from degoog variables");
  assert.doesNotMatch(styles, /font-family|text-transform/);
  // Fills the results column; only the full-width row caps it to the column.
  assert.match(styles, /\.tstories \{[^}]*max-width: none;/);
  assert.match(styles, /\.results-slot-panel-full-width > \.tstories \{\s*max-width: var\(--degoog-results-rail-inline-size, 652px\);/);
  for (const [, value] of styles.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.match(value, /^(?:var\(--theme-radius-(?:sm|md|pill), (?:8px|12px|999px)\)|50%)$/, value);
  }
  const rules = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  let checked = 0;
  for (const [, selectors] of rules.matchAll(/(?:^|[{}])\s*([^{}@;]+)\{/g)) {
    for (const selector of selectors.split(",").map((part) => part.trim()).filter(Boolean)) {
      if (/^(?:from|to|\d+%)$/.test(selector)) continue;
      assert.match(
        selector,
        /^(?::is\()?\.tstories|^\.results-slot-panel-full-width(?::has\(> \.tstories\)| > \.tstories)$/,
        `scoped selector: ${selector}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 30, `checked ${checked} selectors`);
});

test("slot declares placement, network exposure and settings", () => {
  assert.equal(slot.isClientExposed, false);
  assert.equal(slot.position, "above-results");
  assert.deepEqual(slot.slotPositions, ["above-results", "full-width-above-results", "below-results"]);
  assert.deepEqual(slot.settingsSchema.map(({ key }) => key), ["freshHours", "triggerMode"]);
  assert.equal(slot.waitForResults, undefined);
});
