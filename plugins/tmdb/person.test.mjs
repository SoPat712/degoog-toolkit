import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import slot, { testRenderPerson } from "./index.js";

const pluginUrl = new URL("./", import.meta.url);

async function initTranslations() {
  await slot.init({
    apiBase: "/api/plugin/tmdb",
    template: '<div class="tmdb-result slot-full-width">{{content}}</div>',
    readFile: (filename) => readFile(new URL(filename, pluginUrl), "utf8"),
    signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
  });
}

const details = {
  id: 123,
  name: "Example Actor",
  known_for_department: "Acting",
  birthday: "1935-07-17",
  place_of_birth: "Bronx, New York, USA",
  biography:
    "Example Actor built a long career across film and television, earning recognition for carefully observed character performances.",
};

const images = {
  profiles: [
    { file_path: "/portrait-one.jpg" },
    { file_path: "/portrait-two.jpg" },
    { file_path: "/portrait-three.jpg" },
  ],
};

const credits = {
  cast: [
    {
      id: 10,
      media_type: "movie",
      title: "Example Film",
      character: "Lead",
      release_date: "2024-05-10",
      poster_path: "/film.jpg",
      vote_average: 8.1,
      popularity: 20,
    },
    {
      id: 11,
      media_type: "tv",
      name: "Example Series",
      character: "Detective",
      first_air_date: "2023-09-01",
      poster_path: "/series.jpg",
      vote_average: 7.6,
      popularity: 15,
    },
  ],
};

test("renders a localized Material actor profile for route navigation", async () => {
  await initTranslations();

  const html = testRenderPerson(details, images, credits, "nm0000123", {
    lang: "en-US",
    resolveTranslations: true,
    signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
  });

  assert.match(html, /tmdb-panel--person/);
  assert.match(html, /tmdb-person-portrait-button/);
  assert.match(html, /tmdb-person-facts/);
  assert.match(html, /tmdb-person-biography/);
  assert.match(html, /tmdb-person-gallery-strip/);
  assert.match(html, /Jul 17, 1935/);
  assert.match(html, />Biography</);
  assert.match(html, />Films &amp; TV</);
  assert.match(html, />Lead</);
  assert.match(html, />Detective</);
  assert.match(html, /tmdb-film-rating/);
  assert.doesNotMatch(html, /\{\{\s*t:/);
});

test("uses the requested route locale instead of exposing translation tokens", async () => {
  await initTranslations();

  const html = testRenderPerson(details, images, credits, null, {
    lang: "es-ES",
    resolveTranslations: true,
    signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
  });

  assert.match(html, />Sinopsis</);
  assert.match(html, />Biografía</);
  assert.match(html, />Créditos</);
  assert.doesNotMatch(html, /\{\{\s*t:/);
});

test("falls back safely when a route receives a malformed locale", async () => {
  await initTranslations();

  const html = testRenderPerson(
    { ...details, deathday: "2020-11-05" },
    images,
    credits,
    null,
    {
      lang: "not_a_locale",
      resolveTranslations: true,
      signProxyUrl: (url) => `/proxy?url=${encodeURIComponent(url)}`,
    },
  );

  assert.match(html, /Jul 17, 1935/);
  assert.match(html, /Nov 5, 2020/);
  assert.match(html, />Died</);
  assert.doesNotMatch(html, /\{\{\s*t:/);
});
