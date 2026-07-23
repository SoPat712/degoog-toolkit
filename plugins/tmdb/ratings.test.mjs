import assert from "node:assert/strict";
import test from "node:test";
import {
  testBuildRatingsHtml,
  testBuildServiceChoices,
  testWrapTabs,
  _withTimeout,
} from "./index.js";

test("renders compact logo pills with combined Rotten Tomatoes scores", () => {
  const html = testBuildRatingsHtml(
    {
      voteAverage: 7.1,
      voteCount: 1234,
      tmdbHref: "https://www.themoviedb.org/movie/10545",
      imdb: "7.0/10",
      imdbHref: "https://www.imdb.com/title/tt0116583/",
      rottenTomatoes: "80%",
      rottenTomatoesHref:
        "https://www.rottentomatoes.com/m/the_hunchback_of_notre_dame",
      rottenTomatoesAudience: "71%",
      rottenTomatoesAudienceHref:
        "https://www.rottentomatoes.com/m/the_hunchback_of_notre_dame",
      letterboxdHref: "https://letterboxd.com/tmdb/10545/",
      jellyfinHref: null,
      seerrHref: "https://seerr.example.test/movie/10545",
      seerrStatus: "seerrRequest",
    },
    {
      lang: "en-US",
      signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
    },
  );

  assert.equal((html.match(/class="tmdb-rating-item/g) || []).length, 5);
  assert.equal((html.match(/tmdb-rating-item--rt/g) || []).length, 1);
  assert.match(html, /tmdb-rating-logo--tmdb/);
  assert.match(html, /tmdb-rating-logo--imdb/);
  assert.match(html, /tmdb-rating-logo--rt/);
  assert.match(html, /tmdb-rating-logo--letterboxd/);
  assert.match(html, /tmdb-rating-logo--seerr/);
  assert.match(html, /tmdb-rating-audience-icon/);
  assert.match(html, /tmdb-rating-segment--critic/);
  assert.match(html, /tmdb-rating-segment--audience/);
  assert.doesNotMatch(html, /tmdb-rating-badge/);
  assert.doesNotMatch(html, />Tomatometer</);
  assert.doesNotMatch(html, />Letterboxd</);
  assert.doesNotMatch(html, />Seerr</);
});

test("title chooser only includes services with usable links", () => {
  const choices = testBuildServiceChoices(
    [
      {
        id: "tmdb",
        name: "TMDB",
        href: "https://www.themoviedb.org/movie/10545",
        icon: "https://cdn.simpleicons.org/themoviedatabase",
      },
      {
        id: "jellyfin",
        name: "Jellyfin",
        href: null,
        icon: "https://cdn.example.test/jellyfin.svg",
      },
      {
        id: "seerr",
        name: "Seerr",
        href: "https://seerr.example.test/movie/10545",
        icon: "https://cdn.jsdelivr.net/seerr.svg",
      },
    ],
    {
      signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
    },
  );

  assert.deepEqual(
    choices.map(({ id, href }) => ({ id, href })),
    [
      {
        id: "tmdb",
        href: "https://www.themoviedb.org/movie/10545",
      },
      {
        id: "seerr",
        href: "https://seerr.example.test/movie/10545",
      },
    ],
  );
  assert.match(choices[0].icon, /^\/proxy\?/);
});

test("renders accessible tabs without inline event handlers", () => {
  const html = testWrapTabs([
    { label: "Overview", panel: "<p>Overview</p>" },
    { label: "Filmography", panel: "<p>Filmography</p>" },
  ]);

  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /hidden/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test("external integration timeout aborts provider work", async () => {
  let capturedSignal;
  const fallback = { skipped: true };

  const result = await _withTimeout(
    async (signal) => {
      capturedSignal = signal;
      return await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
    5,
    "test provider",
    fallback,
  );

  assert.equal(result, fallback);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(capturedSignal.reason.name, "TimeoutError");
});
