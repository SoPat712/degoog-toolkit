import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

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
  for (const service of ["spotify", "apple", "deezer", "youtube"]) {
    assert.match(result.html, new RegExp(`music-service-icon-${service}`));
  }
  assert.match(result.html, /https:\/\/music\.youtube\.com\/search\?q=/);
  assert.doesNotMatch(result.html, /Recording matches|4:34|Open the artist/);
});

test("music client enhancer fills stale cards without duplicating YouTube Music", async () => {
  const source = await readFile(new URL("./music/script.js", import.meta.url), "utf8");
  assert.match(source, /links\.querySelector\('a\[href\^="https:\/\/music\.youtube\.com\/"\]'\)/);
  assert.match(source, /new MutationObserver/);
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

test("music renders artist and album results with discography links", async () => {
  music.init({ template: '<article class="music-card">{{content}}</article>' });
  const artistId = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
  const artist = await music.execute("artist Radiohead", {
    fetch: async () => ({
      ok: true,
      json: async () => ({ artists: [{ id: artistId, name: "Radiohead", type: "Group" }] }),
    }),
  });
  assert.match(artist.html, new RegExp(`musicbrainz\\.org/artist/${artistId}/discography`));
  assert.match(artist.html, /YouTube Music/);

  const groupId = "b1392450-e666-3926-a536-22c65f834433";
  const album = await music.execute("album OK Computer", {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        "release-groups": [{
          id: groupId,
          title: "OK Computer",
          "first-release-date": "1997-05-21",
          "primary-type": "Album",
        }],
      }),
    }),
    signProxyUrl: (url) => `/api/proxy/image?source=${encodeURIComponent(url)}`,
  });
  assert.match(album.html, /OK Computer/);
  assert.match(album.html, new RegExp(`musicbrainz\\.org/release-group/${groupId}`));
  assert.match(album.html, /src="\/api\/proxy\/image\?source=/);
});

test("music serializes MusicBrainz requests even after a failed response", async () => {
  const requestTimes = [];
  music.init({ template: '<article class="music-card">{{content}}</article>' });
  const fetcher = async () => {
    requestTimes.push(Date.now());
    if (requestTimes.length === 1) return { ok: false };
    return { ok: true, json: async () => ({ artists: [] }) };
  };

  await Promise.all([
    music.execute("artist request queue one", { fetch: fetcher, results: [] }),
    music.execute("artist request queue two", { fetch: fetcher, results: [] }),
  ]);

  assert.equal(requestTimes.length, 2);
  assert.ok(requestTimes[1] - requestTimes[0] >= 900);
});

test("books render metadata without a cover and fail quietly", async () => {
  books.init({ template: '<article class="books-card">{{CONTENT}}</article>' });
  const result = await books.execute("book Matilda", {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        docs: [{
          key: "/works/OL45804W",
          title: "Matilda",
          author_name: ["Roald Dahl"],
          first_publish_year: 1988,
          publish_date: ["1988", "2007"],
          edition_count: 12,
          isbn: ["9780140328721"],
          subject: ["Children's stories", "Magic"],
          public_scan_b: true,
        }],
      }),
    }),
  });
  assert.match(result.html, /books-card__cover--empty/);
  assert.match(result.html, /Roald Dahl|12 editions|Children&#39;s stories|Read or borrow|Find in libraries/);

  books.init({ template: '<article class="books-card">{{CONTENT}}</article>' });
  assert.equal((await books.execute("book Missing", {
    fetch: async () => ({ ok: true, json: async () => ({ docs: [] }) }),
  })).html, "");
  assert.equal((await books.execute("book Unavailable", {
    fetch: async () => { throw new Error("offline"); },
  })).html, "");
});

test("papers render status and citation controls without requiring an abstract", async () => {
  papers.init({ template: '<article class="papers-card">{{CONTENT}}</article>' });
  const result = await papers.execute("doi 10.1038/nature12373", {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        message: {
          DOI: "10.1038/nature12373",
          title: ["A corrected paper"],
          author: [{ given: "Ada", family: "Lovelace" }],
          issued: { "date-parts": [[2024, 2, 3]] },
          "update-to": [{ type: "correction", DOI: "10.1038/nature12374" }],
        },
      }),
    }),
  });
  assert.match(result.html, /Correction notice/);
  assert.match(result.html, /data-paper-citation="apa"/);
  assert.match(result.html, /data-paper-citation="bibtex"/);
  assert.match(result.html, /data-paper-citation="ris"/);
  assert.doesNotMatch(result.html, /papers-card__abstract/);

  papers.init({ template: '<article class="papers-card">{{CONTENT}}</article>' });
  assert.equal((await papers.execute("paper Missing", {
    fetch: async () => ({ ok: true, json: async () => ({ message: { items: [] } }) }),
  })).html, "");
  assert.equal((await papers.execute("paper Unavailable", {
    fetch: async () => { throw new Error("offline"); },
  })).html, "");
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

test("paper citation route rejects invalid requests and contains resolver failures", async () => {
  const invalid = await paperRoutes[0].handler(
    new Request("http://localhost/api/plugin/example/citation?doi=nope&format=ris"),
  );
  assert.equal(invalid.status, 400);

  papers.init({ fetch: async () => { throw new Error("offline"); } });
  const unavailable = await paperRoutes[0].handler(
    new Request("http://localhost/api/plugin/example/citation?doi=10.1038%2Fnature12373&format=ris"),
  );
  assert.equal(unavailable.status, 502);
});
