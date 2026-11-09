import assert from "node:assert/strict";
import test from "node:test";
import { parseMusicQuery, routes, slot } from "./index.js";
import { lyricsLines, lyricsSectionHtml } from "./lyrics.mjs";

// Placeholder lyrics: tests never need real song text.
const PLAIN = "Line one\nLine two\n\nLine three\nLine four\nLine five\nLine six\nLine seven\n";
const record = (trackName, artistName, extra = {}) => ({
  id: Math.floor(Math.random() * 1e6), trackName, artistName, albumName: "Album", duration: 484,
  instrumental: false, plainLyrics: PLAIN, syncedLyrics: null, ...extra,
});
const MIRRORS = {
  id: "c01bd40c-5f23-4c34-9238-7a5f226f6c0e",
  title: "Mirrors",
  length: 484000,
  "artist-credit": [{ name: "Justin Timberlake", artist: { id: "596ffa74-3d08-44ef-b113-765d43d12738", name: "Justin Timberlake" } }],
  releases: [{ title: "The 20/20 Experience", status: "Official", "release-group": { id: "deae6fc2-a675-4f35-9565-d2aaea4872c7", title: "The 20/20 Experience", "primary-type": "Album" } }],
};

function memoryCache() {
  const store = new Map();
  return { get: async (key) => store.get(key) ?? null, set: async (key, value) => { store.set(key, value); } };
}

/** Routes LRCLIB and MusicBrainz requests to handlers and records them. */
function services({ lrclib = () => Response.json([]), musicbrainz = () => Response.json({ recordings: [MIRRORS] }) } = {}) {
  const requests = [];
  const fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    return url.hostname === "lrclib.net" ? lrclib(url) : musicbrainz(url);
  };
  return { fetch, requests, lrclibCalls: () => requests.filter((url) => url.hostname === "lrclib.net") };
}

test("lyrics queries parse as songs; lyrics topics and tools do not", () => {
  for (const [query, term] of [
    ["mirrors lyrics", "mirrors"], ["Mirrors Lyrics?", "Mirrors"], ["lyrics to bohemian rhapsody", "bohemian rhapsody"],
    ["lyrics mirrors justin timberlake", "mirrors justin timberlake"], ["hello adele song lyrics", "hello adele"],
    ["mirrors by justin timberlake lyrics", "mirrors by justin timberlake"],
  ]) assert.deepEqual(parseMusicQuery(query), { kind: "recording", term, lyrics: true }, query);
  for (const query of [
    "lyrics", "song lyrics", "lyrics generator", "rap lyrics", "love song lyrics", "christmas song lyrics",
    "genius lyrics", "lyrics by taylor swift", "lyrics translation", "lyrics website", "how to write lyrics",
    "mirrors lyrics meaning", "funny lyrics",
  ]) assert.equal(parseMusicQuery(query), null, query);
});

test("tracking numbers after track are parcels, not songs", async () => {
  for (const query of ["track 1Z5R89390357567127", "track 9400 1112 0620 6406 2607 87", "track TBA123456789012"]) {
    assert.equal(parseMusicQuery(query), null, query);
    const rendered = await slot.execute(query, { results: [], fetch: () => { throw new Error("must not fetch"); } });
    assert.equal(rendered.html, "", query);
  }
  assert.deepEqual(parseMusicQuery("track 1979"), { kind: "recording", term: "1979" });
});

test("lyric lines come from plain lyrics, else synced lyrics without timestamps", () => {
  assert.deepEqual(lyricsLines({ plainLyrics: "\nA\n\n\nB\n\n" }), ["A", "", "B"]);
  assert.deepEqual(lyricsLines({ plainLyrics: null, syncedLyrics: "[00:01.00] A\n[00:02.50][00:40.00] B\n[00:03.00] " }), ["A", "B"]);
  assert.deepEqual(lyricsLines({ instrumental: true, plainLyrics: "x" }), []);
  const html = lyricsSectionHtml(["<b>", "B"], { id: "x" });
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /data-music-lyrics-toggle[^>]*hidden/, "two lines need no Show more");
});

