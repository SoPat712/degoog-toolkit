import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import slot, { routes } from "./index.js";

const refresh = routes.find((route) => route.path === "refresh").handler;
const item = {
  id: "example-coffee",
  title: "Example Coffee & Tea",
  position: { lat: 0, lng: 0 },
  distance: 100,
  address: { label: "10 Example Street, Example City" },
  categories: [{ name: "Coffee shop" }],
  openingHours: [{ isOpen: true, text: ["Mon-Sun: 08:00-23:00"] }],
};

async function initialize() {
  await slot.init({
    readFile: (name) => readFile(new URL(name, import.meta.url), "utf8"),
    fetch: async () => Response.json({ items: [item] }),
  });
  slot.configure({
    hereApiKey: "test-key",
    defaultLat: "0",
    defaultLon: "0",
    useOsmGeocoder: false,
  });
}

for (const [lang, acceptLanguage, words] of [
  ["en-US", "fr", ["Places", "Open", "Hours"]],
  ["fr-FR", "en", ["Lieux", "Ouvert", "Horaires"]],
  ["es-ES", "en", ["Lugares", "Abierto", "Horario"]],
  ["", "fr-FR,fr;q=0.9", ["Lieux", "Ouvert", "Horaires"]],
  ["not_a_locale", "en", ["Places", "Open", "Hours"]],
  ["de-DE", "en", ["Places", "Open", "Hours"]],
]) {
  test(`refresh translates ${lang || acceptLanguage} without exposing tokens`, async () => {
    await initialize();
    const response = await refresh(new Request("https://example.test/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": acceptLanguage },
      body: JSON.stringify({ lat: 0, lon: 0, query: "coffee near me", lang }),
    }));
    assert.equal(response.status, 200);
    const { html } = await response.json();
    assert.match(html, /places-wrap/);
    assert.doesNotMatch(html, /\{\{\s*t:/);
    assert.match(html, /Example Coffee &amp; Tea/);
    for (const word of words) assert.ok(html.includes(word), `Missing translated label: ${word}`);
  });
}

test("initial slot render still delegates translation to degoog", async () => {
  await initialize();
  const { html } = await slot.execute("coffee near me", {});
  assert.match(html, /\{\{ t:plugin-osm-slot\.places \}\}/);
});

test("refresh sends the page locale", async () => {
  const script = await readFile(new URL("script.js", import.meta.url), "utf8");
  assert.match(script, /lang: document\.documentElement\.lang/);
});
