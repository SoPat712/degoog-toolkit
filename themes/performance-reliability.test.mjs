import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

const themesDir = path.resolve("themes");

test("LiterallyGoogle preloads compact Latin fonts and keeps other scripts on demand", async () => {
  const themeDir = path.join(themesDir, "literallygoogle");
  const fontsDir = path.join(themeDir, "fonts", "google-sans", "static");
  const css = await readFile(path.join(themeDir, "style.css"), "utf8");
  const layout = await readFile(path.join(themeDir, "layout.html"), "utf8");

  for (const file of ["GoogleSans-Regular.woff2", "GoogleSans-Medium.woff2"]) {
    const filePath = path.join(fontsDir, file);
    const [info, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
    assert.ok(info.size <= 64_000, `${file} is ${info.size} bytes`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.match(layout, new RegExp(`fonts/google-sans/static/${file}`));
  }

  for (const file of [
    "GoogleSans-Regular-Other.woff2",
    "GoogleSans-Medium-Other.woff2",
  ]) {
    const bytes = await readFile(path.join(fontsDir, file));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.match(css, new RegExp(file));
    assert.doesNotMatch(layout, new RegExp(file));
  }

  assert.match(css, /unicode-range:\s*U\+0000-024F/);
  assert.match(css, /unicode-range:\s*U\+0370-1CFF/);
});

test("theme result lists defer offscreen layout with matching geometry", async () => {
  for (const folder of ["literallygoogle", "literallyapple"]) {
    const css = await readFile(path.join(themesDir, folder, "style.css"), "utf8");
    assert.match(css, /@supports \(content-visibility:\s*auto\)/, folder);
    assert.match(css, /#results-list > \.result-item\s*\{[^}]*content-visibility:\s*auto/s, folder);
    assert.match(css, /contain-intrinsic-block-size:\s*auto 9rem/, folder);
  }
});

test("theme behavior and style assets keep compressed size headroom", async () => {
  for (const folder of ["literallygoogle", "literallyapple"]) {
    for (const file of ["style.css", path.join("scripts", "search.js")]) {
      const bytes = await readFile(path.join(themesDir, folder, file));
      const compressed = gzipSync(bytes).length;
      assert.ok(
        compressed <= 45_000,
        `${folder}/${file} gzips to ${compressed} bytes`,
      );
    }
  }
});
