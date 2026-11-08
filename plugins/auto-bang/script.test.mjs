import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("./script.js", import.meta.url), "utf8");

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.style = { display: "block" };
    this.parentElement = null;
  }
  addEventListener() {}
}

class FakeInput extends FakeElement {
  constructor(id) {
    super(id);
    this.value = "";
    this.listeners = {};
    this.form = { submits: 0, requestSubmit() { this.submits++; } };
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
  closest(selector) {
    return selector === "form" ? this.form : null;
  }
  setSelectionRange() {}
  focus() {}
}

function setup(value = "!wea") {
  const item = new FakeElement();
  item.dataset.trigger = "weather";
  item.remove = () => {};
  const dropdown = new FakeElement("ac-dropdown-results");
  dropdown.dataset.autoBangActive = "true";
  dropdown.querySelector = () => null;
  dropdown.querySelectorAll = (selector) => (selector === ".ac-item--bang" ? [item] : []);
  const input = new FakeInput("results-search-input");
  input.value = value;

  const context = vm.createContext({
    __PLUGIN_ID__: "test-auto-bang",
    HTMLElement: FakeElement,
    HTMLInputElement: FakeInput,
    window: {},
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById: (id) => (id === dropdown.id ? dropdown : null),
    },
  });
  vm.runInContext(`${source}\nglobalThis.bindBangSearchInput = bindBangSearchInput;`, context);
  context.bindBangSearchInput(input);
  return { input, dropdown };
}

function keyEvent(key, extra = {}) {
  return {
    key,
    ...extra,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

test("Tab completes the bang into the input without searching", () => {
  const { input, dropdown } = setup();
  const tab = keyEvent("Tab");
  input.listeners.keydown(tab);

  assert.equal(tab.defaultPrevented, true);
  assert.equal(input.value, "!weather ");
  assert.equal(input.form.submits, 0);
  assert.equal(dropdown.style.display, "none");
});

test("Shift+Tab keeps its normal focus movement", () => {
  const { input } = setup();
  const shiftTab = keyEvent("Tab", { shiftKey: true });
  input.listeners.keydown(shiftTab);

  assert.equal(shiftTab.defaultPrevented, false);
  assert.equal(input.value, "!wea");
  assert.equal(input.form.submits, 0);
});

test("Enter still runs the chosen bang", () => {
  const { input } = setup();
  const enter = keyEvent("Enter");
  input.listeners.keydown(enter);

  assert.equal(enter.defaultPrevented, true);
  assert.equal(input.value, "!weather ");
  assert.equal(input.form.submits, 1);
});
