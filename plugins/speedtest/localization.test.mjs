import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import command, { slot } from "./index.js";

// Mirrors degoog core's command registry (commands/registry.ts): built-ins load
// first, onLoad reserves a trigger before checking whether the command is
// disabled, and getCommandMap() lets later aliases replace earlier entries.
const CORE_BUILTIN_TRIGGERS = ["speedtest"];

function coreBangMap(commands) {
  const seenTriggers = new Set();
  const loaded = [];
  for (const entry of commands) {
    if (seenTriggers.has(entry.trigger)) continue;
    seenTriggers.add(entry.trigger);
    loaded.push(entry);
  }
  const map = new Map();
  for (const entry of loaded) {
    map.set(entry.trigger, entry.id);
    for (const alias of entry.aliases ?? []) map.set(alias, entry.id);
  }
  return { loaded: loaded.map((entry) => entry.id), map };
}

test("Speedtest primary trigger avoids the core built-in and keeps one settings owner", () => {
  assert.equal(command.trigger, "speed");
  assert.ok(!CORE_BUILTIN_TRIGGERS.includes(command.trigger));
  assert.ok(command.aliases.includes("speedtest"));
  assert.ok(command.settingsSchema.some((field) => field.key === "debugMode"));
  assert.equal(command.naturalLanguagePhrases, undefined);
  assert.equal(slot.settingsSchema, undefined);
});

test("Speedtest registers next to the built-in and owns both bangs", () => {
  const { loaded, map } = coreBangMap([
    { id: "speedtest-command", trigger: "speedtest", aliases: [] },
    { id: "plugin", trigger: command.trigger, aliases: command.aliases },
  ]);
  assert.deepEqual(loaded, ["speedtest-command", "plugin"]);
  assert.equal(map.get("speed"), "plugin");
  assert.equal(map.get("speedtest"), "plugin");
});

async function loadRuntime(lang) {
  const source = await readFile(new URL("./card.js", import.meta.url), "utf8");
  const data = JSON.parse(await readFile(new URL(`./locales/${lang}.json`, import.meta.url), "utf8"))["plugin-speedtest"];
  const calls = { fetch: 0, frames: [] };
  class HTMLElement {}
  const context = vm.createContext({
    HTMLElement,
    AbortController,
    setTimeout: () => 0,
    clearTimeout: () => {},
    performance: { now: () => 0 },
    navigator: { userAgent: "node" },
    fetch: () => {
      calls.fetch += 1;
      return new Promise(() => {});
    },
    window: {
      scopedT: () => (key) => data[key] || key,
      requestAnimationFrame: (callback) => calls.frames.push(callback),
      cancelAnimationFrame: () => {},
    },
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
  });
  vm.runInContext(source.replace('  if (document.readyState === "loading")', '  globalThis.check = { initialState, updateButton, initCard };\n  if (document.readyState === "loading")'), context);
  return { check: context.check, data, calls, HTMLElement };
}

function fakeButton() {
  const classes = new Set();
  const listeners = {};
  return {
    classes,
    listeners,
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
}

test("Speedtest runtime start and running states use the page translation", async () => {
  for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    const { check, data } = await loadRuntime(lang);
    assert.equal(check.initialState().status, data.readyToMeasure);
    const button = fakeButton();
    const card = { querySelector: (selector) => selector === "[data-speedtest-action]" ? button : null };
    check.updateButton(card, check.initialState());
    assert.equal(button.textContent, data.start);
    assert.ok(button.classes.has("speedtest-card__action--start"));
    check.updateButton(card, { running: true });
    assert.equal(button.textContent, data.running);
    assert.ok(!button.classes.has("speedtest-card__action--start"));
    check.updateButton(card, { phase: "complete" });
    assert.equal(button.textContent, data.runAgain);
  }
});

test("Speedtest waits for a click before starting a run", async () => {
  const { check, data, calls, HTMLElement } = await loadRuntime("en");
  const button = fakeButton();
  const cancel = fakeButton();
  const card = Object.assign(new HTMLElement(), {
    dataset: {},
    classList: { toggle() {} },
    querySelector: (selector) => ({
      "[data-speedtest-action]": button,
      "[data-speedtest-cancel]": cancel,
    })[selector] ?? null,
  });

  check.initCard(card);
  calls.frames.splice(0).forEach((frame) => frame(0));
  assert.equal(calls.fetch, 0);
  assert.notEqual(card.dataset.speedtestRunning, "true");
  assert.equal(button.textContent, data.start);

  button.listeners.click();
  assert.equal(card.dataset.speedtestRunning, "true");
  cancel.listeners.click();
  assert.equal(card.dataset.speedtestRunning, "false");
});
