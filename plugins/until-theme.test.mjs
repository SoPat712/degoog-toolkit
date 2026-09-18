import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./until/style.css", import.meta.url), "utf8");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(body, `Missing ${selector}`);
  return body;
};

test("Until uses a flat theme surface instead of a panel gradient", () => {
  const panel = rule(".until-card__panel");
  assert.match(panel, /background:\s*var\(--until-board\);/);
  assert.doesNotMatch(panel, /gradient\(/);
  assert.doesNotMatch(css, /(?:135deg|to bottom right)/);
});

test("Until delegates colors to the active theme without a competing dark palette", () => {
  const root = rule(".until-card");
  for (const [alias, themeToken] of [
    ["text", "text-primary"], ["muted", "text-secondary"],
    ["board", "bg"], ["board-2", "bg-light"],
    ["edge", "border"], ["line", "border-light"],
    ["amber", "warning"], ["green", "success"],
    ["accent", "text-link"], ["detail-bg-hover", "bg-hover"],
  ]) {
    assert.match(root, new RegExp(`--until-${alias}:\\s*var\\(--${themeToken}[,)]`));
    assert.equal([...css.matchAll(new RegExp(`--until-${alias}:`, "g"))].length, 1,
      `${alias} must not be overridden for a hard-coded theme or OS preference`);
  }
  const executableCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(executableCss, /data-theme|prefers-color-scheme|literallygoogle|literallyapple/);
  assert.doesNotMatch(executableCss, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.match(root, /--until-text:\s*var\(--text-primary, CanvasText\)/);
  assert.match(root, /--until-board:\s*var\(--bg, Canvas\)/);
});

test("Until retains themed flip leaves, borders, status colors and motion", () => {
  for (const selector of [".until-card__flap-card", ".until-card__detail-half"]) {
    assert.match(rule(selector), /var\(--until-board-2\)/);
    assert.match(rule(selector), /var\(--until-flap-highlight\)/);
  }
  assert.match(rule(".until-card__flap"), /border:\s*1px solid var\(--until-flap-border\)/);
  assert.match(rule(".until-card__status"), /color:\s*var\(--until-green\)/);
  assert.match(rule(".until-card--past .until-card__status"), /color:\s*var\(--until-amber\)/);
  assert.match(css, /@keyframes until-flip-top/);
  assert.match(css, /@keyframes until-flip-bottom/);
  assert.match(css, /prefers-reduced-motion/);
});
