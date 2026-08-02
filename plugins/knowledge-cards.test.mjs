import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBookQuery,
  slot as books,
} from "./books/index.js";
import {
  parseMusicQuery,
  slot as music,
} from "./music/index.js";
import {
  parsePaperQuery,
  routes as paperRoutes,
  slot as papers,
} from "./papers/index.js";

test("knowledge cards keep explicit triggers and selectable placements", () => {
  assert.deepEqual(parseMusicQuery("radiohead discography"), {
    kind: "artist",
    term: "radiohead",
  });
  assert.deepEqual(parseBookQuery("978-0-14-032872-1"), {
    kind: "isbn",
    term: "9780140328721",
  });
  assert.deepEqual(parsePaperQuery("https://doi.org/10.1038/nature12373"), {
    kind: "doi",
    term: "10.1038/nature12373",
  });
  assert.equal(parseMusicQuery("weather in rome"), null);
  assert.equal(parseBookQuery("9780140328722"), null);
  assert.equal(parsePaperQuery("attention is all you need"), null);

  for (const slot of [music, books, papers]) {
    assert.deepEqual(
      new Set(slot.slotPositions),
      new Set(["full-width-above-results", "knowledge-panel"]),
    );
    assert.equal(slot.isClientExposed, false);
  }
});

test("knowledge cards use server fetches and escape remote metadata", async () => {
  let musicRequests = 0;
  music.init({ template: '<article class="music-card">{{content}}</article>' });
  const musicResult = await music.execute("music radiohead", {
    fetch: async (url, init) => {
      musicRequests += 1;
      assert.equal(new URL(url).searchParams.has("inc"), false);
      assert.match(init.headers["User-Agent"], /degoog-toolkit/);
      return {
        ok: true,
        json: async () => ({
          artists: [{
            id: "0383dadf-2a4e-4d10-a46a-e9e041da8eb3",
            name: "Radiohead <script>",
            type: "Group",
          }],
        }),
      };
    },
  });
  assert.equal(musicRequests, 1);
  assert.match(musicResult.html, /Radiohead &lt;script&gt;/);
  assert.doesNotMatch(musicResult.html, /Radiohead <script>/);

  books.init({ template: '<article class="books-card">{{CONTENT}}</article>' });
  const bookResult = await books.execute("9780140328721", {
    fetch: async (url, init) => {
      assert.equal(new URL(url).searchParams.get("isbn"), "9780140328721");
      assert.match(init.headers["User-Agent"], /degoog-toolkit/);
      return {
        ok: true,
        json: async () => ({
          docs: [{
            key: "/works/OL45804W",
            title: "Matilda <script>",
            author_name: ["Roald Dahl"],
            cover_i: 123,
            isbn: ["9780140328721"],
            edition_count: 12,
          }],
        }),
      };
    },
    signProxyUrl: (url) => `/api/proxy/image?source=${encodeURIComponent(url)}`,
  });
  assert.match(bookResult.html, /Matilda &lt;script&gt;/);
  assert.match(bookResult.html, /src="\/api\/proxy\/image\?source=/);
  assert.doesNotMatch(bookResult.html, /src="https:\/\/covers\.openlibrary\.org/);

  papers.init({ template: '<article class="papers-card">{{CONTENT}}</article>' });
  const paperResult = await papers.execute("doi 10.1038/nature12373", {
    fetch: async (url, init) => {
      assert.match(url, /api\.crossref\.org\/works/);
      assert.match(init.headers["User-Agent"], /degoog-toolkit/);
      return {
        ok: true,
        json: async () => ({
          message: {
            DOI: "10.1038/nature12373",
            title: ["A paper <script>"],
            author: [{ given: "Ada", family: "Lovelace" }],
            abstract: "<jats:p>Safe &amp; useful</jats:p>",
            issued: { "date-parts": [[2024, 2, 3]] },
          },
        }),
      };
    },
  });
  assert.match(paperResult.html, /A paper &lt;script&gt;/);
  assert.match(paperResult.html, /Safe &amp; useful/);
  assert.doesNotMatch(paperResult.html, /<jats:p>/);
});

test("music card recognizes result-backed song searches", async () => {
  let query = "";
  music.init({ template: '<article class="music-card">{{content}}</article>' });
  const result = await music.execute("mirrors justin timberlake", {
    results: [{
      title: "Justin Timberlake – Mirrors Lyrics | Genius Lyrics",
      url: "https://genius.com/Justin-timberlake-mirrors-lyrics",
    }],
    fetch: async (url) => {
      query = new URL(url).searchParams.get("query");
      return {
        ok: true,
        json: async () => ({
          recordings: [
            {
              id: "fa3cb5ad-b2db-4998-aea0-f51f5b12b27e",
              title: "Mirrors",
              length: 274000,
              disambiguation: "radio edit",
              "artist-credit": [{ name: "Justin Timberlake" }],
            },
            {
              id: "c01bd40c-5f23-4c34-9238-7a5f226f6c0e",
              title: "Mirrors",
              length: 485000,
              disambiguation: "album version",
              "first-release-date": "2013-02-11",
              tags: [{ name: "pop" }],
              "artist-credit": [{
                name: "Justin Timberlake",
                artist: {
                  id: "596ffa74-3d08-44ef-b113-765d43d12738",
                  name: "Justin Timberlake",
                },
              }],
              releases: [{
                title: "The 20/20 Experience",
                status: "Official",
                date: "2013-03-19",
                "release-group": {
                  id: "deae6fc2-a675-4f35-9565-d2aaea4872c7",
                  title: "The 20/20 Experience",
                  "primary-type": "Album",
                },
              }],
            },
          ],
        }),
      };
    },
    signProxyUrl: (url) => `/api/proxy/image?source=${encodeURIComponent(url)}`,
  });

  assert.equal(
    query,
    'recording:"Mirrors" AND artist:"Justin Timberlake"',
  );
  assert.match(result.html, /Mirrors/);
  assert.match(result.html, /Justin Timberlake/);
  assert.match(result.html, /Song by/);
  assert.match(result.html, /The 20\/20 Experience/);
  assert.match(result.html, />2013</);
  assert.match(result.html, />8:05</);
  assert.match(result.html, />pop</);
  assert.match(result.html, /src="\/api\/proxy\/image\?source=/);
  assert.doesNotMatch(result.html, /Recording matches|4:34|Open the artist/);
});

test("music card keeps a result-backed fallback when MusicBrainz fails", async () => {
  music.init({ template: '<article class="music-card">{{content}}</article>' });
  const result = await music.execute("hello adele", {
    results: [{
      title: "Adele – Hello Lyrics | Genius Lyrics",
      url: "https://genius.com/Adele-hello-lyrics",
    }],
    fetch: async () => ({ ok: false }),
  });

  assert.match(result.html, /Hello/);
  assert.match(result.html, /Adele/);
  assert.match(result.html, /Apple Music/);
});

test("paper citation route negotiates a server-side citation", async () => {
  let accept = "";
  papers.init({
    fetch: async (_url, init) => {
      accept = init.headers.Accept;
      return { ok: true, text: async () => "@article{example}" };
    },
  });
  const response = await paperRoutes[0].handler(
    new Request(
      "http://localhost/api/plugin/example/citation?doi=10.1038%2Fnature12373&format=bibtex",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "@article{example}");
  assert.equal(accept, "application/x-bibtex");
});
