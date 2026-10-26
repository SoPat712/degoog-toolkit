import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { slot } from "../plugins/unit-slot/index.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = new URL("../plugins/unit-slot/", import.meta.url);
const [template, css, script, theme, font, panelScss, variablesScss, chevronSource] = await Promise.all([
  readFile(new URL("template.html", base), "utf8"),
  readFile(new URL("style.css", base), "utf8"),
  readFile(new URL("script.js", base), "utf8"),
  readFile(new URL("../themes/literallygoogle/style.css", import.meta.url), "utf8"),
  readFile(new URL("../themes/literallygoogle/fonts/google-sans/static/GoogleSans-Regular.woff2", import.meta.url)),
  readFile(new URL("../source/degoog/src/styles/components/generic/_panels.scss", import.meta.url), "utf8"),
  readFile(new URL("../source/degoog/src/styles/_variables.scss", import.meta.url), "utf8"),
  readFile(new URL("../source/degoog/src/shared/ui/components/layout/chevron.tsx", import.meta.url), "utf8"),
]);
// Use the actual core pane declarations so the preview can compare the widget
// with a native sidebar pane under the same theme.
const variables = new Map([...variablesScss.matchAll(/^(\$[\w-]+):\s*([^;]+);/gm)].map(match => [match[1], match[2]]));
const resolveVariables = value => value.replace(/\$[\w-]+/g, key => {
  assert.ok(variables.has(key), `Unknown core style variable ${key}`);
  return variables.get(key);
});
const corePanelCss = resolveVariables(`.degoog-panel {${panelScss.match(/\.degoog-panel\s*\{([\s\S]*?)\s*&--stack-item/)[1]}}\n.degoog-panel--accordion {${panelScss.match(/&--accordion\s*\{([^}]+)\}/)[1]}}`);
const nativeChevron = chevronSource.match(/'(<svg[^']+<\/svg>)'/)[1];
await slot.init({ template });
const screenshotDir = process.env.UNIT_SCREENSHOT_DIR || path.join(tmpdir(), "unit-converter-preview");
await mkdir(screenshotDir, { recursive: true });
const origin = "https://unit-converter.test";
const storageKey = "degoog:unit-slot:collapsed";
const browser = await chromium.launch({ headless: true });
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
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/script.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
    const language = url.searchParams.get("lang") || "en";
    const { catalog, html } = await localized(url.searchParams.get("q") || "15 gb to mb", language);
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="${language}" data-theme="dark"><head><meta charset="utf-8"><style>
      ${corePanelCss}
      ${theme.replace(/@import[^;]+;/g, "")}
      @font-face { font-family:'Google Sans';src:url(data:font/woff2;base64,${font.toString("base64")}) }
      body { margin:0;padding:24px;background:var(--bg);color:var(--text-primary) }
      #fixtures { width:320px }
      .degoog-input { appearance:none;width:100%;box-sizing:border-box;line-height:normal }
      .degoog-select-wrap { position:relative }
      .degoog-select-wrap::after { content:'▾';position:absolute;right:16px;top:50%;transform:translateY(-50%);color:var(--text-secondary);pointer-events:none }
      .results-slot-panel { padding:16px;border:1px solid var(--border-light);border-radius:24px;background:var(--bg-light) }
      ${css}
      </style></head><body><main id="results-page"><div id="results-sidebar"><div id="fixtures">${html}</div><div id="native-pane-reference" class="sidebar-panel degoog-panel degoog-panel--accordion" hidden>${nativeChevron}</div><div id="native-ai-reference" class="glance-ai degoog-panel" hidden></div></div></main><script>
      window.unitCatalog=${JSON.stringify(catalog).replace(/</g, "\\u003c")};
      window.scopedT=()=>key=>key.split('.').reduce((node,part)=>node?.[part],window.unitCatalog)||key;
      </script><script src="/script.js"></script></body></html>` });
  });
  async function load(query = "15 gb to mb", language = "en") {
    await page.goto(`${origin}/?${new URLSearchParams({ q: query, lang: language })}`);
    await page.waitForFunction(() => document.querySelector(".uxs-wrap")?._uxsInit);
    await page.evaluate(() => document.fonts.ready);
  }
  async function expectResult(value) {
    await page.waitForFunction(expected => document.querySelector("#uxs-result").textContent === expected, value);
  }
  await load();
  await expectResult("15,000.00");
  assert.equal(await page.locator(".uxs-category-wrap > svg").evaluate(node => node.outerHTML), await page.locator("#native-pane-reference > svg").evaluate(node => node.outerHTML));
  assert.equal(await page.locator(".uxs-toggle > svg").evaluate(node => node.outerHTML), await page.locator("#native-pane-reference > svg").evaluate(node => node.outerHTML));
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
  const categoryPill = await page.locator(".uxs-category-wrap").evaluate(node => {
    const label = node.querySelector(".uxs-category-size");
    const range = document.createRange();
    range.selectNodeContents(label);
    const labelRect = range.getBoundingClientRect();
    const arrowRect = node.querySelector("svg").getBoundingClientRect();
    const toggle = node.parentElement.querySelector(".uxs-toggle").getBoundingClientRect();
    return {
      arrowGap: arrowRect.left - labelRect.right,
      toggleGap: toggle.left - node.getBoundingClientRect().right,
      radius: getComputedStyle(node.querySelector("select")).borderRadius,
      label: label.textContent,
    };
  });
  assert.equal(categoryPill.label, "Data rate");
  assert.equal(categoryPill.radius, "100px");
  assert.ok(categoryPill.arrowGap >= 4 && categoryPill.arrowGap <= 16, JSON.stringify(categoryPill));
  assert.ok(categoryPill.toggleGap >= 0 && categoryPill.toggleGap <= 12, JSON.stringify(categoryPill));
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
  await page.locator(".uxs-toggle").click();
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
  await page.locator(".uxs-toggle").nth(1).click();
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
    const nativeSurface = await page.locator(".uxs-main").evaluate(pane => {
      const native = document.querySelector("#native-pane-reference");
      const properties = ["backgroundColor", "borderTopColor", "borderTopWidth", "borderRadius", "boxShadow"];
      return properties.every(property => getComputedStyle(pane)[property] === getComputedStyle(native)[property]);
    });
    assert.equal(nativeSurface, true, `${mode}/${width}: pane must use the native sidebar surface`);
    const quickSurface = await page.locator('.uxs-quick-tile[aria-pressed="false"]').first().evaluate(async tile => {
      await new Promise(requestAnimationFrame);
      await Promise.all(tile.getAnimations().map(animation => animation.finished));
      return getComputedStyle(tile).backgroundColor === getComputedStyle(document.querySelector("#native-ai-reference")).backgroundColor;
    });
    assert.equal(quickSurface, true, `${mode}/${width}: quick buttons must use the AI Summary surface`);
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
  await page.locator("#fixtures").screenshot({ path: path.join(screenshotDir, "storage.png"), animations: "disabled" });
  await page.locator("#fixtures").evaluate(node => { node.style.width = "320px"; });
  await page.locator("#fixtures").screenshot({ path: path.join(screenshotDir, "storage-mobile.png"), animations: "disabled" });
  await page.locator("#fixtures").evaluate(node => { node.style.width = "640px"; });
  await page.locator(".uxs-toggle").click();
  await page.locator("#fixtures").screenshot({ path: path.join(screenshotDir, "compact.png"), animations: "disabled" });
  await page.locator(".uxs-toggle").click();
  await load("100 Mbps to MB/s");
  await page.locator("#fixtures").screenshot({ path: path.join(screenshotDir, "data-rate.png"), animations: "disabled" });

  for (const language of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    await load("1 GiB/s to MiB/s", language);
    await expectResult("1,024.00");
    assert.doesNotMatch(await page.locator(".uxs-main").textContent(), /undefined|\{\{|NaN/);
    assert.ok((await page.locator(".uxs-toggle").getAttribute("aria-label")).length > 0);
  }
  const measures = await page.locator("#uxs-category-select option").evaluateAll(nodes => nodes.map(node => node.value));
  for (const measure of measures) {
    await page.locator("#uxs-category-select").selectOption(measure);
    assert.doesNotMatch(await page.locator(".uxs-main").textContent(), /NaN|undefined/);
  }
  await page.evaluate(() => {
    document.querySelector("#fixtures").innerHTML = `<div class="results-slot-panel"><div class="results-slot-panel-body">${document.querySelector("#fixtures").innerHTML}</div></div>`;
  });
  assert.equal(await page.locator(".uxs-main").evaluate(node => getComputedStyle(node).borderTopWidth), "0px");
  assert.equal(await page.locator(".uxs-main").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } }); });
  await load();
  await page.locator(".uxs-toggle").click();
  assert.equal(await page.locator(".uxs-body").isHidden(), true);
  await page.locator(".uxs-toggle").click();
  await page.locator("#uxs-amount").fill("20");
  await expectResult("20,000.00");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ layouts, languages: 9, categories: measures.length, storage: true, dataRates: true, tiles: true, savedCompactView: true, deniedStorage: true, lateCards: true, errors, screenshotDir }));
} finally {
  await browser.close();
}
