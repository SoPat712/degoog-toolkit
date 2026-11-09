import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bingArticleUrl,
  bingFeedUrl,
  bingImageUrl,
  decodeEntities,
  freshShare,
  googleFeedUrl,
  looksLikeName,
  newsMarket,
  parseBingRss,
  parseGoogleRss,
  selectStories,
  similarTitles,
} from "./feeds.mjs";
import { parseNewsQuery, slot } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-09T18:00:00Z");
const HOUR = 3_600_000;
const hoursAgo = (hours) => new Date(NOW - hours * HOUR).toUTCString();

function bingItem({ title, url, source = "Example News", hours = 2, image = "/th?id=ONUT.abc&pid=News" }) {
  const link = `http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=${encodeURIComponent(url)}&amp;mkt=en-us`;
  return `<item><title>${title}</title><link>${link}</link><description>Story.</description>` +
    `<pubDate>${hoursAgo(hours)}</pubDate><News:Source>${source}</News:Source>` +
    (image ? `<News:Image>${image}</News:Image><News:ImageSize>w={0}&amp;h={1}&amp;c=14</News:ImageSize>` : "") +
    "</item>";
}

function googleItem({ title, source = "Wire Service", sourceUrl = "https://wire.example", hours = 2, id = "abc" }) {
  return `<item><title>${title} - ${source}</title><link>https://news.google.com/rss/articles/${id}?oc=5</link>` +
    `<pubDate>${hoursAgo(hours)}</pubDate><source url="${sourceUrl}">${source}</source></item>`;
}

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;

// Distinct headlines that never collapse as near-duplicates.
const SUBJECTS = [
  "launches new rocket", "budget hearing delayed", "picks astronaut crew", "probe reaches orbit",
  "telescope finds galaxy", "contract awarded today", "moon base plans", "mission control upgrade",
  "satellite deal signed", "engine test fires", "spacewalk scheduled soon", "lander photos released",
];
const headlines = (name, count, from = 0) =>
  Array.from({ length: count }, (_, i) => `${name} ${SUBJECTS[(from + i) % SUBJECTS.length]} ${from + i}`);

// Routes feed URLs to canned RSS and records which feeds were requested.
function newsFetch({ bing = [], fresh = [], google = [], fail = false } = {}) {
  const calls = [];
  const fetch = async (url) => {
    const parsed = new URL(url);
    const feed = parsed.hostname === "news.google.com" ? "google" : parsed.searchParams.has("qft") ? "bing-fresh" : "bing";
    calls.push(feed);
    if (fail) throw new Error("offline");
    const items = feed === "google" ? google : feed === "bing-fresh" ? fresh : bing;
    return new Response(rss(items), { status: 200 });
  };
  return { fetch, calls };
}

const context = (fetch, extra = {}) => ({
  fetch,
  locale: "en-US",
  signProxyUrl: (url) => `/api/proxy/image?url=${encodeURIComponent(url)}&sig=test`,
  signFaviconUrl: (url) => `/api/proxy/favicon?domain=${new URL(url).hostname}&sig=test`,
  ...extra,
});

function reset(settings = {}) {
  slot.configure(settings);
  slot.init({ template });
}

test.beforeEach(() => {
  reset();
  Date.now = () => NOW;
});

const realNow = Date.now;
test.after(() => {
  Date.now = realNow;
});

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

test("Bing items unwrap apiclick links, size thumbnails and decode entities", () => {
  const [story] = parseBingRss(rss([
    bingItem({ title: "Q&amp;A: NASA&#39;s &quot;plan&quot;", url: "https://site.example/a?x=1&y=2", image: "/th?id=OVX.1&amp;pid=News" }),
  ]));
  assert.equal(story.title, `Q&A: NASA's "plan"`);
  assert.equal(story.url, "https://site.example/a?x=1&y=2");
  assert.equal(story.source, "Example News");
  assert.equal(story.published, NOW - 2 * HOUR);
  const image = new URL(story.image);
  assert.equal(image.origin, "https://www.bing.com");
  assert.equal(image.searchParams.get("id"), "OVX.1");
  assert.equal(image.searchParams.get("w"), "480");
  assert.equal(image.searchParams.get("h"), "270");

  assert.equal(bingArticleUrl("https://direct.example/story"), "https://direct.example/story");
  assert.equal(bingArticleUrl("http://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)"), "");
  assert.equal(bingImageUrl("http://www.bing.com/th?id=X", ""), "https://www.bing.com/th?id=X&w=480&h=270&c=14");
  assert.equal(decodeEntities("&#x1F600; &amp;amp; &bogus;"), "😀 &amp; &bogus;");
  assert.equal(parseBingRss("<rss><item><title>No link</title></item></rss>").length, 0);
});

