import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { loadCoreFixtureStyles } from "./degoog-core-fixture.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const { slot: books } = await import(new URL("plugins/books/index.js", root));
const { slot: sports } = await import(new URL("plugins/sports-slot/index.js", root));
const strings = JSON.parse(await read("plugins/books/locales/en.json"))["plugin-books"];
const translate = (html) => html.replace(/\{\{\s*t:plugin-books\.([\w.]+)\s*\}\}/g,
  (_, key) => key.split(".").reduce((value, part) => value?.[part], strings) || key);
books.init({ template: await read("plugins/books/template.html") });
books.configure({});
const book = translate((await books.execute("book dune", {
  fetch: async () => Response.json({ docs: [{ title: "Dune", author_name: ["Frank Herbert"], first_publish_year: 1965 }] }),
})).html);
sports.init({ apiBase: "/api/plugin/sports-fixture", fetch: async (address) => Response.json(
  new URL(address).pathname.endsWith("/scoreboard") ? { events: [{ id: "game", date: new Date().toISOString(), competitions: [{
    status: { type: { state: "pre", description: "Scheduled" } },
    competitors: [
      { homeAway: "home", team: { displayName: "Philadelphia Eagles", abbreviation: "PHI" }, score: "0" },
      { homeAway: "away", team: { displayName: "Dallas Cowboys", abbreviation: "DAL" }, score: "0" },
    ],
  }] }] } : {}),
});
sports.configure({ useEspnApi: true });
const score = (await sports.execute("cowboys vs eagles", {})).html;
const chevron = (await read("source/degoog/src/shared/ui/components/layout/chevron.tsx")).match(/CHEVRON_SVG\s*=\s*'([^']+)'/)[1];
const coreAccordion = await read("source/degoog/src/shared/ui/components/layout/sidebar-accordion.tsx");
const coreClass = (name) => coreAccordion.match(new RegExp(`${name}\\s*=\\s*"([^"\\n]+)"`))[1];
const accordion = (title, content, extra = "") => `<div class="${coreClass("SIDEBAR_ACCORDION_CLASS")} ${extra}"><button type="button" class="${coreClass("SIDEBAR_TOGGLE_CLASS")}"><span>${title}</span>${chevron}</button><div class="${coreClass("SIDEBAR_BODY_CLASS")}">${content}</div></div>`;
const knowledgeFixtures = [
  ["calculator", "calc-card", "name"], ["metronome", "metro-card", "name"],
  ["snake", "snake-card", "name"], ["color-translator", "clrtr-card", "colorTranslator"],
  ["books", "books-card", "name"], ["minesweeper", "ms-card", "name"],
  ["define-slot", "dslot-card", "name"], ["osm-slot", "places-wrap", "name"],
  ["tip-calculator", "tipcalc-card", "name"], ["papers", "papers-card", "name"],
  ["periodic-table", "pt-card", "name"], ["stocks", "stocks-card", "name"],
  ["tic-tac-toe", "ttt-card", "name"], ["stopwatch", "timer-widget", "name"],
  ["time", "time-result", "name"], ["music", "music-card", "name"],
  ["undecideds", "undecideds-slot", "name"], ["until", "until-card", "name"],
];
// Keep coverage in step with actual Store extensions advertising this position.
const advertised = [];
for (const folder of await readdir(new URL("plugins/", root))) {
  let entry;
  try { entry = await read(`plugins/${folder}/index.js`); } catch { continue; }
  if (/slotPositions\s*:\s*\[[^\]]*["']knowledge-panel["']/.test(entry)) advertised.push(folder);
}
assert.deepEqual(advertised.sort(), [...knowledgeFixtures.map(([folder]) => folder), "unit-slot"].sort());
const translations = {};
for (const [folder, className] of knowledgeFixtures) {
  const entry = await read(`plugins/${folder}/index.js`);
  const template = await read(`plugins/${folder}/template.html`).catch(() => "");
  assert.match(entry + template, new RegExp(`class=["'][^"']*\\b${className}\\b`), `${folder} fixture root exists`);
  Object.assign(translations, JSON.parse(await read(`plugins/${folder}/locales/en.json`)));
}
const fixtureContent = ([folder, className]) => folder === "books" ? book : `<div class="${className}" data-fixture-plugin="${folder}"><button type="button" data-fixture-action>Action</button><select data-fixture-picker><option>First</option><option>Second</option></select><input aria-label="${folder} value" value="1"></div>`;
const fixturePanels = knowledgeFixtures.map((fixture) => accordion("", fixtureContent(fixture), `fixture-${fixture[0]}`)).join("");
const pluginCss = (await Promise.all([
  ...knowledgeFixtures.map(([folder]) => read(`plugins/${folder}/style.css`)),
  read("plugins/sports-slot/style.css"),
])).join("\n");
const coreStyles = await loadCoreFixtureStyles();
const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ["literallygoogle", "literallyapple"]) {
    const source = await read(`themes/${theme}/scripts/search.js`);
    const start = source.indexOf("/* ── 7. Sidebar accordion panels");
    const end = source.indexOf("/* ── 8.", start);
    assert.ok(start >= 0 && end > start);
    const script = source.slice(start, end);
    const themeCss = await read(`themes/${theme}/style.css`);
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ hasTouch: width < 1024 });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>' }));
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<!doctype html><html lang="en" data-theme="light" data-knowledge-panel-desktop="open" data-knowledge-panel-mobile="collapsed" data-sidebar-panels-desktop="open" data-sidebar-panels-mobile="open"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        ${coreStyles.css}
        ${themeCss}${coreStyles.fontsCss}${pluginCss}
        #fixture{display:grid;gap:24px;max-width:1000px;margin:20px auto;padding:0 16px}#results-sidebar{width:100%;max-width:340px;min-width:0}body{margin:0}#results-page{padding:0}
        </style></head><body id="results-page"><main id="fixture"><div id="results-sidebar">
        ${accordion("Engine Performance", '<div class="engine-stat-row">Engine timing</div>', "engine-performance-panel")}
        ${fixturePanels}
        ${accordion("", '<div class="uxs-wrap"><button class="uxs-toggle" type="button">Unit converter</button><select><option>Length</option></select></div>', "fixture-unit")}
        ${accordion("Wikipedia", '<div class="wiki-card"><h3 class="kp-title">Wikipedia article</h3></div>', "fixture-wiki")}
        ${accordion("Related searches", '<a class="related-search-link" href="#">More searches</a>', "related-searches-panel")}
        </div><div id="slot-full-width-above-results"><div class="results-slot-panel-full-width">${score}</div></div></main></body></html>`);
      await page.addScriptTag({ content: `
        window.scopedT=namespace=>key=>(${JSON.stringify(translations)})[namespace]?.[key]||key;
        window.fixtureUnitRoot=document.querySelector('.uxs-wrap');
        window.fixtureUnitParent=window.fixtureUnitRoot.parentNode;
        const SEARCH_ACTIVITY_TEXT={streamingPattern:/streaming/i,searchingPattern:/searching/i,completePattern:/results/i,completeTimePattern:/seconds/i};
        const onReady=fn=>fn(),getResultsList=()=>null,getResultsMeta=()=>null,getResultsSearchButton=()=>null,getResultsSearchInput=()=>null;
        document.querySelectorAll('.sidebar-accordion-toggle').forEach(button=>{button.dataset.sidebarToggleWired='true';button.addEventListener('click',()=>button.closest('.sidebar-accordion').classList.toggle('open'));});
        ${script}` });
      await page.waitForSelector(".theme-plugin-panel[data-lg-sidebar-user-knowledge], .theme-plugin-panel .sidebar-accordion-toggle");
      await page.evaluate(() => document.fonts.ready);
      async function headerAppearance(toggle) {
        return toggle.evaluate(async button => {
          await new Promise(requestAnimationFrame);
          await Promise.all(button.getAnimations({ subtree: true }).map(animation => animation.finished));
          const style = getComputedStyle(button), label = getComputedStyle(button.querySelector("span"));
          const properties = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariantNumeric", "lineHeight", "letterSpacing"];
          return {
            font: Object.fromEntries(properties.map(property => [property, label[property]])),
            padding: style.padding,
            height: button.getBoundingClientRect().height,
            border: [style.borderTopWidth, style.borderBottomWidth],
            background: style.backgroundColor,
            color: style.color,
          };
        });
      }
      const bookPanel = page.locator("#results-sidebar .fixture-books");
      assert.equal(await page.locator("#results-sidebar .theme-plugin-panel").count(), knowledgeFixtures.length);
      assert.equal(await page.locator(".fixture-unit.theme-plugin-panel").count(), 0);
      assert.equal(await page.locator(".fixture-unit > .sidebar-accordion-toggle").isVisible(), false);
      assert.equal(await page.evaluate(() => document.querySelector('.uxs-wrap') === window.fixtureUnitRoot && window.fixtureUnitRoot.parentNode === window.fixtureUnitParent), true);
      assert.equal(await page.locator(".fixture-wiki.theme-plugin-panel, .related-searches-panel.theme-plugin-panel, .engine-performance-panel.theme-plugin-panel").count(), 0);
      const scorePanel = page.locator(".results-slot-panel-full-width > .theme-plugin-panel");
      const nativeChevron = await page.locator(".engine-performance-panel .accordion-chevron").evaluate((svg) => svg.outerHTML);
      const nativeToggle = page.locator(".engine-performance-panel > .sidebar-accordion-toggle");
      for (const [folder, , key] of knowledgeFixtures) {
        const toggle = page.locator(`.fixture-${folder} > .sidebar-accordion-toggle`);
        assert.equal(await toggle.locator("span").textContent(), translations[`plugin-${folder}`]?.[key] || "Stocks");
      }
      for (const panel of [...knowledgeFixtures.map(([folder]) => page.locator(`.fixture-${folder}`)), scorePanel]) {
        const toggle = panel.locator(":scope > .sidebar-accordion-toggle");
        assert.deepEqual(await headerAppearance(toggle), await headerAppearance(nativeToggle), `${theme}/${width}/${await panel.getAttribute("class")}: native header typography, padding, height, and colors`);
        const normal = await headerAppearance(toggle);
        await toggle.hover();
        assert.deepEqual(await headerAppearance(toggle), normal, `${theme}/${width}: no custom header hover styling`);
        await page.mouse.move(0, 0);
        assert.equal(await toggle.locator("svg").evaluate((svg) => svg.outerHTML), nativeChevron);
        assert.equal(await toggle.locator("select, input, button, a").count(), 0);
        const geometry = await toggle.evaluate((el) => {
          const box=el.getBoundingClientRect(), panel=el.parentElement.getBoundingClientRect(), icon=el.querySelector("svg").getBoundingClientRect(), style=getComputedStyle(el);
          return { width:box.width, panelWidth:panel.width, iconInset:box.right-icon.right, paddingRight:parseFloat(style.paddingRight), color:style.color, iconColor:getComputedStyle(el.querySelector("svg")).color };
        });
        assert.ok(Math.abs(geometry.width - geometry.panelWidth) <= 2);
        assert.ok(Math.abs(geometry.iconInset - geometry.paddingRight) <= 2, `${theme}/${width}: ${JSON.stringify(geometry)}`);
        assert.equal(geometry.iconColor, geometry.color);
        const wasOpen = await toggle.getAttribute("aria-expanded") === "true";
        assert.equal(wasOpen, width >= 1024);
        await toggle.click({ position: { x: 8, y: 8 } });
        assert.equal(await toggle.getAttribute("aria-expanded"), String(!wasOpen));
        if (width < 1024) await toggle.tap();
        else await toggle.click();
        await page.waitForFunction(({ button, expected }) => button.getAttribute("aria-expanded") === expected, { button: await toggle.elementHandle(), expected: String(wasOpen) });
        await toggle.press("Enter");
        assert.equal(await toggle.getAttribute("aria-expanded"), String(!wasOpen));
        assert.equal(await panel.locator(":scope > .sidebar-accordion-body").isVisible(), !wasOpen);
        assert.equal(await panel.evaluate(el => getComputedStyle(el).rowGap), "2px");
        await toggle.press("Space");
        assert.equal(await toggle.getAttribute("aria-expanded"), String(wasOpen), `${theme}/${width}/${await panel.getAttribute("class")}: Space`);
        if (!wasOpen) await toggle.click();
        const separation = await panel.evaluate(panel => {
          const toggle = panel.querySelector(":scope > button"), body = panel.querySelector(":scope > .sidebar-accordion-body");
          return { gap: body.getBoundingClientRect().top - toggle.getBoundingClientRect().bottom, background: getComputedStyle(panel).backgroundColor };
        });
        assert.deepEqual(separation, { gap: 2, background: "rgba(0, 0, 0, 0)" }, `${theme}/${width}: visible native header gap`);
        const rootGeometry = await panel.locator(":scope > .sidebar-accordion-body").evaluate(body => {
          const root = body.querySelector(":scope > .theme-plugin-content"), style = getComputedStyle(body);
          return { width: root.getBoundingClientRect().width, available: body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
        });
        assert.ok(rootGeometry.width > 0 && rootGeometry.width <= rootGeometry.available + 1, `${theme}/${width}: content root fits native body ${JSON.stringify(rootGeometry)}`);
        if (!wasOpen) await toggle.click();
      }
      // Independent body controls stay outside the collapse button and retain focus.
      const calculator = page.locator(".fixture-calculator");
      const calculatorToggle = calculator.locator(":scope > .sidebar-accordion-toggle");
      if (await calculatorToggle.getAttribute("aria-expanded") === "false") await calculatorToggle.click();
      await calculator.locator("[data-fixture-picker]").selectOption({ index: 1 });
      await calculator.locator("input").fill("42");
      await calculator.locator("[data-fixture-action]").click();
      assert.equal(await calculatorToggle.getAttribute("aria-expanded"), "true");
      assert.equal(await calculator.locator("[data-fixture-picker]").inputValue(), "Second");
      assert.equal(await calculator.locator("input").inputValue(), "42");
      // Core rerenders replace entire knowledge wrappers during streamed results.
      await calculatorToggle.click();
      await calculator.evaluate((panel, html) => { panel.outerHTML = html; }, accordion("", fixtureContent(knowledgeFixtures[0]), "fixture-calculator"));
      await page.waitForFunction(() => document.querySelector('.fixture-calculator > button').getAttribute('aria-expanded') === 'false');
      assert.equal(await page.locator(".fixture-calculator.theme-plugin-panel").count(), 1);
      for (const mode of ["light", "dark"]) {
        await page.evaluate((mode) => { document.documentElement.dataset.theme = mode; }, mode);
        const colors = await page.evaluate(() => [...document.querySelectorAll(".theme-plugin-panel > .sidebar-accordion-toggle, .engine-performance-panel > .sidebar-accordion-toggle")].map((el) => getComputedStyle(el).backgroundColor));
        assert.ok(colors.every((color) => color === colors[0]), `${theme}/${width}/${mode}: pane surfaces differ: ${colors}`);
        const panes = await page.locator(".theme-plugin-panel").evaluateAll(panels => panels.map(panel => {
          const toggle = panel.querySelector(":scope > button"), body = panel.querySelector(":scope > .sidebar-accordion-body");
          return { toggle: getComputedStyle(toggle).backgroundColor, body: getComputedStyle(body).backgroundColor, icon: getComputedStyle(toggle.querySelector("svg")).color, text: getComputedStyle(toggle).color };
        }));
        assert.ok(panes.every(pane => pane.toggle === pane.body && pane.body !== "rgba(0, 0, 0, 0)" && pane.icon === pane.text), `${theme}/${width}/${mode}: connected pane colors`);
      }
      const toggle = scorePanel.locator(":scope > .sidebar-accordion-toggle");
      if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
      await page.locator(".sports-slot").evaluate((panel) => panel.replaceWith(panel.cloneNode(true)));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator(".results-slot-panel-full-width > .theme-plugin-panel").count(), 1);
      assert.equal(await page.locator(".theme-plugin-panel .theme-plugin-panel").count(), 0);
      for (const selector of [...knowledgeFixtures.map(([, className]) => `.${className}`), ".sports-slot", ".sports-slot__scoreboard", ".sports-slot__tabs"]) {
        assert.deepEqual(await page.locator(selector).evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth })), { background: "rgba(0, 0, 0, 0)", border: "0px" });
      }
      await toggle.click();
      if (await bookPanel.locator(":scope > .sidebar-accordion-toggle").getAttribute("aria-expanded") === "false") await bookPanel.locator(":scope > .sidebar-accordion-toggle").click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/${theme}-plugin-panels-${width}.png`, fullPage: true, animations: "disabled" });
      await bookPanel.screenshot({ path: `/private/tmp/${theme}-books-gap-${width}.png`, animations: "disabled" });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log(`PASS: all 18 knowledge extensions, native typography/padding/height/hover/chevrons, full-width pointer and keyboard collapse, independent controls, light/dark panes, streamed replacement state, unit exclusion, and desktop/mobile widths in both themes (${coreStyles.source}).`);
} finally { await browser.close(); }
