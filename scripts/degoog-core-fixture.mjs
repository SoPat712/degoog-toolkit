import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

// Read the core declarations and mixins instead of approximating the native
// accordion in browser fixtures. A captured deployed stylesheet can also be
// supplied for verification against the exact installed degoog version.
export async function loadCoreFixtureStyles() {
  const [variables, mixins, panels, navigation, forms, base, google] = await Promise.all([
    read("source/degoog/src/styles/_variables.scss"),
    read("source/degoog/src/styles/_mixins.scss"),
    read("source/degoog/src/styles/components/generic/_panels.scss"),
    read("source/degoog/src/styles/components/generic/_navigation.scss"),
    read("source/degoog/src/styles/components/generic/_forms.scss"),
    read("source/degoog/src/styles/style.scss"),
    read("themes/literallygoogle/style.css"),
  ]);
  const values = new Map([...variables.matchAll(/^(\$[\w-]+):\s*([^;]+);/gm)].map(match => [match[1], match[2]]));
  function resolve(source) {
    return source.replace(/\$[\w-]+/g, key => {
      assert.ok(values.has(key), `Unknown core style variable ${key}`);
      return resolve(values.get(key));
    });
  }
  function capture(source, pattern) {
    const match = source.match(pattern);
    assert.ok(match, `Core fixture declaration missing: ${pattern}`);
    return match[1];
  }
  const toggle = capture(navigation, /\.degoog-accordion-toggle\s*\{([\s\S]*?)\n\s*\.accordion-chevron/)
    .replace(/@include ([\w-]+);/g, (_, name) => capture(mixins, new RegExp(`@mixin ${name}\\s*\\{([^}]+)\\}`)));
  const globalCss = resolve([
    `* {${capture(base, /^\*\s*\{([^}]+)\}/m)}}`,
    `*, *::before, *::after {${capture(base, /\*,\s*\*::before,\s*\*::after\s*\{([^}]+)\}/)}}`,
    `html {${capture(base, /^html\s*\{([^}]+)\}/m)}}`,
    `body {${capture(base, /^body\s*\{([^}]+)\}/m)}}`,
  ].join("\n"));
  const nativeCss = [
    `.degoog-panel {${capture(panels, /\.degoog-panel\s*\{([\s\S]*?)\s*&--stack-item/)}}`,
    `.degoog-panel--accordion {${capture(panels, /&--accordion\s*\{([^}]+)\}/)}}`,
    `.degoog-accordion-toggle {${toggle}}`,
    `.degoog-accordion-toggle .accordion-chevron {${capture(navigation, /\.degoog-accordion-toggle\s*\{[\s\S]*?\.accordion-chevron\s*\{([^}]+)\}/)}}`,
    `.degoog-input {${capture(forms, /^\.degoog-input\s*\{([\s\S]*?)\n\s*&::placeholder/m)}}`,
    `select.degoog-input {${capture(forms, /select\.degoog-input\s*\{([^}]+)\}/)}}`,
  ].join("\n");
  const sidebarMedia = navigation.match(/&--sidebar\s*\{\s*@media\s*([^\{]+)\{([^}]+)\}/);
  assert.ok(sidebarMedia);
  const componentCss = process.env.DEGOOG_CORE_CSS
    ? await readFile(process.env.DEGOOG_CORE_CSS, "utf8")
    : resolve(nativeCss + `\n@media ${sidebarMedia[1]} { .degoog-accordion-toggle--sidebar {${sidebarMedia[2]}} }`);
  const fonts = await Promise.all([...google.matchAll(/@font-face\s*\{[^}]+\}/g)].map(async ([rule]) => {
    const source = rule.match(/url\("([^"]+)"\)/)?.[1];
    assert.ok(source);
    const bytes = await readFile(new URL(`themes/literallygoogle/${source}`, root));
    return rule.replace(/url\("[^"]+"\)/, `url("data:font/woff2;base64,${bytes.toString("base64")}")`);
  }));
  return { css: componentCss + "\n" + globalCss, fontsCss: fonts.join("\n"), source: process.env.DEGOOG_CORE_CSS || "bundled degoog SCSS" };
}
