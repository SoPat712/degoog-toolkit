import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { load } from "cheerio";

const THEMES = ["literallygoogle", "literallyapple"];
const read = (file) => readFile(new URL(`./${file}`, import.meta.url), "utf8");
const readTheme = (theme, file) => read(`${theme}/${file}`);

function sectionOf(source) {
  return (start, end) => {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `missing ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `missing ${end}`);
    return source.slice(from, to);
  };
}

function cssRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const walk = (text) => {
    let depth = 0;
    let start = 0;
    let selector = "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (depth === 0) {
          selector = text.slice(start, i).trim();
          start = i + 1;
        }
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          const body = text.slice(start, i);
          if (selector.startsWith("@")) walk(body);
          else rules.push({ selector, body });
          start = i + 1;
        }
      }
    }
  };
  walk(clean);
  return rules;
}

// Minimal stand-in for core's renderTemplateString (each / if / ^if / values).
function renderTemplate(template, context) {
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const truthy = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));
  let out = template.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each \1\}\}/g, (_, key, body) =>
    (context[key] || []).map((item) => renderTemplate(body, { ...context, ...item })).join(""),
  );
  out = out.replace(/\{\{([#^])if (\w+)\}\}([\s\S]*?)\{\{\/if \2\}\}/g, (_, mode, key, body) =>
    (mode === "#") === truthy(context[key]) ? body : "",
  );
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => esc(context[key]));
}

for (const theme of THEMES) {
  const source = await readTheme(theme, "scripts/search.js");
  const section = sectionOf(source);

  test(`${theme}: the server page comes from history state in POST mode`, () => {
    const window = { location: { search: "" }, history: { state: null } };
    const context = vm.createContext({ URLSearchParams, window });
    vm.runInContext(section("    function getUrlPage() {", "    let infiniteScrollSetting"), context);
    assert.equal(context.getUrlPage(), 1);
    window.history.state = { degoog: true, query: "cars", type: "web", page: 3 };
    assert.equal(context.getUrlPage(), 3, "bare /search keeps the page core recorded");
    window.location.search = "?q=cars&page=2";
    assert.equal(context.getUrlPage(), 2, "an explicit URL page still wins");
    window.location.search = "";
    window.history.state = { page: 4 };
    assert.equal(context.getUrlPage(), 1, "foreign history entries are ignored");
  });

  test(`${theme}: infinite scroll turns off client paging`, async () => {
    let sentinel = null;
    let frames = 0;
    let requested = "";
    const context = vm.createContext({
      window: { __DEGOOG_BASE_URL__: "/base", requestAnimationFrame: () => { frames++; } },
      document: { querySelector: (selector) => (selector === "#results-main .degoog-infinite" ? sentinel : null) },
      fetch: async (url) => {
        requested = url;
        return { ok: true, json: async () => ({ infiniteScroll: true }) };
      },
      syncPagination() {},
      isWebTab: () => true,
      getUrlPage: () => 1,
      RESULTS_PER_PAGE_HINT: 10,
    });
    vm.runInContext(section("    let infiniteScrollSetting", "    function isWebTab()"), context);
    vm.runInContext(section("    function shouldEnableClientPagination(", "    function resetClientPagination("), context);
    assert.equal(context.shouldEnableClientPagination(28), true);
    sentinel = {};
    assert.equal(context.shouldEnableClientPagination(28), false, "core's sentinel marks infinite mode");
    sentinel = null;
    context.loadInfiniteScrollSetting();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(requested, "/base/api/settings/streaming");
    assert.equal(frames, 1, "the pager re-syncs once the setting is known");
    assert.equal(context.shouldEnableClientPagination(28), false, "stays off after the sentinel is torn down");
  });

  test(`${theme}: prev/next-only pagers use the server page as current`, () => {
    const node = (page) => ({ page, classList: { contains: () => false }, getAttribute: () => null });
    const context = vm.createContext({
      getPageNumber: (n) => n.page,
      isActivePage: () => false,
      getUrlPage: () => 2,
    });
    vm.runInContext(section("    function classifyControls(", "    function getResultCount("), context);
    const controls = context.classifyControls([node(3), node(1)]);
    assert.equal(controls.activePage, 2);
    assert.equal(controls.prev.page, 1);
    assert.equal(controls.next.page, 3);
    assert.equal(context.classifyControls([]).activePage, 1);
  });

  test(`${theme}: results tabs are a keyboard tab list`, () => {
    const makeEl = (props = {}) => {
      const attrs = new Map(Object.entries(props.attrs || {}));
      const classes = new Set(props.classes || []);
      return {
        dataset: props.dataset || {},
        hidden: false,
        style: { display: props.display || "" },
        parentElement: null,
        classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c) },
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        setAttribute: (k, v) => attrs.set(k, String(v)),
        removeAttribute: (k) => attrs.delete(k),
        getClientRects: () => (props.display === "none" ? [] : [{}]),
        closest(selector) { return selector.startsWith(".results-tab") ? this : null; },
        focus() { focused = this; },
        click() { clicks.push(this.dataset.type); },
      };
    };
    let focused = null;
    const clicks = [];
    const container = makeEl({ attrs: { role: "tablist" } });
    const rail = makeEl();
    const tabs = [
      makeEl({ dataset: { type: "web" } }),
      makeEl({ dataset: { type: "tab:engine:images" }, classes: ["active"] }),
      makeEl({ dataset: { type: "tab:engine:news", bangHidden: "true" }, display: "none" }),
      makeEl({ dataset: { type: "tab:engine:videos" } }),
    ];
    for (const tab of tabs) tab.parentElement = rail;
    container.querySelectorAll = (selector) => (selector.includes("tablist") ? [] : tabs);
    container.contains = (node) => tabs.includes(node);
    let direction = "ltr";
    const context = vm.createContext({
      getResultsTabs: () => container,
      getComputedStyle: () => ({ direction }),
    });
    vm.runInContext(section("    function setAttrIfChanged(", "    function syncSearchType()"), context);
    context.syncTabSemantics();
    assert.equal(rail.getAttribute("role"), "tablist");
    assert.equal(container.getAttribute("role"), null, "only the tabs' own parent is the tab list");
    assert.deepEqual(tabs.map((t) => t.getAttribute("role")), ["tab", "tab", "tab", "tab"]);
    assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["false", "true", "false", "false"]);
    assert.deepEqual(tabs.map((t) => t.getAttribute("tabindex")), ["-1", "0", "-1", "-1"]);

    const press = (target, key, extra = {}) => {
      const event = { target, key, repeat: false, prevented: false, stopped: false, ...extra,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      context.onTabsKeydown(event);
      return event;
    };
    assert.equal(press(tabs[1], "ArrowRight").prevented, true);
    assert.equal(focused, tabs[3], "hidden bang tabs are skipped");
    press(tabs[3], "ArrowRight");
    assert.equal(focused, tabs[0], "arrows wrap");
    press(tabs[0], "End");
    assert.equal(focused, tabs[3]);
    direction = "rtl";
    press(tabs[3], "ArrowRight");
    assert.equal(focused, tabs[1], "right arrow moves backwards in RTL");
    direction = "ltr";
    const enter = press(tabs[3], "Enter");
    assert.equal(enter.prevented, true);
    press(tabs[3], " ");
    press(tabs[3], "Enter", { repeat: true });
    assert.deepEqual(clicks, ["tab:engine:videos", "tab:engine:videos"], "Enter/Space dispatch core's click once per press");
    focused = null;
    assert.equal(press(tabs[0], "ArrowRight", { ctrlKey: true }).prevented, false);
    assert.equal(focused, null);

    tabs[1].style.display = "none";
    tabs[1].dataset.bangHidden = "true";
    context.syncTabSemantics();
    assert.deepEqual(tabs.map((t) => t.getAttribute("tabindex")), ["0", "-1", "-1", "-1"], "a hidden active tab hands the tab stop on");
  });

  test(`${theme}: image related-search chips follow core's suggestion preferences`, async () => {
    const calls = [];
    let prefs = {};
    const context = vm.createContext({
      window: { __DEGOOG_SEARCH_AUTH__: { n: "nonce", s: "sig" } },
      encodeURIComponent,
      JSON,
      MAX_TERMS: 8,
      readCorePrefs: async () => prefs,
      fetch: async (url, init = {}) => {
        calls.push({ url, init });
        return { ok: true, json: async () => ["Cars", "cars review", { text: "cars review" }, { text: "best cars" }, "", 7] };
      },
    });
    vm.runInContext(section("    function normalizeTerms(", "    function rememberSidebarTerms("), context);
    vm.runInContext(section("    async function fetchTerms(", "    function removeRow("), context);
    assert.deepEqual([...context.normalizeTerms(["a", "A", "b", { text: "c" }, "q"], "q")], ["a", "b", "c"]);
    assert.deepEqual([...await context.fetchTerms("cars")], ["cars review", "best cars"]);
    assert.equal(calls[0].url, "/api/suggest?q=cars");
    assert.equal(calls[0].init.headers["x-search-nonce"], "nonce");
    prefs = { post_method_enabled: true };
    await context.fetchTerms("cars");
    assert.equal(calls[1].url, "/api/suggest");
    assert.equal(calls[1].init.method, "POST");
    assert.equal(calls[1].init.body, JSON.stringify({ query: "cars" }), "POST mode keeps the query out of the URL");
    prefs = { display_search_suggestions: false };
    assert.deepEqual([...await context.fetchTerms("cars")], []);
    assert.equal(calls.length, 2, "no request when the visitor turned suggestions off");
  });

  test(`${theme}: Videos keep the web layout and its sidebar`, async () => {
    const style = await readTheme(theme, "style.css");
    for (const rule of cssRules(style)) {
      if (!/#sidebar-col\s*$/.test(rule.selector) || !/display:\s*none/.test(rule.body)) continue;
      assert.doesNotMatch(rule.selector, /videos|video-card/, `${theme} hides the sidebar on Videos: ${rule.selector}`);
    }
    assert.doesNotMatch(style, /\.results-tab\[data-type="(?:tab:engine:)?videos"\]/);
    assert.match(source, /if \(type === "images"\) return false;/, "fluid web columns include Videos");
  });

  test(`${theme}: keyboard focus rings the whole result`, async () => {
    const style = await readTheme(theme, "style.css");
    const rules = cssRules(style);
    const ring = rules.find((r) => r.selector === "#results-list .result-item:has(a.result-title:focus-visible)");
    assert.ok(ring, "result ring rule");
    assert.match(ring.body, /outline:\s*\dpx solid/);
    assert.match(ring.body, /border-radius:\s*var\(--theme-radius-/);
    assert.match(ring.body, /margin-inline:\s*calc\(-1 \* var\(/);
    assert.match(ring.body, /padding-inline:\s*var\(/);
    const titles = rules.filter((r) => r.selector === "#results-list a.result-title:focus-visible");
    assert.equal(titles.length, 2, "fallback ring plus :has() override");
    assert.match(titles[0].body, /outline:\s*\dpx solid/, "browsers without :has() keep a visible ring");
    assert.match(titles[1].body, /outline:\s*none/);
    assert.match(style, /@supports selector\(:has\(\*\)\)/);
  });

  test(`${theme}: header carries core's clear button and logo letters`, async () => {
    const $ = load(await readTheme(theme, "search-templates/header.html"));
    const clear = $("#results-search-clear-btn");
    assert.equal(clear.length, 1);
    assert.equal(clear.attr("type"), "button");
    assert.equal(clear.attr("style"), undefined, "visibility is CSS-driven so restored values show it");
    assert.match(clear.attr("aria-label"), new RegExp(`t:theme-${theme}\\.clearSearch`));
    const bar = $("#results-search-bar").children().toArray().map((el) => el.attribs.id || el.attribs.class);
    assert.ok(bar.indexOf("results-search-clear-btn") < bar.indexOf("search-bar-actions-results"), "× sits before the action icons");
    assert.equal($(".results-logo .logo-letter").length, 6, "logo-mot easter egg targets");
    const style = await readTheme(theme, "style.css");
    assert.match(style, /:has\(\.search-input:placeholder-shown\) #results-search-clear-btn[^{]*\{\s*display:\s*none !important;/);
    assert.match(style, /:has\(\.search-input:not\(:placeholder-shown\)\) #results-search-clear-btn[^{]*\{\s*display:\s*inline-flex !important;/);
    for (const locale of ["en", "es", "fr"]) {
      const bank = JSON.parse(await readTheme(theme, `locales/${locale}.json`))[`theme-${theme}`];
      assert.equal(typeof bank.clearSearch, "string", `${theme} ${locale}`);
      assert.equal(typeof bank.relatedSearches, "string", `${theme} ${locale}`);
    }
  });

  test(`${theme}: layout uses core's translated title, description and module preload`, async () => {
    const layout = await readTheme(theme, "layout.html");
    assert.match(layout, /<title>\{\{t:app\.title\}\}<\/title>/);
    assert.match(layout, /<meta name="description" content="\{\{t:app\.description\}\}" \/>/);
    assert.doesNotMatch(layout, /<title>degoog<\/title>|alternative search engine aggregator/);
    const preload = layout.indexOf('<link rel="modulepreload" href="/public/app.js?v=__APP_VERSION__" />');
    assert.notEqual(preload, -1);
    assert.ok(preload < layout.indexOf('rel="stylesheet"'));
  });
}

test("literallygoogle logo, tabs and results share one left edge", async () => {
  const style = await readTheme("literallygoogle", "style.css");
  const rules = cssRules(style);
  const root = rules.find((r) => r.selector === ":root" && r.body.includes("--literallygoogle-results-content-inline-base"));
  assert.match(root.body, /--literallygoogle-results-content-inline-base:\s*clamp\(\s*1\.25rem,\s*9vw,/);
  const header = rules.find((r) => r.selector === "#results-header" && r.body.includes("position: sticky"));
  assert.match(header.body, /padding-inline-start:\s*var\(--literallygoogle-results-content-inline-start\)/, "the logo starts at the results edge");
});

test("literallygoogle centered mode centers the whole page rail", async () => {
  const style = await readTheme("literallygoogle", "style.css");
  const rules = cssRules(style);
  const root = rules.find((r) => r.selector === ":root" && r.body.includes("--literallygoogle-results-page-max"));
  assert.ok(root, "static page width resolved on :root");
  assert.match(root.body, /--literallygoogle-results-content-inline-start:\s*var\(\s*--literallygoogle-results-content-inline-base\s*\)/);
  const pageMax = root.body.match(/--literallygoogle-results-page-max:\s*calc\(([^;]*)\);/)[1];
  assert.doesNotMatch(pageMax, /content-inline-base/, "the block starts at the logo, so the edge is not part of it");
  const centered = rules.find((r) => r.selector.startsWith("#results-page.centered-mode:not(") && r.body.includes("--literallygoogle-results-content-inline-start: max("));
  assert.ok(centered);
  assert.match(centered.body, /var\(--literallygoogle-results-content-inline-base\),\s*calc\(\(100vw - var\(--literallygoogle-results-page-max\)\) \/ 2\)/);
  assert.match(centered.body, /--degoog-results-content-inline-start:/, "Store plugins follow the shifted rail");
  assert.match(centered.body, /--lg-centered-header-end:\s*max\(\s*1\.25rem,/);
  const reset = rules.find((r) => r.selector.includes("#results-page.centered-mode :is(#results-header, #results-tabs, #results-meta)"));
  assert.match(reset.body, /max-width:\s*none/);
  assert.match(reset.body, /margin-inline:\s*0/);
  const header = rules.find((r) => r.selector === "#results-page.centered-mode #results-header");
  assert.match(header.body, /padding-inline:\s*var\(--literallygoogle-results-content-inline-start\)\s*var\(--lg-centered-header-end\)/);
});

test("literallygoogle supplies Google-style error and easter-egg pages", async () => {
  const manifest = JSON.parse(await readTheme("literallygoogle", "theme.json"));
  const pages = { "404": "pages/404.html", teapot: "pages/teapot.html", gandalf: "pages/gandalf.html", "robots-takeover": "pages/robots-takeover.html" };
  const banks = {};
  for (const locale of ["en", "es", "fr"]) {
    banks[locale] = JSON.parse(await readTheme("literallygoogle", `locales/${locale}.json`))["theme-literallygoogle"];
  }
  for (const [key, file] of Object.entries(pages)) {
    assert.equal(manifest.html[key], file);
    const html = await readTheme("literallygoogle", file);
    assert.doesNotMatch(html, /<!doctype|<html|<head/i, `${file} is a fragment placed into the layout`);
    for (const [, name] of html.matchAll(/\{\{\s*t:theme-literallygoogle\.(\w+)\s*\}\}/g)) {
      for (const locale of Object.keys(banks)) assert.equal(typeof banks[locale][name], "string", `${locale}: ${name}`);
    }
    const $ = load(html);
    assert.equal($(".logo-letter").length >= 3, true, `${file} uses the theme wordmark`);
  }
  const robots = await readTheme("literallygoogle", pages["robots-takeover"]);
  assert.equal(robots.split("__ROBOTS_RESULTS__").length, 2);
  const $robots = load(robots);
  assert.equal($robots("#results-header, #results-tabs").length, 0, "core's client renders into those ids");
  assert.equal($robots("#results-list").text().trim(), "__ROBOTS_RESULTS__");
  const gandalf = await readTheme("literallygoogle", pages.gandalf);
  assert.match(gandalf, /<style>[\s\S]*\.lg-gandalf[\s\S]*<\/style>/, "blocked addresses cannot load stylesheets");
  const notFound = load(await readTheme("literallygoogle", pages["404"]));
  assert.equal(notFound("button#lg-error-robot").length, 1, "the robot is keyboard reachable");
  assert.ok(notFound(".lg-error-page").attr("data-lg-dance").includes("t:theme-literallygoogle.notFoundDance"));
});

test("literallygoogle no-JS templates render the theme without scripts", async () => {
  const KNOWN = new Set(["layout", "index", "search", "home-header", "home-search", "home-footer", "search-header", "result", "image-card", "logo", "tabs", "pagination"]);
  const files = await readdir(new URL("./literallygoogle/nojs/", import.meta.url));
  for (const file of files) {
    if (file.endsWith(".html")) assert.ok(KNOWN.has(file.slice(0, -5)), `core never loads nojs/${file}`);
    else assert.equal(file, "nojs.css");
  }
  const nojs = (file) => readTheme("literallygoogle", `nojs/${file}`);

  const layout = await nojs("layout.html");
  assert.doesNotMatch(layout, /<script|modulepreload/);
  for (const token of ["__PAGE_CONTENT__", "__BODY_CLASS__", "__THEME_CSS__", "__THEME_ATTRS__", "__LANG_ATTR__", "__RTL_SUPPORT__"]) {
    assert.ok(layout.includes(token), token);
  }
  assert.match(layout, /href="__THEME_PATH__\/nojs\/nojs\.css\?v=__APP_VERSION__"/);

  const header = load(await nojs("search-header.html"));
  assert.equal(header(".results-logo .logo-letter").length, 6);
  assert.equal(header("#results-search-bar #results-search-input").length, 1);
  assert.equal(header("#results-search-btn").attr("type"), "submit");

  const tabsHtml = renderTemplate(await nojs("tabs.html"), {
    tools_open: false,
    tabs: [
      { name: "Web", href: "/nojs/search?q=a", active_class: "active" },
      { name: "Images", href: "/nojs/search?q=a&type=tab%3Aimages", active_class: "" },
    ],
    search_action: "/nojs/search",
    method: "get",
    query: "a",
    type: "",
    time_options: [{ value: "any", label: "Any time", selected: true }, { value: "day", label: "Past day", selected: false }],
    languages: [],
    date_from: "",
    date_to: "",
  });
  const tabs = load(tabsHtml);
  assert.deepEqual(tabs(".lg-nojs-tab").toArray().map((el) => el.attribs.href), ["/nojs/search?q=a", "/nojs/search?q=a&type=tab%3Aimages"]);
  assert.equal(tabs(".lg-nojs-tab.active").text(), "Web");
  assert.equal(tabs("details.lg-nojs-tools").attr("open"), undefined);
  assert.equal(tabs("form input[name=q]").attr("value"), "a");
  assert.equal(tabs("form input[name=type]").length, 0);
  assert.equal(tabs("select[name=time] option[selected]").attr("value"), "any");
  assert.equal(tabs("select[name=lang]").length, 0, "no language list unless the instance enables it");

  const pager = load(renderTemplate(await nojs("pagination.html"), {
    prev_href: "/nojs/search?q=a",
    next_href: "/nojs/search?q=a&page=3",
    pages: [1, 2, 3].map((number) => ({ number, current: number === 2, href: `/nojs/search?q=a&page=${number}` })),
  }));
  assert.equal(pager("a[rel=prev]").attr("href"), "/nojs/search?q=a");
  assert.equal(pager("a[rel=next]").attr("href"), "/nojs/search?q=a&page=3");
  assert.equal(pager("[aria-current=page]").text().replace(/\s+/g, ""), "o2");
  assert.equal(pager("a.lg-nojs-pager-page").length, 2);
  assert.equal(pager(".lg-nojs-pager-letter").length, 7, "d e g + one o per page + g");

  const css = await nojs("nojs.css");
  assert.doesNotMatch(css, /data-lg-|aria-selected|\.loaded\b|lg-client-page|lg-image-fab/, "no script-set hooks");
  assert.match(css, /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme\]\) body\.nojs/);
});
