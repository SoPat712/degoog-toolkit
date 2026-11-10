import assert from "node:assert/strict";
import test from "node:test";
import { implicitMusicHint, parseMusicResultHint, slot } from "./index.js";
import { streamingRecordingHint } from "./result-hints.mjs";

const spotify = { title: "Mirrors - song and lyrics by Justin Timberlake | Spotify", url: "https://open.spotify.com/track/4rHZZAmHpZrA3iH5zx8frV" };
const apple = { title: "‎Mirrors - Song by Justin Timberlake - Apple Music", url: "https://music.apple.com/us/song/mirrors/1441493608" };
const soundcloud = { title: "Stream Mirrors by Justin Timberlake | Listen online for free on SoundCloud", url: "https://soundcloud.com/justintimberlake/mirrors-1" };

for (const result of [spotify, apple, soundcloud]) {
  for (const query of ["mirrors", "mirrors justin timberlake", "justin timberlake mirrors", "mirrors by justin timberlake"]) {
    test(`${new URL(result.url).hostname} recognizes ${query}`, () => {
      assert.equal(slot.trigger(query), true);
      const hint = parseMusicResultHint(query, [result]);
      assert.equal(hint?.recordingTitle, "Mirrors");
      assert.equal(hint.artist, "Justin Timberlake");
      assert.equal(hint.fromStreamingResult, true);
    });
  }
}

test("streaming pages support locale prefixes, lyrics labels and album track links", () => {
  for (const result of [
    { ...spotify, url: spotify.url.replace("/track/", "/intl-de/track/") },
    { ...spotify, title: "Mirrors - song by Justin Timberlake - Spotify" },
    { ...apple, title: "‎Mirrors - Song with Lyrics by Justin Timberlake - Apple Music", url: "https://music.apple.com/us/song/1441493608" },
    { ...apple, url: "https://music.apple.com/us/album/the-20-20-experience/1441493500?i=1441493608" },
  ]) assert.equal(streamingRecordingHint(result, "mirrors")?.artist, "Justin Timberlake");
  assert.equal(streamingRecordingHint({ ...spotify, title: "Déjà Vu - song and lyrics by Beyoncé | Spotify" }, "deja vu beyonce")?.artist, "Beyoncé");
  assert.equal(streamingRecordingHint({ ...spotify, title: "青花瓷 - song and lyrics by 周杰倫 | Spotify" }, "青花瓷")?.artist, "周杰倫");
});

test("playlists, artist pages, albums, profiles, search URLs and lookalikes are not songs", () => {
  for (const url of [spotify.url.replace("/track/", "/playlist/"), spotify.url.replace("/track/", "/artist/"), spotify.url.replace("/track/", "/album/"), "https://open.spotify.com/search/Mirrors",
    "https://music.apple.com/us/album/mirrors/1441493608", "https://music.apple.com/us/artist/justin-timberlake/398128",
    "https://soundcloud.com/justintimberlake", "https://soundcloud.com/justintimberlake/sets/mirrors", "https://soundcloud.com/justintimberlake/tracks", "https://soundcloud.com/discover/mirrors",
    "https://open.spotify.com.evil.test/track/4rHZZAmHpZrA3iH5zx8frV", "https://user:pass@open.spotify.com/track/4rHZZAmHpZrA3iH5zx8frV", "file://open.spotify.com/track/4rHZZAmHpZrA3iH5zx8frV", "not a URL"])
    for (const result of [spotify, apple, soundcloud]) assert.equal(streamingRecordingHint({ ...result, url }, "mirrors"), null, url);
});

test("streaming titles must match the entire title or title-and-artist query", async () => {
  for (const query of ["mirrors lyrics meaning", "mirrors wall decor", "justin timberlake", "mirrors tour tickets", "mirrors adele", "weather tomorrow", "!si mirrors", "time in rome", "mirrors tutorial", "site:spotify.com mirrors"]) {
    assert.equal(parseMusicResultHint(query, [spotify, apple, soundcloud]), null, query);
    let calls = 0;
    assert.equal((await slot.execute(query, { results: [spotify], fetch: () => { calls++; throw new Error("must not fetch"); } })).html, "");
    assert.equal(calls, 0, query);
  }
  assert.equal(parseMusicResultHint("mirrors", [{ ...spotify, title: null }]), null);
  assert.equal(parseMusicResultHint("mirrors", [{ ...spotify, title: "x".repeat(501) }]), null);
});

test("conflicting song identities abstain; equivalent evidence uses strict metadata matching", () => {
  assert.equal(parseMusicResultHint("mirrors", [spotify, { ...spotify, title: "Mirrors - song and lyrics by Blue Öyster Cult | Spotify" }]), null);
  assert.equal(parseMusicResultHint("mirrors", Array(8).fill({}).concat(spotify)), null);
  const lyrics = { title: "Justin Timberlake – Mirrors Lyrics | Genius Lyrics", url: "https://genius.com/Justin-timberlake-mirrors-lyrics" };
  assert.equal(parseMusicResultHint("mirrors justin timberlake", [lyrics, spotify, apple, soundcloud])?.fromStreamingResult, true);
});

