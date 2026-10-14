import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import translator from "../translate-slot/index.js";

const languages = ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"];
function leaves(data, prefix = "") {
  return Object.entries(data).flatMap(([key, value]) => typeof value === "string" ? [prefix + key] : leaves(value, `${prefix}${key}.`)).sort();
}
test("dictionary, translator, and history have matching locale and setting keys", async () => {
  for (const plugin of ["define-slot", "translate-slot", "search-history"]) {
    const module = await import(`../${plugin}/index.js`);
    let reference;
    for (const lang of languages) {
      const data = JSON.parse(await readFile(new URL(`../${plugin}/locales/${lang}.json`, import.meta.url), "utf8"))[`plugin-${plugin}`];
      reference ||= leaves(data);
      assert.deepEqual(leaves(data), reference, `${plugin}: ${lang}`);
      for (const field of module.default.settingsSchema) assert.ok(data.settings[field.key]?.label, `${plugin}: ${lang}: ${field.key}`);
    }
  }
});
test("history client renders translated empty and paginated states", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  for (const lang of languages) {
    const data = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-search-history"];
    class Element {
      dataset = {};
      status = { textContent: "" };
      querySelector(selector) { return selector === ".search-history-result__pager-status" ? this.status : null; }
      querySelectorAll() { return []; }
    }
    const entries = Array.from({ length: 25 }, (_, i) => ({ id: String(i), entry: `query ${i}`, timestamp: "2026-01-01T12:00:00Z" }));
    const context = vm.createContext({
      __PLUGIN_ID__: "test-history",
      HTMLElement: Element,
      window: { scopedT: () => (key) => data[key] || key },
      document: { readyState: "loading", documentElement: { lang }, addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } },
      localStorage: { getItem() { return JSON.stringify(entries); } },
    });
    vm.runInContext(source + "\nglobalThis.render = renderHistoryPage;", context);
    const root = new Element();
    context.render(root);
    assert.ok(root.innerHTML.includes(data.next));
    assert.equal(root.status.textContent, data.showing.replace("{start}", "1").replace("{end}", "20").replace("{count}", "25") + " • " + data.pageStatus.replace("{page}", "1").replace("{total}", "2"));
  }
});
test("translator fallback localizes language names and contains no old unresolved labels", async () => {
  await translator.init({ fetch: async () => { throw new Error("Unexpected network request"); } });
  for (const lang of languages) {
    const { html } = await translator.execute("!translate", { lang });
    assert.ok(html.includes(new Intl.DisplayNames([lang], { type: "language" }).of("de")));
    assert.doesNotMatch(html, /\{\{t_/);
    assert.match(html, /t:plugin-translate-slot.ready/);
  }
});
