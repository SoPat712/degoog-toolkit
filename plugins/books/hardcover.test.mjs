import assert from "node:assert/strict";
import test from "node:test";
import { createHardcoverClient } from "./hardcover.mjs";

const TOKEN = "private-fixture-token-never-cache";
const parsed = (term = "The Book", kind = "title") => ({ kind, term });
const sample = {
  title: "  The Book  ", subtitle: "A story", author_names: ["Example Author"],
  release_year: 2020, pages: 314, rating: 4.25, ratings_count: 57,
  genres: ["Fiction", "Fantasy"], isbns: ["9781234567897"],
  image: { url: "https://images.example.org/book.jpg" }, slug: "the-book",
  description: "A short description.", series_names: ["The Sequence"], featured_series_position: 2,
  moods: ["Reflective"], content_warnings: ["Violence"], users_count: 180,
  has_ebook: true, has_audiobook: true, compilation: false,
};

function fixture(documents = [sample], asString = false) {
  const results = { hits: documents.map((document) => ({ document })) };
  return new Response(JSON.stringify({ data: { search: { results: asString ? JSON.stringify(results) : results } } }), {
    headers: { "Content-Type": "application/json" },
  });
}

function client(token = TOKEN) {
  const result = createHardcoverClient();
  result.configure(token);
  return result;
}

function memoryCache() {
  const entries = new Map();
  const writes = [];
  return {
    entries, writes,
    async get(key) { return entries.get(key); },
    async set(key, value, ttl) { entries.set(key, value); writes.push({ key, value, ttl }); },
  };
}

const reason = (expected) => (error) => {
  assert.equal(error.reason, expected);
  assert.equal(error.message, `Hardcover ${expected}`);
  assert.ok(!JSON.stringify(error).includes(TOKEN));
  assert.ok(!error.stack.includes(TOKEN));
  return true;
};

test("unconfigured, blank and invalid queries make no requests", async () => {
  const provider = createHardcoverClient();
  const never = () => { throw new Error("unexpected request"); };
  assert.equal(provider.isConfigured(), false);
  assert.deepEqual(await provider.search(parsed(), never), []);
  provider.configure(TOKEN);
  assert.equal(provider.isConfigured(), true);
  assert.deepEqual(await provider.search({ kind: "other", term: "x" }, never), []);
  assert.deepEqual(await provider.search(parsed("  "), never), []);
  provider.configure("  ");
  assert.equal(provider.isConfigured(), false);
  assert.deepEqual(await provider.search(parsed(), never), []);
});

test("escapes queries and sends only the documented GraphQL arguments and headers", async () => {
  const provider = client(`  bEaReR  ${TOKEN}  `);
  const term = 'Book "quoted" \\ \n } mutation { change: "no"';
  let called = 0;
  await provider.search(parsed(term), async (url, options) => {
    called += 1;
    assert.equal(url, "https://api.hardcover.app/v1/graphql");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers["User-Agent"], "degoog-toolkit/1.0 (+https://github.com/SoPat712/degoog-toolkit)");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).query,
      `{ search(query: ${JSON.stringify(term)}, query_type: "Book", per_page: 5, page: 1) { results } }`);
    return fixture();
  });
  assert.equal(called, 1);
  for (const [kind, count, field] of [["author", 16, "author_names"], ["isbn", 3, "isbns"]]) {
    await provider.search(parsed("example", kind), async (_, options) => {
      const query = JSON.parse(options.body).query;
      assert.ok(query.includes(`per_page: ${count}`));
      assert.ok(query.includes(`fields: "${field}", weights: "1"`));
      assert.ok(!query.includes("typos"));
      return fixture();
    });
  }
});

test("normalizes object and JSON-string Typesense results", async () => {
  const provider = client();
  const objectDocs = await provider.search(parsed(), async () => fixture());
  const stringDocs = await provider.search(parsed(), async () => fixture([sample], true));
  assert.deepEqual(objectDocs, stringDocs);
  assert.deepEqual(objectDocs[0], {
    title: "The Book", subtitle: "A story", author_name: ["Example Author"],
    first_publish_year: 2020, number_of_pages_median: 314,
    ratings_average: 4.25, ratings_count: 57, subject: ["Fiction", "Fantasy"], isbn: ["9781234567897"],
    _source: "Hardcover", _url: "https://hardcover.app/books/the-book", _coverUrl: "https://images.example.org/book.jpg",
    _description: "A short description.", _series: "The Sequence", _seriesPosition: 2,
    _moods: ["Reflective"], _warnings: ["Violence"], _readers: 180,
    _ebook: true, _audiobook: true, _compilation: false,
  });
  assert.ok(!("key" in objectDocs[0]));
  assert.ok(!("cover_i" in objectDocs[0]));
});

