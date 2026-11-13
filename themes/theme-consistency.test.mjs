import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { load } from "cheerio";

const GOOGLE_STYLE = new URL("./literallygoogle/style.css", import.meta.url);
const APPLE_STYLE = new URL("./literallyapple/style.css", import.meta.url);
const GOOGLE_SCRIPT = new URL(
  "./literallygoogle/scripts/search.js",
  import.meta.url,
);
const APPLE_SCRIPT = new URL(
  "./literallyapple/scripts/search.js",
  import.meta.url,
);

test("LiterallyGoogle image controls retain the native results-bar sizing contract", async () => {
  const home = load(await readFile(new URL("./literallygoogle/index-templates/search.html", import.meta.url), "utf8"));
  const results = load(await readFile(new URL("./literallygoogle/search-templates/header.html", import.meta.url), "utf8"));
  assert.equal(home("#search-input").closest(".degoog-search-bar").length, 1);
  const bar = results("#results-search-input").closest(".degoog-search-bar");
  assert.equal(bar.length, 1);
  assert.equal(bar.hasClass("degoog-search-bar--results"), true,
    "opting out of core's legacy selector must preserve its results sizing modifier");
});

const SHARED_RADIUS_TOKENS = {
  "--theme-radius-xs": "4px",
  "--theme-radius-sm": "8px",
  "--theme-radius-md": "12px",
  "--theme-radius-lg": "16px",
  "--theme-radius-xl": "20px",
  "--theme-radius-search": "24px",
  "--theme-radius-pill": "999px",
};
const SHARED_COLOR_TOKENS = [
  "--primary",
  "--primary-hover",
  "--primary-rgb",
  "--danger",
  "--warning",
  "--success",
  "--bg",
  "--bg-light",
  "--bg-hover",
  "--border",
  "--border-light",
  "--text-primary",
  "--text-secondary",
  "--text-link",
  "--text-link-visited",
  "--text-cite",
  "--text-snippet",
  "--search-bar-bg",
  "--search-bar-bg-hover",
  "--search-bar-focused",
  "--search-bar-icon",
  "--btn-bg",
  "--btn-text",
  "--overlay-bg",
  "--white",
];

// Theme-owned names. Normalizing only a script's own names means a name copied
// from the other theme survives normalization and fails the comparison.
const THEME_NAMES = {
  literallygoogle: { brand: "LiterallyGoogle", dict: "LG_LANG_DICT", translate: "getLgTranslation", attr: "data-lg-", cssVar: "--literallygoogle-" },
  literallyapple: { brand: "LiterallyApple", dict: "LA_LANG_DICT", translate: "getLaTranslation", attr: "data-la-", cssVar: "--literallyapple-" },
};
const THEME_SCOPED_ATTRS = ["pager-enhanced", "search-type", "sidebar-bound"];

function normalizeThemeScript(source, theme) {
  const names = THEME_NAMES[theme];
  let normalized = source
    .replaceAll(names.brand, "LiterallyTheme")
    .replaceAll(names.dict, "THEME_LANG_DICT")
    .replaceAll(names.translate, "getThemeTranslation");
  for (const attr of THEME_SCOPED_ATTRS) {
    normalized = normalized.replaceAll(`${names.attr}${attr}`, `data-theme-${attr}`);
  }
  return normalized
    .replace(/const SIDEBAR_MAX_REM = \d+;/, "const SIDEBAR_MAX_REM = THEME_VALUE;")
    .replace(/const SIDEBAR_MIN_REM = \d+;/, "const SIDEBAR_MIN_REM = THEME_VALUE;")
    .replaceAll(names.cssVar, "--literallytheme-");
}

test("LiterallyGoogle keeps a slightly wider fluid sidebar", async () => {
  const [googleStyle, googleScript] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(GOOGLE_SCRIPT, "utf8"),
  ]);

  assert.match(googleStyle, /--literallygoogle-results-sidebar-min:\s*calc\(17rem \+ 5px\);/);
  assert.match(googleStyle, /--literallygoogle-results-sidebar-max:\s*calc\(21rem \+ 5px\);/);
  assert.match(googleScript, /const SIDEBAR_MIN_REM = 17;/);
  assert.match(googleScript, /const SIDEBAR_MAX_REM = 21;/);
});

