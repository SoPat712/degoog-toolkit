import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const languages = ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"];
function leaves(value, prefix = "") {
  return Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [prefix + key] : leaves(item, `${prefix}${key}.`)).sort();
}
for (const [plugin, query] of [["metronome", "metronome"], ["stopwatch", "stopwatch"], ["tip-calculator", "tip calculator"]]) {
  test(`${plugin} renders translation tokens covered by nine matching locale schemas`, async () => {
    const root = new URL(`../${plugin}/`, import.meta.url);
    const { slot } = await import(new URL("index.js", root));
    const template = await readFile(new URL("template.html", root), "utf8");
    await slot.init({ template });
    const { html } = await slot.execute(query, {});
    assert.ok(html);
    let reference;
    for (const lang of languages) {
      const data = JSON.parse(await readFile(new URL(`locales/${lang}.json`, root), "utf8"))[`plugin-${plugin}`];
      const keys = leaves(data);
      reference ||= keys;
      assert.deepEqual(keys, reference, lang);
      for (const [, key] of html.matchAll(new RegExp(`\\{\\{ t:plugin-${plugin}\\.([\\w]+) \\}\\}`, "g"))) assert.ok(data[key], `${lang}: ${key}`);
      for (const field of slot.settingsSchema) assert.ok(data.settings?.[field.key]?.label, `${lang}: ${field.key}`);
    }
    if (plugin === "metronome") assert.match(html, /data-t-audio-unavailable="\{\{ t:plugin-metronome.audioUnavailable \}\}"/);
    if (plugin === "stopwatch") assert.match(html, /aria-label="\{\{ t:plugin-stopwatch.timerMode \}\}"/);
  });
}