test("rejects malformed fields and unsafe resource URLs", async () => {
  const documents = [null, "x", {}, { title: 12 }, {
    title: "Safe", author_names: [null, " Author ", 23, "Author"], genres: "Fiction", isbns: {},
    pages: Infinity, release_year: {}, rating: -1, ratings_count: "17",
    image: { url: "https://user:password@images.example.org/cover.jpg" }, slug: "../other?x=1",
    description: {}, series_names: [7, " A Series "], featured_series_position: "2.5",
    moods: ["Quiet", null], content_warnings: false, users_count: -1, has_ebook: "true",
  }, { title: "Script URL", image: { url: "javascript:alert(1)" }, slug: "x/y" },
  { title: "HTTP URL", image: { url: "http://example.org/cover.jpg" } }];
  const docs = await client().search(parsed(), async () => fixture(documents));
  assert.equal(docs.length, 3);
  assert.deepEqual(docs[0].author_name, ["Author"]);
  assert.deepEqual(docs[0].subject, []);
  assert.deepEqual(docs[0].isbn, []);
  assert.equal(docs[0].first_publish_year, undefined);
  assert.equal(docs[0].number_of_pages_median, undefined);
  assert.equal(docs[0].ratings_average, undefined);
  assert.equal(docs[0].ratings_count, undefined);
  assert.equal(docs[0]._series, "A Series");
  assert.equal(docs[0]._seriesPosition, "2.5");
  assert.equal(docs[0]._readers, 0);
  assert.equal(docs[0]._ebook, false);
  assert.deepEqual(docs[0]._moods, ["Quiet"]);
  for (const doc of docs) {
    assert.equal(doc._coverUrl, "");
    assert.ok(!("_url" in doc));
  }
});

test("caches only public normalized results, segregates tokens and uses positive/negative TTLs", async () => {
  const provider = client();
  const cache = memoryCache();
  let calls = 0;
  const fetcher = async () => { calls += 1; return fixture(); };
  const first = await provider.search(parsed(), fetcher, cache);
  first[0].title = "Changed";
  first[0].author_name.push("Injected");
  const second = await provider.search(parsed(), fetcher, cache);
  assert.equal(calls, 1);
  assert.equal(second[0].title, "The Book");
  assert.deepEqual(second[0].author_name, ["Example Author"]);
  assert.equal(cache.writes[0].ttl, 6 * 60 * 60 * 1000);
  provider.configure("__SET__");
  await provider.search(parsed(), fetcher, cache);
  assert.equal(calls, 1);
  provider.configure("second-private-token");
  await provider.search(parsed(), fetcher, cache);
  assert.equal(calls, 2);
  assert.notEqual(cache.writes[0].key, cache.writes[1].key);
  assert.ok(cache.writes[0].key.startsWith("books:hardcover:v1:"));
  assert.ok(!JSON.stringify(cache.writes).includes(TOKEN));
  assert.ok(!JSON.stringify(cache.writes).includes("second-private-token"));
  await provider.search(parsed("missing"), async () => { calls += 1; return fixture([]); }, cache);
  assert.equal(cache.writes.at(-1).ttl, 5 * 60 * 1000);
  assert.deepEqual(await provider.search(parsed("missing"), fetcher, cache), []);
  assert.equal(calls, 3);
});

test("deduplicates concurrent identical searches and survives cache failures", async () => {
  const provider = client();
  let calls = 0;
  let finish;
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => { finish = resolve; });
    return fixture();
  };
  const broken = { get: async () => { throw new Error(TOKEN); }, set: async () => { throw new Error(TOKEN); } };
  const requests = [provider.search(parsed(), fetcher, broken), provider.search(parsed(), fetcher, broken)];
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  finish();
  const [a, b] = await Promise.all(requests);
  assert.deepEqual(a, b);
  a[0].author_name.push("Mutation");
  assert.deepEqual(b[0].author_name, ["Example Author"]);
});

test("401/403 block future requests and placeholders/same tokens preserve the block", async () => {
  for (const status of [401, 403]) {
    const provider = client();
    let calls = 0;
    const fetcher = async () => { calls += 1; return new Response(TOKEN, { status }); };
    await assert.rejects(provider.search(parsed(), fetcher), reason("auth"));
    assert.equal(provider.isConfigured(), true);
    provider.configure(`Bearer ${TOKEN}`);
    provider.configure("__SET__");
    await assert.rejects(provider.search(parsed(), fetcher), reason("auth"));
    assert.equal(calls, 1);
    provider.configure("replacement-token");
    assert.equal(provider.isConfigured(), true);
    assert.equal((await provider.search(parsed(), async () => fixture())).length, 1);
  }
});

