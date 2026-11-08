import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { routes, slot } from "./index.js";

const encodeAsset = (url) =>
  Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const movieDetails = (id, title, releaseDate = "2021-09-15") => ({
  id,
  title,
  overview: "Plot.",
  release_date: releaseDate,
  vote_average: 7.5,
  genres: [],
});

let searches;
let calls;
let tmdb;
let other;

const memoryCache = () => {
  const store = new Map();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => void store.set(key, value),
    delete: async (key) => void store.delete(key),
    clear: async () => store.clear(),
  };
};

async function setup(settings = {}, { cache = false } = {}) {
  searches = [];
  calls = [];
  tmdb = () => ({});
  other = () => new Response("not found", { status: 404 });
  const fetch = async (address) => {
    const url = new URL(String(address));
    calls.push(url);
    if (url.hostname !== "api.themoviedb.org") return other(url);
    if (url.pathname === "/3/search/multi") searches.push(url.searchParams.get("query"));
    return Response.json(tmdb(url));
  };
  await slot.init({
    apiBase: "/api/plugin/test-tmdb",
    template: '<div class="tmdb-result">{{content}}</div>',
    fetch,
    ...(cache ? { useCache: () => memoryCache() } : {}),
  });
  slot.configure({ apiKey: "test-key", ...settings });
  return fetch;
}

const titleOf = (html) => html.match(/tmdb-title-text">([^<]*)/)?.[1] ?? null;

async function render(query, results = []) {
  const out = await slot.execute(query, { locale: "en-US", results });
  return out.html ? titleOf(out.html) : null;
}

beforeEach(() => setup());

test("asset proxy no longer serves files from general-purpose CDNs", async () => {
  const asset = routes.find(({ path }) => path === "asset");
  for (const url of [
    "https://cdn.jsdelivr.net/gh/attacker/repo@main/x.svg",
    "https://cdn.simpleicons.org/themoviedatabase",
  ]) {
    const response = await asset.handler(
      new Request(`https://degoog.test/api/plugin/test-tmdb/asset?u=${encodeAsset(url)}`),
    );
    assert.equal(response.status, 400, url);
  }
  assert.equal(calls.length, 0, "rejected hosts are never fetched");
});

test("asset proxy refuses SVG even from an allowed host and hardens raster responses", async () => {
  const asset = routes.find(({ path }) => path === "asset");
  const request = (path) =>
    asset.handler(
      new Request(
        `https://degoog.test/api/plugin/test-tmdb/asset?u=${encodeAsset(`https://image.tmdb.org/t/p/w92${path}`)}`,
      ),
    );

  other = (url) =>
    url.pathname.endsWith(".svg")
      ? new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', {
          headers: { "content-type": "image/svg+xml" },
        })
      : new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { "content-type": "image/jpeg; charset=binary" },
        });

  // image.tmdb.org is not api.themoviedb.org, so the mock routes it to `other`.
  const svg = await request("/logo.svg");
  assert.equal(svg.status, 415);
  assert.doesNotMatch(await svg.text(), /<script/);

  const jpeg = await request("/poster.jpg");
  assert.equal(jpeg.status, 200);
  assert.equal(jpeg.headers.get("content-type"), "image/jpeg");
  assert.equal(jpeg.headers.get("x-content-type-options"), "nosniff");
  assert.match(jpeg.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);
});

test("everyday words are not media intent on their own", async () => {
  tmdb = (url) => {
    if (url.pathname === "/3/search/multi") {
      const query = url.searchParams.get("query");
      if (query === "dog") return { results: [{ id: 626735, media_type: "movie", title: "Dog", popularity: 3 }] };
      if (query === "apple") {
        return { results: [{ id: 9, media_type: "tv", name: "Apple Cider Vinegar", popularity: 30 }] };
      }
      return { results: [] };
    }
    const match = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    return match ? movieDetails(Number(match[1]), "Dog", "2022-02-18") : {};
  };

  for (const query of ["dog show", "apple watch", "product review", "smart tv"]) {
    assert.equal(await render(query), null, query);
  }
  assert.deepEqual(searches, [], "no TMDB search without a strong media keyword");

  // A strong keyword still finds the same exact-title movie.
  assert.equal(await render("dog movie"), "Dog");
  // A one-word prefix of a longer title is not a match, even with intent.
  assert.equal(await render("apple series"), null);
});

test("partial or obscure title matches need an audience", async () => {
  tmdb = (url) =>
    url.pathname === "/3/search/multi"
      ? { results: [{ id: 1, media_type: "movie", title: "Dogville", popularity: 50, vote_count: 4000 }] }
      : movieDetails(1, "Dogville");
  assert.equal(await render("dog movie"), null, "whole words only: dog is not Dogville");

  tmdb = (url) =>
    url.pathname === "/3/search/multi"
      ? { results: [{ id: 2, media_type: "movie", title: "Lamp", popularity: 0.2, vote_count: 1 }] }
      : movieDetails(2, "Lamp");
  assert.equal(await render("lamp film"), null, "exact title with no audience");
});

