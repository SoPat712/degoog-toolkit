import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import {
  descriptionHead,
  descriptionType,
  matchKind,
  parseAmbiguousQuery,
  rankCandidates,
  refinedQuery,
  slot,
  splitTitle,
  wikiLanguage,
} from "./index.js";

const readLocal = (file) => readFile(new URL(file, import.meta.url), "utf8");
const english = JSON.parse(await readLocal("./locales/en.json"))["plugin-see-results-about"];
const template = await readLocal("./template.html");

const cacheTtls = [];
function memoryCache() {
  const store = new Map();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, ttl) => {
      cacheTtls.push(ttl);
      store.set(key, value);
    },
  };
}
let cache = memoryCache();
const freshPlugin = () => {
  cache = memoryCache();
  slot.init({ template, useCache: () => cache });
};
freshPlugin();

const signProxyUrl = (url) => `/api/proxy/image?url=${encodeURIComponent(url)}&sig=test`;
// Mirrors core's server-side {{ t:... }} pass for the English catalog.
const translate = (html) =>
  html.replace(/\{\{\s*t:plugin-see-results-about\.(\w+)\s*\}\}/g, (_, key) => english[key]);
const flush = () => new Promise((resolve) => setImmediate(resolve));

const BRAVE_LINKS = [
  { title: "Brave (2012 film)", description: "2012 film by Mark Andrews and Brenda Chapman", length: 83842 },
  { title: "Brave (web browser)", description: "Chromium-based open-source web browser", length: 36495 },
  { title: "Brave Search", description: "Privacy-focused search engine", length: 15574 },
  { title: "The Brave (TV series)", description: "American military drama television series", length: 34577 },
  { title: "Brave (Kelis song)", description: "2011 single by Kelis", length: 28172 },
  { title: "Pixar", description: "American animation studio", length: 120000 },
  { title: "Atlanta Braves", description: "Major League Baseball franchise", length: 200000 },
  { title: "Brave (surname)", description: "Surname", length: 900 },
  { title: "HMS Brave", description: "List of ships with the same or similar names", length: 2119 },
  { title: "Brave series", description: "", length: 33527 },
  { title: "Brave (band)", missing: true },
  { title: "Brave (album)", description: "Topics referred to by the same term", length: 500, disambiguation: true },
];
const BRAVE_VIEWS = {
  "Brave (2012 film)": 36365,
  "Brave (web browser)": 33632,
  "Brave Search": 11860,
  "The Brave (TV series)": 4052,
  "Brave (Kelis song)": 125,
};
const BRAVE_THUMBS = {
  "Brave (web browser)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Brave.png/120px-Brave.png?utm_source=en.wikipedia.org",
  "Brave Search": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Search.png/120px-Search.png",
};

/**
 * A fake Wikipedia API. `pages` maps titles to detection answers, `links` lists
 * the disambiguation page's links, `views`/`thumbs` answer the readership call.
 */
