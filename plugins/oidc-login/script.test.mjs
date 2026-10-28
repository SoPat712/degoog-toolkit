import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./script.js", import.meta.url), "utf8");
const id = "sopat712-degoog-toolkit-oidc-login";
const defaultAuth = { valid: false, oidcPlugin: id, automaticSearchLogin: "silent", loginUrl: `/api/plugin/${id}/login` };
const prefixKey = `oidc-login:${id}`;

async function browser({ href = "https://search.example/search?q=rust", auth = defaultAuth, storage = new Map(), storageUnavailable = false,
  query = "", api = true, settingsPage = false, base = "", status = 200, authenticatedFlag } = {}) {
  const url = new URL(href); const navigations = [], searches = [], forms = [], requests = [];
  const location = { origin: url.origin, href, pathname: url.pathname, search: url.search, hash: url.hash, replace: value => navigations.push(value), reload: () => navigations.push("reload") };
  const sessionStorage = {
    getItem(key) { if (storageUnavailable) throw new Error("storage blocked"); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageUnavailable) throw new Error("storage blocked"); storage.set(key, value); },
    removeItem(key) { if (storageUnavailable) throw new Error("storage blocked"); storage.delete(key); },
  };
  const document = {
    readyState: "complete",
    getElementById(name) { if (name === "results-page") return settingsPage ? null : {}; if (name === "results-search-input") return { value: query }; return null; },
    createElement(tag) { return { children: [], appendChild(child) { this.children.push(child); }, submit() { forms.push(this); }, tag }; },
    body: { appendChild() {} },
  };
  const window = { location, __DEGOOG_BASE_URL__: base, ...(authenticatedFlag === undefined ? {} : { __DEGOOG_RESULT_ACTIONS__: { authenticated: authenticatedFlag } }), ...(api ? { degoog: { search: (...args) => searches.push(args), results: { current: () => ({ type: "images" }) } } } : {}) };
  const context = vm.createContext({ window, document, sessionStorage, __PLUGIN_ID__: id, URL, URLSearchParams, Date,
    fetch: async (url, init) => { requests.push({ url, init }); return Response.json(auth, { status }); } });
  new vm.Script(source).runInContext(context);
  await new Promise(setImmediate);
  return { navigations, searches, forms, requests, storage };
}

test("search-page SSO uses one silent redirect with a local return path and no tokens in storage", async () => {
  const result = await browser();
  assert.equal(result.navigations.length, 1);
  const navigation = new URL(result.navigations[0]);
  assert.equal(navigation.origin, "https://search.example");
  assert.equal(navigation.searchParams.get("mode"), "silent");
  assert.equal(navigation.searchParams.get("returnTo"), "/search?q=rust");
  assert.deepEqual([...result.storage], [[`${prefixKey}:attempt`, "attempted"]]);
  assert.equal(result.requests[0].init.credentials, "same-origin");
});

test("a failed silent round trip cannot loop; blocked storage suppresses automatic login", async () => {
  const first = await browser(); const second = await browser({ storage: first.storage });
  assert.equal(second.navigations.length, 0);
  assert.equal((await browser({ storageUnavailable: true })).navigations.length, 0);
});

test("existing native sessions need no redirect or client-readable session token", async () => {
  const storage = new Map([[`${prefixKey}:attempt`, "attempted"]]);
  const result = await browser({ auth: { valid: true }, storage });
  assert.equal(result.navigations.length, 0); assert.equal(storage.size, 0);
});

test("a newly valid cookie refreshes stale server-rendered admin flags at most once", async () => {
  const storage = new Map([[`${prefixKey}:attempt`, "attempted"]]);
  const first = await browser({ auth: { valid: true }, authenticatedFlag: false, storage });
  assert.deepEqual(first.navigations, ["reload"]);
  const second = await browser({ auth: { valid: true }, authenticatedFlag: false, storage });
  assert.equal(second.navigations.length, 0); assert.equal(storage.size, 0);
});

test("only the selected OIDC gate's same-origin login endpoint can trigger automatic navigation", async () => {
  for (const auth of [ { ...defaultAuth, oidcPlugin: "another-plugin" }, { ...defaultAuth, automaticSearchLogin: "off" },
    { ...defaultAuth, loginUrl: "https://evil.example/login" }, { ...defaultAuth, loginUrl: "javascript:alert(1)" }, { ...defaultAuth, loginUrl: "/other/login" } ]) {
    assert.equal((await browser({ auth })).navigations.length, 0);
  }
  assert.equal((await browser({ status: 503 })).navigations.length, 0);
  assert.equal((await browser({ settingsPage: true })).requests.length, 0);
});

test("POST-search queries remain local and are restored after successful or unsuccessful SSO", async () => {
  const first = await browser({ href: "https://search.example/search?type=images", query: "private query" });
  assert.equal(new URL(first.navigations[0]).searchParams.get("returnTo"), "/search?type=images");
  assert.equal(first.navigations[0].includes("private"), false);
  const restored = await browser({ href: "https://search.example/search?type=images", auth: { valid: true }, storage: new Map(first.storage) });
  assert.deepEqual(restored.searches, [["private query", "images"]]);
  const notLoggedIn = await browser({ href: "https://search.example/search?type=images", storage: new Map(first.storage) });
  assert.deepEqual(notLoggedIn.searches, [["private query", "images"]]);
  assert.equal(notLoggedIn.navigations.length, 0);
});

test("POST-query restoration supports cores without the browser search API", async () => {
  const first = await browser({ href: "https://search.example/search", query: "private query", api: false });
  const restored = await browser({ href: "https://search.example/search", auth: { valid: true }, storage: first.storage, api: false });
  assert.equal(restored.forms.length, 1);
  assert.equal(restored.forms[0].method, "post");
  assert.equal(restored.forms[0].action, "/search");
  assert.deepEqual(restored.forms[0].children.map(c => [c.name, c.value]), [["q", "private query"], ["type", "web"]]);
});

test("SSO respects degoog base paths and validates untrusted saved browser state", async () => {
  const result = await browser({ href: "https://search.example/degoog/search?q=rust", base: "/degoog", auth: { ...defaultAuth, loginUrl: `/degoog/api/plugin/${id}/login` } });
  assert.equal(new URL(result.navigations[0]).pathname, `/degoog/api/plugin/${id}/login`);
  assert.equal(result.requests[0].url, "/degoog/api/settings/auth");
  const storage = new Map([[`${prefixKey}:pending-search`, JSON.stringify({ path: "/search?q=rust", query: "private", type: "images<script>", at: Date.now() })]]);
  assert.equal((await browser({ auth: { valid: true }, storage })).searches.length, 0);
});
