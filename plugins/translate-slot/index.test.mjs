import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { slot } from "./index.js";

const requests = [];

function googleFetch(url) {
  const parsed = new URL(url);
  requests.push(parsed);
  return Promise.resolve(
    Response.json([[["XX", parsed.searchParams.get("q"), null, null]], null, "en"]),
  );
}

await slot.init({ template: "", fetch: googleFetch });
slot.configure({});

async function translationRequest(query) {
  requests.length = 0;
  await slot.execute(query, {});
  const request = requests.at(-1);
  return request
    ? {
        text: request.searchParams.get("q"),
        source: request.searchParams.get("sl"),
        target: request.searchParams.get("tl"),
      }
    : null;
}

test("ordinary searches ending in a bare language code do not trigger", () => {
  for (const query of [
    "weather in la",
    "what time is it in la",
    "things to do in la",
    "taxes in pa",
    "restaurants in ca",
    "who is in it",
    "is there sugar in it",
    "in it we trust",
    "sold as is",
    "meant to be",
    "to be or not to be",
    "flights to ca",
    "es to en hola",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("content searches in a named language do not trigger", () => {
  for (const query of [
    "movies in english",
    "songs in spanish",
    "subtitles in english",
    "how to type in japanese",
    "english to spanish dictionary",
    "switch to english",
    "flights to myanmar",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("explicit translation requests still trigger with names or codes", async () => {
  for (const query of [
    "translate hello to spanish",
    "translate hello to es",
    "how do you say thank you in japanese",
    "how do you say thank you in ja",
    "how to say thank you in japanese",
    "hello in french",
    "i love you in spanish",
    "movie in spanish",
    "spanish to english hola",
    "from spanish to english hola",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }

  assert.deepEqual(await translationRequest("translate hello to es"), {
    text: "hello",
    source: "auto",
    target: "es",
  });
  assert.deepEqual(await translationRequest("how to say thank you in japanese"), {
    text: "thank you",
    source: "auto",
    target: "ja",
  });
  assert.deepEqual(await translationRequest("hola from spanish to english"), {
    text: "hola",
    source: "es",
    target: "en",
  });
});

test("execute keeps the trigger's reading of name-only queries", async () => {
  assert.deepEqual(await translationRequest("spanish hello in french"), {
    text: "spanish hello",
    source: "auto",
    target: "fr",
  });
});

test("unit and currency conversions stay with their own plugins", () => {
  for (const query of [
    "100 lb to kg",
    "100 usd to eur",
    "translate 100 lb to kg",
    "translate 100 usd to eur",
  ]) {
    assert.equal(slot.trigger(query), false, query);
  }
});

test("the slot card is not capped by core command-result width", async () => {
  const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
  const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
  assert.doesNotMatch(template, /command-result/);
  assert.doesNotMatch(source, /class="trc-card command-result"/);
});

test("narrow cards stack the source and translation panes", async () => {
  const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
  assert.match(
    css,
    /@container \(max-width:\s*560px\)\s*\{\s*\.trc-text-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
});