function wikipedia({
  pages = {},
  redirects = [],
  links = [],
  linkRedirects = [],
  views = {},
  thumbs = {},
  viewsPerCall = Infinity,
  status = 200,
} = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const parsed = new URL(url);
    const params = Object.fromEntries(parsed.searchParams);
    calls.push({ host: parsed.host, params, init });
    if (status !== 200) return new Response("busy", { status });
    const titles = String(params.titles || "").split("|");
    let body;
    if (params.generator === "links") {
      body = {
        query: {
          redirects: linkRedirects,
          pages: links.map((link) => ({
            ns: 0,
            title: link.title,
            ...(link.missing ? { missing: true } : {}),
            ...(link.description ? { description: link.description } : {}),
            ...(link.length ? { length: link.length } : {}),
            ...(link.disambiguation ? { pageprops: { disambiguation: "" } } : {}),
          })),
        },
      };
    } else if (String(params.prop).includes("pageviews")) {
      const answered = new Set(params.pvipcontinue ? titles.slice(viewsPerCall) : titles.slice(0, viewsPerCall));
      body = {
        ...(params.pvipcontinue || titles.length <= viewsPerCall ? {} : { continue: { pvipcontinue: titles[viewsPerCall], continue: "||pageimages" } }),
        query: {
          pages: titles.map((title) => ({
            ns: 0,
            title,
            ...(answered.has(title) && title in views ? { pageviews: { "2026-11-01": views[title], "2026-11-02": null } } : {}),
            ...(thumbs[title] ? { thumbnail: { source: thumbs[title], width: 96, height: 96 } } : {}),
          })),
        },
      };
    } else {
      const resolve = (title) => redirects.find((entry) => entry.from === title)?.to || title;
      body = {
        query: {
          redirects: redirects.filter((entry) => titles.includes(entry.from)),
          pages: [...new Set(titles.map(resolve))].map((title) => pages[title]
            ? { ns: 0, title, ...(pages[title] === "dab" ? { pageprops: { disambiguation: "" } } : {}) }
            : { ns: 0, title, missing: true }),
        },
      };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  fetch.calls = calls;
  return fetch;
}

const braveWikipedia = (overrides = {}) => wikipedia({
  pages: { Brave: "dab" },
  redirects: [{ from: "Brave (disambiguation)", to: "Brave" }],
  links: BRAVE_LINKS,
  views: BRAVE_VIEWS,
  thumbs: BRAVE_THUMBS,
  ...overrides,
});

const chipsOf = (html) => [...html.matchAll(/<a class="sra-chip" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([, href, inner]) => ({
    query: decodeURIComponent(href.replace(/^\/search\?q=/, "")),
    name: inner.match(/class="sra-name">([^<]*)</)?.[1],
    type: inner.match(/class="sra-type">([^<]*)</)?.[1],
    img: inner.match(/<img[^>]+src="([^"]+)"/)?.[1] || "",
  }));

test("slot contract: one native full-width capability, server-only, no settings", () => {
  assert.equal(slot.id, "see-results-about");
  assert.equal(slot.position, "full-width-above-results");
  assert.deepEqual(slot.slotPositions, ["full-width-above-results", "above-results", "above-sidebar", "below-results"]);
  assert.equal(slot.isClientExposed, false);
  assert.equal(slot.waitForResults, undefined, "never waits for search results");
  assert.equal(slot.settingsSchema, undefined);
});

test("triggers only on short, plain names", () => {
  for (const query of [
    "brave", "mercury", "python", "jaguar", "apple", "avatar", "Brave", "  new   york ",
    "big ben", "paris, texas", "st. louis", "apollo 11", "苹果", "ягуар", "the who", "the office",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
  for (const query of [
    "", "   ", "how to cook pasta", "weather tomorrow", "weather",
    "the quick brown fox jumps over the lazy dog", "a much longer five word query",
    "!w brave", "brave !w", "site:example.com brave", '"brave"', "brave -browser", "+brave",
    "brave OR mercury", "brave*", "brave?", "is brave good", "what is python", "who is mercury",
    "wie alt ist", "comment cuisiner", "как приготовить", "怎么做饭", "苹果吗",
    "100 usd to eur", "2+2", "20% on 120", "1984", "brave.com", "https://brave.com", "#ff0000",
    "python vs java", "brave download", "jaguar price", "mercury news", "time", "translate hello",
    "define brave", "paris time", "coffee near me", "lakers score", "msft stock",
    "C", "He", "Fe", "in", "水", "play snake", "play minesweeper",
    "the", "The", "of the", "and", "with", "into the", "about", "an",
  ]) {
    assert.equal(slot.trigger(query), false, query);
    assert.equal(parseAmbiguousQuery(query), null, query);
  }
  assert.equal(parseAmbiguousQuery("  new   york "), "new york");
});

test("title parsing and match kinds", () => {
  assert.deepEqual(splitTitle("Brave (2012 film)"), { base: "Brave", qualifier: "2012 film" });
  assert.deepEqual(splitTitle("Brave Search"), { base: "Brave Search", qualifier: "" });
  assert.equal(matchKind("Brave", "brave"), "exact");
  assert.equal(matchKind("Brave (2012 film)", "brave"), "qualified");
  assert.equal(matchKind("The Brave (TV series)", "brave"), "qualified");
  assert.equal(matchKind("Brave Search", "brave"), "prefix");
  assert.equal(matchKind("Brave-class patrol boat", "brave"), "prefix");
  assert.equal(matchKind("Monty Python", "python"), "contains");
  assert.equal(matchKind("Atlanta Braves", "brave"), null);
  assert.equal(matchKind("Pixar", "brave"), null);
  assert.equal(matchKind("M&T Bank Stadium", "bank"), null, "a name inside a longer title");
  assert.equal(matchKind("Bank of America Stadium", "bank"), "prefix");
  assert.equal(matchKind("New York City", "new york"), "prefix");
  assert.equal(matchKind("Mercúrio (planeta)", "mercurio", "pt"), "qualified");
  assert.equal(matchKind("水星 (行星)", "水星", "zh"), "qualified");
  assert.equal(matchKind("水星记", "水星", "zh"), "prefix");
});

test("chip types and refined searches come from titles and descriptions", () => {
  assert.equal(descriptionHead("Large cat native to the Americas"), "Large cat");
  assert.equal(descriptionHead("Family of Unix-like operating systems"), "Family of Unix-like operating systems");
  assert.equal(descriptionHead("Capital and largest city of France"), "Capital and largest city");
  assert.equal(descriptionHead("Entertainer dressed in drag"), "Entertainer");
  assert.equal(descriptionHead("Car marque owned by Jaguar Land Rover"), "Car marque");
  // A cut never leaves a fragment: a verb, a vague noun or a dangling participle.
  assert.equal(descriptionHead("Used to count, measure, and label"), "Used to count");
  assert.equal(descriptionHead("Medium consisting of pages of text or images"), "Medium");
  assert.equal(descriptionHead("Structured form of play"), "Structured form of play");
  assert.equal(descriptionHead("1977–1993 series of microcomputers"), "1977–1993 series of microcomputers");
  assert.equal(descriptionHead("Type of lung commonly found in arachnids"), "Type of lung");
  assert.equal(descriptionHead("Mountain climbing in Nepal"), "Mountain climbing");
  assert.equal(descriptionType("Used to count, measure, and label"), "used to count");
  assert.equal(descriptionType("Type of lung commonly found in arachnids"), "lung");
  assert.equal(descriptionHead("Especie de mamífero carnívoro", "es"), "Especie de mamífero carnívoro");
  assert.equal(descriptionType("Species of large cat native to the Americas"), "large cat");
  assert.equal(descriptionType("Edible fruit"), "edible fruit");
  assert.equal(descriptionType("Capital and largest city of France"), "capital");
  assert.equal(descriptionType("Christian festival before Lent"), "christian festival");

  assert.equal(refinedQuery({ title: "Brave (2012 film)", kind: "qualified" }), "Brave 2012 film");
  assert.equal(refinedQuery({ title: "Brave Search", kind: "prefix" }), "Brave Search");
  assert.equal(refinedQuery({ title: "Queen (Queen album)", kind: "qualified" }), "Queen album");
  assert.equal(refinedQuery({ title: "Jaguar", kind: "exact", description: "Large cat native to the Americas" }), "Jaguar large cat");
  assert.equal(refinedQuery({ title: "Coffee", label: "Java (drink)", alias: true, kind: "qualified" }), "Java drink");
  assert.equal(refinedQuery({ title: "Panthera onca", label: "Jaguar", alias: true, kind: "exact" }, "es"), "Panthera onca");
});

test("degoog's locale picks the Wikipedia, falling back to English", () => {
  assert.equal(wikiLanguage("de-DE"), "de");
  assert.equal(wikiLanguage("pt_BR"), "pt");
  assert.equal(wikiLanguage("zh-CN"), "zh");
  assert.equal(wikiLanguage("sv-SE"), "en");
  assert.equal(wikiLanguage(undefined), "en");
});

test("brave renders ranked chips with refined searches and proxied thumbnails", async () => {
  freshPlugin();
  const fetch = braveWikipedia();
  const result = await slot.execute("brave", { fetch, signProxyUrl, locale: "en-US" });
  assert.equal(result.title, "");
  const html = translate(result.html);
  // One visible label; the Wikipedia attribution is read out, not shown.
  assert.match(html, /<h2 class="sra-heading">See results about<span class="sra-hidden"> from Wikipedia<\/span><\/h2>/);
  assert.doesNotMatch(html, /sra-source|wikipedia\.org\/wiki/);
  assert.match(html, /<img class="sra-thumb" src="[^"]+" alt="" width="32" height="32"/);
  assert.deepEqual(chipsOf(html).map(({ name, type, query }) => [name, type, query]), [
    ["Brave", "2012 film", "Brave 2012 film"],
    ["Brave", "Web browser", "Brave web browser"],
    ["Brave Search", "Privacy-focused search engine", "Brave Search"],
    ["The Brave", "TV series", "The Brave TV series"],
  ]);
  const thumbs = chipsOf(html).map(({ img }) => img).filter(Boolean);
  assert.equal(thumbs.length, 2);
  for (const src of thumbs) assert.match(src, /^\/api\/proxy\/image\?url=https%3A%2F%2F(?:thumb|upload)\.wikimedia\.org/);
  assert.doesNotMatch(html, /utm_source/, "tracking query is stripped before signing");
  assert.doesNotMatch(html, /src="https?:/, "no direct external images");
  assert.match(html, /<span class="sra-thumb sra-thumb--empty" aria-hidden="true">B<\/span>/);
  assert.doesNotMatch(html, /Pixar|Atlanta Braves|HMS Brave|surname|Kelis/);

  assert.equal(fetch.calls.length, 3, "detect, links, readership");
  for (const { host, init } of fetch.calls) {
    assert.equal(host, "en.wikipedia.org");
    assert.match(init.headers["User-Agent"], /degoog-toolkit/);
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.deepEqual(fetch.calls[0].params.titles.split("|"), ["Brave (disambiguation)", "Brave"]);
  assert.equal(fetch.calls[1].params.titles, "Brave");
  assert.equal(fetch.calls[2].params.pvipdays, "30");
  assert.ok(cacheTtls.every((ttl) => ttl >= 7 * 24 * 60 * 60 * 1000), `cache TTL ${cacheTtls}`);

  // A second search is served from the cache, with thumbnails signed anew.
  const again = await slot.execute("Brave", { fetch, signProxyUrl, locale: "en-US" });
  assert.equal(fetch.calls.length, 3);
  assert.equal(chipsOf(again.html).length, 4);
});

test("remote titles and descriptions are escaped", async () => {
  freshPlugin();
  const fetch = braveWikipedia({
    links: [
      { title: "Brave (<img src=x>)", description: "Film \"quoted\" & $& more", length: 9000 },
      { title: "Brave (web browser)", description: "Web browser", length: 8000 },
    ],
    views: { "Brave (<img src=x>)": 5000, "Brave (web browser)": 4000 },
    thumbs: {},
  });
  const { html } = await slot.execute("brave", { fetch, signProxyUrl });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /<span class="sra-type">&lt;img src=x&gt;<\/span>/);
  assert.match(html, /title="Film &quot;quoted&quot; &amp; \$&amp; more"/);
  assert.match(html, /href="\/search\?q=Brave%20%3Cimg%20src%3Dx%3E"/);
});

test("without an image proxy no Wikimedia URL reaches the browser", async () => {
  freshPlugin();
  const { html } = await slot.execute("brave", { fetch: braveWikipedia() });
  assert.equal(chipsOf(html).length, 4);
  assert.doesNotMatch(html, /<img|wikimedia\.org/);
});

test("a primary-topic title uses the disambiguation page and refines its own meaning", async () => {
  freshPlugin();
  const fetch = wikipedia({
    pages: { Jaguar: "article", "Jaguar (disambiguation)": "dab" },
    links: [
      { title: "Jaguar", description: "Large cat native to the Americas", length: 150000 },
      { title: "Jaguar Cars", description: "Car marque owned by Jaguar Land Rover", length: 90000 },
      { title: "Atari Jaguar", description: "Home video game console", length: 60000 },
    ],
    linkRedirects: [
      { from: "JAGUAR", to: "Atari Jaguar" },
      { from: "Jaguar (cat)", to: "Jaguar" },
    ],
    views: { Jaguar: 70000, "Jaguar Cars": 35000, "Atari Jaguar": 11000 },
  });
  const { html } = await slot.execute("jaguar", { fetch, signProxyUrl });
  assert.equal(fetch.calls[1].params.titles, "Jaguar (disambiguation)");
  assert.deepEqual(chipsOf(html).map(({ name, query }) => [name, query]), [
    ["Jaguar", "Jaguar large cat"],
    ["Jaguar Cars", "Jaguar Cars"],
    ["Atari Jaguar", "Atari Jaguar"],
  ]);
});

test("redirects stand in for their target only when they name the search", async () => {
  freshPlugin();
  const fetch = wikipedia({
    pages: { Java: "article", "Java (disambiguation)": "dab" },
    links: [
      { title: "Java", description: "Island and region in Indonesia", length: 120000 },
      { title: "Java (programming language)", description: "Programming language", length: 110000 },
      { title: "Coffee", description: "Brewed beverage", length: 150000 },
      { title: "Sun Microsystems", description: "American computer company", length: 100000 },
      { title: "Coffee production in Indonesia", description: "Coffee industry", length: 30000 },
    ],
    linkRedirects: [
      { from: "Java (drink)", to: "Coffee" },
      { from: "JAVA", to: "Sun Microsystems" },
      { from: "Java coffee", to: "Coffee production in Indonesia", tofragment: "Java" },
    ],
    views: {
      Java: 32000,
      "Java (programming language)": 34000,
      Coffee: 100000,
      "Sun Microsystems": 40000,
      "Coffee production in Indonesia": 9000,
    },
  });
  const chips = chipsOf((await slot.execute("java", { fetch, signProxyUrl })).html);
  assert.deepEqual(chips.map(({ name, type, query }) => [name, type, query]), [
    ["Java", "Drink", "Java drink"],
    ["Java", "Programming language", "Java programming language"],
    ["Java", "Island and region", "Java island"],
  ]);
});

test("one strong meaning, a dominant primary topic or no disambiguation stays silent", async () => {
  freshPlugin();
  const single = wikipedia({
    pages: { Chrome: "dab" },
    links: [
      { title: "Google Chrome", description: "Web browser", length: 220000 },
      { title: "Chrome plating", description: "Technique of electroplating", length: 29000 },
      { title: "Chrome (band)", description: "American rock band", length: 21000 },
    ],
    views: { "Google Chrome": 290000, "Chrome plating": 2600, "Chrome (band)": 1900 },
  });
  assert.equal((await slot.execute("chrome", { fetch: single, signProxyUrl })).html, "");

  const dominant = wikipedia({
    pages: { "Taylor Swift": "article", "Taylor Swift (disambiguation)": "dab" },
    links: [
      { title: "Taylor Swift", description: "American singer-songwriter", length: 300000 },
      { title: "Taylor Swift (album)", description: "2006 studio album", length: 60000 },
    ],
    views: { "Taylor Swift": 900000, "Taylor Swift (album)": 40000 },
  });
  assert.equal((await slot.execute("taylor swift", { fetch: dominant, signProxyUrl })).html, "");

  const none = wikipedia({ pages: { Pasta: "article" } });
  assert.equal((await slot.execute("pasta", { fetch: none, signProxyUrl })).html, "");
  assert.equal(none.calls.length, 1, "no links request without a disambiguation page");
  // Misses are cached too, so ordinary names cost one request a week.
  await slot.execute("pasta", { fetch: none, signProxyUrl });
  assert.equal(none.calls.length, 1);
});

test("rankCandidates needs two readable meanings and drops duplicate refinements", () => {
  const info = new Map([
    ["Brave (2012 film)", { views: 30000, thumbnail: "" }],
    ["Brave (film)", { views: 20000, thumbnail: "" }],
    ["Brave (web browser)", { views: 250, thumbnail: "" }],
  ]);
  const candidates = [
    { title: "Brave (2012 film)", label: "Brave (2012 film)", kind: "qualified", description: "2012 film", length: 1 },
    { title: "Brave (film)", label: "Brave (2012 film)", alias: true, kind: "qualified", description: "Film", length: 1 },
    { title: "Brave (web browser)", label: "Brave (web browser)", kind: "qualified", description: "Web browser", length: 1 },
  ];
  assert.deepEqual(rankCandidates(candidates, info, "brave"), [], "below MIN_VIEWS and duplicate");

  // A longer title is a more specific subject than a same-name meaning.
  const banks = rankCandidates([
    { title: "Bank of America Stadium", kind: "prefix", extra: 3, description: "Stadium", length: 1 },
    { title: "Bank (geography)", kind: "qualified", extra: 0, description: "Land beside water", length: 1 },
  ], new Map([
    ["Bank of America Stadium", { views: 8000 }],
    ["Bank (geography)", { views: 5000 }],
  ]), "bank");
  assert.deepEqual(banks.map(({ title }) => title), ["Bank (geography)", "Bank of America Stadium"]);
});

test("German locale queries de.wikipedia.org with its own suffix", async () => {
  freshPlugin();
  const fetch = wikipedia({
    pages: { Merkur: "dab" },
    links: [
      { title: "Merkur (Planet)", description: "sonnennächster Planet", length: 90000 },
      { title: "Merkur (Mythologie)", description: "römischer Gott", length: 20000 },
    ],
    views: { "Merkur (Planet)": 11000, "Merkur (Mythologie)": 2000 },
  });
  const { html } = await slot.execute("merkur", { fetch, signProxyUrl, locale: "de-DE" });
  assert.ok(fetch.calls.every(({ host }) => host === "de.wikipedia.org"));
  assert.ok(fetch.calls[0].params.titles.includes("Merkur (Begriffsklärung)"));
  assert.deepEqual(chipsOf(html).map(({ query }) => query), ["Merkur Planet", "Merkur Mythologie"]);
});

test("pageviews are continued once when Wikipedia answers part of the titles", async () => {
  freshPlugin();
  const fetch = braveWikipedia({ viewsPerCall: 2 });
  const { html } = await slot.execute("brave", { fetch, signProxyUrl });
  const readership = fetch.calls.filter(({ params }) => String(params.prop).includes("pageviews"));
  assert.equal(readership.length, 2);
  assert.ok(readership[1].params.pvipcontinue);
  assert.equal(chipsOf(html).length, 4);
});

test("Wikipedia failures render nothing, pause new lookups for a minute, then retry", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-09T12:00:00Z") });
  try {
    for (const failing of [braveWikipedia({ status: 503 }), async () => { throw new Error("offline"); }]) {
      freshPlugin();
      assert.deepEqual(await slot.execute("brave", { fetch: failing, signProxyUrl }), { title: "", html: "" });
      assert.equal(cache.store.size, 0, "failures are not cached");
    }
    // An outage must not make every later search wait out the timeout again.
    const up = braveWikipedia();
    assert.equal((await slot.execute("brave", { fetch: up, signProxyUrl })).html, "");
    assert.equal(up.calls.length, 0);
    mock.timers.tick(60_000);
    assert.equal(chipsOf((await slot.execute("brave", { fetch: up, signProxyUrl })).html).length, 4);
    // Cached chips keep showing even while new lookups are paused.
    await slot.execute("jaguar", { fetch: async () => { throw new Error("offline"); }, signProxyUrl });
    assert.equal(chipsOf((await slot.execute("brave", { fetch: up, signProxyUrl })).html).length, 4);
  } finally {
    mock.timers.reset();
  }
});

test("a stalled Wikipedia is abandoned at the lookup budget", async () => {
  freshPlugin();
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const stalled = (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
    const pending = slot.execute("brave", { fetch: stalled, signProxyUrl });
    for (let i = 0; i < 5; i += 1) await flush();
    mock.timers.tick(4000);
    assert.deepEqual(await pending, { title: "", html: "" });
  } finally {
    mock.timers.reset();
  }
});

test("concurrent searches share one lookup", async () => {
  freshPlugin();
  const fetch = braveWikipedia();
  const [first, second] = await Promise.all([
    slot.execute("brave", { fetch, signProxyUrl }),
    slot.execute("brave", { fetch, signProxyUrl }),
  ]);
  assert.equal(fetch.calls.length, 3);
  assert.equal(first.html, second.html);
});

test("execute ignores queries the trigger rejects without any request", async () => {
  freshPlugin();
  const fetch = braveWikipedia();
  for (const query of ["how to cook pasta", "weather tomorrow", "!w brave"]) {
    assert.deepEqual(await slot.execute(query, { fetch, signProxyUrl }), { title: "", html: "" });
  }
  assert.equal(fetch.calls.length, 0);
});

test("the row is one slim line that never scrolls on desktop", async () => {
  const css = await readLocal("./style.css");
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1] || "";
  };
  const heading = rule(".sra-card .sra-heading");
  assert.match(heading, /font-size:\s*0\.875rem/);
  assert.match(heading, /color:\s*var\(--text-secondary\)/);
  assert.match(heading, /white-space:\s*nowrap/);
  // Chips that do not fit wrap onto a clipped second line: no scrollbar, no half chips.
  const chips = rule(".sra-card .sra-chips");
  assert.match(chips, /flex-wrap:\s*wrap/);
  assert.match(chips, /height:\s*2\.75rem/);
  assert.match(chips, /overflow:\s*hidden/);
  const chip = rule(".sra-card .sra-chip");
  assert.match(chip, /height:\s*2\.75rem/);
  assert.match(chip, /max-width:\s*220px/);
  assert.match(chip, /padding:\s*6px 12px 6px 6px/);
  assert.match(rule(".sra-card .sra-chip:focus-visible"), /outline-offset:\s*-2px/, "the ring stays inside the clip");
  assert.match(rule(".sra-card .sra-thumb"), /width:\s*32px/);
  assert.match(rule(".sra-card .sra-name"), /font-size:\s*0\.875rem/);
  assert.match(css, /\n\.sra-card \.sra-type \{[^}]*font-size:\s*0\.75rem/);
  // Narrow containers swipe with the scrollbar hidden.
  const narrow = css.slice(css.indexOf("@container (max-width: 520px)"));
  assert.match(narrow, /\.sra-card \.sra-chips \{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;/);
  assert.match(narrow, /\.sra-card \.sra-chips::-webkit-scrollbar \{\s*display:\s*none;/);
});

test("the row is borderless, keeps to the results rail and uses theme tokens", async () => {
  const css = await readLocal("./style.css");
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1] || "";
  };
  const root = rule(".sra-card");
  assert.match(root, /max-width:\s*var\(--degoog-results-rail-inline-size,\s*652px\)/);
  assert.match(root, /(?:^|;)\s*width:\s*100%/);
  assert.doesNotMatch(root, /(?:^|;)\s*(?:background|border|border-radius|box-shadow|padding)\s*:/, "no panel chrome");
  const chip = rule(".sra-card .sra-chip");
  assert.match(chip, /background:\s*var\(--bg-light\)/);
  assert.match(chip, /border-radius:\s*var\(--theme-radius-md,\s*12px\)/);
  assert.doesNotMatch(chip, /(?:^|;)\s*border\s*:/);
  assert.match(rule(".results-slot-panel .sra-card .sra-chip"), /background:\s*var\(--bg\)/, "chips stay visible on a panel");
  assert.match(rule(".sra-card .sra-chip:hover"), /background:\s*var\(--bg-hover\)/);
  const thumb = rule(".sra-card .sra-thumb");
  assert.match(thumb, /border-radius:\s*var\(--theme-radius-sm,\s*8px\)/);
  assert.match(css, /@container \(max-width: 520px\)/, "narrow containers stack the label above the row");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|font-family/i, "theme colors and fonts only");
  for (const [, value] of css.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.match(value, /^var\(--theme-radius-(?:sm, 8px|md, 12px|pill, 999px)\)$|^50%$/, value);
  }
  for (const [selector] of css.matchAll(/^[^@\s/}][^{]*(?=\{)/gm)) {
    for (const part of selector.split(",")) assert.match(part, /\.sra-card\b/, part);
  }
  assert.match(template, /^<nav class="sra-card"/);
});
