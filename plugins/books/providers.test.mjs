import assert from "node:assert/strict";
import test from "node:test";
import books, { slot, slotPlugin } from "./index.js";

const token = "private-books-fixture-token";
const book = { title: "Dune", slug: "dune", author_names: ["Frank Herbert"], isbns: ["9780441172719"],
  rating: 4.3, ratings_count: 420, pages: 412, release_year: 1965, description: "<p>A desert world.</p>",
  image: { url: "https://images.hardcover.app/dune.jpg" }, series_names: ["Dune Chronicles"], featured_series_position: 1,
  moods: ["Adventurous"], content_warnings: ["Violence"], users_count: 5000, has_ebook: true };
const response = (docs) => Response.json({ data: { search: { results: { hits: docs.map((document) => ({ document })) } } } });
const ol = { key: "/works/OL893415W", title: "Dune", author_name: ["Frank Herbert"], ebook_access: "borrowable" };

test("Books has one settings owner with a server-only Hardcover token", () => {
  assert.equal(books, slot);
  assert.equal(slotPlugin, slot);
  assert.equal(slot.isClientExposed, false);
  assert.deepEqual(slot.settingsSchema.map((field) => field.key), ["hardcoverToken"]);
  assert.equal(slot.settingsSchema[0].secret, true);
  assert.equal(slot.settingsSchema[0].type, "password");
});

test("Hardcover is preferred and Open Library independently supplies borrowing access", async () => {
  const requests = [];
  slot.configure({ hardcoverToken: token });
  slot.init({ signProxyUrl: (url) => `/image-proxy?url=${encodeURIComponent(url)}` });
  try {
    const result = await slot.execute("book dune", { fetch: async (address, options) => {
      requests.push(address);
      if (new URL(address).hostname === "api.hardcover.app") {
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
        return response([book]);
      }
      assert.equal(new URL(address).searchParams.get("isbn"), "9780441172719");
      assert.equal(options.headers.Authorization, undefined);
      return Response.json({ docs: [ol] });
    } });
    assert.equal(requests.length, 2);
    assert.match(result.html, /eyebrow">Hardcover/);
    assert.match(result.html, /href="https:\/\/hardcover.app\/books\/dune"/);
    assert.match(result.html, /href="https:\/\/openlibrary.org\/works\/OL893415W"[^>]*>\{\{ t:plugin-books.borrow/);
    assert.match(result.html, /Dune Chronicles #1/);
    assert.match(result.html, /A desert world\./);
    assert.match(result.html, /5000.*plugin-books.readers/);
    assert.match(result.html, /plugin-books.contentWarnings/);
    assert.match(result.html, /src="\/image-proxy/);
    assert.doesNotMatch(result.html, new RegExp(token));
  } finally { slot.configure({}); }
});

test("Hardcover author searches retain real authored works and provider links", async () => {
  slot.configure({ hardcoverToken: token });
  slot.init({});
  try {
    let calls = 0;
    const result = await slot.execute("books by frank herbert", { fetch: async () => {
      calls++;
      return response([book, { ...book, title: "Dune Messiah", slug: "dune-messiah" }, { ...book, title: "Dune box set", compilation: true }]);
    } });
    assert.equal(calls, 1);
    assert.match(result.html, /<h2>Frank Herbert<\/h2>/);
    assert.match(result.html, /href="https:\/\/hardcover.app\/books\/dune-messiah"/);
    assert.doesNotMatch(result.html, /box set/);
  } finally { slot.configure({}); }
});

test("bad tokens and service failures fall back with a controlled note and no secret exposure", async () => {
  for (const status of [401, 503]) {
    slot.configure({ hardcoverToken: `${token}-${status}` });
    slot.init({});
    try {
      let hardcoverCalls = 0;
      const fetcher = async (address) => {
        if (new URL(address).hostname === "api.hardcover.app") {
          hardcoverCalls++;
          return new Response(token, { status });
        }
        return Response.json(String(address).includes("/search.json?") ? { docs: [ol] } : {});
      };
      for (let i = 0; i < 2; i++) {
        const result = await slot.execute("book dune", { fetch: fetcher });
        assert.match(result.html, /<h2>Dune<\/h2>/);
        assert.match(result.html, /eyebrow">Open Library/);
        assert.match(result.html, status === 401 ? /plugin-books.hardcoverAuth/ : /plugin-books.hardcoverUnavailable/);
        assert.doesNotMatch(result.html, new RegExp(token));
      }
      assert.equal(hardcoverCalls, status === 401 ? 1 : 2);
    } finally { slot.configure({}); }
  }
});

test("result hints still require matching authors and ISBN searches require the requested ISBN", async () => {
  slot.configure({ hardcoverToken: token });
  slot.init({});
  try {
    const fetcher = async (address) => new URL(address).hostname === "api.hardcover.app"
      ? response([{ ...book, author_names: ["Another Writer"], isbns: ["9780140328721"] }])
      : Response.json(String(address).includes("/search.json?") ? { docs: [ol] } : {});
    const hint = await slot.execute("dune", { results: [{ url: "https://goodreads.com/book/show/44767458.Dune", title: "Dune by Frank Herbert | Goodreads" }], fetch: fetcher });
    assert.match(hint.html, /eyebrow">Open Library/);
    assert.doesNotMatch(hint.html, /Another Writer/);
    const isbn = await slot.execute("9780441172719", { fetch: fetcher });
    assert.match(isbn.html, /eyebrow">Open Library/);
    assert.doesNotMatch(isbn.html, /Another Writer/);
  } finally { slot.configure({}); }
});