test("new streaming evidence only renders a matching MusicBrainz title and artist", async () => {
  for (const [title, artist, visible] of [
    ["Mirrors", "Justin Timberlake", true], ["Other Song", "Justin Timberlake", false],
    ["Mirrors", "Blue Öyster Cult", false], ["Mirrors", "Justin Timberlake Tribute Band", false],
  ]) {
    slot.init({ useCache: () => ({ get: async () => ({ recordings: [{ title, "artist-credit": [{ name: artist }] }] }) }) });
    const rendered = await slot.execute("mirrors justin timberlake", { results: [spotify] });
    assert.equal(Boolean(rendered.html), visible);
    if (visible) assert.match(rendered.html, /\{\{ t:plugin-music\.songBy \}\} Justin Timberlake/);
  }
  slot.init({ useCache: () => ({ get: async () => ({ recordings: [] }) }) });
  assert.equal((await slot.execute("mirrors justin timberlake", { results: [soundcloud] })).html, "", "Do not mistake a SoundCloud uploader for an artist absent matching metadata");
  slot.init({});
});

test("explicit songs retain streaming evidence and use one server-side metadata request", async () => {
  slot.init({});
  let calls = 0;
  const rendered = await slot.execute("song mirrors", { results: [apple], fetch: async (input) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.origin, "https://musicbrainz.org");
    assert.equal(url.searchParams.get("query"), 'recording:"Mirrors" AND artist:"Justin Timberlake"');
    return Response.json({ recordings: [{ title: "Mirrors", "artist-credit": [{ name: "Justin Timberlake" }] }] });
  } });
  assert.equal(calls, 1);
  assert.match(rendered.html, /music-song-title">Mirrors/);
});

// Result titles recorded from a live search, trimmed to what the hints read.
const HELLO_RESULTS = [
  { title: "Hello - Wikipedia", url: "https://en.wikipedia.org/wiki/Hello" },
  { title: "Adele - Hello (Official Music Video) - YouTube", url: "https://www.youtube.com/watch?v=YQHsXMglC9A" },
  { title: "Hello (Adele song) - Wikipedia", url: "https://en.wikipedia.org/wiki/Hello_(Adele_song)" },
  { title: "HELLO! - Daily royal, celebrity, fashion, beauty & lifestyle news", url: "https://www.hellomagazine.com" },
  { title: "Hello - song and lyrics by Adele - Spotify", url: "https://open.spotify.com/track/4sPmO7WMQUAf45kwMOtONw" },
];
const BLINDING_LIGHTS_RESULTS = [
  { title: "Blinding Lights - Wikipedia", url: "https://en.wikipedia.org/wiki/Blinding_Lights" },
  { title: "The Weeknd - Blinding Lights (Official Video) - YouTube", url: "https://www.youtube.com/watch?v=4NRXx6U8ABQ" },
  { title: "The Weeknd – Blinding Lights Lyrics | Genius Lyrics", url: "https://genius.com/The-weeknd-blinding-lights-lyrics" },
  { title: "The Weeknd - Blinding Lights (Official Audio) - YouTube", url: "https://www.youtube.com/watch?v=fHI8X4OXluQ" },
  { title: "The Weeknd - Blinding Lights Lyrics | AZLyrics.com", url: "https://www.azlyrics.com/lyrics/weeknd/blindinglights.html" },
  { title: "City of Blinding Lights", url: "https://en.wikipedia.org/wiki/City_of_Blinding_Lights" },
];

test("a bare word needs every top result to name the song and its artist", async () => {
  slot.init({});
  for (const [query, results] of [["hello", HELLO_RESULTS], ["mirrors", [spotify]], ["mirrors", [{ title: "Mirrors - The Home Depot", url: "https://www.homedepot.com/b/Mirrors" }, spotify, apple]]]) {
    assert.equal(implicitMusicHint(query, results), null, query);
    assert.equal((await slot.execute(query, { results, fetch: () => { throw new Error("must not fetch"); } })).html, "", query);
  }
  const strong = [
    { title: "Hello (Adele song) - Wikipedia", url: "https://en.wikipedia.org/wiki/Hello_(Adele_song)" },
    HELLO_RESULTS[1], HELLO_RESULTS[4],
  ];
  assert.equal(implicitMusicHint("hello", strong)?.artist, "Adele");
  assert.equal(implicitMusicHint("mirrors", [spotify, apple, soundcloud])?.artist, "Justin Timberlake");
  assert.equal(implicitMusicHint("hello adele", HELLO_RESULTS)?.artist, "Adele", "a named artist needs one result");
});

test("sums and numbers are never songs", async () => {
  const sum = { title: "2+2 - song and lyrics by Someone | Spotify", url: "https://open.spotify.com/track/4rHZZAmHpZrA3iH5zx8frV" };
  for (const query of ["2+2", "2 + 2", "1984", "12 x 4"]) {
    assert.equal(slot.trigger(query), false, query);
    assert.equal(implicitMusicHint(query, [sum, sum, sum]), null, query);
  }
});

test("a longer bare title needs three agreeing song results, one near the top", () => {
  const hint = implicitMusicHint("blinding lights", BLINDING_LIGHTS_RESULTS);
  assert.equal(hint?.recordingTitle, "Blinding Lights");
  assert.equal(hint.artist, "The Weeknd");
  assert.equal(implicitMusicHint("blinding lights", BLINDING_LIGHTS_RESULTS.slice(0, 3)), null, "two results are not enough");
  const lower = [...Array(3).fill({ title: "Elsewhere", url: "https://example.com" }), ...BLINDING_LIGHTS_RESULTS.slice(1, 5)];
  assert.equal(implicitMusicHint("blinding lights", lower), null, "none in the top three");
  const morning = { title: "Good Morning - song and lyrics by Kanye West | Spotify", url: "https://open.spotify.com/track/4rHZZAmHpZrA3iH5zx8frV" };
  assert.equal(implicitMusicHint("good morning", [morning]), null);
  assert.equal(implicitMusicHint("the blinding lights", BLINDING_LIGHTS_RESULTS), null, "\"the\" does not name The Weeknd");
});
