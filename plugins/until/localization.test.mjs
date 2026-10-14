import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { slot } from "./index.js";

const languages = ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"];
test("Until refresh retains translated captions and grammatical unit names", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  for (const lang of languages) {
    const locale = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-until"];
    const caption = { textContent: "" };
    const card = {
      dataset: { untilTarget: new Date(Date.now() + 86400000).toISOString() },
      classList: { toggle() {} },
      querySelector: (selector) => selector === "[data-until-caption]" ? caption : null,
    };
    const context = vm.createContext({
      window: { scopedT: () => (key) => locale[key] || key },
      document: { documentElement: { lang }, readyState: "loading", addEventListener() {} },
      MutationObserver: class { observe() {} },
    });
    vm.runInContext(source.replace("  if (document.readyState", "  globalThis.check = { updateCard, plural };\n  if (document.readyState"), context);
    context.check.updateCard(card);
    assert.equal(caption.textContent, locale.fromNow);
    for (const value of [1, 2, 5, 21]) {
      const expected = new Intl.NumberFormat(lang, { style: "unit", unit: "day", unitDisplay: "long" }).formatToParts(value).find((part) => part.type === "unit").value;
      assert.equal(context.check.plural("day", value), expected);
    }
  }
});
test("Until server respects all nine date locales and translates usage", async () => {
  slot.init({});
  for (const lang of languages) {
    const { html } = await slot.execute("!until 2033-07-06", { lang });
    assert.ok(html.includes(new Intl.DateTimeFormat(lang, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(2033, 6, 6))), lang);
  }
  assert.match((await slot.execute("!until", {})).html, /t:plugin-until.tryQuery/);
});