test("LiterallyApple aligns tabs and status with the visible sidebar rail", async () => {
  const [appleStyle, appleScript] = await Promise.all([
    readFile(APPLE_STYLE, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  assert.match(
    appleStyle,
    /--literallyapple-results-sidebar-min:\s*calc\(16rem \+ 5px\);/,
  );
  assert.match(
    appleStyle,
    /--literallyapple-results-sidebar-max:\s*calc\(20rem \+ 5px\);/,
  );
  assert.match(
    appleStyle,
    /--literallyapple-results-sidebar-col:\s*calc\(\s*var\(--literallyapple-results-sidebar-max\) \+ var\(--lg-sidebar-scrollbar-size\)\s*\);/,
  );
  assert.match(
    appleStyle,
    /#results-tabs\s*\{[\s\S]*?grid-template-columns:\s*var\(\s*--lg-results-meta-grid-columns,[\s\S]*?width:\s*fit-content;/,
  );
  assert.match(
    appleStyle,
    /#results-meta\s*\{[\s\S]*?grid-template-columns:\s*var\(\s*--lg-results-meta-grid-columns,[\s\S]*?width:\s*fit-content;/,
  );
  assert.match(appleScript, /const SIDEBAR_MIN_REM = 16;/);
  assert.match(appleScript, /const SIDEBAR_MAX_REM = 20;/);
});

test("LiterallyGoogle keeps breathing room below the sticky header", async () => {
  const googleStyle = await readFile(GOOGLE_STYLE, "utf8");

  assert.match(
    googleStyle,
    /--literallygoogle-sticky-sidebar-gap:\s*0\.5rem;/,
  );
  assert.match(
    googleStyle,
    /#sidebar-col\.is-sticky\s*\{[^}]*top:\s*calc\([\s\S]*?--literallygoogle-sticky-header-offset[\s\S]*?--literallygoogle-sticky-sidebar-gap,\s*0\.5rem\)/,
  );
});

test("theme behavior bundles stay aligned", async () => {
  const [googleScript, appleScript] = await Promise.all([
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  assert.equal(
    normalizeThemeScript(appleScript, "literallyapple"),
    normalizeThemeScript(googleScript, "literallygoogle"),
  );
});

test("self-contained knowledge cards bypass sidebar accordion chrome", async () => {
  const [googleStyle, appleStyle, googleScript, appleScript] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  for (const script of [googleScript, appleScript]) {
    assert.match(script, /function isSelfContainedKnowledgePanel\(accordion\)/);
    assert.match(
      script,
      /!toggle\.textContent\.trim\(\)[\s\S]*body\.childElementCount[\s\S]*accordion\.classList\.add\("open"\)/,
    );
    assert.match(script, /lg-sidebar-knowledge-self-contained/);
  }

  for (const style of [googleStyle, appleStyle]) {
    assert.match(
      style,
      /\.sidebar-accordion\.lg-sidebar-knowledge-self-contained\s*>\s*\.sidebar-accordion-toggle\s*\{[^}]*display:\s*none;/,
    );
    assert.match(
      style,
      /\.sidebar-accordion\.lg-sidebar-knowledge-self-contained\s*>\s*\.sidebar-accordion-body\s*\{[^}]*display:\s*block\s*!important;[^}]*padding:\s*0\s*!important;[^}]*margin:\s*0\s*!important;/,
    );
    assert.match(
      style,
      /\.sidebar-accordion\.lg-sidebar-knowledge-self-contained\s*\{[^}]*scroll-margin-top:/,
    );
  }
});

test("narrow pagers retain each theme's overflow handling", async () => {
  const [googleStyle, appleStyle] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  assert.match(appleStyle, /@media \(max-width: 400px\)[\s\S]*?\.lg-pager\s*\{[^}]*overflow:\s*hidden;/);
  assert.doesNotMatch(googleStyle, /\.lg-pager\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(googleStyle, /\.lg-pager-o-track,\s*\.lg-pager-pages\s*\{\s*display:\s*flex;/);
});

test("themes expose the same radius scale", async () => {
  const styles = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of styles) {
    for (const [token, value] of Object.entries(SHARED_RADIUS_TOKENS)) {
      assert.match(
        style,
        new RegExp(`${token.replaceAll("-", "\\-")}:\\s*${value}`),
      );
    }
  }
});

test("theme geometry uses the shared radius scale", async () => {
  const styles = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of styles) {
    const declarations = style.matchAll(
      /(?:border-radius|border-(?:start|end)-(?:start|end)-radius):\s*([^;]+)/g,
    );
    for (const [, value] of declarations) {
      const cleanValue = value.trim().replace(/\s*!important/i, "");
      
      // Tokenize by spaces, ignoring spaces inside parentheses
      const parts = [];
      let current = "";
      let depth = 0;
      for (let i = 0; i < cleanValue.length; i++) {
        const char = cleanValue[i];
        if (char === "(") depth++;
        else if (char === ")") depth--;
        
        if (char === " " && depth === 0) {
          if (current) {
            parts.push(current);
            current = "";
          }
        } else {
          current += char;
        }
      }
      if (current) parts.push(current);

      for (const part of parts) {
        assert.match(
          part,
          /^(?:0|50%|inherit|\d+(?:px|rem|em|%)|var\(--theme-radius-[a-z]+\)|clamp\(.+\)|calc\(.+\))$/,
        );
      }
    }
  }
});

test("themes expose the same semantic color roles", async () => {
  const styles = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of styles) {
    for (const token of SHARED_COLOR_TOKENS) {
      assert.match(style, new RegExp(`${token.replaceAll("-", "\\-")}:\\s*`));
    }
  }
});

test("native full-width slots follow each theme's results rail", async () => {
  const [googleStyle, appleStyle] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of [googleStyle, appleStyle]) {
    assert.match(style, /#slot-full-width-above-results\s*>\s*\.results-slot-panel-full-width/);
    assert.match(style, /--theme-native-slot-inline-size:\s*calc\(/);
    assert.match(style, /#results-page\.centered-mode\s+#slot-full-width-above-results/);
    assert.match(style, /@media \(max-width: 767px\)[\s\S]*?#slot-full-width-above-results[\s\S]*?padding-inline:\s*1rem/);
    // One phone gutter: results sit on the search bar's 1rem edge.
    assert.match(style, /@media \(max-width: 767px\)[\s\S]*?#results-layout\s*\{\s*padding-block:\s*0;\s*padding-inline:\s*1rem;/);
  }

  assert.match(
    googleStyle,
    /padding-inline-start:\s*var\(\s*--literallygoogle-results-content-inline-start\s*\)/,
  );
  assert.match(
    appleStyle,
    /padding-inline-start:\s*var\(\s*--literallyapple-results-content-inline-start\s*\)/,
  );
});

test("blocks that fill in later keep the card and wait without taking space", async () => {
  const [googleStyle, appleStyle, design] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
    readFile(new URL("./literallygoogle/design.md", import.meta.url), "utf8"),
  ]);
  const bare = String.raw`> \.results-slot-panel:has\(> \.results-slot-panel-body > \[data-slot-bare\]\)`;
  const slots = String.raw`#results-page\s+:is\(#slot-above-results, #slot-below-results\)\s+`;

  for (const style of [googleStyle, appleStyle]) {
    // The theme's normal card stays around the block.
    assert.doesNotMatch(style, new RegExp(`${slots}${bare}\\s*\\{`));
    assert.doesNotMatch(style, new RegExp(`${slots}${bare}\\s*> \\.results-slot-panel-body\\s*\\{`));
    // Stacked cards keep the glance box's 16px rhythm.
    assert.match(style, /#results-main > #slot-above-results\s*\{\s*margin-block:\s*1rem;\s*gap:\s*1rem;/);
    // A waiting (hidden) bare root takes no space, panel or lone slot.
    assert.match(style, /> \.results-slot-panel-body\s*> \[data-slot-bare\]\[hidden\]\),[\s\S]{0,260}:only-child[\s\S]{0,120}\[data-slot-bare\]\[hidden\][\s\S]{0,40}\{\s*display:\s*none !important;/);
    assert.match(style, /#at-a-glance:empty\s*\+ #slot-above-results:has\([\s\S]{0,140}\[data-slot-bare\][\s\S]{0,20}\{\s*margin-top:\s*0;/);
    // The contract never reaches the native full-width wrapper.
    assert.doesNotMatch(style, /results-slot-panel-full-width[^{]*data-slot-bare/);
  }
  assert.match(design, /### Blocks that fill in after the results \(`data-slot-bare`\)/);
  assert.match(design, /Other themes ignore the attribute and show the normal panel/);
});

test("the results count sits in the two-column tabs row, in CSS only", async () => {
  const [googleStyle, appleStyle, googleScript, appleScript, design] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
    readFile(new URL("./literallygoogle/design.md", import.meta.url), "utf8"),
  ]);
  const web = String.raw`#results-page:not\(:has\(#results-layout\.media-mode\)\):not\(\.lg-command-mode\)`;
  for (const [style, end, height, top] of [
    [googleStyle, "5\\.75rem", "2\\.75rem", "0\\.75rem"],
    [appleStyle, "5\\.5rem", "2\\.3125rem", "1rem"],
  ]) {
    const wide = style.slice(style.indexOf("@media (min-width: 1024px)"));
    // Lifted out of the meta row into the tabs row, clear of Filter.
    const stats = wide.match(new RegExp(`${web}\\s*#results-meta\\s*> \\.results-meta-stats \\{([^}]*)\\}`))?.[1] || "";
    for (const rule of [/position: absolute;/, new RegExp(`inset-inline-end: ${end};`), /bottom: (?:100%|calc\(100% \+ 1px\));/,
      /display: flex;/, /align-items: center;/, new RegExp(`height: ${height};`)]) {
      assert.match(stats, rule);
    }
    assert.match(wide, new RegExp(`${web}\\s*#results-meta \\{\\s*position: relative;`));
    // Pinned filters hide Filter; the count then ends the row.
    assert.match(wide, new RegExp(`${web}:has\\(\\s*#tools-bar\\[style\\*="none"\\]\\s*\\)\\s*#results-meta\\s*> \\.results-meta-stats \\{\\s*inset-inline-end: 0;`));
    // Without spell-check or engine chrome the meta row keeps only its top padding.
    assert.match(wide, new RegExp(`${web}\\s*#results-meta:not\\(:has\\(> :not\\(\\.results-meta-stats\\)\\)\\) \\{\\s*padding-block: ${top} 0;`));
    // Narrower layouts, Images and command pages keep the meta row as before.
    assert.doesNotMatch(style.slice(0, style.indexOf("@media (min-width: 1024px)")), /inset-inline-end: 5\.(?:75|5)rem/);
    // The earlier shared-line pull-up is gone.
    assert.doesNotMatch(style, /sra-meta-row|margin-top:\s*calc\(-1 \*/);
  }
  // No script mirrors the count; the theme bundles stay within budget.
  for (const script of [googleScript, appleScript]) assert.doesNotMatch(script, /tabs-count/);
  assert.match(design, /Results count in the tabs row/);
});

test("themes preserve their intended search bar heights", async () => {
  const [googleStyle, appleStyle] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  assert.match(
    googleStyle,
    /--literallygoogle-search-shell-height:\s*50px;/,
  );
  assert.match(
    googleStyle,
    /#home-search \.search-bar,\s*#results-page \.results-search-bar\s*\{[\s\S]*?height:\s*var\(--literallygoogle-search-shell-height\);[\s\S]*?min-height:\s*var\(--literallygoogle-search-shell-height\);/,
  );
  assert.match(
    appleStyle,
    /\.results-search-bar,\s*\.search-bar\s*\{[\s\S]*?height:\s*48px;[\s\S]*?min-height:\s*48px;/,
  );
});

test("LiterallyGoogle page chrome follows the correct result rails", async () => {
  const googleStyle = await readFile(GOOGLE_STYLE, "utf8");

  assert.match(
    googleStyle,
    /#results-page\s*\{[^}]*--literallygoogle-results-rail-inline-size:\s*var\(\s*--literallygoogle-results-main-col-max\s*\);/,
  );
  const rootTokens = googleStyle.match(/:root\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(rootTokens, /--literallygoogle-results-rail-inline-size/);
  assert.match(
    googleStyle,
    /> \.lg-results-tabs-rail\s*\{\s*grid-column:\s*1;/,
  );
  assert.match(
    googleStyle,
    /> #tools-bar\s*\{\s*grid-column:\s*1;/,
  );
  assert.match(
    googleStyle,
    /#results-meta\s*\.results-meta-stats\s*\{[^}]*margin-inline-start:\s*auto;[^}]*text-align:\s*end;/,
  );
  assert.match(
    googleStyle,
    /> \.lg-results-tabs-rail\s*\{\s*grid-column:\s*1\s*\/\s*-1;/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 1024px\)[\s\S]*?#results-tabs\s*\{[\s\S]*?--lg-results-meta-grid-columns[\s\S]*?--literallygoogle-results-sidebar-max[\s\S]*?column-gap:\s*var\(--literallygoogle-results-column-gap\);/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 1024px\)[\s\S]*?#results-tabs\s*> #tools-bar\s*\{\s*grid-column:\s*2;/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 1024px\)[\s\S]*?#results-meta\s*\.results-meta-stats\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end;/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 1024px\)[\s\S]*?#results-meta\s*\{[\s\S]*?--lg-results-meta-grid-columns[\s\S]*?--literallygoogle-results-sidebar-max[\s\S]*?padding-inline-start:\s*var\(/,
  );
  assert.doesNotMatch(
    googleStyle,
    /--literallygoogle-results-rail-inline-size\)\s*-\s*var\(--literallygoogle-results-content-inline-end\)/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*?#results-tabs\s*\{[\s\S]*?grid-template-columns:\s*minmax\([\s\S]*?100%\s*-\s*var\(--literallygoogle-results-content-inline-end\)/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*?#results-meta\s*\{\s*width:\s*min\(\s*calc\([\s\S]*?100%\s*-\s*var\(--literallygoogle-results-content-inline-end\)[\s\S]*?--literallygoogle-results-main-col-max/,
  );
  assert.match(
    googleStyle,
    /@media \(min-width: 768px\)[\s\S]*?#results-tabs \.tools-toggle\s*\{\s*padding-inline-end:\s*0;/,
  );
});

test("LiterallyGoogle rounds a single related-search row", async () => {
  const googleStyle = await readFile(GOOGLE_STYLE, "utf8");

  assert.match(
    googleStyle,
    /\.related-search-link:only-child\s*\{[^}]*border-end-start-radius:\s*var\(--theme-radius-md\);[^}]*border-end-end-radius:\s*var\(--theme-radius-md\);/,
  );
});

test("themes expose the shared Store plugin results contract", async () => {
  const [googleStyle, appleStyle] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  assert.match(googleStyle, /--degoog-results-content-inline-start:\s*var\(/);
  assert.match(googleStyle, /#results-page\s*\{[\s\S]*--degoog-results-rail-inline-size:/);
  assert.match(appleStyle, /--degoog-results-content-inline-start:\s*var\(/);
  assert.match(appleStyle, /#results-page\s*\{[\s\S]*--degoog-results-rail-inline-size:/);
});

test("themes flatten nested glance panels", async () => {
  const styles = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of styles) {
    const nestedRule = style.match(
      /#results-page \.results-slot-panel-body > \.glance-box,\s*#results-page \.results-slot-panel-body > \.degoog-panel--slot:not\(\.results-slot-panel\),\s*#results-page #at-a-glance > \.glance-box\s*\{([^}]*)\}/,
    )?.[1] || "";

    assert.match(nestedRule, /background:\s*transparent\s*!important/);
    assert.match(nestedRule, /border:\s*none\s*!important/);
    assert.match(nestedRule, /box-shadow:\s*none\s*!important/);
    assert.match(nestedRule, /border-radius:\s*0\s*!important/);
  }
});

test("LiterallyGoogle preserves the native glance skeleton surface", async () => {
  const googleStyle = await readFile(GOOGLE_STYLE, "utf8");

  assert.match(
    googleStyle,
    /#results-page #at-a-glance > \.glance-box:has\(\.skeleton-glance\),\s*#results-page #at-a-glance > \.glance-box:has\(\.glance-ai-skeleton\)\s*\{[^}]*background:\s*var\(--bg-light\) !important;[^}]*border-radius:\s*var\(--theme-radius-lg\) !important;/,
  );
});

test("single-column themes lead with knowledge and preserve their sidebar panel placement", async () => {
  const [googleStyle, appleStyle, googleScript, appleScript] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  for (const script of [googleScript, appleScript]) {
    assert.match(script, /const TWO_COL_MIN = 1024;/);
    assert.match(
      script,
      /Sidebar accordion panels[\s\S]*?const DESKTOP_MIN = 1024;/,
    );
  }
  for (const style of [googleStyle, appleStyle]) {
    assert.match(style, /@media \(min-width: 768px\) and \(max-width: 1023px\)/);
    assert.match(
      style,
      /#sidebar-col\s*\{[^}]*position:\s*static;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/,
    );
    assert.doesNotMatch(style, /#sidebar-col\s*\{[^}]*order:\s*-1;/);
    const single = style.slice(style.indexOf("@media (max-width: 1023px) {"));
    assert.match(
      single,
      /:is\(#sidebar-col, #sidebar-col > \.sticky, #results-sidebar\)\s*\{\s*display:\s*contents;/,
    );
    assert.match(
      single,
      /:is\(#slot-above-sidebar, #slot-below-sidebar, #results-sidebar > \*\)\s*\{\s*order:\s*1;/,
    );
    if (style === googleStyle) {
      assert.match(single, /#results-sidebar\s*> \*\s*\{\s*order:\s*-1;/);
      assert.match(single, /#results-sidebar\s*> \.lg-sidebar-knowledge\s*\{\s*order:\s*-2;/);
    } else {
      assert.doesNotMatch(single, /#results-sidebar\s*> \*\s*\{\s*order:\s*-1;/);
      assert.match(single, /#results-sidebar\s*> \.lg-sidebar-knowledge\s*\{\s*order:\s*-1;/);
    }
    assert.match(
      style,
      /#sidebar-col\.is-sticky\s*>\s*\.sticky\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/,
    );
  }
});

test("themes hoist spell-check notices without expiring them", async () => {
  const [googleStyle, appleStyle, googleScript, appleScript] = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  for (const script of [googleScript, appleScript]) {
    assert.match(script, /const PRESERVED_GLANCE_SKELETON_ATTR/);
    assert.match(script, /meta\.appendChild\(notice\)/);
    assert.match(script, /restoreNativeGlanceSkeletonIfNeeded\(container\)/);
    assert.doesNotMatch(
      script,
      /SPELL_CHECK_CORRECTION_TTL_MS|lgSpellCheckHoistedAt|isHoistedSpellCheckFresh/,
    );
  }
  for (const style of [googleStyle, appleStyle]) {
    assert.match(style, /#results-meta\s+\.spell-check-notice/);
  }
});

test("image filter drawers initialize closed in both themes", async () => {
  const scripts = await Promise.all([
    readFile(GOOGLE_SCRIPT, "utf8"),
    readFile(APPLE_SCRIPT, "utf8"),
  ]);

  for (const script of scripts) {
    assert.match(script, /function initializeImageDrawerClosed/);
    assert.match(
      script,
      /initializeImageDrawerClosed\(page, document\.getElementById\("tools-panel"\), toggle\);/,
    );
    assert.match(script, /setImageFiltersSidebarOpen\(false\);/);
  }
});

test("themes wrap unbroken result-title URLs", async () => {
  const styles = await Promise.all([
    readFile(GOOGLE_STYLE, "utf8"),
    readFile(APPLE_STYLE, "utf8"),
  ]);

  for (const style of styles) {
    assert.match(
      style,
      /\.result-title\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/,
    );
  }
});

const THEMES = Object.keys(THEME_NAMES);
const readTheme = (theme, file) => readFile(new URL(`./${theme}/${file}`, import.meta.url), "utf8");

test("each theme uses only its own translation helper and search-type attribute", async () => {
  for (const theme of THEMES) {
    const other = THEMES.find((name) => name !== theme);
    const own = THEME_NAMES[theme];
    const foreign = THEME_NAMES[other];
    const sources = await Promise.all(
      ["scripts/search.js", "search.html", "style.css"].map((file) => readTheme(theme, file)),
    );
    for (const source of sources) {
      assert.doesNotMatch(source, new RegExp(`${foreign.translate}\\(`), `${theme} calls ${foreign.translate}`);
      assert.ok(!source.includes(`${foreign.attr}search-type`), `${theme} uses ${foreign.attr}search-type`);
    }
    const [script, html, style] = sources;
    const typeAttr = script.match(/const TYPE_ATTR = "([^"]+)";/)?.[1];
    assert.equal(typeAttr, `${own.attr}search-type`);
    assert.match(html, new RegExp(`setAttribute\\("${typeAttr}", type\\)`), "pre-paint script writes the synced attribute");
    for (const [, attr] of script.matchAll(/getAttribute\("(data-l[ag]-search-type)"\)/g)) {
      assert.equal(attr, typeAttr, `${theme} reads the attribute its tab sync writes`);
    }
    for (const [, attr] of style.matchAll(/\[(data-l[ag]-search-type)=/g)) {
      assert.equal(attr, typeAttr, `${theme} styles the attribute its tab sync writes`);
    }
    assert.match(script, new RegExp(`label: ${own.translate}\\("filters"\\)`));
  }
});

// Mirrors the audit scan: any bare call must resolve to a declaration in the
// same file or a browser global. Add genuine globals here when adopting them.
const BROWSER_GLOBALS = new Set(
  "window document console Math JSON Object Array String Number Boolean Date Promise Set Map WeakMap WeakSet Error TypeError requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval MutationObserver ResizeObserver IntersectionObserver URL URLSearchParams Event CustomEvent MouseEvent KeyboardEvent getComputedStyle parseInt parseFloat isNaN isFinite fetch Image matchMedia encodeURIComponent decodeURIComponent queueMicrotask Symbol RegExp structuredClone AbortController getSelection".split(" "),
);
const JS_KEYWORDS = new Set("if for while switch catch function return typeof new await async super this import delete void in of do else try finally throw yield case default break continue".split(" "));

function undeclaredCalls(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  const declared = new Set();
  const add = (list) => list.split(/[\s,{}[\]=:.]+/).forEach((name) => name && declared.add(name));
  for (const [, name] of code.matchAll(/\b(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(name);
  for (const [, list] of code.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) add(list);
  for (const [, list] of code.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)) add(list);
  for (const [, list] of code.matchAll(/\(([^()]*)\)\s*=>/g)) add(list);
  for (const [, name] of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(name);
  for (const [, name] of code.matchAll(/catch\s*\(\s*([\w$]+)/g)) declared.add(name);
  const missing = new Set();
  for (const [, name] of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!declared.has(name) && !BROWSER_GLOBALS.has(name) && !JS_KEYWORDS.has(name)) missing.add(name);
  }
  return [...missing];
}

test("theme scripts only call functions they declare", async () => {
  for (const theme of THEMES) {
    assert.deepEqual(undeclaredCalls(await readTheme(theme, "scripts/search.js")), [], theme);
  }
});

test("theme layouts set the color scheme and language before first paint", async () => {
  const { runInNewContext } = await import("node:vm");
  for (const theme of THEMES) {
    const layout = await readTheme(theme, "layout.html");
    assert.match(layout, /<html lang="__LANG_ATTR__" __THEME_ATTRS__ __RTL_SUPPORT__>/);
    const script = layout.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, `${theme}: pre-paint theme script`);
    assert.ok(layout.indexOf("<script>") < layout.indexOf('rel="stylesheet"'), "script runs before styles load");
    for (const [stored, prefersDark, expected] of [
      ["light", true, "light"],
      ["dark", false, "dark"],
      [null, true, "dark"],
      [null, false, "light"],
    ]) {
      const attrs = {};
      runInNewContext(script, {
        localStorage: { getItem: (key) => (key === "theme" ? stored : null) },
        document: { documentElement: { setAttribute: (name, value) => { attrs[name] = value; } } },
        window: { matchMedia: () => ({ matches: prefersDark }) },
      });
      assert.equal(attrs["data-theme"], expected, `${theme}: stored=${stored} prefersDark=${prefersDark}`);
    }
  }
});

test("theme select defaults are the option core applies when unsaved", async () => {
  // Core's getActiveThemeDataAttrs uses options[0], not `default`, for unsaved selects.
  for (const theme of THEMES) {
    const manifest = JSON.parse(await readTheme(theme, "theme.json"));
    for (const field of manifest.settingsSchema.filter((item) => item.type === "select")) {
      assert.equal(field.options[0], field.default, `${theme}: ${field.key}`);
      assert.equal(field.optionLabels.length, field.options.length, `${theme}: ${field.key} labels`);
    }
  }
});

test("theme stylesheet imports use url() so core rewrites them to the theme path", async () => {
  const googleStyle = await readFile(GOOGLE_STYLE, "utf8");
  assert.match(googleStyle, /^@import url\("4play\.css"\);/);
  for (const style of [googleStyle, await readFile(APPLE_STYLE, "utf8")]) {
    assert.doesNotMatch(style, /@import\s+["']/);
  }
});

test("theme results pages carry every translated string the scripts read", async () => {
  for (const theme of THEMES) {
    const [script, html] = await Promise.all([readTheme(theme, "scripts/search.js"), readTheme(theme, "search.html")]);
    const keys = new Set([...script.matchAll(/get(?:Lg|La|Theme)Translation\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]));
    for (const [, key] of script.matchAll(/\["(?:prev|next)10", -?PAGE_JUMP, "([A-Za-z0-9]+)"\]/g)) keys.add(key);
    assert.ok(keys.has("filters") && keys.has("prev10") && keys.has("next10"));
    for (const locale of ["en", "es", "fr"]) {
      const bank = JSON.parse(await readTheme(theme, `locales/${locale}.json`))[`theme-${theme}`];
      for (const key of keys) {
        const attr = `data-t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        assert.ok(html.includes(`${attr}="{{ t:theme-${theme}.${key} }}"`), `${theme}: ${attr}`);
        assert.equal(typeof bank[key], "string", `${theme} ${locale}: ${key}`);
      }
    }
    const english = JSON.parse(await readTheme(theme, "locales/en.json"))[`theme-${theme}`];
    const fallback = script.match(/filters: "([^"]+)"/)?.[1];
    assert.equal(english.filters, fallback, `${theme}: English filter label matches the built-in fallback`);
  }
});

test("theme favicons only use core-signed URLs", async () => {
  for (const theme of THEMES) {
    const files = ["scripts/search.js", "search-templates/image-card.html", "search-templates/media-preview.html"];
    const [script, card, preview] = await Promise.all(files.map((file) => readTheme(theme, file)));
    for (const source of [script, card, preview]) {
      assert.doesNotMatch(source, /\/api\/proxy\/favicon\?domain=/, `${theme}: unsigned favicon URL`);
    }
    const $ = load(preview);
    for (const id of ["media-preview-favicon-wrap", "media-preview-domain"]) {
      assert.equal($(`#${id}`).length, 1, `${theme}: core preview hook #${id}`);
      assert.notEqual($(`#${id}`).attr("hidden"), undefined, `${theme}: #${id} stays hidden`);
      assert.equal($(`#${id}`).attr("class"), undefined, "no core class may override [hidden]");
    }
    const favicon = load(card)("img.image-favicon");
    if (favicon.length) {
      assert.equal(favicon.attr("src"), undefined, `${theme}: card favicon waits for the signed URL`);
      assert.notEqual(favicon.attr("hidden"), undefined);
    }
  }
});

test("mobile themes do not hand Store plugins the desktop logo offset", async () => {
  for (const style of [await readFile(GOOGLE_STYLE, "utf8"), await readFile(APPLE_STYLE, "utf8")]) {
    assert.match(
      style,
      /@media \(max-width: 767px\) \{\s*:root \{\s*--degoog-results-content-inline-start:\s*0px;\s*--degoog-results-content-inline-end:\s*0px;/,
    );
  }
});

test("LiterallyApple hides the core filter toggle only while its image FAB owns filters", async () => {
  const appleStyle = await readFile(APPLE_STYLE, "utf8");
  assert.doesNotMatch(appleStyle, /#results-tabs \.tools-bar\s*\{[^}]*display:\s*none/);
  assert.match(
    appleStyle,
    /#results-page\[data-la-search-type="images"\]\.lg-image-fab-filters #results-tabs #tools-bar\s*\{\s*display:\s*none !important;/,
  );
});

test("theme pages load their scripts through __THEME_PATH__", async () => {
  for (const theme of THEMES) {
    const html = await readTheme(theme, "search.html");
    assert.match(html, /<script src="__THEME_PATH__\/scripts\/search\.js\?v=__APP_VERSION__"><\/script>/);
    assert.doesNotMatch(html, /\/themes\/literally/);
  }
});

test("RTL two-column results mirror through the grid itself", async () => {
  for (const theme of THEMES) {
    const style = await readTheme(theme, "style.css");
    // The grid already mirrors under dir=rtl; swapping columns again put the
    // results in the narrow column.
    assert.doesNotMatch(style, /html\[dir="rtl"\] #results-page #results-main\s*\{\s*grid-column:/, theme);
    assert.match(style, /\.lg-pager-letters-core\s*\{[^}]*direction:\s*ltr;[^}]*unicode-bidi:\s*isolate;/, theme);
    const script = await readTheme(theme, "scripts/search.js");
    assert.match(script, /style\.direction === "rtl" \? rect\.right : window\.innerWidth - rect\.left/, theme);
  }
});

test("themes keep the results column, tool cards and pager usable", async () => {
  for (const theme of THEMES) {
    const style = await readTheme(theme, "style.css");
    // Tool cards in the above-results slot lead the glance; the slot opens up
    // so blocks that fill in later stay after it in degoog's order.
    assert.match(style, /#results-main:has\([\s\S]*?:not\(\[data-slot-bare\], style, script, link\)\s*\)\s*> #slot-above-results\s*\{\s*display:\s*contents;/, theme);
    assert.match(style, /> #slot-above-results\s*> \.results-slot-panel:has\(\s*> \.results-slot-panel-body\s*> :not\(\[data-slot-bare\], style, script, link\)\s*\)\s*\{\s*order:\s*-1;\s*margin-bottom:\s*1rem;/, theme);
    assert.doesNotMatch(style, /\)\s*> #slot-above-results\s*\{\s*order:\s*-1;/, theme);
    // The glance placeholder has a height for each layout band.
    assert.match(style, /@media \(max-width: 599px\)\s*\{\s*#results-page #at-a-glance > \.glance-box:has\(> \.skeleton-glance\)\s*\{\s*height:/, theme);
    // Page numbers keep a 24px pitch on narrow pagers.
    assert.match(style, /@container lg-pagination \(max-width: 34rem\)[\s\S]*?--lg-pager-page-size:\s*1\.5rem;/, theme);
    if (theme === "literallygoogle") {
      assert.doesNotMatch(style, /\.lg-pager-control\s*\{[^}]*grid-row:\s*2;/, theme);
      assert.match(style, /\.lg-pager-control--prev10,\s*\.lg-pager-control--next10\s*\{\s*display:\s*none;/, theme);
    } else {
      assert.match(style, /\.lg-pager-control--next,[\s\S]*?grid-column:\s*2 \/ span 2;/, theme);
    }
    assert.match(style, /#results-page:has\(#results-list > \.no-results\) \.results-meta-stats\s*\{\s*display:\s*none !important;/, theme);
    if (theme === "literallygoogle") {
      assert.match(style, /@media \(max-width: 1023px\)\s*\{\s*#results-page\s*\{\s*padding-block-end:\s*calc\(2\.5rem \+ env\(safe-area-inset-bottom, 0px\)\);/, theme);
    } else {
      assert.match(style, /#results-page\s*\{\s*padding-block-end:\s*calc\(2\.5rem \+ env\(safe-area-inset-bottom, 0px\)\);/, theme);
    }
    // Command pages start on the results edge at the main column's width.
    assert.match(style, /:is\(#results-meta, #results-layout\)\s*\{[\s\S]*?results-main-col-max[\s\S]*?padding-inline:\s*var\(--literally(google|apple)-results-content-inline-start\)/, theme);
    // Below 1000px the image preview is a bottom sheet, not a docked column.
    assert.match(style, /@media \(min-width: 768px\) and \(max-width: 999px\)\s*\{\s*#results-page:has\(#results-layout\.media-mode\) #media-preview-panel\s*\{[^}]*position:\s*fixed;/, theme);
    const about = await readTheme(theme, "scripts/result-about.js");
    assert.match(about, /new ResizeObserver\(entries => entries\.forEach\(entry => fitCrumbs\(entry\.target\)\)\)/, theme);
  }
  const apple = await readTheme("literallyapple", "style.css");
  assert.match(apple, /#results-page\s*\{[^}]*--literallyapple-results-rail-inline-size:\s*var\(\s*--literallyapple-results-main-col-max\s*\);/);
  assert.match(apple, /@media \(max-width: 767px\)\s*\{\s*#results-page #results-tabs \.lg-results-tabs__scroll\s*\{\s*padding-inline-start:\s*1rem;/);
  // The media-tab gutter must not pad the tabs, or the Images pills start at 24px.
  assert.doesNotMatch(apple, /:has\(#results-list \.video-card\)\s*\)\s*#results-tabs,/);
  assert.match(apple, /#results-main,\s*#results-page \.glance-box,\s*#results-page \.skeleton-card\s*\{\s*max-width:\s*none;/);
  // The preview pill's content sits on .mp2-body's 1rem edge, as does the related grid.
  assert.match(apple, /\.mp2-bar\s*\{[^}]*padding:\s*0\.9rem calc\(1rem - 1px\) 0\.75rem;/);
  assert.match(apple, /\.media-preview-more\s*\{[^}]*padding:\s*0\.1rem 0 0;/);
  const google = await readTheme("literallygoogle", "style.css");
  // As on Google, the first tab label sits on the shared edge.
  assert.match(google, /\.lg-results-tabs__list > \.results-tab:first-child\s*\{\s*margin-inline-start:\s*0;/);
  assert.match(google, /#results-page #results-tabs\s*\{\s*padding-inline-start:\s*1rem;/);
  assert.match(google, /@media \(hover: hover\)\s*\{\s*#results-page #results-tabs \.results-tab:not\(\.active\):not\(\[aria-selected="true"\]\):hover/);
});
