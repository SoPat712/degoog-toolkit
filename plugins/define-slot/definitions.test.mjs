import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function fixture(dictionaryResponse, { related = true, source = "dictionaryapi", wiktionaryResponse } = {}) {
  const { slot } = await import(`./index.js?test=${crypto.randomUUID()}`);
  const cache = new Map();
  let dictionaryRequests = 0;
  let wiktionaryRequests = 0;
  const fetch = async (url, init) => {
    if (String(url).startsWith("https://api.dictionaryapi.dev/")) {
      dictionaryRequests++;
      return dictionaryResponse(init);
    }
    if (String(url).startsWith("https://en.wiktionary.org/api/rest_v1/page/definition/")) {
      wiktionaryRequests++;
      assert.match(init.headers["User-Agent"], /Degoog-Toolkit-Dictionary/);
      return wiktionaryResponse(init);
    }
    if (url === "https://api.powerthesaurus.org") {
      const body = JSON.parse(init.body);
      if (body.operationName === "SEARCH_QUERY") {
        return Response.json({ data: { search: { terms: [{ id: "term", name: "cosmopolitan" }] } } });
      }
      return Response.json({ data: { thesauruses: { edges: related ? [{ node: {
        id: "related", targetTerm: { name: body.variables.list === "SYNONYM" ? "international" : "provincial" },
        relations: [], rating: 68, votes: 68,
      } }] : [] } } });
    }
    // No network: optional related-word HTML fallback has no entries here.
    return new Response("", { status: 404 });
  };
  slot.init({
    template: await readFile(new URL("./template.html", import.meta.url), "utf8"),
    fetch, apiBase: "/api/plugin/installed-dictionary-id",
    useCache: () => ({ get: key => cache.get(key), set: (key, value) => cache.set(key, value) }),
  });
  slot.configure({ maxDefinitions: "3", definitionSource: source });
  return { slot, dictionaryRequests: () => dictionaryRequests, wiktionaryRequests: () => wiktionaryRequests };
}

test("definition failure remains explicit above useful related words", async () => {
  const { slot } = await fixture(() => new Response("Unavailable", { status: 503 }));
  const { html } = await slot.execute("define cosmopolitan", {});
  assert.match(html, /plugin-define-slot\.definitionUnavailable/);
  assert.match(html, /international/);
  assert.ok(html.indexOf("definitionUnavailable") < html.indexOf("dslot-related"));
  assert.doesNotMatch(html, /<ol class="dslot-definitions"><\/ol>/);
});

test("a real missing entry is distinguished from a provider outage", async () => {
  const { slot } = await fixture(() => Response.json({ title: "No Definitions Found" }, { status: 404 }));
  const { html } = await slot.execute("define cosmopolitan", {});
  assert.match(html, /plugin-define-slot\.noDefinition/);
  assert.doesNotMatch(html, /definitionUnavailable/);
  assert.match(html, /international/);
});

test("malformed and definition-free payloads cannot cache a silent dictionary success", async () => {
  for (const data of [{ meanings: [] }, [{ word: "cosmopolitan", meanings: [] }],
    [{ word: "cosmopolitan", meanings: [{ definitions: [{ definition: "  " }] }] }]]) {
    const { slot, dictionaryRequests } = await fixture(() => Response.json(data));
    const { html } = await slot.execute("define cosmopolitan", {});
    assert.match(html, /plugin-define-slot\.definitionUnavailable/);
    await slot.execute("define cosmopolitan", {});
    assert.equal(dictionaryRequests(), 2);
  }
});

test("a definition request still reports failure when the thesaurus is also empty", async () => {
  const { slot } = await fixture(() => { throw new Error("Connection failed"); }, { related: false });
  const { html } = await slot.execute("define cosmopolitan", {});
  assert.match(html, /plugin-define-slot\.definitionUnavailable/);
});

test("real definitions stay first, escape provider markup, and retain examples", async () => {
  const { slot, dictionaryRequests } = await fixture(() => Response.json([{
    word: "cosmopolitan", meanings: [{ partOfSpeech: "adjective", definitions: [
      { definition: "A <test> dictionary meaning.", example: "An illustrative sentence." },
    ] }],
  }]));
  const { html } = await slot.execute("define cosmopolitan", {});
  assert.match(html, /A &lt;test&gt; dictionary meaning\./);
  assert.match(html, /An illustrative sentence/);
  assert.ok(html.indexOf("dslot-definitions") < html.indexOf("dslot-related"));
  assert.doesNotMatch(html, /definitionUnavailable|noDefinition/);
  await slot.execute("define cosmopolitan", {});
  assert.equal(dictionaryRequests(), 1);
});

