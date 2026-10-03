import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(body, `Missing ${selector}`);
  return body;
};

test("TV title and episode rail occupy separate grid rows", () => {
  const band = ".tmdb-panel--tv .tmdb-tv-band--with-head";
  const head = rule(`${band} .tmdb-tv-band-head`);
  const main = rule(`${band} .tmdb-tv-main`);
  const rail = rule(`${band} .tmdb-tv-rail`);
  assert.match(head, /grid-column:\s*1 \/ -1;/);
  assert.match(head, /grid-row:\s*1;/);
  assert.match(main, /grid-column:\s*1;/);
  assert.match(main, /grid-row:\s*2;/);
  assert.match(rail, /grid-column:\s*2;/);
  assert.match(rail, /grid-row:\s*2;/);
  assert.doesNotMatch(css, /grid-row:\s*1 \/ span 2;/);
});

test("long TMDB titles wrap without hiding the title picker or year", () => {
  const title = rule(".tmdb-header-title-row .tmdb-title");
  assert.match(title, /min-width:\s*0;/);
  assert.match(title, /max-width:\s*100%;/);
  assert.match(title, /white-space:\s*normal;/);
  assert.doesNotMatch(title, /overflow:\s*hidden|text-overflow:\s*ellipsis/);
  const text = rule(".tmdb-result .tmdb-panel .tmdb-title-link .tmdb-title-text");
  assert.match(text, /min-width:\s*0;/);
  assert.match(text, /overflow-wrap:\s*anywhere;/);
  assert.match(rule(".tmdb-title-picker-icon"), /flex:\s*0 0 auto;/);
});
