import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";
import { bookSubjects, plainDescription, selectAuthorBooks } from "./catalog.mjs";

const dune = {
  key: "/works/OL893415W", title: "Dune", subtitle: "A novel", author_name: ["Frank Herbert"],
  first_publish_year: 1965, edition_count: 100, number_of_pages_median: 412,
  ratings_average: 4.21, ratings_count: 230, cover_i: 123, ebook_access: "borrowable",
  subject: ["Science fiction", "Science-fiction", "Adventure"],
};
const run = async (doc, work = {}, query = "book dune", extra = {}) => {
  slot.init({});
  return slot.execute(query, { fetch: async (url) => Response.json(String(url).includes("/search.json?") ? { docs: [doc] } : work), ...extra });
};

test("book cards show ratings, pages, a safe synopsis, and discovery links without an ISBN", async () => {
  const result = await run(dune, { description: { value: '<b>A desert story</b> with [more](https://example.test)\n---\nFooter' } });
  assert.match(result.html, /4\.2 \/ 5/);
  assert.match(result.html, /230.*plugin-books.ratings/);
  assert.match(result.html, /412.*plugin-books.pages/);
  assert.match(result.html, /<details class="books-card__synopsis"><summary>/);
  assert.match(result.html, /A desert story with more/);
  assert.doesNotMatch(result.html, /<b>|Footer/);
  assert.match(result.html, /https:\/\/search.worldcat.org\/search\?q=Dune%20Frank%20Herbert/);
  assert.match(result.html, /www.goodreads.com\/search/);
  assert.match(result.html, /app.thestorygraph.com\/browse/);
  assert.doesNotMatch(result.html, /src="https:/);
});

test("reading actions distinguish public, borrowable, restricted, and unavailable scans", async () => {
  for (const [access, expected] of [["public", "readFree"], ["borrowable", "borrow"], ["printdisabled", ""], ["no_ebook", ""]]) {
    const result = await run({ ...dune, ebook_access: access, public_scan_b: access === "printdisabled" });
    if (expected) assert.match(result.html, new RegExp(`plugin-books\\.${expected}`));
    else assert.doesNotMatch(result.html, /plugin-books\.(?:readFree|borrow)\s*}/);
  }
});

test("only trusted work keys fetch descriptions and synopsis failure retains the book", async () => {
  for (const key of ["/works/OL893415W", "https://evil.test/work", "/works/../../settings"]) {
    const calls = [];
    const result = await run({ ...dune, key }, {}, "book dune", { fetch: async (url) => {
      calls.push(url);
      if (calls.length === 1) return Response.json({ docs: [{ ...dune, key }] });
      throw new Error("synopsis unavailable");
    } });
    assert.match(result.html, /<h2>Dune<\/h2>/);
    assert.equal(calls.length, key === dune.key ? 2 : 1);
    if (calls.length === 2) assert.equal(calls[1], `https://openlibrary.org${dune.key}.json`);
  }
});

test("search and synopsis data are cached separately and initialized proxy helpers work", async () => {
  const cache = new Map(), ttls = new Map(), calls = [];
  slot.init({
    signProxyUrl: (url) => `/signed?url=${encodeURIComponent(url)}`,
    useCache: () => ({ get: (key) => cache.get(key), set: (key, value, ttl) => { cache.set(key, value); ttls.set(key, ttl); } }),
    fetch: async (url) => { calls.push(url); return Response.json(calls.length === 1 ? { docs: [dune] } : { description: "Cached synopsis" }); },
  });
  try {
    for (let i = 0; i < 2; i++) {
      const result = await slot.execute("book dune", {});
      assert.match(result.html, /Cached synopsis/);
      assert.match(result.html, /src="\/signed\?/);
    }
    assert.equal(calls.length, 2);
    assert.equal(ttls.get(`work:${dune.key}`), 7 * 24 * 60 * 60_000);
  } finally { slot.init({}); }
});

test("author searches request multiple works, filter noise, and render a keyboard accessible carousel", async () => {
  const docs = [dune, { ...dune, title: "Dune Messiah", cover_i: null }, { ...dune, title: "DUNE" },
    { ...dune, title: "Dune study guide" }, { ...dune, title: "Other book", author_name: ["Brian Herbert"] }];
  slot.init({});
  let calls = 0;
  const result = await slot.execute("books by frank herbert", { fetch: async (url) => {
    calls++;
    const params = new URL(url).searchParams;
    assert.equal(params.get("limit"), "16");
    assert.equal(params.get("sort"), "readinglog");
    assert.equal(params.get("author"), "frank herbert");
    return Response.json({ docs });
  } });
  assert.equal(calls, 1);
  assert.match(result.html, /<h2>Frank Herbert<\/h2>/);
  assert.match(result.html, /books-card__carousel" tabindex="0" role="region"/);
  assert.match(result.html, /Dune Messiah/);
  assert.equal((result.html.match(/class="books-card__slide"/g) || []).length, 2);
  assert.doesNotMatch(result.html, /study guide|Other book/);
});

test("author filtering uses whole words within one author and keeps one identity", () => {
  const book = (title, authors) => ({ title, author_name: authors });
  assert.deepEqual(selectAuthorBooks([book("A", ["Frank Smith", "John Herbert"]), book("B", ["Frank Herbert"])], "Frank Herbert").map((doc) => doc.title), ["B"]);
  assert.deepEqual(selectAuthorBooks([book("A", ["Annette Smith"]), book("B", ["Ann Smith"])], "Ann").map((doc) => doc.title), ["B"]);
  assert.deepEqual(selectAuthorBooks([book("A", ["José Saramago"]), book("B", ["João Saramago"])], "saramago").map((doc) => doc.title), ["A"]);
  assert.equal(selectAuthorBooks([book("A", ["José Saramago"])], "Jose Saramago").length, 1);
});

test("malformed optional metadata and descriptions do not break rendering", async () => {
  const result = await run({ ...dune, ratings_average: "NaN", ratings_count: -1, number_of_pages_median: "bad", subject: [null, 23, "Adventure"] });
  assert.match(result.html, /<h2>Dune<\/h2>/);
  assert.doesNotMatch(result.html, /NaN|plugin-books.pages|books-card__rating/);
  assert.deepEqual(bookSubjects([null, "Science fiction", "Science-fiction", 42, "Adventure"]), ["Science fiction", "Adventure"]);
  assert.equal(plainDescription({ value: 23 }), "");
  assert.equal(plainDescription("x".repeat(2000)).length, 1600);
});