test("a partial entry can still answer a pronunciation request", async () => {
  const { slot } = await fixture(() => Response.json([{
    word: "cosmopolitan", phonetic: "/test-pronunciation/", meanings: [],
  }]));
  const { html } = await slot.execute("pronounce cosmopolitan", {});
  assert.match(html, /test-pronunciation/);
  assert.doesNotMatch(html, /definitionUnavailable/);
});

test("explicit synonym requests retain useful related words without a definition notice", async () => {
  const { slot } = await fixture(() => new Response("Unavailable", { status: 503 }));
  const { html } = await slot.execute("synonyms cosmopolitan", {});
  assert.match(html, /international/);
  assert.doesNotMatch(html, /definitionUnavailable/);
});

test("selected Wiktionary source supplies English meanings without waiting for Dictionary API", async () => {
  const { slot, dictionaryRequests, wiktionaryRequests } = await fixture(() => {
    throw new Error("The blocked provider must not be requested");
  }, { source: "wiktionary", wiktionaryResponse: () => Response.json({
    en: [{ partOfSpeech: "Adjective", definitions: [
      { definition: '<a href="/wiki/inclusive">Inclusive</a>; affecting the whole <a>world</a>.' },
      { definition: " " },
      { definition: 'Composed of <a>people</a> from all over the world.', examples: ['A <b>cosmopolitan</b> city.'] },
      { definition: '&#x41;t ease&nbsp;with many cultures. <script>bad()</script>' },
    ] }],
    sv: [{ partOfSpeech: "Noun", definitions: [{ definition: "Swedish entry must not appear" }] }],
  }) });
  const { html } = await slot.execute("define cosmopolitan", {});
  assert.equal((html.match(/class="dslot-def-text"/g) || []).length, 3);
  assert.match(html, /Composed of people from all over the world/);
  assert.match(html, /Inclusive; affecting the whole world\./);
  assert.match(html, /A cosmopolitan city/);
  assert.match(html, /At ease with many cultures/);
  assert.doesNotMatch(html, /<script>|bad\(\)|Swedish entry|{{dictionary_source}}/);
  assert.match(html, /Wiktionary/);
  assert.match(html, /creativecommons\.org\/licenses\/by-sa\/4\.0/);
  assert.match(html, /cosmopolitan#English/);
  assert.doesNotMatch(html, /https:\/\/dictionaryapi.dev\//);
  await slot.execute("define cosmopolitan", {});
  assert.equal(dictionaryRequests(), 0);
  assert.equal(wiktionaryRequests(), 1);
});

test("Wiktionary errors and malformed/empty data stay explicit and are not success-cached", async () => {
  for (const response of [
    () => new Response("Unavailable", { status: 503 }),
    () => Response.json({ error: "changed API" }),
    () => Response.json({ en: {} }),
    () => Response.json({ en: [{ definitions: [{ definition: " " }] }] }),
    () => Response.json({ en: [{ definitions: "changed API" }] }),
  ]) {
    const { slot, wiktionaryRequests } = await fixture(null, { source: "wiktionary", wiktionaryResponse: response });
    const { html } = await slot.execute("define cosmopolitan", {});
    assert.match(html, /definitionUnavailable/);
    await slot.execute("define cosmopolitan", {});
    assert.equal(wiktionaryRequests(), 2);
  }
});

test("Wiktionary missing English entry does not use foreign definitions", async () => {
  for (const response of [
    () => new Response("Not found", { status: 404 }),
    () => Response.json({ sv: [{ definitions: [{ definition: "Foreign gloss" }] }] }),
  ]) {
    const { slot } = await fixture(null, { source: "wiktionary", wiktionaryResponse: response });
    const { html } = await slot.execute("define cosmopolitan", {});
    assert.match(html, /noDefinition/);
    assert.doesNotMatch(html, /Foreign gloss/);
  }
});

test("Wiktionary selection preserves the original dedicated pronunciation lookup", async () => {
  const { slot, dictionaryRequests, wiktionaryRequests } = await fixture(() => Response.json([{
    word: "cosmopolitan", phonetic: "/test-pronunciation/", meanings: [],
  }]), { source: "wiktionary" });
  const { html } = await slot.execute("pronounce cosmopolitan", {});
  assert.match(html, /test-pronunciation/);
  assert.match(html, /dictionaryapi.dev/);
  assert.equal(dictionaryRequests(), 1);
  assert.equal(wiktionaryRequests(), 0);
});

test("the existing request deadline covers a stalled dictionary JSON body", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { slot } = await fixture(init => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      markStarted();
    },
  }), { headers: { "Content-Type": "application/json" } }));
  const pending = slot.execute("define cosmopolitan", {});
  await started;
  t.mock.timers.tick(8000);
  const { html } = await pending;
  assert.match(html, /definitionUnavailable/);
});

