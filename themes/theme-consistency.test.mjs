import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

function normalizeThemeScript(source) {
  return source
    .replaceAll("LiterallyGoogle", "LiterallyTheme")
    .replaceAll("LiterallyApple", "LiterallyTheme")
    .replaceAll("LG_LANG_DICT", "THEME_LANG_DICT")
    .replaceAll("LA_LANG_DICT", "THEME_LANG_DICT")
    .replaceAll("getLgTranslation", "getThemeTranslation")
    .replaceAll("getLaTranslation", "getThemeTranslation")
    .replaceAll("data-lg-pager-enhanced", "data-theme-pager-enhanced")
    .replaceAll("data-la-pager-enhanced", "data-theme-pager-enhanced")
    .replaceAll("data-lg-search-type", "data-theme-search-type")
    .replaceAll("data-la-search-type", "data-theme-search-type")
    .replaceAll("data-lg-sidebar-bound", "data-theme-sidebar-bound")
    .replaceAll("data-la-sidebar-bound", "data-theme-sidebar-bound")
    .replace(/const SIDEBAR_MAX_REM = \d+;/, "const SIDEBAR_MAX_REM = THEME_VALUE;")
    .replace(/const SIDEBAR_MIN_REM = \d+;/, "const SIDEBAR_MIN_REM = THEME_VALUE;")
    .replaceAll("--literallygoogle-", "--literallytheme-")
    .replaceAll("--literallyapple-", "--literallytheme-");
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
    normalizeThemeScript(appleScript),
    normalizeThemeScript(googleScript),
  );
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
    assert.match(style, /@media \(max-width: 767px\)[\s\S]*?#slot-full-width-above-results[\s\S]*?padding-inline:\s*0\.75rem/);
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
  assert.doesNotMatch(
    googleStyle,
    /> \.lg-results-tabs-rail\s*\{\s*grid-column:\s*1\s*\/\s*3;/,
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
    /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*?#results-meta\s*\{\s*width:\s*calc\([\s\S]*?100%\s*-\s*var\(--literallygoogle-results-content-inline-end\)/,
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

test("themes put the full-width tablet sidebar before results", async () => {
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
      /#sidebar-col\s*\{[^}]*order:\s*-1;[^}]*position:\s*static;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/,
    );
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
