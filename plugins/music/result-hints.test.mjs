import assert from "node:assert/strict";
import test from "node:test";
import { parseMusicResultHint, slot } from "./index.js";
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
    const rendered = await slot.execute("mirrors", { results: [spotify] });
    assert.equal(Boolean(rendered.html), visible);
    if (visible) assert.match(rendered.html, /Song by Justin Timberlake/);
  }
  slot.init({ useCache: () => ({ get: async () => ({ recordings: [] }) }) });
  assert.equal((await slot.execute("mirrors", { results: [soundcloud] })).html, "", "Do not mistake a SoundCloud uploader for an artist absent matching metadata");
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
