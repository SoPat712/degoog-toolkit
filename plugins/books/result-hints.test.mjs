import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";
import { parseBookResultHint, selectHintedBook } from "./result-hints.mjs";

// Result shapes observed in degoog's public-title searches; no provider page bodies.
const goodreads = { title: "The Alchemist by Paulo Coelho | Goodreads", url: "https://www.goodreads.com/en/book/show/18144590-the-alchemist" };
const library = { title: "The Alchemist by Paulo Coelho | Open Library", url: "https://openlibrary.org/works/OL796465W/The_Alchemist" };
const work = { key: "/works/OL796465W", title: "O Alquimista", author_name: ["Paulo Coelho"], first_publish_year: 1988,
  editions: { docs: [{ title: "The Alchemist" }] } };

for (const query of ["the alchemist", "The Alchemist Paulo Coelho", "the alchemist by paulo coelho", "Paulo Coelho The Alchemist", '"The Alchemist"']) {
  test(`book evidence recognizes ${query}`, () => {
    assert.equal(slot.trigger(query), true);
    const hint = parseBookResultHint(query, [goodreads]);
    assert.equal(hint?.term, "The Alchemist");
    assert.equal(hint.author, "Paulo Coelho");
    assert.equal(slot.waitForResults, true);
    assert.equal(slot.position, "knowledge-panel");
  });
}

test("Goodreads old/new/localized book URLs and Open Library work/edition URLs are accepted", () => {
  for (const url of [goodreads.url, "https://www.goodreads.com/book/show/865.The_Alchemist", "https://goodreads.com/book/show/865", library.url,
    "https://openlibrary.org/books/OL24953402M/The_Alchemist"])
    assert.equal(parseBookResultHint("the alchemist", [{ ...goodreads, url }])?.author, "Paulo Coelho", url);
  const hint = parseBookResultHint("the alchemist", [goodreads, { ...library, title: "The Alchemist | Open Library" }]);
  assert.equal(hint.workKey, "/works/OL796465W");
  assert.equal(hint.author, "Paulo Coelho");
});

test("book matching normalizes accents and known edition/series suffixes", () => {
  assert.equal(parseBookResultHint("cien anos de soledad", [{ ...goodreads, title: "Cien años de soledad by Gabriel García Márquez | Goodreads" }])?.author, "Gabriel García Márquez");
  for (const suffix of [" (1993 edition)", " (Series, #1)"])
    assert.equal(parseBookResultHint("the alchemist", [{ ...goodreads, title: `The Alchemist${suffix} by Paulo Coelho | Goodreads` }])?.term, "The Alchemist");
});

test("generic mentions, booking intent, and partial titles never request book metadata", async () => {
  for (const query of ["alchemist", "the alchemist review", "books like the alchemist", "the alchemist movie", "book a flight", "I need a book", "radiohead discography", "weather tomorrow", "!si alchemist", "site:goodreads.com the alchemist", "https://goodreads.com", "x".repeat(181)]) {
    assert.equal(parseBookResultHint(query, [goodreads]), null, query);
    let calls = 0;
    assert.equal((await slot.execute(query, { results: [goodreads], fetch: () => { calls++; throw new Error("must not fetch"); } })).html, "", query);
    assert.equal(calls, 0, query);
  }
});

test("book evidence excludes homepages, lists, quotes, lookalikes, credentials and unsafe URLs", () => {
  for (const url of ["https://goodreads.com/", "https://www.goodreads.com/work/quotes/4835472-alquimista", "https://goodreads.com/list/show/865", "https://goodreads.com/author/show/865",
    "https://openlibrary.org/search?q=The+Alchemist", "https://openlibrary.org/works/OL796465W/edit", "https://goodreads.com.evil.test/book/show/865", "https://goodreads.com@evil.test/book/show/865",
    "https://user:pass@goodreads.com/book/show/865", "file://goodreads.com/book/show/865", "javascript:alert(1)", "not a URL"])
    assert.equal(parseBookResultHint("the alchemist", [{ ...goodreads, url }]), null, url);
});

test("ambiguous authors and deep results do not trigger a guess", () => {
  assert.equal(parseBookResultHint("the alchemist", [goodreads, { ...goodreads, title: "The Alchemist by Ben Jonson | Goodreads" }]), null);
  assert.equal(parseBookResultHint("the alchemist", Array(8).fill({}).concat(goodreads)), null);
  assert.equal(parseBookResultHint("the alchemist", [{ ...goodreads, title: null }]), null);
  assert.equal(parseBookResultHint("the alchemist", [{ ...goodreads, title: "x".repeat(501) }]), null);
  assert.equal(parseBookResultHint("the alchemist", undefined), null);
});

test("book metadata must agree on author, work and translated title", () => {
  const hint = parseBookResultHint("the alchemist", [goodreads, library]);
  assert.equal(selectHintedBook([work], hint)?.title, "The Alchemist");
  assert.equal(selectHintedBook([{ ...work, author_name: ["Ben Jonson"] }], hint), null);
  assert.equal(selectHintedBook([{ ...work, key: "/works/OL999W" }], hint), null);
  assert.equal(selectHintedBook([{ ...work, editions: null }], hint), null);
  assert.equal(selectHintedBook([{ ...work, title: "The Alchemist Graphic Novel", editions: null }], hint), null);
});

test("result-backed book requests retain authors and languages in the cache key", async () => {
  const cache = new Map();
  slot.init({ useCache: () => ({ get: (key) => cache.get(key), set: (key, value) => cache.set(key, value) }) });
  const requests = [];
  const fetcher = async (input) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(url.origin, "https://openlibrary.org");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("q"), "The Alchemist");
    assert.match(url.searchParams.get("fields"), /editions.title/);
    return Response.json({ docs: [work] });
  };
  for (const locale of ["en-US", "en-US", "pt-BR"]) {
    const rendered = await slot.execute("the alchemist", { locale, results: [goodreads], fetch: fetcher });
    assert.match(rendered.html, /<h2>The Alchemist<\/h2>/);
    assert.match(rendered.html, /Paulo Coelho/);
  }
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((url) => url.searchParams.get("lang")), ["en", "pt"]);
  assert.ok(requests.every((url) => url.searchParams.get("author") === "Paulo Coelho"));
  const rendered = await slot.execute("the alchemist", { results: [{ ...goodreads, title: "The Alchemist by Ben Jonson | Goodreads" }], fetch: fetcher });
  assert.equal(requests.length, 3);
  assert.equal(rendered.html, "");
  slot.init({});
});
