import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { load } from "cheerio";

// Tabs + More menu, the image Sources pill, the result header breadcrumb and
// About this result panel (both themes share these scripts by name).
const THEMES = ["literallygoogle", "literallyapple"];
const readTheme = (theme, file) => readFile(new URL(`./${theme}/${file}`, import.meta.url), "utf8");

function sectionOf(source) {
  return (start, end) => {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `missing ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `missing ${end}`);
    return source.slice(from, to);
  };
}

// Same subset of core's template syntax the theme template uses.
function renderTemplate(template, context) {
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const truthy = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));
  let out = template.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each \1\}\}/g, (_, key, body) =>
    (context[key] || []).map((item) => renderTemplate(body, { ...context, ...item })).join(""),
  );
  let previous;
  do {
    previous = out;
    out = out.replace(/\{\{([#^])if (\w+)\}\}([\s\S]*?)\{\{\/if \2\}\}/g, (_, mode, key, body) =>
      (mode === "#") === truthy(context[key]) ? body : "",
    );
  } while (out !== previous);
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => esc(context[key]));
}

function fakeClassList(...names) {
  const set = new Set(names);
  return {
    contains: (name) => set.has(name),
    add: (name) => set.add(name),
    remove: (name) => set.delete(name),
    toggle: (name, force) => {
      const on = force === undefined ? !set.has(name) : Boolean(force);
      if (on) set.add(name);
      else set.delete(name);
      return on;
    },
  };
}

function fakeTab(type, { text, active = false, bangHidden = false } = {}) {
  const raw = type.startsWith("tab:engine:") ? type.slice(11) : type;
  return {
    dataset: { type, ...(bangHidden ? { bangHidden: "true" } : {}) },
    hidden: false,
    style: { display: bangHidden ? "none" : "" },
    textContent: text ?? raw.charAt(0).toUpperCase() + raw.slice(1),
    classList: fakeClassList(...(active ? ["active"] : [])),
  };
}

function fakeRow({ name, meta, failed = false, reason = "", retrying = false, retry = true }) {
  const parts = {
    ".engine-stat-label": { textContent: name },
    ".engine-stat-meta": { textContent: meta },
    ".engine-stat-reason": reason ? { getAttribute: (k) => (k === "data-tooltip" ? reason : null) } : null,
    ".engine-retry-link": retry ? { classList: fakeClassList(...(retrying ? ["retrying"] : [])), clicks: 0, click() { this.clicks++; } } : null,
  };
  return {
    classList: fakeClassList(...(failed ? ["engine-failed"] : [])),
    querySelector: (selector) => parts[selector] ?? null,
    retryLink: parts[".engine-retry-link"],
  };
}

for (const theme of THEMES) {
  const source = await readTheme(theme, "scripts/search.js");
  const about = await readTheme(theme, "scripts/result-about.js");
  const section = sectionOf(source);
  const aboutSection = sectionOf(about);
  const typeAttr = theme === "literallygoogle" ? "data-lg-search-type" : "data-la-search-type";

  test(`${theme}: four tabs stay in the row and the rest fold under More`, () => {
    const context = vm.createContext({
      PRIMARY_TAB_COUNT: 4,
      DEFAULT_PRIMARY_TABS: ["web", "images", "videos", "news"],
    });
    vm.runInContext(section("    function tabKey(tab) {", "    function relabelTab(tab) {"), context);
    vm.runInContext(section("    function isTabListed(tab) {", "    function loadSavedTabOrder() {"), context);
    const types = ["web", "images", "news", "consumer", "file", "it", "music", "repos", "science", "videos"];
    const tabs = types.map((t) => fakeTab(t === "web" ? t : `tab:engine:${t}`, { active: t === "web" }));
    const names = (list) => list.map((tab) => tab.dataset.type.replace("tab:engine:", ""));

    let row = context.pickTabRow(tabs, []);
    assert.deepEqual(names(row.overflow), ["consumer", "file", "it", "music", "repos", "science"],
      "without a saved order Web, Images, Videos and News stay, wherever core put them");
    assert.equal(row.extra, null);

    tabs[0].classList.remove("active");
    tabs[5].classList.add("active");
    row = context.pickTabRow(tabs, []);
    assert.equal(row.extra, tabs[5], "the active IT tab joins the row after the four");
    assert.equal(row.overflow.includes(tabs[5]), false);

    row = context.pickTabRow(tabs, ["web", "science", "repos", "images"]);
    assert.deepEqual(names(tabs.filter((t) => !row.overflow.includes(t) && t !== row.extra)), ["web", "images", "news", "consumer"],
      "with a saved order the first four DOM tabs (core already applied the order) stay");

    const few = ["web", "images", "news", "videos", "it"].map((t) => fakeTab(t === "web" ? t : `tab:engine:${t}`));
    assert.deepEqual([...context.pickTabRow(few, []).overflow], [], "a single extra tab is shown instead of a one-item menu");

    const bang = types.map((t) => fakeTab(t === "web" ? t : `tab:engine:${t}`, { bangHidden: !["web", "it", "music"].includes(t) }));
    assert.deepEqual([...context.pickTabRow(bang, []).overflow], [], "bang-hidden tabs are neither shown nor listed");
    assert.equal(context.tabKey(fakeTab("tab:my-plugin")), "my-plugin");
  });

  test(`${theme}: known engine types get proper tab labels`, () => {
    const labels = { tabIt: "IT", tabRepos: "Repos", tabFiles: "Files", tabMusic: "Music", tabScience: "Science" };
    const context = vm.createContext({
      TAB_LABEL_KEYS: { it: "tabIt", repos: "tabRepos", file: "tabFiles", music: "tabMusic", science: "tabScience" },
      getThemeTranslation: (key) => labels[key],
    });
    const fn = section("    function relabelTab(tab) {", "    function isTabListed(tab) {")
      .replaceAll("getLgTranslation", "getThemeTranslation")
      .replaceAll("getLaTranslation", "getThemeTranslation");
    vm.runInContext(fn, context);
    const it = fakeTab("tab:engine:it");
    const file = fakeTab("tab:engine:file");
    const translated = fakeTab("tab:engine:music", { text: "Musique" });
    const plugin = fakeTab("tab:it", { text: "It" });
    const unknown = fakeTab("tab:engine:consumer");
    for (const tab of [it, file, translated, plugin, unknown]) context.relabelTab(tab);
    assert.equal(it.textContent, "IT");
    assert.equal(file.textContent, "Files");
    assert.equal(translated.textContent, "Musique", "core's translated label is kept");
    assert.equal(plugin.textContent, "It", "plugin tabs keep their own names");
    assert.equal(unknown.textContent, "Consumer", "unknown types keep core's label");
    context.relabelTab(it);
    assert.equal(it.textContent, "IT", "relabelling is idempotent");
  });

  test(`${theme}: folded tabs stay rendered for core's tab shortcuts and are skipped by arrows`, async () => {
    const style = await readTheme(theme, "style.css");
    const rule = style.match(/#results-page #results-tabs \.results-tab\.lg-tab-overflow\s*\{([^}]*)\}/);
    assert.ok(rule, "overflow rule");
    assert.doesNotMatch(rule[1], /display:\s*none/, "core's cycleTab skips display:none tabs");
    assert.match(rule[1], /clip-path:\s*inset\(50%\)/);
    assert.match(style, /\.results-tab\.lg-tab-extra\s*\{\s*order:\s*1;/);
    assert.match(section("    function isTabShown(tab) {", "    function syncTabSemantics() {"), /lg-tab-overflow/);
    const more = section("    function createTabsRail() {", "    function collectTabNodes(");
    assert.match(more, /aria-haspopup="menu" aria-expanded="false" aria-controls="lg-tabs-more-menu"/);
    assert.doesNotMatch(more, /class="results-tab/, "More must not look like a tab to core");
    assert.match(section("    function activateMoreItem(item) {", "    function onMoreKeydown("), /tab\.click\(\);/,
      "menu items run core's own tab click handler");
  });

  test(`${theme}: the More menu is a keyboard menu`, () => {
    const items = [0, 1, 2].map((i) => ({ i, focus() { focused = this; }, getAttribute: () => null }));
    let focused = items[0];
    let closed = null;
    const activated = [];
    const context = vm.createContext({
      document: { get activeElement() { return focused; } },
      moreItems: () => items,
      closeMoreMenu: (restore) => { closed = restore; },
      activateMoreItem: (item) => activated.push(item.i),
    });
    vm.runInContext(section("    function onMoreMenuKeydown(event) {", "    function onDocumentPointerDown("), context);
    const press = (key, extra = {}) => {
      const event = { key, repeat: false, prevented: false, ...extra, preventDefault() { this.prevented = true; } };
      context.onMoreMenuKeydown(event);
      return event;
    };
    press("ArrowDown");
    assert.equal(focused, items[1]);
    press("ArrowUp"); press("ArrowUp");
    assert.equal(focused, items[2], "arrows wrap");
    press("Home");
    assert.equal(focused, items[0]);
    press("End");
    assert.equal(focused, items[2]);
    press("Enter");
    press(" ", { repeat: true });
    assert.deepEqual(activated, [2]);
    assert.equal(press("Escape").prevented, true);
    assert.equal(closed, true, "Escape returns focus to More");
    closed = null;
    assert.equal(press("Tab").prevented, false);
    assert.equal(closed, false, "Tab closes and lets focus move on");
  });

  test(`${theme}: the pre-paint search type uses exact types`, async () => {
    const html = await readTheme(theme, "search.html");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const typeFor = (search) => {
      const attrs = {};
      const context = vm.createContext({
        URLSearchParams,
        window: { location: { search } },
        document: { getElementById: () => ({ setAttribute: (k, v) => { attrs[k] = v; } }) },
      });
      vm.runInContext(script, context);
      return attrs[typeAttr];
    };
    assert.equal(typeFor("?q=a&type=tab:engine:it"), "it");
    assert.equal(typeFor("?q=a&type=tab:engine:unit"), "unit", "\"unit\" contains \"it\" but is not IT");
    assert.equal(typeFor("?q=a&type=tab:engine:commits"), "commits");
    assert.equal(typeFor("?q=a&type=engine:images"), "images");
    assert.equal(typeFor("?q=a&type=tab:engine:nasa-images"), "nasa-images", "core only treats exact images as images");
    assert.equal(typeFor("?q=a&type=tab:my-plugin"), "my-plugin", "same as the runtime sync");
    assert.equal(typeFor("?q=a"), "web");
    assert.equal(typeFor("?q=a&type="), "web");
  });

  test(`${theme}: Sources reads core's engine rows`, () => {
    const context = vm.createContext({ Number });
    vm.runInContext(section("    function readEngineRow(row) {", "    function countLabel("), context);
    const rows = [
      fakeRow({ name: "DuckDuckGo", meta: "100 results · 514ms" }),
      fakeRow({ name: "Openverse", meta: "0 results · 3001ms", failed: true, reason: "Timed out" }),
      fakeRow({ name: "Flaky", meta: "0 results · page 2 failed · 40ms", reason: "Network error", retrying: true }),
      fakeRow({ name: "NASA Images", meta: "0 results · 902ms" }),
      fakeRow({ name: "Slowpoke", meta: "retrying... · 12ms" }),
      fakeRow({ name: "Late", meta: "-1 results · 0ms" }),
      fakeRow({ name: "", meta: "3 results · 1ms" }),
    ];
    const summary = context.summarizeSources(rows);
    assert.deepEqual([...summary.returned.map((e) => e.name)], ["DuckDuckGo", "Slowpoke", "Late"]);
    assert.deepEqual([...summary.failed.map((e) => e.name)], ["Openverse", "Flaky"]);
    assert.deepEqual([...summary.empty.map((e) => e.name)], ["NASA Images"]);
    assert.equal(summary.engines.length, 6, "unnamed rows are ignored");
    const [ddg, openverse, flaky] = summary.engines;
    assert.equal(ddg.count, 100);
    assert.equal(ddg.time, "514");
    assert.equal(openverse.reason, "Timed out");
    assert.equal(openverse.retry, rows[1].retryLink, "Retry reuses core's own link");
    assert.equal(flaky.retrying, true);
    assert.equal(summary.engines[5].state, "pending", "core marks a retry in flight as -1 results");
  });

  test(`${theme}: Sources checkboxes untick to hide and keep at least one source`, () => {
    let selected = [];
    const calls = [];
    const context = vm.createContext({
      currentSources: { returned: [{ name: "A" }, { name: "B" }, { name: "C" }] },
      normalizeEngine: (name) => String(name || "").trim().toLowerCase(),
      getSelectedEngines: () => [...selected],
      setSelectedEngines: (next) => { selected = [...next]; calls.push([...next]); },
    });
    vm.runInContext(section("    function onSourcesPanelChange(event) {", "    function onSourcesPanelKeydown("), context);
    const change = (name, checked) => {
      const box = { dataset: { engineName: name }, checked };
      box.closest = () => box;
      context.onSourcesPanelChange({ target: box });
      return box;
    };
    change("B", false);
    assert.deepEqual(selected, ["A", "C"], "unticking from 'all' keeps the others");
    change("A", false);
    assert.deepEqual(selected, ["C"]);
    const last = change("C", false);
    assert.equal(last.checked, true, "the last source cannot be unticked");
    assert.deepEqual(selected, ["C"]);
    change("A", true);
    change("B", true);
    assert.deepEqual(selected, [], "ticking every source clears the filter");
  });

  test(`${theme}: Sources pill label and live filter growth`, () => {
    const strings = { sources: "{count} sources", sourcesOne: "1 source", sourcesFailed: "{count} failed" };
    const context = vm.createContext({ getThemeTranslation: (key) => strings[key] });
    vm.runInContext(
      section("    function countLabel(", "    function ensureSourcesPill(").replace(/get(Lg|La)Translation/g, "getThemeTranslation"),
      context,
    );
    assert.equal(context.countLabel(7, "sourcesOne", "sources"), "7 sources");
    assert.equal(context.countLabel(1, "sourcesOne", "sources"), "1 source");
    const render = section("    function renderImageSources() {", "\n    function getSelectedEngines() {");
    assert.match(render, /sourcesSeen/, "engines that answer after a filter was chosen join it");
    assert.match(render, /failedNode\.hidden = !failed;/, "the failed part shows only when something failed");
    assert.match(section("    function clearFilter() {", "    function scheduleApply() {"), /sourcesSeen = new Set\(\);/);
    assert.match(source, /if \(target\.closest\?\.\("\.lg-image-sources-retry"\)\)|const retry = target\.closest\?\.\("\.lg-image-sources-retry"\);/);
    assert.match(source, /engine\?\.retry\?\.click\(\);/, "Retry clicks core's retry link");
  });

  test(`${theme}: Images hide the old engine rail and keep core's status text in the panel`, async () => {
    const style = await readTheme(theme, "style.css");
    assert.doesNotMatch(source, /lg-media-engine-pills__scroll|renderMediaEnginePills|STICKY_RAIL_REVEAL_DISTANCE/);
    assert.doesNotMatch(style, /\.lg-media-engine-pill\b|\.lg-media-engine-rail\b/);
    assert.match(style, new RegExp(`#results-page\\.lg-media-engine-pills-ready\\[${typeAttr}="images"\\] #results-meta\\s*\\{\\s*display:\\s*none;`));
    assert.match(section("    function renderSourcesPanel(", "    function positionSourcesPanel("), /results-meta-stats/);
    assert.match(style, /\.lg-image-sources-panel\.lg-sheet/);
    assert.match(style, /\.lg-sheet-scrim\s*\{/);
  });

  test(`${theme}: result breadcrumbs and About links`, () => {
    const context = vm.createContext({ URL, window: { __DEGOOG_BASE_URL__: "/base" }, encodeURIComponent, decodeURIComponent });
    vm.runInContext(aboutSection("    function siteName(host) {", "    function renderHeader("), context);
    assert.equal(context.siteName("www.truecar.com"), "truecar.com");
    assert.equal(context.siteName("news.northwestern.edu"), "news.northwestern.edu");
    assert.equal(context.parseResultUrl("magnet:?xt=urn:btih:abc"), null, "non-web links keep core's cite");
    const url = context.parseResultUrl("https://www.truecar.com/shop/new/?ref=x#top");
    assert.deepEqual([...context.breadcrumbParts(url)], ["https://www.truecar.com", "shop", "new"]);
    assert.deepEqual([...context.breadcrumbParts(context.parseResultUrl("https://example.com/a%20b/%E0%A4"))],
      ["https://example.com", "a b", "%E0%A4"], "bad escapes stay as they are");
    const links = context.aboutLinks(url, "fr-FR");
    assert.equal(links.site, "/base/search?q=site%3Atruecar.com");
    assert.equal(links.translate,
      "https://translate.google.com/translate?sl=auto&tl=fr&u=https%3A%2F%2Fwww.truecar.com%2Fshop%2Fnew%2F%3Fref%3Dx");
    assert.equal(links.archive, "https://web.archive.org/web/*/https://www.truecar.com/shop/new/?ref=x");
    assert.match(context.aboutLinks(url, "zh-TW").translate, /tl=zh-TW/);
  });

  test(`${theme}: the result template keeps core's ids and hooks`, async () => {
    const template = await readTheme(theme, "search-templates/result.html");
    const manifest = JSON.parse(await readTheme(theme, "theme.json"));
    assert.equal(manifest.templates.result, "search-templates/result.html");
    const base = {
      index: 3,
      title: "Choose Your Make & Model",
      url: "https://www.truecar.com/shop/new",
      cite_url: "www.truecar.com/shop/new",
      snippet: "Find your ideal car.",
      favicon_url: "/api/proxy/favicon?d=x",
      favicon_host: "www.truecar.com",
      link_target: "_self",
      sources: [{ name: "Google", tooltip: "" }, { name: "Startpage", tooltip: "From your index" }],
    };
    const signedIn = load(renderTemplate(template, {
      ...base, show_actions: true, action_block: true, action_replace: true, action_score: true, action_refresh: true,
    }));
    for (const id of ["result-favicon-3", "result-actions-3", "result-actions-toggle-3", "result-actions-menu-3",
      "result-action-block-3", "result-action-replace-3", "result-action-score-3", "result-action-refresh-3"]) {
      assert.equal(signedIn(`#${id}`).length, 1, id);
    }
    assert.equal(signedIn("#result-favicon-3").attr("data-favicon-host"), "www.truecar.com");
    assert.equal(signedIn("#result-actions-3").attr("data-host"), "www.truecar.com", "core reads the host here");
    const menu = signedIn("#result-actions-menu-3");
    assert.ok(menu.is("[hidden]"), "core toggles the hidden attribute");
    assert.equal(signedIn("#result-actions-3").find("#result-actions-toggle-3, #result-actions-menu-3").length, 2,
      "core's click delegation and outside-click check need both inside result-actions-N");
    assert.equal(menu.find("[id^='result-action-']").length, 4, "core's buttons live in the About panel");
    assert.equal(signedIn("[id^='result-action-']:not([id^='result-actions-'])").filter((_, el) => !el.attribs.id.match(/^result-action-(block|replace|score|refresh)-3$/)).length, 0,
      "no theme id collides with core's result-action- prefix");
    assert.equal(signedIn("#result-actions-toggle-3").attr("aria-controls"), "result-actions-menu-3");
    assert.equal(signedIn(".result-engines").text().trim(), "Google Startpage",
      "streaming compares this text with the result's sources to skip re-renders");
    assert.equal(signedIn(".lg-result-site-name").text(), "www.truecar.com", "no-JS falls back to the host");
    assert.equal(signedIn(".lg-result-site .result-cite").text(), "www.truecar.com/shop/new");
    assert.equal(signedIn(".lg-result-site-line > .result-cite + #result-actions-3").length, 1,
      "the ⋮ follows the URL, so a thumbnail doesn't move it");

    const anonymous = load(renderTemplate(template, { ...base, show_actions: false }));
    assert.equal(anonymous("[id^='result-actions']").length, 0, "no domain menu without show_actions");
    assert.equal(anonymous(".result-engine-tag").length, 2, "no-JS pages still list the engines");
  });

  test(`${theme}: About panel lives inside the result and escapes its containment when open`, async () => {
    const style = await readTheme(theme, "style.css");
    assert.match(style, /#results-list > \.result-item\.lg-about-open\s*\{[^}]*content-visibility:\s*visible;[^}]*animation:\s*none;/,
      "content-visibility and core's stream-in transform would clip the popover and the phone sheet");
    assert.match(style, /#results-list \.result-item\.lg-about-ready \.result-body > \.result-engines\s*\{\s*display:\s*none;/);
    assert.match(style, /#results-list \.lg-result-about-toggle\s*\{[^}]*opacity:\s*1;/, "the ⋮ is always visible, also on touch");
    const sync = aboutSection("    function syncPanel(panel) {", "    function closePanel(panel) {");
    assert.match(sync, /panel\.prepend\(buildContent\(item, url\)\)/, "theme content goes before core's instance actions");
    assert.match(aboutSection("    function onClick(event) {", "    function onKeydown("), /if \(toggle && !toggle\.id\)/,
      "core keeps driving its own result-actions toggle");
    assert.match(about, /attributeFilter: \["hidden", "href"\]/, "replace and core's own close are observed");
  });

  test(`${theme}: theme strings exist in every locale and on the page`, async () => {
    const html = await readTheme(theme, "search.html");
    const keys = ["more", "moreTabs", "tabIt", "tabRepos", "tabFiles", "tabMusic", "tabScience", "sources", "sourcesOne",
      "sourcesFailed", "sourcesTitle", "sourcesHint", "sourcesReturned", "sourcesFailedGroup", "sourcesEmpty",
      "sourcesEmptyOne", "sourcesSearching", "retry", "retrying", "engineSettings", "aboutResult", "foundBy",
      "connection", "secure", "notSecure", "moreFromSite", "translatePage", "archivedCopy"];
    for (const key of keys) {
      const attr = `data-t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      assert.match(html, new RegExp(`${attr}="\\{\\{ t:theme-${theme}\\.${key} \\}\\}"`), attr);
    }
    for (const locale of ["en", "es", "fr"]) {
      const bank = JSON.parse(await readTheme(theme, `locales/${locale}.json`))[`theme-${theme}`];
      for (const key of [...keys, "yourInstance"]) assert.equal(typeof bank[key], "string", `${locale}: ${key}`);
      for (const key of ["sources", "sourcesFailed", "sourcesEmpty"]) assert.match(bank[key], /\{count\}/, `${locale}: ${key}`);
      assert.match(bank.moreFromSite, /\{site\}/);
    }
    assert.ok(html.indexOf("/scripts/search.js") < html.indexOf("/scripts/result-about.js"));
  });
}

test("both themes ship the same result template and About script", async () => {
  const [google, apple] = await Promise.all(THEMES.map((theme) => readTheme(theme, "search-templates/result.html")));
  assert.equal(apple, google.replaceAll("theme-literallygoogle.", "theme-literallyapple."));
  const [googleAbout, appleAbout] = await Promise.all(THEMES.map((theme) => readTheme(theme, "scripts/result-about.js")));
  assert.equal(appleAbout.replaceAll("getLaTranslation", "getLgTranslation").replaceAll("LA_LANG_DICT", "LG_LANG_DICT"), googleAbout);
});
