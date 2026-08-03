import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const pluginsDir = path.resolve("plugins");
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const pluginFolders = manifest.plugins.map(({ path: pluginPath }) =>
  path.basename(pluginPath),
);
const degoog023SlotPositions = new Set([
  "above-results",
  "below-results",
  "above-sidebar",
  "below-sidebar",
  "knowledge-panel",
  "at-a-glance",
]);
const nativeFullWidthRootSelectors = new Map([
  ["weather-slot", ".weather-result"],
  ["currency-slot", ".cxs-wrap"],
  ["osm-slot", ".places-wrap"],
  ["stocks", ".stocks-card"],
  ["tmdb", ".tmdb-result"],
  ["music", ".music-card"],
  ["books", ".books-card"],
  ["papers", ".papers-card"],
  ["color-translator", ".clrtr-card"],
  ["tip-calculator", ".tipcalc-card"],
  ["snake", ".snake-card"],
  ["periodic-table", ".pt-card"],
  ["sports-slot", ".sports-slot"],
]);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("Store manifest registers every shipped extension folder", async () => {
  const collections = [
    ["plugins", manifest.plugins],
    ["engines", manifest.engines],
    ["themes", manifest.themes],
  ];

  for (const [root, items] of collections) {
    const folders = (await readdir(path.resolve(root), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${root}/${entry.name}`)
      .sort();
    const registered = items.map(({ path: itemPath }) => itemPath).sort();

    assert.deepEqual(registered, folders, `${root}: manifest paths match folders`);
    for (const item of items) {
      assert.match(item.name, /\S/, `${item.path}: has a Store name`);
      assert.match(item.description, /\S/, `${item.path}: has a Store description`);
      assert.match(
        item.version,
        /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
        `${item.path}: uses a semantic version`,
      );
      const author = JSON.parse(
        await readFile(path.resolve(item.path, "author.json"), "utf8"),
      );
      assert.deepEqual(
        author,
        { name: "SoPat712", url: "https://github.com/SoPat712" },
        `${item.path}: author.json`,
      );
    }
  }
});

test("every Store item includes at least one screenshot", async () => {
  const items = [...manifest.plugins, ...manifest.engines, ...manifest.themes];

  for (const item of items) {
    const screenshotDir = path.resolve(item.path, "screenshots");
    const files = await readdir(screenshotDir);
    assert.ok(
      files.some((file) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file)),
      `${item.path}: includes a Store screenshot`,
    );
  }
});

test("vendored dependencies have reproducible provenance and hashes", async () => {
  const vendorManifest = JSON.parse(
    await readFile(path.resolve("vendor-manifest.json"), "utf8"),
  );
  assert.equal(vendorManifest.schemaVersion, 1);
  assert.ok(vendorManifest.components.length >= 4);

  for (const component of vendorManifest.components) {
    assert.match(component.name, /\S/);
    assert.match(component.version, /\S/);
    assert.match(component.sourceUrl, /^https:\/\//);
    assert.match(component.license, /\S/);

    if (component.sha256) {
      const bytes = await readFile(path.resolve(component.source));
      assert.equal(sha256(bytes), component.sha256, component.name);
    }
    if (component.licenseFile) {
      const license = await readFile(path.resolve(component.licenseFile));
      assert.equal(
        sha256(license),
        component.licenseSha256,
        `${component.name} license`,
      );
    }
    for (const file of component.files || []) {
      const bytes = await readFile(path.resolve(file.path));
      assert.equal(sha256(bytes), file.sha256, file.path);
    }
  }
});

test("all registered plugins keep required metadata and client exposure", async () => {
  for (const folder of pluginFolders) {
    const pluginDir = path.join(pluginsDir, folder);
    const author = JSON.parse(
      await readFile(path.join(pluginDir, "author.json"), "utf8"),
    );
    assert.deepEqual(
      author,
      { name: "SoPat712", url: "https://github.com/SoPat712" },
      `${folder}: author.json`,
    );

    const module = await import(
      `${pathToFileURL(path.join(pluginDir, "index.js")).href}?hygiene=${Date.now()}-${folder}`
    );
    for (const route of module.routes || []) {
      if (/^(?:delete|remove|clear)$/i.test(route.path)) {
        assert.notEqual(
          String(route.method).toLowerCase(),
          "get",
          `${folder}: mutating route ${route.path} must not use GET`,
        );
      }
    }
    const capabilities = new Set();
    for (const [name, value] of Object.entries(module)) {
      if (
        value &&
        typeof value === "object" &&
        (typeof value.execute === "function" ||
          typeof value.executeSearch === "function" ||
          typeof value.intercept === "function" ||
          typeof value.handle === "function")
      ) {
        capabilities.add(value);
        assert.equal(
          typeof value.isClientExposed,
          "boolean",
          `${folder}: ${name} must declare isClientExposed`,
        );
      }
    }
  }
});

test("plugin assets avoid inline handlers and hard-coded install ids", async () => {
  for (const folder of pluginFolders) {
    const pluginDir = path.join(pluginsDir, folder);
    const files = await readdir(pluginDir);
    for (const file of files) {
      if (!/\.(?:js|mjs|html)$/.test(file) || file.endsWith(".test.mjs")) {
        continue;
      }
      const source = await readFile(path.join(pluginDir, file), "utf8");
      assert.doesNotMatch(
        source,
        /\son(?:click|change|input|error|load|submit|keydown|keyup)\s*=/i,
        `${folder}/${file}: inline event handler`,
      );
      for (const match of source.matchAll(/<button\b[^>]*>/gs)) {
        assert.match(
          match[0],
          /\btype=(?:"button"|'button')/i,
          `${folder}/${file}: buttons must declare type="button"`,
        );
      }
      if (file === "script.js") {
        assert.doesNotMatch(
          source,
          /\/api\/plugin\/[a-z0-9_-]+/i,
          `${folder}/${file}: hard-coded installed plugin id`,
        );
        const scanObservers = source.match(/new MutationObserver\(scan\)/g) || [];
        assert.ok(
          scanObservers.length <= 1,
          `${folder}/${file}: duplicate scan observers`,
        );
      }
      if (source.includes("ctx.createCache(")) {
        assert.match(
          source,
          /ctx\?*\.useCache|ctx\.useCache/,
          `${folder}/${file}: prefer Valkey-aware useCache before createCache fallback`,
        );
      }
    }
  }
});

test("Snake default export preserves command registration and settings", async () => {
  const module = await import(
    `${pathToFileURL(path.join(pluginsDir, "snake", "index.js")).href}?snake=${Date.now()}`
  );
  assert.equal(module.default, module.command);
  assert.equal(module.command.trigger, "snake");
  assert.deepEqual(
    module.command.settingsSchema.map(({ key }) => key),
    ["enabled", "boardSize", "initialSpeed"],
  );
  assert.equal(module.slot.settingsSchema, undefined);
});

test("Time initializes late cards with one teardown-aware ticker", async () => {
  const source = await readFile(path.join(pluginsDir, "time", "script.js"), "utf8");
  assert.match(source, /new MutationObserver/);
  assert.match(source, /const liveCards = new Set\(\)/);
  assert.match(source, /if \(!card\.isConnected\)/);
  assert.match(source, /window\.clearInterval\(tickIntervalId\)/);
  assert.match(source, /window\.addEventListener\(\s*"pagehide"/);
  assert.match(source, /clock && clock\.textContent !== clockText/);
  const observerBody = source.slice(
    source.indexOf("const observer = new MutationObserver"),
    source.indexOf("observer.observe"),
  );
  assert.match(observerBody, /pruneDisconnected\(\)/);
  assert.doesNotMatch(observerBody, /pruneAndTick\(\)/);
  assert.doesNotMatch(source, /timeIntervalId/);
});

test("Search History locale catalogs keep key parity", async () => {
  const localeDir = path.join(pluginsDir, "search-history", "locales");
  const english = JSON.parse(await readFile(path.join(localeDir, "en.json"), "utf8"));
  const italian = JSON.parse(await readFile(path.join(localeDir, "it.json"), "utf8"));
  const flatten = (value, prefix = "") =>
    Object.entries(value).flatMap(([key, child]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object"
        ? flatten(child, next)
        : [next];
    });
  assert.deepEqual(flatten(italian).sort(), flatten(english).sort());
});

test("audited plugin controls keep accessible names and dialog semantics", async () => {
  const templates = Object.fromEntries(
    await Promise.all(
      [
        "color-translator",
        "currency-slot",
        "tip-calculator",
        "translate-slot",
        "undecideds",
        "unit-slot",
        "weather-slot",
      ].map(async (folder) => [
        folder,
        await readFile(path.join(pluginsDir, folder, "template.html"), "utf8"),
      ]),
    ),
  );

  const colorInputs = templates["color-translator"].match(
    /<input\b[^>]*data-clrtr-input[^>]*>/g,
  );
  assert.equal(colorInputs?.length, 12);
  for (const input of colorInputs) assert.match(input, /aria-label=/);

  for (const id of ["cxs-amount", "cxs-swap", "cxs-picker-search", "cxs-picker-close"]) {
    assert.match(
      templates["currency-slot"],
      new RegExp(`<[^>]+id="${id}"[^>]+aria-label=`),
      id,
    );
  }
  assert.match(templates["unit-slot"], /id="uxs-amount"[^>]+aria-label=/);
  assert.match(templates["translate-slot"], /trc-source-input[^>]+aria-label=/);
  assert.match(templates["translate-slot"], /trc-output[^>]+aria-label=/);
  assert.match(templates["undecideds"], /label for="undecideds-num-min"/);
  assert.match(templates["undecideds"], /label for="undecideds-num-max"/);
  assert.equal(
    templates["tip-calculator"].match(/tipcalc-number-input[^>]+aria-label=/g)?.length,
    3,
  );

  const weather = templates["weather-slot"];
  assert.equal(weather.match(/role="tab"/g)?.length, 4);
  assert.equal(weather.match(/aria-selected=/g)?.length, 4);
  assert.equal(weather.match(/aria-controls="weather-chart-panel"/g)?.length, 4);
  assert.match(weather, /role="tabpanel"[^>]+aria-labelledby=/);

  const placesIndex = await readFile(path.join(pluginsDir, "osm-slot", "index.js"), "utf8");
  const placesScript = await readFile(path.join(pluginsDir, "osm-slot", "script.js"), "utf8");
  assert.match(placesIndex, /data-places-modal hidden role="dialog" aria-modal="true"/);
  assert.match(placesIndex, /places-modal-close-btn[^>]+aria-label=/);
  assert.match(placesScript, /modalOpener\.focus\(\)/);
  assert.match(placesScript, /e\.key !== "Tab"/);
});

test("audited compact controls keep 24px CSS hit areas", async () => {
  const styles = Object.fromEntries(
    await Promise.all(
      [
        "color-translator",
        "define-slot",
        "metronome",
        "music",
        "osm-slot",
        "periodic-table",
        "sports-slot",
        "stocks",
        "tip-calculator",
        "weather-slot",
      ].map(async (folder) => [
        folder,
        await readFile(path.join(pluginsDir, folder, "style.css"), "utf8"),
      ]),
    ),
  );

  for (const [folder, selector] of [
    ["define-slot", ".dslot-tag-button"],
    ["define-slot", ".dslot-source a"],
    ["music", ".music-artist-link"],
    ["osm-slot", ".places-hours-toggle"],
    ["sports-slot", ".sports-slot__link"],
    ["stocks", ".stocks-detail-link"],
    ["tip-calculator", ".tipcalc-number-input"],
    ["weather-slot", ".weather-footer a"],
  ]) {
    assert.match(
      styles[folder],
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{[^}]*min-height:\\s*24px`),
      `${folder}: ${selector}`,
    );
  }

  assert.match(styles["color-translator"], /\.clrtr-slider\s*\{[^}]*height:\s*24px/);
  assert.match(styles["color-translator"], /\.clrtr-value\s*\{[^}]*min-height:\s*24px/);
  assert.match(styles.metronome, /\.metro-slider\s*\{[^}]*height:\s*24px/);
  assert.match(styles["periodic-table"], /repeat\(18,\s*minmax\(24px,\s*1fr\)\)/);
});