test("a lyrics query names its artist through LRCLIB and opens the lyrics", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const { fetch, requests } = services({
    lrclib: (url) => url.pathname === "/api/search"
      ? Response.json([record("Justin Timberlake - Mirrors (Official Video)", "Justin Timberlake"), record("Mirrors", "Justin Timberlake")])
      : Response.json(record("Mirrors", "Justin Timberlake")),
  });
  const { html } = await slot.execute("mirrors justin timberlake lyrics", { results: [], fetch });

  const brainz = requests.find((url) => url.hostname === "musicbrainz.org");
  assert.equal(brainz.searchParams.get("query"), 'recording:"Mirrors" AND artist:"Justin Timberlake"');
  const get = requests.find((url) => url.pathname === "/api/get");
  assert.deepEqual(Object.fromEntries(get.searchParams), {
    track_name: "Mirrors", artist_name: "Justin Timberlake", album_name: "The 20/20 Experience", duration: "484",
  });
  assert.match(html, /music-song-title">Mirrors</);
  assert.match(html, /<section class="music-lyrics" data-music-lyrics-open/);
  assert.match(html, /music-lyrics-line music-lyrics-extra">Line seven</);
  assert.match(html, /aria-expanded="true"[^>]*>\{\{ t:plugin-music\.showLess \}\}</);
  assert.match(html, /\{\{ t:plugin-music\.lyricsFrom \}\} <a href="https:\/\/lrclib\.net\/"/);
});

test("a bare title needs one clearly dominant artist", async () => {
  const titled = (artists) => (url) => url.searchParams.has("q")
    ? Response.json([])
    : Response.json(artists.map((artist) => record("Bohemian Rhapsody", artist)));

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const dominant = services({
    lrclib: titled(["Queen", "Queen", "Queen", "Queen", "Pentatonix"]),
    musicbrainz: () => Response.json({ recordings: [{ ...MIRRORS, title: "Bohemian Rhapsody", "artist-credit": [{ name: "Queen" }] }] }),
  });
  const { html } = await slot.execute("bohemian rhapsody lyrics", { results: [], fetch: dominant.fetch });
  assert.match(html, /music-song-title">Bohemian Rhapsody</);
  assert.match(html, /Song by\b|songBy \}\} Queen/);

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const split = services({ lrclib: titled(["Adele", "Adele", "Lionel Richie", "Lionel Richie", "Adele"]) });
  assert.equal((await slot.execute("hello lyrics", { results: [], fetch: split.fetch })).html, "");
  assert.equal(split.requests.filter((url) => url.hostname === "musicbrainz.org").length, 0, "no MusicBrainz call without an artist");
});

test("agreeing lyric-site results name the artist without searching LRCLIB", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const results = [
    { title: "Justin Timberlake – Mirrors Lyrics | Genius Lyrics", url: "https://genius.com/Justin-timberlake-mirrors-lyrics" },
    { title: "Justin Timberlake - Mirrors Lyrics | AZLyrics.com", url: "https://www.azlyrics.com/lyrics/justintimberlake/mirrors.html" },
  ];
  const { fetch, lrclibCalls } = services({ lrclib: () => Response.json(record("Mirrors", "Justin Timberlake")) });
  const { html } = await slot.execute("mirrors lyrics", { results, fetch });
  assert.match(html, /data-music-lyrics-open/);
  assert.deepEqual(lrclibCalls().map((url) => url.pathname), ["/api/get"]);
});

test("lyric sites that clearly favour one artist outweigh a same-named song", async () => {
  const site = (artist, host = "genius.com") => ({ title: `${artist} – Mirrors Lyrics | Genius Lyrics`, url: `https://${host}/${artist.replace(/\W+/g, "-")}-mirrors-lyrics` });
  const real = [
    site("Justin Timberlake"), site("Justin Timberlake", "www.musixmatch.com"), site("Niall Horan"),
    site("Justin Timberlake", "www.azlyrics.com"), site("Justin Timberlake", "www.songlyrics.com"),
  ];
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const { fetch, lrclibCalls } = services({ lrclib: () => Response.json(record("Mirrors", "Justin Timberlake")) });
  const { html } = await slot.execute("mirrors lyrics", { results: real, fetch });
  assert.match(html, /\{\{ t:plugin-music\.songBy \}\} <a[^>]*>Justin Timberlake</);
  assert.deepEqual(lrclibCalls().map((url) => url.pathname), ["/api/get"], "named without an LRCLIB search");

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const close = services({ lrclib: () => Response.json([]) });
  const split = [site("Justin Timberlake"), site("Justin Timberlake", "www.azlyrics.com"), site("Niall Horan")];
  assert.equal((await slot.execute("mirrors lyrics", { results: split, fetch: close.fetch })).html, "", "two to one is not clear");
});

