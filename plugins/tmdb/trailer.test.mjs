import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load } from "cheerio";
import { routes, slot } from "./index.js";

const videoKey = "AbCdEf123_-";
let trailerKey;

beforeEach(async () => {
  trailerKey = videoKey;
  slot.configure({ apiKey: "test-key" });
  await slot.init({
    apiBase: "/api/plugin/test-tmdb",
    template: '<div class="tmdb-result">{{content}}</div>',
    signProxyUrl: (url) => `/api/proxy/image?url=${encodeURIComponent(url)}`,
    fetch: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://api.themoviedb.org");
      const responses = {
        "/3/movie/123": { id: 123, title: "Example Movie" },
        "/3/movie/123/credits": { cast: [], crew: [] },
        "/3/movie/123/images": { posters: [], backdrops: [] },
        "/3/movie/123/external_ids": {},
        "/3/movie/123/videos": {
          results: [{ site: "YouTube", key: trailerKey, type: "Trailer", name: 'Trailer "One" <official>' }],
        },
      };
      assert.ok(parsed.pathname in responses, `Unexpected request: ${parsed.pathname}`);
      return Response.json(responses[parsed.pathname]);
    },
  });
});

async function renderRoute() {
  const response = await routes.find(({ path }) => path === "movie").handler(
    new Request("https://degoog.test/api/plugin/test-tmdb/movie?id=123"),
  );
  assert.equal(response.status, 200);
  return load((await response.json()).html);
}

test("TMDB exposes an optional URL setting alongside its existing API settings", () => {
  const setting = slot.settingsSchema.find(({ key }) => key === "youtubeBaseUrl");
  assert.equal(setting?.type, "url");
  assert.equal(setting.required, false);
  assert.ok(slot.settingsSchema.some(({ key }) => key === "apiKey"));
});

test("trailer links default to YouTube without embedding or exposing thumbnails", async () => {
  const $ = await renderRoute();
  const link = $(".tmdb-trailer-link");
  assert.equal(link.attr("href"), `https://www.youtube.com/watch?v=${videoKey}`);
  assert.equal(link.attr("rel"), "noopener noreferrer");
  assert.equal(link.attr("aria-label"), 'Watch trailer: Trailer "One" <official>');
  assert.equal($("iframe").length, 0);
  assert.equal(link.find("official").length, 0);
  assert.equal(link.find("img").attr("src"), `/api/proxy/image?url=${encodeURIComponent(`https://i.ytimg.com/vi/${videoKey}/hqdefault.jpg`)}`);
});

for (const [configured, base] of [
  ["https://video.example.test", "https://video.example.test"],
  [" https://video.example.test/// ", "https://video.example.test"],
  ["http://localhost:3000", "http://localhost:3000"],
  ["https://video.example.test/invidious/", "https://video.example.test/invidious"],
]) {
  test(`trailer links use the configured base ${configured.trim()}`, async () => {
    slot.configure({ apiKey: "test-key", youtubeBaseUrl: configured });
    const route = await renderRoute();
    assert.equal(route(".tmdb-trailer-link").attr("href"), `${base}/watch?v=${videoKey}`);
    const result = await slot.execute("Example Movie", {
      results: [{ url: "https://www.themoviedb.org/movie/123-example" }],
    });
    assert.equal(load(result.html)(".tmdb-trailer-link").attr("href"), `${base}/watch?v=${videoKey}`);
  });
}

for (const value of ["", "not a URL", "//example.test", "javascript:alert(1)", "file:///tmp/video", "https://user:password@example.test", "https://example.test/?v=other", "https://example.test/#player"]) {
  test(`invalid or empty trailer base falls back safely: ${value || "empty"}`, async () => {
    slot.configure({ apiKey: "test-key", youtubeBaseUrl: value });
    const $ = await renderRoute();
    assert.equal($(".tmdb-trailer-link").attr("href"), `https://www.youtube.com/watch?v=${videoKey}`);
  });
}

test("clearing the custom URL restores YouTube on subsequent renders", async () => {
  slot.configure({ apiKey: "test-key", youtubeBaseUrl: "https://video.example.test" });
  await renderRoute();
  slot.configure({ apiKey: "test-key", youtubeBaseUrl: "" });
  const $ = await renderRoute();
  assert.equal($(".tmdb-trailer-link").attr("href"), `https://www.youtube.com/watch?v=${videoKey}`);
});

test("invalid video identifiers never become trailer links", async () => {
  trailerKey = 'abcdef" onmouseover="alert(1)';
  const $ = await renderRoute();
  assert.equal($(".tmdb-trailer-link").length, 0);
});