test("trailing and what-is forms stay silent without content for the request", async () => {
  const { slot } = await fixture(() => Response.json({ title: "No Definitions Found" }, { status: 404 }));
  for (const query of ["olivia meaning", "what is chatgpt", "netflix definition"]) {
    const { html } = await slot.execute(query, {});
    assert.equal(html, "", query);
  }
});

test("trailing synonym requests still answer from related words", async () => {
  const { slot } = await fixture(() => new Response("Unavailable", { status: 503 }));
  const { html } = await slot.execute("cosmopolitan synonyms", {});
  assert.match(html, /international/);
});

test("trailing definition requests render real definitions", async () => {
  const { slot } = await fixture(() => Response.json([{
    word: "prate", meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To talk foolishly." }] }],
  }]));
  const { html } = await slot.execute("prate definition", {});
  assert.match(html, /To talk foolishly\./);
});

test("compound terms and bare origin queries do not trigger", async () => {
  const { slot } = await import(`./index.js?test=${crypto.randomUUID()}`);
  for (const query of [
    "circular definition", "operational definition", "received pronunciation",
    "folk etymology", "origin pc", "origin download", "origin of species",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
  for (const query of ["etymology of salary", "word origin salary", "salary etymology", "prate meaning"]) {
    assert.equal(slot.trigger(query), true, query);
  }
});

test("long quotations and citation links stay out of definitions", async () => {
  const longQuote = "In a closed system the entropy never decreases, and this quotation keeps going " +
    "for well over the length anyone reads in a search card, citing a paper and its authors, " +
    "http//arxiv.org/pdf/physics/0004055, along the way.";
  const { slot } = await fixture(() => Response.json([{
    word: "entropy", meanings: [{ partOfSpeech: "noun", definitions: [
      { definition: "Hidden thermal energy http://arxiv.org/pdf/physics/0004055.", example: longQuote },
      { definition: "Disorder in a system.", example: "Entropy grows (see www.example.com/entropy)." },
    ] }],
  }]));
  const { html } = await slot.execute("define entropy", {});
  assert.doesNotMatch(html, /arxiv|example\.com|closed system/);
  assert.match(html, /Hidden thermal energy\.</);
  assert.match(html, /Entropy grows\./);
});

test("each part of speech gets a sense before extra senses, main use first", async () => {
  const { slot } = await fixture(() => Response.json([
    { word: "happy", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A happy event." }] }] },
    { word: "happy", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "Happy people as a group." }] }] },
    { word: "happy", meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To become happy." }] }] },
    { word: "happy", meanings: [{ partOfSpeech: "adjective", definitions: [
      { definition: "Feeling well-being." }, { definition: "Lucky." }, { definition: "Content." },
    ] }] },
  ]));
  const { html } = await slot.execute("define happy", {});
  const senses = [...html.matchAll(/class="dslot-def-text">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(senses, ["Feeling well-being.", "A happy event.", "To become happy."]);
});

test("phones show related words as wrapping chips with real tap targets", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  const phone = css.slice(css.indexOf("@container (max-width: 420px)"));
  assert.match(phone, /\.dslot-tags \{\s*display: flex;\s*flex-wrap: wrap;/);
  assert.match(phone, /\.dslot-term-detail \{\s*display: none;/);
  assert.match(css, /\.dslot-tag-button \{\s*min-width: 24px;\s*min-height: 24px;/);
});
