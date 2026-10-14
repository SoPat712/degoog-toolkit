import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

test("Minesweeper cell positions use localized labels and substitute coordinates", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    const data = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-minesweeper"];
    const context = vm.createContext({
      window: { scopedT: () => (key) => data[key] || key },
      document: { body: {}, querySelector() { return null; } },
      MutationObserver: class { observe() {} },
    });
    vm.runInContext(source.replace("  initListeners();", "  globalThis.position = cellPosition;"), context);
    assert.equal(context.position(2, 4), data.cellPosition.replace("{row}", "3").replace("{column}", "5"));
  }
});