test("Google items drop the publisher suffix and keep the publisher URL", () => {
  const [story] = parseGoogleRss(rss([
    `<item><title><![CDATA[Moon base contracts awarded - Reuters]]></title><link>https://news.google.com/rss/articles/x</link>` +
      `<pubDate>${hoursAgo(1)}</pubDate><source url="https://www.reuters.com">Reuters</source></item>`,
  ]));
  assert.equal(story.title, "Moon base contracts awarded");
  assert.equal(story.source, "Reuters");
  assert.equal(story.sourceUrl, "https://www.reuters.com/");
  assert.equal(story.image, "");
});

test("markets follow the browser locale and default to en-us", () => {
  assert.deepEqual(newsMarket("en-US"), { bing: "en-us", language: "en", region: "US" });
  assert.deepEqual(newsMarket("de"), { bing: "de-de", language: "de", region: "DE" });
  assert.equal(newsMarket("pt").bing, "pt-br");
  assert.equal(newsMarket("xx").bing, "en-us");
  assert.equal(newsMarket(undefined).bing, "en-us");
  const bing = new URL(bingFeedUrl("nasa", newsMarket("en-GB"), 48));
  assert.equal(bing.searchParams.get("mkt"), "en-gb");
  assert.equal(bing.searchParams.get("format"), "rss");
  assert.equal(bing.searchParams.get("qft"), 'interval="8"');
  assert.equal(new URL(bingFeedUrl("nasa", newsMarket("en-US"), 12)).searchParams.get("qft"), 'interval="7"');
  assert.equal(new URL(googleFeedUrl("nasa", newsMarket("de-DE"))).searchParams.get("ceid"), "DE:de");
});

test("story selection keeps fresh, distinct headlines in feed order", () => {
  const stories = [
    { title: "NASA picks crew for moon mission", url: "https://a.example/1", published: NOW - HOUR },
    { title: "NASA picks crew for the moon mission, report says", url: "https://b.example/1", published: NOW - HOUR },
    { title: "Old NASA story", url: "https://c.example/1", published: NOW - 80 * HOUR },
    { title: "Future dated story", url: "https://d.example/1", published: NOW + 2 * HOUR },
    { title: "Same link different words", url: "https://www.a.example/1/", published: NOW - HOUR },
    { title: "Rocket engine test fires", url: "https://e.example/1", published: NOW - 3 * HOUR },
  ];
  const picked = selectStories([stories], { now: NOW, windowMs: 48 * HOUR, max: 8 });
  assert.deepEqual(picked.map((story) => story.url), ["https://a.example/1", "https://e.example/1"]);
  assert.equal(similarTitles("Taylor Swift attends Chiefs game", "Swift attends the Chiefs game again"), true);
  assert.equal(similarTitles("Taylor Swift attends Chiefs game", "Knicks guard apologizes to fans"), false);
  assert.equal(selectStories([stories, stories], { now: NOW, windowMs: 48 * HOUR, max: 1 }).length, 1);
});

test("fresh share and name detection separate news topics from evergreen words", () => {
  const ranked = [1, 2, 3, 400, 900, 3000].map((hours) => ({ published: NOW - hours * HOUR }));
  assert.equal(freshShare(ranked, NOW, 48 * HOUR), 0.5);
  assert.equal(freshShare([], NOW, 48 * HOUR), 0);

  const story = (title) => ({ title });
  assert.equal(looksLikeName("nasa", [
    story("Astronaut applications open as NASA expands crew"),
    story("Why NASA picked a new lander"),
    story("NASA Is Looking for Astronauts to Live on the Moon"),
  ]), true);
  assert.equal(looksLikeName("coffee", [
    story("Why your coffee costs more this year"),
    story("New shop brings coffee and pastries to Main Street"),
    story("Prices rise as Coffee Farmers Face Drought Across the Region"),
  ]), false);
  assert.equal(looksLikeName("iphone", [story("Leaker says the iPhone fix is close"), story("Apple's iPhone sales climb")]), true);
});