test("a missed signature falls back to search, and missing lyrics keep the card", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const fallback = services({
    lrclib: (url) => url.pathname === "/api/get"
      ? new Response("{}", { status: 404 })
      : Response.json([
        record("Mirrors", "Justin Timberlake", { duration: 200, plainLyrics: "Wrong length" }),
        record("Mirrors", "Justin Timberlake", { duration: 485, plainLyrics: "Right length" }),
        record("Mirrors", "Someone Else", { duration: 484, plainLyrics: "Wrong artist" }),
      ]),
  });
  const { html } = await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch: fallback.fetch });
  assert.match(html, /music-lyrics-line">Right length</);

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const offline = services({ lrclib: () => { throw new Error("offline"); } });
  const card = (await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch: offline.fetch })).html;
  assert.match(card, /music-song-title">Mirrors</);
  assert.doesNotMatch(card, /music-lyrics/);
});

test("a throttled MusicBrainz is retried once, then LRCLIB alone shows the song", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  let throttled = 1;
  const retried = services({
    lrclib: () => Response.json(record("Mirrors", "Justin Timberlake")),
    musicbrainz: () => (throttled-- > 0 ? new Response("", { status: 503 }) : Response.json({ recordings: [MIRRORS] })),
  });
  const first = (await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch: retried.fetch })).html;
  assert.equal(retried.requests.filter((url) => url.hostname === "musicbrainz.org").length, 2);
  assert.match(first, /href="https:\/\/musicbrainz\.org\/release-group\/deae6fc2/, "the retry's MusicBrainz card");

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const down = services({
    lrclib: () => Response.json(record("Mirrors", "Justin Timberlake", { albumName: "The 20/20 Experience" })),
    musicbrainz: () => new Response("", { status: 503 }),
  });
  const html = (await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch: down.fetch })).html;
  assert.equal(down.requests.filter((url) => url.hostname === "musicbrainz.org").length, 2, "one retry only");
  assert.match(html, /music-song-title">Mirrors</);
  assert.match(html, /\{\{ t:plugin-music\.songBy \}\} Justin Timberlake/);
  assert.match(html, /music-fact-value">The 20\/20 Experience</);
  assert.match(html, /music-fact-value">8:04</);
  assert.match(html, /<section class="music-lyrics" data-music-lyrics-open/);
  assert.doesNotMatch(html, /musicbrainz\.org/, "no MusicBrainz links without MusicBrainz data");

  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const silent = services({ lrclib: () => new Response("{}", { status: 404 }), musicbrainz: () => new Response("", { status: 503 }) });
  assert.equal((await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch: silent.fetch })).html, "",
    "no card without a song record from either service");
});

test("a hung MusicBrainz request leaves time for the LRCLIB card inside the slot timeout", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "lrclib.net") return Response.json(record("Mirrors", "Justin Timberlake"));
    return new Promise((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  const started = Date.now();
  const { html } = await slot.execute("mirrors by justin timberlake lyrics", { results: [], fetch });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 9000, `finished in ${elapsed}ms, inside core's 10 s slot timeout`);
  assert.match(html, /music-lyrics-line">Line one</);
});

test("other song cards load lyrics from the plugin route after rendering", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', routeUrl: (path) => `/api/plugin/store-music/${path}` });
  const { fetch, lrclibCalls } = services();
  const { html } = await slot.execute("song mirrors", { results: [], fetch });
  assert.equal(lrclibCalls().length, 0);
  const src = html.match(/data-music-lyrics-src="([^"]+)"/)?.[1].replace(/&amp;/g, "&");
  const url = new URL(src, "http://localhost");
  assert.equal(url.pathname, "/api/plugin/store-music/lyrics");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    track: "Mirrors", artist: "Justin Timberlake", album: "The 20/20 Experience", duration: "484",
  });
  assert.match(html, /<section class="music-lyrics" data-music-lyrics-src="[^"]+" hidden/);
});

test("the lyrics route answers from LRCLIB and validates its input", async () => {
  const route = routes.find((item) => item.path === "lyrics");
  assert.equal(route.method, "get");
  const seen = [];
  slot.init({ useCache: memoryCache, fetch: async (input) => {
    seen.push(new URL(input));
    return new URL(input).searchParams.get("track_name") === "Mirrors"
      ? Response.json(record("Mirrors", "Justin Timberlake"))
      : new Response("{}", { status: 404 });
  } });
  const ok = await route.handler(new Request("http://localhost/api/plugin/music/lyrics?track=Mirrors&artist=Justin%20Timberlake&duration=484"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /max-age=86400/);
  assert.deepEqual((await ok.json()).lines.slice(0, 2), ["Line one", "Line two"]);
  assert.equal(seen[0].hostname, "lrclib.net");

  assert.equal((await route.handler(new Request("http://localhost/x?track=Mirrors"))).status, 400);
  assert.equal((await route.handler(new Request("http://localhost/x?track=Unknown&artist=Nobody"))).status, 404);
});
