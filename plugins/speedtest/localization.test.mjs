import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import command, { slot } from "./index.js";

test("Speedtest primary trigger and speed fallback alias share one settings owner", () => {
  assert.equal(command.trigger, "speedtest");
  assert.ok(command.aliases.includes("speed"));
  assert.ok(command.settingsSchema.some((field) => field.key === "debugMode"));
  assert.equal(slot.settingsSchema, undefined);
});
test("Speedtest runtime start and running states use the page translation", async () => {
  const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
  for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    const data = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-speedtest"];
    const context = vm.createContext({
      window: { scopedT: () => (key) => data[key] || key },
      document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    });
    vm.runInContext(source.replace('  if (document.readyState === "loading")', '  globalThis.check = { initialState, updateButton };\n  if (document.readyState === "loading")'), context);
    assert.equal(context.check.initialState().status, data.readyToMeasure);
    const button = {};
    const card = { querySelector: (selector) => selector === "[data-speedtest-action]" ? button : null };
    context.check.updateButton(card, { running: true });
    assert.equal(button.textContent, data.running);
    context.check.updateButton(card, { phase: "complete" });
    assert.equal(button.textContent, data.runAgain);
  }
});