test("newsworthy searches render a signed, escaped carousel", async () => {
  const { fetch, calls } = newsFetch({
    bing: [
      ...headlines("NASA", 9).map((title, i) => bingItem({ title, url: `https://news${i}.example/story`, hours: i + 1 })),
      bingItem({ title: "NASA <script>alert(1)</script> story", url: "https://evil.example/x", hours: 1 }),
    ],
    fresh: headlines("NASA", 4, 9).map((title, i) => bingItem({ title: `Why ${title} matters for NASA`, url: `https://fresh${i}.example/s`, hours: 3 })),
  });
  const rendered = await slot.execute("nasa", context(fetch));
  assert.equal(rendered.title, "");
  assert.deepEqual(calls, ["bing", "bing-fresh"]);
  assert.match(rendered.html, /class="tstories"/);
  assert.equal(rendered.html.match(/class="tstories__item"/g)?.length, 8);
  assert.match(rendered.html, /\{\{ t:plugin-top-stories\.heading \}\}/);
  assert.match(rendered.html, />1 hour ago</);
  assert.match(rendered.html, /src="\/api\/proxy\/image\?url=https%3A%2F%2Fwww\.bing\.com%2Fth/);
  assert.match(rendered.html, /src="\/api\/proxy\/favicon\?domain=news0\.example/);
  assert.doesNotMatch(rendered.html, /src="https?:/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /href="https:\/\/news0\.example\/story" target="_blank" rel="noopener noreferrer"/);
});

test("evergreen and everyday-word searches stay silent", async () => {
  const old = (name) => headlines(name, 10).map((title, i) =>
    bingItem({ title, url: `https://old${i}.example/s`, hours: i < 3 ? 5 : 500 }));
  const evergreen = newsFetch({ bing: old("Python"), google: old("Python").map((item, i) => googleItem({ title: `Python guide ${i}`, hours: i < 4 ? 5 : 900, id: `g${i}` })) });
  assert.equal((await slot.execute("python", context(evergreen.fetch))).html, "");
  assert.deepEqual(evergreen.calls, ["bing", "google"]);

  // Fresh, but "coffee" is written in lowercase mid-headline: an everyday word.
  const everyday = newsFetch({
    bing: Array.from({ length: 10 }, (_, i) => bingItem({ title: `Why your coffee costs more in town ${i}`, url: `https://c${i}.example/s`, hours: 2 })),
  });
  assert.equal((await slot.execute("coffee", context(everyday.fetch))).html, "");
  assert.deepEqual(everyday.calls, ["bing", "bing-fresh"]);
});

test("thin Bing feeds ask Google, which can confirm and fill the row", async () => {
  const { fetch, calls } = newsFetch({
    bing: [bingItem({ title: "Officials in Ukraine outline new energy plan", url: "https://b.example/1" })],
    google: headlines("Ukraine", 6).map((title, i) => googleItem({ title: `Talks in Ukraine as ${title}`, hours: 1, id: `g${i}` })),
  });
  const rendered = await slot.execute("ukraine", context(fetch));
  assert.deepEqual(calls, ["bing", "google", "bing-fresh"]);
  assert.equal(rendered.html.match(/class="tstories__item"/g)?.length, 7);
  assert.match(rendered.html, /href="https:\/\/news\.google\.com\/rss\/articles\/g0\?oc=5"/);
  assert.match(rendered.html, /favicon\?domain=wire\.example/);

  reset({ googleFallback: "false" });
  const noFallback = newsFetch({ bing: [bingItem({ title: "Ukraine story", url: "https://b.example/1" })] });
  assert.equal((await slot.execute("ukraine", context(noFallback.fetch))).html, "");
  assert.deepEqual(noFallback.calls, ["bing"]);
});

test("fewer than three fresh stories, failures and bangs render nothing", async () => {
  const few = newsFetch({
    bing: [
      ...headlines("NASA", 2).map((title, i) => bingItem({ title, url: `https://n${i}.example/s`, hours: 1 })),
      ...headlines("NASA", 4, 5).map((title, i) => bingItem({ title, url: `https://o${i}.example/s`, hours: 300 })),
    ],
  });
  reset({ googleFallback: "false" });
  assert.equal((await slot.execute("nasa news", context(few.fetch))).html, "");

  reset();
  const offline = newsFetch({ fail: true });
  assert.deepEqual(await slot.execute("nasa", context(offline.fetch)), { title: "", html: "" });

  const bang = newsFetch();
  assert.deepEqual(await slot.execute("!n nasa", context(bang.fetch)), { html: "" });
  assert.deepEqual(bang.calls, []);
});

test("feeds are cached per query and market", async () => {
  const store = new Map();
  slot.init({
    template,
    useCache: () => ({
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => { store.set(key, value); },
    }),
  });
  const { fetch, calls } = newsFetch({
    bing: headlines("Tesla", 10).map((title, i) => bingItem({ title: `${title} as Tesla grows`, url: `https://t${i}.example/s`, hours: 2 })),
  });
  await slot.execute("tesla", context(fetch));
  await slot.execute("Tesla", context(fetch));
  assert.deepEqual(calls, ["bing", "bing-fresh"]);
  await slot.execute("tesla", context(fetch, { locale: "en-GB" }));
  assert.deepEqual(calls, ["bing", "bing-fresh", "bing", "bing-fresh"]);
});

test("relative times follow the request locale", async () => {
  const { fetch } = newsFetch({
    bing: headlines("NASA", 10).map((title, i) => bingItem({ title, url: `https://d${i}.example/s`, hours: 3 })),
  });
  const rendered = await slot.execute("nasa nachrichten", context(fetch, { locale: "de-DE" }));
  assert.match(rendered.html, />vor 3 Stunden</);
});

test("slot declares placement, network exposure and settings", () => {
  assert.equal(slot.isClientExposed, false);
  assert.equal(slot.position, "above-results");
  assert.deepEqual(slot.slotPositions, ["above-results", "below-results"]);
  assert.deepEqual(slot.settingsSchema.map(({ key }) => key), ["freshHours", "triggerMode", "googleFallback"]);
});
