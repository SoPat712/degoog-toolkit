import assert from "node:assert/strict";
import test from "node:test";
import { parseMusicQuery, slot } from "./index.js";

const RADIOHEAD = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
const group = (n, title, type, date, secondary = []) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title, "primary-type": type, "first-release-date": date, "secondary-types": secondary,
});

function memoryCache() {
  const store = new Map();
  return { get: async (key) => store.get(key) ?? null, set: async (key, value) => { store.set(key, value); } };
}

test("explicit keywords skip everyday compounds, verbs and topics", () => {
  for (const query of [
    "track my package", "track package", "fedex track", "race track", "train tracks", "go kart track",
    "back on track", "track and field", "track flight 123", "medical records", "my medical records",
    "criminal record", "world record", "guinness world record", "off the record", "record player",
    "record screen on mac", "music theory", "music festival", "photo album", "google photos album",
    "artist statement", "songs about rain", "love songs", "new album", "dune book",
  ]) assert.equal(parseMusicQuery(query), null, query);

  for (const [query, kind, term] of [
    ["radiohead discography", "artist", "radiohead"], ["music radiohead", "artist", "radiohead"],
    ["new order discography", "artist", "new order"], ["album in rainbows", "release-group", "in rainbows"],
    ["album a night at the opera", "release-group", "a night at the opera"], ["song my way", "recording", "my way"],
    ["what a wonderful world song", "recording", "what a wonderful world"],
  ]) assert.deepEqual(parseMusicQuery(query), { kind, term }, query);
});

test("rejected explicit queries never contact MusicBrainz", async () => {
  slot.init({});
  for (const query of ["track my package", "world record", "photo album", "record player"]) {
    const rendered = await slot.execute(query, { results: [], fetch: () => { throw new Error("must not fetch"); } });
    assert.equal(rendered.html, "", query);
  }
});

test("video and lyrics titles need a matching MusicBrainz recording", async () => {
  slot.init({});
  const results = [{ title: "Gordon Ramsay - Beef Wellington", url: "https://www.youtube.com/watch?v=abc" }];
  for (const fetch of [
    async () => Response.json({ recordings: [] }),
    async () => new Response("", { status: 503 }),
    async () => { throw new Error("offline"); },
  ]) assert.equal((await slot.execute("gordon ramsay beef wellington", { results, fetch })).html, "");
});

test("explicit song searches never fall back to the first unrelated recording", async () => {
  slot.init({});
  const rendered = await slot.execute("song mirrors", {
    results: [],
    fetch: async () => Response.json({ recordings: [{ title: "Reflections", "artist-credit": [{ name: "Someone" }] }] }),
  });
  assert.equal(rendered.html, "");
});

test("artist cards browse studio albums and EPs by MBID and cache the discography", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>', useCache: memoryCache });
  const requests = [];
  const fetch = async (input, init) => {
    const url = new URL(input);
    requests.push(url);
    assert.match(init.headers["User-Agent"], /degoog-toolkit/);
    if (url.pathname.endsWith("/artist")) {
      return Response.json({ artists: [{ id: RADIOHEAD, name: "Radiohead", type: "Group", country: "GB" }] });
    }
    return Response.json({ "release-groups": [
      group(1, "Pablo Honey", "Album", "1993-02-22"),
      group(2, "I Might Be Wrong: Live Recordings", "Album", "2001-11-07", ["Live"]),
      group(3, "My Iron Lung", "EP", "1994-09-24"),
      group(4, "A Moon Shaped Pool", "Album", "2016-05-08"),
      group(5, "The Best Of", "Album", "2008-05-28", ["Compilation"]),
      { id: "not-an-mbid", title: "Broken", "primary-type": "Album" },
    ] });
  };

  const rendered = await slot.execute("radiohead discography", { results: [], fetch });
  assert.equal(requests.length, 2);
  const browse = requests[1];
  assert.equal(browse.pathname, "/ws/2/release-group");
  assert.equal(browse.searchParams.get("artist"), RADIOHEAD);
  assert.equal(browse.searchParams.get("type"), "album|ep");
  assert.equal(browse.searchParams.get("release-group-status"), "website-default");
  assert.equal(browse.searchParams.has("inc"), false);

  const titles = [...rendered.html.matchAll(/class="music-release-title"[^>]*>([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(titles, ["A Moon Shaped Pool", "Pablo Honey", "My Iron Lung"]);
  assert.match(rendered.html, /\{\{ t:plugin-music\.discography \}\}/);

  const cached = await slot.execute("radiohead discography", { results: [], fetch: () => { throw new Error("must use cache"); } });
  assert.equal(cached.html, rendered.html);
  slot.init({});
});

test("a failed discography browse still renders the artist", async () => {
  slot.init({ template: '<div class="music-card">{{content}}</div>' });
  const rendered = await slot.execute("artist Radiohead", {
    results: [],
    fetch: async (input) => new URL(input).pathname.endsWith("/artist")
      ? Response.json({ artists: [{ id: RADIOHEAD, name: "Radiohead", type: "Group" }] })
      : new Response("", { status: 503 }),
  });
  assert.match(rendered.html, /music-title-link[^>]*>Radiohead</);
  assert.doesNotMatch(rendered.html, /plugin-music\.discography/);
});