test("plural keywords, punctuation and repeated keywords still find the title", async () => {
  tmdb = (url) => {
    if (url.pathname === "/3/search/multi") {
      const query = url.searchParams.get("query");
      const results = {
        "tom hanks": [{ id: 31, media_type: "person", name: "Tom Hanks", popularity: 60 }],
        "alien romulus": [{ id: 945961, media_type: "movie", title: "Alien: Romulus", popularity: 150 }],
        "oceans eleven": [{ id: 161, media_type: "movie", title: "Ocean's Eleven", popularity: 60 }],
        dune: [{ id: 438631, media_type: "movie", title: "Dune", popularity: 200 }],
        "the truman": [{ id: 37165, media_type: "movie", title: "The Truman Show", popularity: 40, vote_count: 19000 }],
      }[query];
      return { results: results || [] };
    }
    const person = url.pathname.match(/^\/3\/person\/(\d+)$/);
    if (person) return { id: 31, name: "Tom Hanks" };
    const movie = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (movie) {
      const names = { 945961: "Alien: Romulus", 161: "Ocean's Eleven", 438631: "Dune", 37165: "The Truman Show" };
      return movieDetails(Number(movie[1]), names[movie[1]]);
    }
    return {};
  };

  assert.equal(await render("tom hanks movies"), "Tom Hanks");
  assert.equal(await render("tom hanks films"), "Tom Hanks");
  assert.equal(await render("alien romulus movie"), "Alien: Romulus");
  assert.equal(await render("oceans eleven movie"), "Ocean's Eleven");
  assert.equal(await render("watch dune movie"), "Dune");
  assert.equal(searches.at(-1), "dune", "every keyword is stripped, not just the first");
  assert.equal(await render("the truman show movie"), "The Truman Show");
});

test("the first supported result link wins over a lower-ranked TMDB link", async () => {
  tmdb = (url) => {
    if (url.pathname === "/3/find/tt15239678") return { movie_results: [{ id: 693134 }] };
    const movie = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (movie) return movieDetails(Number(movie[1]), movie[1] === "693134" ? "Dune: Part Two" : "Dune");
    return {};
  };
  const results = [
    { url: "https://www.imdb.com/title/tt15239678/" },
    ...Array.from({ length: 8 }, (_, i) => ({ url: `https://example.com/${i}` })),
    { url: "https://www.themoviedb.org/movie/841-dune" },
  ];
  assert.equal(await render("dune", results), "Dune: Part Two");

  // A TMDB link ranked first still wins over a later IMDb link.
  assert.equal(
    await render("dune", [
      { url: "https://www.themoviedb.org/movie/841-dune" },
      { url: "https://www.imdb.com/title/tt15239678/" },
    ]),
    "Dune",
  );
});

test("Jellyfin links only to the library item with the same TMDB id", async () => {
  await setup(
    {
      jellyfinUrl: "http://jellyfin.test:8096",
      jellyfinApiKey: "jf-key",
    },
    { cache: true },
  );
  const jellyfinRequests = [];
  tmdb = (url) => {
    const movie = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (movie) return movieDetails(Number(movie[1]), "Dune", movie[1] === "841" ? "1984-12-14" : "2021-09-15");
    const tv = url.pathname.match(/^\/3\/tv\/(\d+)$/);
    if (tv) return { id: Number(tv[1]), name: "Dune", first_air_date: "2000-12-03", seasons: [] };
    return {};
  };
  other = (url) => {
    jellyfinRequests.push(url);
    const type = url.searchParams.get("IncludeItemTypes");
    const items =
      type === "Series"
        ? [{ Id: "series-dune", Name: "Frank Herbert's Dune", Type: "Series", ProviderIds: { Tmdb: "1906" } }]
        : [
            { Id: "part-two", Name: "Dune: Part Two", Type: "Movie", ProductionYear: 2024, ProviderIds: { Tmdb: "693134" } },
            { Id: "dune-1984", Name: "Dune", Type: "Movie", ProductionYear: 1984, ProviderIds: { Tmdb: "841" } },
            { Id: "dune-2021", Name: "Dune", Type: "Movie", ProductionYear: 2021, ProviderIds: { Tmdb: "438631" } },
          ];
    return Response.json({ Items: items });
  };

  const html = async (results) => (await slot.execute("dune", { locale: "en-US", results })).html;

  const dune2021 = await html([{ url: "https://www.themoviedb.org/movie/438631-dune" }]);
  assert.match(dune2021, /details\?id=dune-2021/);
  assert.doesNotMatch(dune2021, /details\?id=part-two/);
  assert.equal(jellyfinRequests.at(-1).searchParams.get("IncludeItemTypes"), "Movie");
  assert.match(jellyfinRequests.at(-1).searchParams.get("Fields"), /ProviderIds/);

  const dune1984 = await html([{ url: "https://www.themoviedb.org/movie/841-dune" }]);
  assert.match(dune1984, /details\?id=dune-1984/);

  // A series with the same title must not reuse the movie's library item.
  const series = await html([{ url: "https://www.themoviedb.org/tv/1906-dune" }]);
  assert.match(series, /details\?id=series-dune/);
  assert.equal(jellyfinRequests.at(-1).searchParams.get("IncludeItemTypes"), "Series");
});

test("Jellyfin items without provider ids need the exact title and year", async () => {
  await setup({
    jellyfinUrl: "http://jellyfin.test:8096",
    jellyfinApiKey: "jf-key",
  });
  tmdb = (url) => (/^\/3\/movie\/438631$/.test(url.pathname) ? movieDetails(438631, "Dune") : {});
  let items = [
    { Id: "part-two", Name: "Dune: Part Two", ProductionYear: 2024 },
    { Id: "dune-1984", Name: "Dune", ProductionYear: 1984 },
  ];
  other = () => Response.json({ Items: items });
  const html = async () =>
    (await slot.execute("dune", { locale: "en-US", results: [{ url: "https://www.themoviedb.org/movie/438631" }] })).html;

  assert.doesNotMatch(await html(), /tmdb-rating-item--jellyfin/);

  items = [...items, { Id: "dune-2021", Name: "Dune", ProductionYear: 2021 }];
  assert.match(await html(), /details\?id=dune-2021/);
});
