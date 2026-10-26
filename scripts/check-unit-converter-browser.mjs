import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { slot } from "../plugins/unit-slot/index.js";
import convert from "../plugins/unit-slot/convert-units.js";
import { loadCoreFixtureStyles } from "./degoog-core-fixture.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = new URL("../plugins/unit-slot/", import.meta.url);
const themeName = process.env.UNIT_THEME || "literallygoogle";
assert.ok(["literallygoogle", "literallyapple"].includes(themeName));
const [template, css, script, theme, chevronSource, themeScript, coreStyles] = await Promise.all([
  readFile(new URL("template.html", base), "utf8"),
  readFile(new URL("style.css", base), "utf8"),
  readFile(new URL("script.js", base), "utf8"),
  readFile(new URL(`../themes/${themeName}/style.css`, import.meta.url), "utf8"),
  readFile(new URL("../source/degoog/src/shared/ui/components/layout/chevron.tsx", import.meta.url), "utf8"),
  readFile(new URL(`../themes/${themeName}/scripts/search.js`, import.meta.url), "utf8"),
  loadCoreFixtureStyles(),
]);
const nativeChevron = chevronSource.match(/'(<svg[^']+<\/svg>)'/)[1];
const sidebarScriptStart = themeScript.indexOf("/* ── 7. Sidebar accordion panels");
const sidebarScriptEnd = themeScript.indexOf("/* ── 8.", sidebarScriptStart);
assert.ok(sidebarScriptStart >= 0 && sidebarScriptEnd > sidebarScriptStart);
const sidebarScript = themeScript.slice(sidebarScriptStart, sidebarScriptEnd);
const nativeKnowledgeWrapper = html => `<div class="sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion open"><button type="button" class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar"><span></span>${nativeChevron}</button><div class="sidebar-accordion-body degoog-accordion-body">${html}</div></div>`;
const nativeReferences = `<div id="native-engine-reference" class="sidebar-panel sidebar-accordion engine-performance-panel degoog-panel degoog-panel--accordion"><button type="button" class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar"><span>Engine Performance</span>${nativeChevron}</button><div class="sidebar-accordion-body degoog-accordion-body"><div class="engine-stat-row">Engine timing</div></div></div><div id="native-related-reference" class="sidebar-panel sidebar-accordion related-searches-panel degoog-panel degoog-panel--accordion"><button type="button" class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar"><span>People also search for</span>${nativeChevron}</button><div class="sidebar-accordion-body degoog-accordion-body"><a class="related-search-link" href="#">Related search</a></div></div>`;
await slot.init({ template });
const screenshotDir = process.env.UNIT_SCREENSHOT_DIR || path.join(tmpdir(), themeName === "literallygoogle" ? "unit-converter-preview" : "unit-converter-apple-preview");
await mkdir(screenshotDir, { recursive: true });
const origin = "https://unit-converter.test";
const storageKey = "degoog:unit-slot:collapsed";
const browser = await chromium.launch({ headless: true });
const parityRecords = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async value => { window.copiedValue = value; } },
    });
  });
  async function localized(query, language = "en") {
    const catalog = JSON.parse(await readFile(new URL(`locales/${language}.json`, base), "utf8"))["plugin-unit-slot"];
    const output = await slot.execute(query, { tab: "all", lang: language });
    return {
      catalog,
      html: output.html.replace(/\{\{\s*t:plugin-unit-slot\.([^ }]+)\s*\}\}/g, (_, key) => {
        const value = key.split(".").reduce((node, part) => node?.[part], catalog);
        assert.ok(typeof value === "string", `${language}: missing ${key}`);
        return value;
      }),
    };
  }
  async function fixtureRoute(route) {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/script.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
    const language = url.searchParams.get("lang") || "en";
    const mode = url.searchParams.get("mode") || "knowledge";
    const { catalog, html } = await localized(url.searchParams.get("q") || "15 gb to mb", language);
    const content = mode === "standalone" ? html : mode === "regular" ? `<div class="results-slot-panel"><div class="results-slot-panel-body">${html}</div></div>` : nativeKnowledgeWrapper(html);
    // Classic mode exercises the core wrapper without the custom theme's
    // sidebar transformations. Keep only its palette tokens for that case.
    const themeCss = mode === "classic" ? theme.match(/\[data-theme="dark"\]\s*\{[^}]+\}/)[0] : theme.replace(/@import[^;]+;/g, "");
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="${language}" data-theme="dark" data-knowledge-panel-desktop="open" data-knowledge-panel-mobile="open" data-sidebar-panels-desktop="collapsed" data-sidebar-panels-mobile="collapsed" data-related-searches-desktop="collapsed" data-related-searches-mobile="collapsed"><head><meta charset="utf-8"><style>
      ${coreStyles.css}
      .sidebar-accordion-body { display:none }
      .sidebar-accordion.open > .sidebar-accordion-body { display:block }
      .sidebar-accordion:not([class~="degoog-accordion"]).open .accordion-chevron { transform:rotate(180deg) }
      ${themeCss}
      ${coreStyles.fontsCss}
      body { margin:0;padding:24px;background:var(--bg);color:var(--text-primary) }
      #fixtures { width:320px }
      #native-engine-reference, #native-related-reference { margin-top:16px }
      .degoog-input { appearance:none;width:100%;box-sizing:border-box;line-height:normal }
      .degoog-select-wrap { position:relative }
      .degoog-select-wrap::after { content:'▾';position:absolute;right:16px;top:50%;transform:translateY(-50%);color:var(--text-secondary);pointer-events:none }
      .results-slot-panel { padding:16px;border:1px solid var(--border-light);border-radius:24px;background:var(--bg-light) }
      ${css}
      </style></head><body><main id="results-page"><div id="results-sidebar"><div id="fixtures">${content}${mode === "classic" ? "" : nativeReferences}</div><div id="native-pane-reference" class="sidebar-panel degoog-panel degoog-panel--accordion" hidden>${nativeChevron}</div><div id="native-ai-reference" class="results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item" hidden></div><div id="theme-surface-reference" style="background:var(--bg-light)" hidden></div></div></main><script>
      window.unitCatalog=${JSON.stringify(catalog).replace(/</g, "\\u003c")};
      window.scopedT=()=>key=>key.split('.').reduce((node,part)=>node?.[part],window.unitCatalog)||key;
      </script><script src="/script.js"></script>${mode === "classic" ? "" : `<script>
      const SEARCH_ACTIVITY_TEXT={streamingPattern:/streaming/i,searchingPattern:/searching/i,completePattern:/results/i,completeTimePattern:/seconds/i};
      const onReady=fn=>fn(),getResultsList=()=>null,getResultsMeta=()=>null,getResultsSearchButton=()=>null,getResultsSearchInput=()=>null;
      ${sidebarScript}</script>`}</body></html>` });
  }
  await page.route("**/*", fixtureRoute);
  async function load(query = "15 gb to mb", language = "en", mode = "knowledge") {
    await page.goto(`${origin}/?${new URLSearchParams({ q: query, lang: language, mode })}`);
    await page.waitForFunction(() => document.querySelector(".uxs-wrap")?._uxsInit);
    if (mode === "knowledge") await page.waitForSelector(".lg-sidebar-knowledge-self-contained");
    await page.evaluate(() => document.fonts.ready);
  }
  async function expectResult(value) {
    await page.waitForFunction(expected => document.querySelector("#uxs-result").textContent === expected, value);
  }
  async function clickToggle(index = 0) {
    const button = page.locator(".uxs-toggle").nth(index);
    const box = await button.boundingBox();
    await button.click({ position: { x: box.width - 24, y: box.height / 2 } });
    await page.mouse.move(0, 0);
  }
  async function headerGeometry() {
    return page.locator(".uxs-top-bar").first().evaluate(async header => {
      const chevron = header.querySelector(".uxs-toggle svg");
      await new Promise(requestAnimationFrame);
      await Promise.all(chevron.getAnimations().map(animation => animation.finished));
      const rect = header.getBoundingClientRect();
      const style = getComputedStyle(header);
      const button = header.querySelector(".uxs-toggle");
      const buttonRect = button.getBoundingClientRect();
      const icon = button.querySelector("svg");
      const iconRect = icon.getBoundingClientRect();
      return {
        iconX: iconRect.x,
        rightInset: rect.right - iconRect.right,
        color: getComputedStyle(icon).color,
        nativeColor: getComputedStyle(document.querySelector("#native-pane-reference svg")).color,
        fillsHeader: Math.abs(buttonRect.width - (rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth))) <= 1 && Math.abs(buttonRect.height - (rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth))) <= 1,
      };
    });
  }
  async function headerAppearance(selector) {
    return page.locator(selector).evaluate(async button => {
      await new Promise(requestAnimationFrame);
      await Promise.all(button.getAnimations({ subtree: true }).map(animation => animation.finished));
      const style = getComputedStyle(button);
      const label = getComputedStyle(button.querySelector("span"));
      const fontProperties = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariantNumeric", "lineHeight", "letterSpacing"];
      let painted = button;
      while (painted.parentElement && getComputedStyle(painted).backgroundColor === "rgba(0, 0, 0, 0)") painted = painted.parentElement;
      return {
        font: Object.fromEntries(fontProperties.map(property => [property, label[property]])),
        padding: style.padding,
        contentHeight: button.getBoundingClientRect().height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
        visibleHeight: button.matches(".uxs-toggle") && button.getAttribute("aria-expanded") === "false"
          ? button.closest(".uxs-main").getBoundingClientRect().height : button.getBoundingClientRect().height,
        background: getComputedStyle(painted).backgroundColor,
        color: style.color,
      };
    });
  }
  async function assertNativeHeaderParity(context) {
    const own = await headerAppearance(".uxs-toggle");
    const collapsed = await page.locator(".uxs-toggle").getAttribute("aria-expanded") === "false";
    for (const selector of ["#native-engine-reference > button", "#native-related-reference > button"]) {
      const native = await headerAppearance(selector);
      assert.deepEqual(own.font, native.font, `${context}: native header typography`);
      assert.equal(own.padding, native.padding, `${context}: native header padding`);
      assert.ok(Math.abs(own.contentHeight - native.contentHeight) <= 0.5, `${context}: native content height ${JSON.stringify({ own, native })}`);
      if (collapsed) assert.ok(Math.abs(own.visibleHeight - native.visibleHeight) <= 0.5, `${context}: native collapsed height ${JSON.stringify({ own, native })}`);
      assert.equal(own.background, native.background, `${context}: native header surface`);
      assert.equal(own.color, native.color, `${context}: native header text color`);
    }
    parityRecords.push({ context, collapsed, ...own });
  }
  async function assertNativeHeaderGap(context) {
    const separation = await page.locator(".uxs-main").evaluate(root => {
      const header = root.querySelector(".uxs-top-bar"), body = root.querySelector(".uxs-body");
      return {
        gap: body.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        expected: parseFloat(getComputedStyle(document.querySelector("#native-engine-reference")).rowGap),
        background: getComputedStyle(root).backgroundColor,
        headerCorner: getComputedStyle(header).borderEndStartRadius,
        bodyCorner: getComputedStyle(body).borderStartStartRadius,
      };
    });
    assert.equal(separation.gap, separation.expected, `${context}: native header gap`);
    assert.equal(separation.gap, 2);
    assert.equal(separation.background, "rgba(0, 0, 0, 0)", `${context}: page surface must show through the gap`);
    assert.equal(separation.headerCorner, "4px");
    assert.equal(separation.bodyCorner, "4px");
  }
  async function assertNativeHeaderHover(context) {
    for (const selector of [".uxs-toggle", "#native-engine-reference > button", "#native-related-reference > button"]) {
      await page.mouse.move(0, 0);
      const normal = await headerAppearance(selector);
      const target = page.locator(selector);
      const box = await target.boundingBox();
      await target.hover({ position: { x: box.width - 24, y: box.height / 2 } });
      assert.deepEqual(await headerAppearance(selector), normal, `${context}: header must not gain custom hover styling`);
    }
    await page.mouse.move(0, 0);
  }
  await load();
  await expectResult("15,000.00");
  assert.equal(await page.locator(".uxs-body").evaluate(pane => {
    return getComputedStyle(pane).backgroundColor === getComputedStyle(document.querySelector("#native-pane-reference")).backgroundColor;
  }), true, "converter pane must remain visible inside the theme's transparent knowledge wrapper");
  assert.equal(await page.locator(".uxs-category-wrap > svg").evaluate(node => getComputedStyle(node).transform), "matrix(1, 0, 0, 1, 0, -8)", "open sidebar must not rotate or offset the category chevron");
  assert.equal(await page.locator(".uxs-category-wrap > svg").evaluate(node => node.outerHTML), await page.locator("#native-pane-reference > svg").evaluate(node => node.outerHTML));
  assert.equal(await page.locator(".uxs-toggle > svg").evaluate(node => node.outerHTML), await page.locator("#native-pane-reference > svg").evaluate(node => node.outerHTML));
  const groups = await page.locator("#uxs-category-select optgroup").evaluateAll(nodes => nodes.map(node => ({ label: node.label, values: Array.from(node.children).map(option => option.value) })));
  assert.deepEqual(groups.map(group => group.label), ["Everyday measurements", "Time and motion", "Computing", "Electricity and energy", "Science and engineering"]);
  const groupedMeasures = groups.flatMap(group => group.values);
  assert.deepEqual(groupedMeasures.slice().sort(), convert().measures().slice().sort());
  assert.equal(new Set(groupedMeasures).size, groupedMeasures.length, "every category appears exactly once");
  assert.equal(await page.locator(".uxs-toggle select").count(), 0, "native picker must not be nested in the disclosure button");
  const expandedHeader = await headerGeometry();
  assert.equal(expandedHeader.fillsHeader, true);
  assert.equal(expandedHeader.color, expandedHeader.nativeColor);
  assert.ok(Math.abs(expandedHeader.rightInset - 16) <= 1, JSON.stringify(expandedHeader));
  await assertNativeHeaderParity("initial expanded");
  const headerWidth = (await page.locator(".uxs-top-bar").boundingBox()).width;
  for (const x of [8, headerWidth * 0.75, headerWidth - 8]) {
    for (const shouldExpand of [false, true]) {
      const box = await page.locator(".uxs-top-bar").boundingBox();
      await page.mouse.click(box.x + x, box.y + box.height / 2);
      assert.equal(await page.locator(".uxs-body").isVisible(), shouldExpand, "header padding and blank space must toggle the card");
      const geometry = await headerGeometry();
      assert.ok(Math.abs(geometry.iconX - expandedHeader.iconX) <= 0.5, "chevron must stay at the same horizontal position");
      assert.equal(geometry.color, geometry.nativeColor);
      await assertNativeHeaderParity(`pointer ${x}/${shouldExpand ? "expanded" : "collapsed"}`);
    }
  }
  const picker = page.locator("#uxs-category-select");
  assert.equal(await picker.evaluate(select => {
    const rect = select.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === select;
  }), true, "native picker must receive pointer input above the header button");
  await picker.click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".uxs-body").isVisible(), true, "opening the picker must not collapse the card");
  await load();
  await picker.evaluate(select => {
    window.unitKeyEvents = [];
    select.addEventListener("keydown", event => window.unitKeyEvents.push({ key: event.key, prevented: event.defaultPrevented }));
  });
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // Native popup navigation belongs to the platform. Verify the header does
  // not intercept its keys, then exercise the grouped select's change handler.
  assert.equal(await picker.evaluate(select => document.activeElement === select && window.unitKeyEvents.length === 4 && window.unitKeyEvents.every(event => !event.prevented)), true);
  assert.equal(await page.locator(".uxs-body").isVisible(), true);
  await picker.selectOption("dataRate");
  assert.equal(await picker.inputValue(), "dataRate");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#uxs-amount").evaluate(input => input === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await picker.evaluate(select => select === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.locator(".uxs-toggle").evaluate(button => button === document.activeElement), true);
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".uxs-body").isHidden(), true);
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".uxs-body").isVisible(), true);
  await load();
  assert.match(await page.locator("#uxs-from-select option:checked").textContent(), /gigabytes \(GB\)/i);
  assert.equal(await page.locator(".uxs-quick-tile").count(), 6);
  assert.equal(await page.locator('[data-unit="MB"] .uxs-quick-value').textContent(), "15,000");
  await page.locator("#uxs-amount").fill("30");
  await page.locator("#uxs-copy-result").click();
  assert.equal(await page.evaluate(() => window.copiedValue), "30000", "copy must use the final calculation during animation");
  await expectResult("30,000.00");
  await page.locator('[data-unit="GiB"]').focus();
  await page.keyboard.press("Enter");
  await expectResult("27.9397");
  assert.equal(await page.locator('[data-unit="GiB"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[data-unit="GiB"]').evaluate(node => node === document.activeElement), true);
  await page.locator("#uxs-from-select").selectOption("GiB");
  await page.locator("#uxs-to-select").selectOption("MiB");
  await expectResult("30,720.00");
  await page.locator("#uxs-category-select").selectOption("dataRate");
  await page.mouse.move(0, 0);
  const categoryPill = await page.locator(".uxs-category-wrap").evaluate(node => {
    const label = node.querySelector(".uxs-category-size");
    const range = document.createRange();
    range.selectNodeContents(label);
    const labelRect = range.getBoundingClientRect();
    const arrowRect = node.querySelector("svg").getBoundingClientRect();
    return {
      arrowGap: arrowRect.left - labelRect.right,
      radius: getComputedStyle(node.querySelector("select")).borderRadius,
      label: label.textContent,
      color: getComputedStyle(node.querySelector("select")).color,
      expectedColor: getComputedStyle(node.querySelector("svg")).color,
      surface: getComputedStyle(node.querySelector("select")).backgroundColor,
      expectedSurface: getComputedStyle(document.querySelector("#theme-surface-reference")).backgroundColor,
      labelWidth: labelRect.width,
      labelSpace: node.querySelector("select").clientWidth - parseFloat(getComputedStyle(node.querySelector("select")).paddingLeft) - parseFloat(getComputedStyle(node.querySelector("select")).paddingRight),
    };
  });
  assert.equal(categoryPill.label, "Data rate");
  assert.equal(categoryPill.radius, "999px");
  assert.ok(categoryPill.arrowGap >= 4 && categoryPill.arrowGap <= 16, JSON.stringify(categoryPill));
  assert.equal(categoryPill.color, categoryPill.expectedColor, "category uses the theme's quieter secondary text");
  assert.equal(categoryPill.surface, categoryPill.expectedSurface, "category uses the theme's panel surface");
  assert.ok(categoryPill.labelSpace >= categoryPill.labelWidth - 0.5, `category label must fit inside its pill: ${JSON.stringify(categoryPill)}`);
  assert.ok(Math.abs((await headerGeometry()).rightInset - 16) <= 1);
  await page.locator("#uxs-amount").fill("100");
  await expectResult("12.5000");
  assert.equal(await page.locator('[data-unit="MB/s"] .uxs-quick-value').textContent(), "12.5");
  await page.locator("#uxs-swap").click();
  await expectResult("800.0000");
  await page.locator("#uxs-from-select").selectOption("GiB/s");
  await page.locator("#uxs-to-select").selectOption("MiB/s");
  await page.locator("#uxs-amount").fill("1");
  await expectResult("1,024.00");
  await page.locator("#uxs-from-select").selectOption("b/s");
  await page.locator("#uxs-to-select").selectOption("GB/s");
  await expectResult("1.25e-10");
  await page.locator("#uxs-amount").fill("");
  await expectResult("—");
  assert.equal(await page.locator(".uxs-quick-tile").count(), 0);
  assert.equal(await page.locator("#uxs-copy-result").isDisabled(), true);
  await page.locator("#uxs-amount").fill("0");
  await expectResult("0.000000");
  assert.equal(await page.locator("#uxs-copy-result").isDisabled(), false);

  await load();
  await clickToggle();
  assert.equal(await page.locator(".uxs-toggle > svg").evaluate(async node => {
    await new Promise(requestAnimationFrame);
    await Promise.all(node.getAnimations().map(animation => animation.finished));
    return getComputedStyle(node).transform;
  }), "matrix(1, 0, 0, 1, 0, 0)", "open sidebar must not override the collapsed converter chevron");
  assert.equal(await page.locator(".uxs-body").isHidden(), true);
  assert.equal(await page.locator(".uxs-toggle").getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), "1");
  assert.equal(await page.locator(".uxs-summary").textContent(), "15 GB = 15,000 MB");
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".uxs-wrap")?._uxsInit);
  assert.equal(await page.locator(".uxs-body").isHidden(), true);
  const inserted = (await localized("100 Mbps to MB/s")).html;
  await page.locator("#fixtures").evaluate((node, html) => node.insertAdjacentHTML("beforeend", html), inserted);
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".uxs-wrap")).every(node => node._uxsInit));
  const bodyIds = await page.locator(".uxs-body").evaluateAll(nodes => nodes.map(node => node.id));
  assert.equal(new Set(bodyIds).size, bodyIds.length);
  assert.equal(await page.locator(".uxs-body").nth(1).isHidden(), true);
  await clickToggle(1);
  assert.equal(await page.locator(".uxs-body").nth(0).isHidden(), true);
  assert.equal(await page.locator(".uxs-body").nth(1).isVisible(), true);
  await load();
  assert.equal(await page.locator(".uxs-body").isVisible(), true, "expanded preference must also persist");

  let layouts = 0;
  await page.mouse.move(0, 0);
  for (const mode of ["dark", "light"]) for (const width of [240, 280, 320, 380, 400, 480, 640, 900]) {
    await page.evaluate(({ mode, width }) => {
      document.documentElement.dataset.theme = mode;
      document.querySelector("#fixtures").style.width = `${width}px`;
    }, { mode, width });
    const fits = await page.locator(".uxs-main").evaluate(pane => {
      const result = pane.querySelector(".uxs-result");
      return pane.scrollWidth <= pane.clientWidth + 1 && result.scrollWidth <= result.clientWidth + 1 &&
        Array.from(pane.querySelectorAll(".uxs-quick-tile")).every(tile => tile.scrollWidth <= tile.clientWidth + 1);
    });
    assert.equal(fits, true, `${mode}/${width}: controls or result overflow`);
    const nativeSurface = await page.locator(".uxs-main").evaluate(root => {
      const native = document.querySelector("#native-pane-reference");
      const properties = ["backgroundColor", "borderTopColor", "borderTopWidth", "boxShadow"];
      return [...root.children].every(pane => properties.every(property => getComputedStyle(pane)[property] === getComputedStyle(native)[property]));
    });
    assert.equal(nativeSurface, true, `${mode}/${width}: pane must use the native sidebar surface`);
    const quickSurface = await page.locator('.uxs-quick-tile[aria-pressed="false"]').first().evaluate(async tile => {
      await new Promise(requestAnimationFrame);
      await Promise.all(tile.getAnimations().map(animation => animation.finished));
      return { actual: getComputedStyle(tile).backgroundColor, expected: getComputedStyle(document.querySelector("#theme-surface-reference")).backgroundColor, ai: getComputedStyle(document.querySelector("#native-ai-reference")).backgroundColor };
    });
    assert.equal(quickSurface.actual, quickSurface.expected, `${mode}/${width}: quick buttons must use the theme surface token`);
    if (themeName === "literallygoogle") assert.equal(quickSurface.actual, quickSurface.ai, `${mode}/${width}: quick buttons must match AI Summary`);
    const expanded = await headerGeometry();
    assert.equal(expanded.color, expanded.nativeColor);
    await assertNativeHeaderParity(`${mode}/${width}/expanded`);
    await assertNativeHeaderGap(`${mode}/${width}`);
    await clickToggle();
    const collapsed = await headerGeometry();
    assert.ok(Math.abs(expanded.iconX - collapsed.iconX) <= 0.5, `${mode}/${width}: chevron moved inward`);
    assert.equal(collapsed.color, collapsed.nativeColor);
    await assertNativeHeaderParity(`${mode}/${width}/collapsed`);
    if (width === 320) await assertNativeHeaderHover(`${mode}/${width}`);
    await clickToggle();
    layouts++;
  }
  const unselectedTile = page.locator('.uxs-quick-tile[aria-pressed="false"]').first();
  await unselectedTile.hover();
  assert.equal(await unselectedTile.evaluate(async tile => {
    await new Promise(requestAnimationFrame);
    await Promise.all(tile.getAnimations().map(animation => animation.finished));
    const reference = document.createElement("span");
    reference.style.backgroundColor = "var(--bg-hover)";
    document.body.appendChild(reference);
    const expected = getComputedStyle(reference).backgroundColor;
    reference.remove();
    return getComputedStyle(tile).backgroundColor === expected;
  }), true);
  await page.mouse.move(0, 0);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.querySelector("#fixtures").style.width = "640px"; });
  await page.locator(".uxs-wrap").screenshot({ path: path.join(screenshotDir, "storage.png"), animations: "disabled" });
  await page.locator("#fixtures").evaluate(node => { node.style.width = "320px"; });
  await page.locator(".uxs-wrap").screenshot({ path: path.join(screenshotDir, "storage-mobile.png"), animations: "disabled" });
  await clickToggle();
  await page.locator(".uxs-wrap").screenshot({ path: path.join(screenshotDir, "compact.png"), animations: "disabled" });
  await page.locator("#fixtures").screenshot({ path: path.join(screenshotDir, "header-parity.png"), animations: "disabled" });
  await clickToggle();
  await load("100 Mbps to MB/s");
  await page.locator(".uxs-wrap").screenshot({ path: path.join(screenshotDir, "data-rate.png"), animations: "disabled" });

  for (const language of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    await load("1 GiB/s to MiB/s", language);
    await expectResult("1,024.00");
    assert.doesNotMatch(await page.locator(".uxs-main").textContent(), /undefined|\{\{|NaN/);
    assert.ok((await page.locator(".uxs-toggle").getAttribute("aria-label")).length > 0);
    assert.equal(await page.locator("#uxs-category-select optgroup").evaluateAll(groups => {
      const labels = Object.values(window.unitCatalog.categoryGroups);
      return groups.length === 5 && groups.every(group => labels.includes(group.label));
    }), true, `${language}: localized category groups`);
  }
  const measures = await page.locator("#uxs-category-select option").evaluateAll(nodes => nodes.map(node => node.value));
  for (const measure of measures) {
    await page.locator("#uxs-category-select").selectOption(measure);
    assert.doesNotMatch(await page.locator(".uxs-main").textContent(), /NaN|undefined/);
  }
  await load("15 gb to mb", "en", "regular");
  assert.equal(await page.locator(".uxs-main").evaluate(node => getComputedStyle(node).borderTopWidth), "0px");
  assert.equal(await page.locator(".uxs-main").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  assert.equal(await page.locator(".uxs-pane").evaluateAll(panes => panes.every(node => getComputedStyle(node).backgroundColor === "rgba(0, 0, 0, 0)")), true);
  await load("15 gb to mb", "en", "classic");
  assert.equal(await page.locator(".uxs-main").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  assert.notEqual(await page.locator("#fixtures > .sidebar-accordion").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  await load("15 gb to mb", "en", "standalone");
  assert.notEqual(await page.locator(".uxs-body").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } }); });
  await load();
  await clickToggle();
  assert.equal(await page.locator(".uxs-body").isHidden(), true);
  await clickToggle();
  await page.locator("#uxs-amount").fill("20");
  await expectResult("20,000.00");
  const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  touchPage.setDefaultTimeout(8000);
  touchPage.on("pageerror", error => errors.push(error.message));
  await touchPage.route("**/*", fixtureRoute);
  await touchPage.goto(`${origin}/?q=15+gb+to+mb`);
  await touchPage.waitForFunction(() => document.querySelector(".uxs-wrap")?._uxsInit);
  await touchPage.waitForSelector(".lg-sidebar-knowledge-self-contained");
  for (const shouldExpand of [false, true]) {
    const box = await touchPage.locator(".uxs-top-bar").boundingBox();
    await touchPage.touchscreen.tap(box.x + box.width - 8, box.y + box.height / 2);
    assert.equal(await touchPage.locator(".uxs-body").isVisible(), shouldExpand, "touching the header must toggle the card");
  }
  await touchPage.locator("#uxs-category-select").tap();
  await touchPage.keyboard.press("Escape");
  assert.equal(await touchPage.locator(".uxs-body").isVisible(), true, "native picker touch must stay independent");
  await touchPage.close();
  assert.deepEqual(errors, []);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(screenshotDir, "header-parity.json"), JSON.stringify({ coreStyles: coreStyles.source, records: parityRecords }, null, 2));
  console.log(JSON.stringify({ theme: themeName, coreStyles: coreStyles.source, layouts, languages: 9, categories: measures.length, categoryGroups: groups.length, nativeTypographyPaddingHeightAndHover: true, fullHeaderPointerAndTouch: true, independentNativePicker: true, stableNativeChevron: true, wrapperModes: ["knowledge", "regular", "classic", "standalone"], storage: true, dataRates: true, tiles: true, savedCompactView: true, deniedStorage: true, lateCards: true, errors, screenshotDir }));
} finally {
  await browser.close();
}
