import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
const chevron = '<svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
const accordion = (title, content, extra = "") => `<div class="sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion ${extra}"><button type="button" class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar"><span>${title}</span>${chevron}</button><div class="sidebar-accordion-body degoog-accordion-body">${content}</div></div>`;
const pluginCss = await read("plugins/books/style.css") + await read("plugins/sports-slot/style.css");
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
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>' }));
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<html lang="en" data-theme="light" data-knowledge-panel-desktop="open" data-knowledge-panel-mobile="collapsed" data-sidebar-panels-desktop="open" data-sidebar-panels-mobile="open"><head><meta charset="utf-8"><style>
        .degoog-accordion-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;color:var(--text-primary);font:inherit;cursor:pointer}
        .accordion-chevron{flex-shrink:0;transition:transform .2s}.sidebar-accordion.open>.sidebar-accordion-toggle .accordion-chevron{transform:rotate(180deg)}
        ${themeCss}${pluginCss}
        #fixture{display:grid;gap:24px;max-width:1000px;margin:20px auto;padding:0 16px}#results-sidebar{width:100%;max-width:340px;min-width:0}body{margin:0}#results-page{padding:0}
        </style></head><body id="results-page"><main id="fixture"><div id="results-sidebar">
        ${accordion("Engine Performance", '<div class="engine-stat-row">Engine timing</div>', "engine-performance-panel")}
        ${accordion("Books / ISBN", book)}
        </div><div id="slot-full-width-above-results"><div class="results-slot-panel-full-width">${score}</div></div></main></body></html>`);
      await page.addScriptTag({ content: `
        const SEARCH_ACTIVITY_TEXT={streamingPattern:/streaming/i,searchingPattern:/searching/i,completePattern:/results/i,completeTimePattern:/seconds/i};
        const onReady=fn=>fn(),getResultsList=()=>null,getResultsMeta=()=>null,getResultsSearchButton=()=>null,getResultsSearchInput=()=>null;
        document.querySelectorAll('.sidebar-accordion-toggle').forEach(button=>{button.dataset.sidebarToggleWired='true';button.addEventListener('click',()=>button.closest('.sidebar-accordion').classList.toggle('open'));});
        ${script}` });
      await page.waitForSelector(".theme-plugin-panel[data-lg-sidebar-user-knowledge], .theme-plugin-panel .sidebar-accordion-toggle");
      const bookPanel = page.locator("#results-sidebar .theme-plugin-panel");
      const scorePanel = page.locator(".results-slot-panel-full-width > .theme-plugin-panel");
      const nativeChevron = await page.locator(".engine-performance-panel .accordion-chevron").evaluate((svg) => svg.outerHTML);
      for (const panel of [bookPanel, scorePanel]) {
        const toggle = panel.locator(":scope > .sidebar-accordion-toggle");
        assert.equal(await toggle.locator("svg").evaluate((svg) => svg.outerHTML), nativeChevron);
        const wasOpen = await toggle.getAttribute("aria-expanded") === "true";
        await toggle.focus();
        await page.keyboard.press("Enter");
        assert.equal(await toggle.getAttribute("aria-expanded"), String(!wasOpen));
        assert.equal(await panel.locator(":scope > .sidebar-accordion-body").isVisible(), !wasOpen);
        await page.keyboard.press("Space");
        assert.equal(await toggle.getAttribute("aria-expanded"), String(wasOpen));
      }
      for (const mode of ["light", "dark"]) {
        await page.evaluate((mode) => { document.documentElement.dataset.theme = mode; }, mode);
        const colors = await page.evaluate(() => [...document.querySelectorAll(".sidebar-accordion-toggle")].map((el) => getComputedStyle(el).backgroundColor));
        assert.ok(colors.every((color) => color === colors[0]), `${theme}/${width}/${mode}: pane surfaces differ: ${colors}`);
      }
      const toggle = scorePanel.locator(":scope > .sidebar-accordion-toggle");
      if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
      await page.locator(".sports-slot").evaluate((panel) => panel.replaceWith(panel.cloneNode(true)));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator(".results-slot-panel-full-width > .theme-plugin-panel").count(), 1);
      assert.equal(await page.locator(".theme-plugin-panel .theme-plugin-panel").count(), 0);
      for (const selector of [".books-card", ".sports-slot", ".sports-slot__scoreboard", ".sports-slot__tabs"]) {
        assert.deepEqual(await page.locator(selector).evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth })), { background: "rgba(0, 0, 0, 0)", border: "0px" });
      }
      await toggle.click();
      if (await bookPanel.locator(":scope > .sidebar-accordion-toggle").getAttribute("aria-expanded") === "false") await bookPanel.locator(":scope > .sidebar-accordion-toggle").click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/${theme}-plugin-panels-${width}.png`, fullPage: true, animations: "disabled" });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log("PASS: native chevrons, Enter/Space collapse, shared light/dark surfaces, transparent plugin contents, refresh state, and mobile widths in both themes.");
} finally { await browser.close(); }