test("live responsive regressions remain covered", async () => {
  const [colorCss, snakeCss, tmdbCss, weatherScript] = await Promise.all([
    readFile(path.join(pluginsDir, "color-translator", "style.css"), "utf8"),
    readFile(path.join(pluginsDir, "snake", "style.css"), "utf8"),
    readFile(path.join(pluginsDir, "tmdb", "style.css"), "utf8"),
    readFile(path.join(pluginsDir, "weather-slot", "script.js"), "utf8"),
  ]);

  assert.match(colorCss, /@container \(max-width: 680px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(snakeCss, /\.snake-game-wrap\s*\{[^}]*width:\s*100%/);
  assert.match(tmdbCss, /@container tmdb-movie-hero \(max-width: 719px\)/);
  assert.match(tmdbCss, /@container \(min-width: 720px\)/);
  assert.match(weatherScript, /chartTitle\.textContent = meta\.label/);
  assert.match(weatherScript, /chartSub\.textContent = meta\.sub/);
});

test("settings schemas omit inert fields", async () => {
  const [unit, undecideds, sports] = await Promise.all([
    import("./unit-slot/index.js"),
    import("./undecideds/index.js"),
    import("./sports-slot/index.js"),
  ]);
  assert.equal(unit.slot.settingsSchema, undefined);
  assert.equal(undecideds.slot.settingsSchema, undefined);
  const sportsKeys = sports.slot.settingsSchema.map(({ key }) => key);
  assert.ok(!sportsKeys.includes("apiFootballKey"));
  assert.ok(!sportsKeys.includes("theSportsDbApiKey"));
});

test("theme search controls are named and media errors use delegated listeners", async () => {
  for (const theme of manifest.themes) {
    const home = await readFile(
      path.resolve(theme.path, "index-templates", "search.html"),
      "utf8",
    );
    const header = await readFile(
      path.resolve(theme.path, "search-templates", "header.html"),
      "utf8",
    );
    const imageCard = await readFile(
      path.resolve(theme.path, "search-templates", "image-card.html"),
      "utf8",
    );
    const videoCard = await readFile(
      path.resolve(theme.path, "search-templates", "video-card.html"),
      "utf8",
    );
    const script = await readFile(
      path.resolve(theme.path, "scripts", "search.js"),
      "utf8",
    );

    assert.match(home, /id="search-input"[\s\S]*aria-label=/);
    assert.match(header, /class="results-logo"[^>]*aria-label=/);
    assert.match(header, /id="results-search-btn"[^>]*aria-label=/);
    assert.match(header, /id="results-search-input"[\s\S]*aria-label=/);
    assert.doesNotMatch(`${imageCard}\n${videoCard}`, /\sonerror=/i);
    assert.match(script, /document\.addEventListener\("error", handleMediaAssetError, true\)/);
  }
});

test("LiterallyApple keeps generated tab rails horizontal and uses its own layout variables", async () => {
  const themeDir = path.resolve("themes/literallyapple");
  const css = await readFile(path.join(themeDir, "style.css"), "utf8");
  const script = await readFile(path.join(themeDir, "scripts", "search.js"), "utf8");

  assert.match(
    css,
    /#results-page #results-tabs \.lg-results-tabs__scroll\s*\{[\s\S]*?display:\s*flex/,
  );
  assert.match(
    css,
    /#sidebar-col\.is-sticky\.lg-sidebar-is-stuck\s*\{/,
  );
  assert.match(script, /--literallyapple-sidebar-bottom-inset/);
  assert.doesNotMatch(script, /--literallygoogle-/);
});

test("Store plugins use only degoog 0.23-compatible slot positions", async () => {
  for (const folder of pluginFolders) {
    const pluginDir = path.join(pluginsDir, folder);
    const module = await import(
      `${pathToFileURL(path.join(pluginDir, "index.js")).href}?compat=${Date.now()}-${folder}`
    );
    const slot = module.slot || module.slotPlugin;
    if (!slot) continue;
    assert.ok(degoog023SlotPositions.has(slot.position), `${folder}: ${slot.position}`);
    for (const position of slot.slotPositions || []) {
      assert.ok(degoog023SlotPositions.has(position), `${folder}: ${position}`);
    }
  }

  for (const item of [...manifest.plugins, ...manifest.themes]) {
    if (item.minDegoogVersion) {
      assert.equal(item.minDegoogVersion, "0.23.0", `${item.path}: stable minimum`);
    }
  }
});

test("native full-width plugin roots fill the core wrapper", async () => {
  for (const [folder, selector] of nativeFullWidthRootSelectors) {
    const pluginDir = path.join(pluginsDir, folder);
    const css = await readFile(path.join(pluginDir, "style.css"), "utf8");
    const indexSource = await readFile(path.join(pluginDir, "index.js"), "utf8");
    const templateSource = await readFile(path.join(pluginDir, "template.html"), "utf8").catch(
      () => "",
    );
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declarations = [
      ...css.matchAll(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm")),
    ]
      .map((match) => match[1])
      .join("\n");

    assert.ok(declarations, `${folder}: root selector ${selector} exists`);
    assert.match(declarations, /(?:^|;)\s*width:\s*100%\s*;/, `${folder}: fills width`);
    assert.match(declarations, /(?:^|;)\s*max-width:\s*none\s*;/, `${folder}: has no legacy width cap`);
    assert.match(declarations, /(?:^|;)\s*min-width:\s*0\s*;/, `${folder}: can shrink safely`);
    assert.match(declarations, /(?:^|;)\s*box-sizing:\s*border-box\s*;/, `${folder}: width includes padding and border`);
    for (const [, value] of declarations.matchAll(/(?:^|;)\s*max-width:\s*([^;]+)\s*;/g)) {
      assert.equal(value.trim(), "none", `${folder}: root max-width stays uncapped`);
    }
    assert.doesNotMatch(
      declarations,
      /(?:^|;)\s*margin(?:-inline(?:-start|-end)?)?\s*:\s*[^;]*\bauto\b/i,
      `${folder}: root is not centered inside the native wrapper`,
    );

    const rootClass = selector.slice(1);
    assert.match(
      `${indexSource}\n${templateSource}`,
      new RegExp(`class=(?:"[^"]*\\b${rootClass}\\b[^"]*"|'[^']*\\b${rootClass}\\b[^']*')`),
      `${folder}: rendered markup uses the audited root`,
    );
  }
});

test("knowledge cards inherit theme panel surfaces", async () => {
  for (const [folder, selector] of [
    ["music", ".music-card"],
    ["books", ".books-card"],
    ["papers", ".papers-card"],
  ]) {
    const css = await readFile(path.join(pluginsDir, folder, "style.css"), "utf8");
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declarations = css.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1] || "";
    assert.match(declarations, /background:\s*var\(--bg-light/);
    assert.match(declarations, /border-radius:\s*var\(--theme-radius-search/);
  }
});

test("0.23 themes retain the forward-compatible native slot skeleton", async () => {
  for (const theme of manifest.themes) {
    const html = await readFile(path.resolve(theme.path, "search.html"), "utf8");
    const nativeIds = html.match(/id="slot-full-width-above-results"/g) || [];
    assert.equal(nativeIds.length, 1, `${theme.name}: exactly one native container`);
    assert.ok(
      html.indexOf('id="slot-full-width-above-results"') <
        html.indexOf('id="results-layout"'),
      `${theme.name}: native container precedes the results layout`,
    );
    assert.doesNotMatch(html, /degoog-fullwidth-slot-shell/);
    assert.equal(theme.minDegoogVersion, "0.23.0");
  }
});

test("plugin and theme assets no longer use the legacy full-width classes", async () => {
  const roots = [pluginsDir, path.resolve("themes")];
  const pending = [...roots];

  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(target);
        continue;
      }
      if (!/\.(?:css|html|js|md)$/.test(entry.name) || entry.name.endsWith(".test.mjs")) {
        continue;
      }
      const source = await readFile(target, "utf8");
      assert.doesNotMatch(source, /degoog-fullwidth-slot-shell/, target);
      assert.doesNotMatch(source, /\.slot-full-width\b/, target);
      assert.doesNotMatch(
        source,
        /class=(?:"[^"]*\bslot-full-width\b[^"]*"|'[^']*\bslot-full-width\b[^']*')/,
        target,
      );
    }
  }
});

test("search history stays isolated from generic result enhancers", async () => {
  const pluginDir = path.join(pluginsDir, "search-history");
  const indexSource = await readFile(path.join(pluginDir, "index.js"), "utf8");
  const scriptSource = await readFile(path.join(pluginDir, "script.js"), "utf8");
  const cssSource = await readFile(path.join(pluginDir, "style.css"), "utf8");

  assert.match(indexSource, /class="search-history-result command-result"/);
  assert.match(indexSource, /title:\s*""/);
  assert.doesNotMatch(
    `${scriptSource}\n${cssSource}`,
    /\bresult-(?:item|body|url-row|favicon|cite|title)\b/,
  );
  assert.match(`${scriptSource}\n${cssSource}`, /search-history-result__pager/);
  assert.match(scriptSource, /HISTORY_PAGE_SIZE = 20/);
  assert.match(cssSource, /\.search-history-result\.command-result[\s\S]*max-width:\s*none/);
  assert.match(cssSource, /--search-history-content-inline-start/);
});

test("self-contained metronome card flattens the outer slot panel", async () => {
  const css = await readFile(
    path.join(pluginsDir, "metronome", "style.css"),
    "utf8",
  );
  const outerRule = css.match(
    /#results-page \.results-slot-panel:has\(> \.results-slot-panel-body > \.metro-card\)\s*\{([^}]*)\}/,
  )?.[1] || "";
  const bodyRule = css.match(
    /#results-page \.results-slot-panel:has\(> \.results-slot-panel-body > \.metro-card\) > \.results-slot-panel-body\s*\{([^}]*)\}/,
  )?.[1] || "";

  assert.match(outerRule, /border:\s*0\s*!important/);
  assert.match(outerRule, /background:\s*transparent\s*!important/);
  assert.match(outerRule, /box-shadow:\s*none\s*!important/);
  assert.match(bodyRule, /padding:\s*0\s*!important/);
  assert.match(bodyRule, /width:\s*100%/);
});

test("self-contained widgets override themed outer slot surfaces", async () => {
  const widgets = [
    ["calculator", ".calc-card"],
    ["stopwatch", ".timer-widget"],
    ["until", ".until-card"],
  ];

  for (const [folder, rootSelector] of widgets) {
    const css = await readFile(
      path.join(pluginsDir, folder, "style.css"),
      "utf8",
    );
    const escapedRoot = rootSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const panelSelector = `#results-page \\.results-slot-panel:has\\(> \\.results-slot-panel-body > ${escapedRoot}\\)`;
    const outerRule = css.match(
      new RegExp(`${panelSelector}\\s*\\{([^}]*)\\}`),
    )?.[1] || "";
    const bodyRule = css.match(
      new RegExp(`${panelSelector} > \\.results-slot-panel-body\\s*\\{([^}]*)\\}`),
    )?.[1] || "";

    assert.match(outerRule, /border:\s*0\s*!important/, folder);
    assert.match(outerRule, /background:\s*transparent\s*!important/, folder);
    assert.match(outerRule, /box-shadow:\s*none\s*!important/, folder);
    assert.match(outerRule, /padding:\s*0\s*!important/, folder);
    assert.match(bodyRule, /padding:\s*0\s*!important/, folder);
  }
});

test("plugin slot shell selectors only match direct core wrappers", async () => {
  for (const folder of pluginFolders) {
    const stylePath = path.join(pluginsDir, folder, "style.css");
    let css = "";
    try {
      css = await readFile(stylePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    assert.doesNotMatch(
      css,
      /\.results-slot-panel:has\(\.[^)]+\)/,
      `${folder} uses a descendant-wide slot shell selector`,
    );
  }
});