test("network, server and GraphQL failures expose only controlled errors", async () => {
  const provider = client();
  const fetchers = [
    async () => { throw new Error(`Connection failed ${TOKEN}`); },
    async () => new Response(TOKEN, { status: 500 }),
    async () => new Response("invalid-json"),
    async () => new Response(JSON.stringify({ errors: [{ message: TOKEN }], data: { search: { results: { hits: [] } } } })),
    async () => new Response(JSON.stringify({ data: { search: { results: "invalid-json" } } })),
    async () => new Response(JSON.stringify({ data: { search: { results: {} } } })),
  ];
  for (const fetcher of fetchers) await assert.rejects(provider.search(parsed(), fetcher), reason("unavailable"));
  assert.equal(provider.isConfigured(), true);
});

test("aborts a stalled outbound request after about four seconds", async () => {
  const provider = client();
  let signal;
  const start = Date.now();
  await assert.rejects(provider.search(parsed(), async (_, options) => {
    signal = options.signal;
    return new Promise(() => {}); // Even an uncooperative fetch implementation is bounded.
  }), reason("unavailable"));
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - start >= 3900);
  assert.ok(Date.now() - start < 6000);
});

test("429 honors bounded Retry-After seconds and HTTP dates across clients", async () => {
  const realNow = Date.now;
  let now = Math.ceil(realNow() / 86_400_000) * 86_400_000 + 86_400_000;
  Date.now = () => now;
  try {
    const provider = client();
    let calls = 0;
    await assert.rejects(provider.search(parsed(), async () => {
      calls += 1;
      return new Response("limited", { status: 429, headers: { "Retry-After": "120" } });
    }), reason("limit"));
    const other = client("other-token");
    await assert.rejects(other.search(parsed(), async () => { calls += 1; return fixture(); }), reason("limit"));
    now += 119_999;
    await assert.rejects(provider.search(parsed(), async () => fixture()), reason("limit"));
    now += 1;
    assert.equal((await provider.search(parsed(), async () => { calls += 1; return fixture(); })).length, 1);
    assert.equal(calls, 2);
    const longDate = new Date(now + 24 * 60 * 60 * 1000).toUTCString();
    await assert.rejects(provider.search(parsed(), async () => new Response("limited", {
      status: 429, headers: { "Retry-After": longDate },
    })), reason("limit"));
    now += 15 * 60 * 1000 - 1;
    await assert.rejects(provider.search(parsed(), async () => fixture()), reason("limit"));
    now += 1;
    assert.equal((await provider.search(parsed(), async () => fixture())).length, 1);
    await assert.rejects(provider.search(parsed(), async () => new Response("limited", {
      status: 429, headers: { "Retry-After": "-10" },
    })), reason("limit"));
    now += 999;
    await assert.rejects(provider.search(parsed(), async () => fixture()), reason("limit"));
    now += 1;
    assert.equal((await provider.search(parsed(), async () => fixture())).length, 1);
  } finally {
    Date.now = realNow;
  }
});

test("process guards permit at most 30 requests per rolling minute and 4500 per UTC day", async () => {
  const realNow = Date.now;
  let now = Math.ceil(realNow() / 86_400_000) * 86_400_000 + 3 * 86_400_000;
  Date.now = () => now;
  try {
    const provider = client();
    const other = client("other-token");
    let calls = 0;
    const fetcher = async () => { calls += 1; return fixture([]); };
    for (let i = 0; i < 30; i += 1) await provider.search(parsed(String(i)), fetcher);
    await assert.rejects(other.search(parsed(), fetcher), reason("limit"));
    assert.equal(calls, 30);
    now += 59_999;
    await assert.rejects(provider.search(parsed(), fetcher), reason("limit"));
    now += 1;
    for (let i = 30; i < 4500; i += 1) {
      if (i > 30 && i % 30 === 0) now += 60_000;
      await provider.search(parsed(String(i)), fetcher);
    }
    assert.equal(calls, 4500);
    now += 60_000;
    await assert.rejects(other.search(parsed(), fetcher), reason("limit"));
    assert.equal(calls, 4500);
    now = (Math.floor(now / 86_400_000) + 1) * 86_400_000;
    await provider.search(parsed(), fetcher);
    assert.equal(calls, 4501);
  } finally {
    Date.now = realNow;
  }
});
