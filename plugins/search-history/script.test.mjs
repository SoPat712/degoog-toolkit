import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
const entries = Array.from({ length: 3 }, (_, i) => ({
  id: String(i),
  entry: `query ${i}`,
  timestamp: "2026-01-01T12:00:00Z",
}));

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.style = { display: "block", setProperty() {} };
    this.innerHTML = "";
    this.parentElement = null;
    this.inner = null;
  }
  querySelector(selector) {
    return selector === "#history-plugin-root" ? this.inner : null;
  }
  querySelectorAll() {
    return [];
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
}

function loadScript(elements = {}) {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
    // Insert nodes the way core does, then deliver the records like a real
    // observer would (nothing once disconnected).
    insert(node, root = node) {
      elements[root.id] = root;
      if (!this.disconnected) this.callback([{ addedNodes: [node] }]);
    }
  }
  const context = vm.createContext({
    __PLUGIN_ID__: "test-history",
    HTMLElement: FakeElement,
    HTMLInputElement: FakeInput,
    Node: FakeElement,
    MutationObserver: FakeMutationObserver,
    window: { scopedT: () => (key) => key },
    document: {
      readyState: "loading",
      body: new FakeElement(),
      documentElement: { lang: "en" },
      activeElement: null,
      addEventListener() {},
      getElementById: (id) => elements[id] ?? null,
      querySelector: () => null,
    },
    localStorage: { getItem: () => JSON.stringify(entries), setItem() {} },
  });
  vm.runInContext(
    `${source}\nglobalThis.__history = { initHistoryPage, bindHistorySearchInput, renderHistoryDropdown };`,
    context,
  );
  return { api: context.__history, observers };
}

function keyEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

test("renders every !history root inserted during the session", () => {
  const { api, observers } = loadScript();
  api.initHistoryPage();
  assert.equal(observers.length, 1);
  const [observer] = observers;

  const first = new FakeElement("history-plugin-root");
  first.innerHTML = "Loading…";
  observer.insert(first);
  assert.match(first.innerHTML, /query 2/);

  // The plugin's own re-render adds nodes inside the root; that must not loop.
  const rendered = first.innerHTML;
  observer.insert(new FakeElement(), first);
  assert.equal(first.innerHTML, rendered);

  // A second !history replaces the results list with a fresh root.
  const second = new FakeElement("history-plugin-root");
  second.innerHTML = "Loading…";
  const wrapper = new FakeElement();
  wrapper.inner = second;
  observer.insert(wrapper, second);
  assert.match(second.innerHTML, /query 2/);
});

test("Tab leaves the history dropdown without submitting a search", () => {
  const dropdown = new FakeElement("ac-dropdown-results");
  const item = new FakeElement();
  item.dataset.entry = "query 2";
  dropdown.querySelector = (selector) => (selector.includes("ac-item--history") ? item : null);
  dropdown.querySelectorAll = (selector) => (selector.includes("ac-item--history") ? [item] : []);
  const input = new FakeInput("results-search-input");
  const { api } = loadScript({ "ac-dropdown-results": dropdown });
  api.bindHistorySearchInput(input);

  const tab = keyEvent("Tab");
  input.listeners.keydown(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.equal(input.value, "");
  assert.equal(input.form.submits, 0);

  // Enter on the highlighted entry still runs that search.
  const enter = keyEvent("Enter");
  input.listeners.keydown(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(input.value, "query 2");
  assert.equal(input.form.submits, 1);
});

test("history dropdown rows stay out of the tab order", () => {
  const dropdown = new FakeElement("ac-dropdown-results");
  dropdown.querySelector = (selector) => (selector === ".ac-item--history" ? new FakeElement() : null);
  const input = new FakeInput("results-search-input");
  const { api } = loadScript({ "ac-dropdown-results": dropdown });
  api.renderHistoryDropdown(entries, input, dropdown);

  assert.match(dropdown.innerHTML, /ac-item--history/);
  assert.doesNotMatch(dropdown.innerHTML, /tabindex="0"/);
  assert.equal(dropdown.innerHTML.match(/tabindex="-1"/g).length, entries.length * 2);
});
