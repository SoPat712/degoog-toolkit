import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
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
    for (const file of ["style.css", "image-filters.css", path.join("scripts", "search.js"), path.join("scripts", "image-filters.js")]) {
      const bytes = await readFile(path.join(themesDir, folder, file));
      const compressed = gzipSync(bytes).length;
      assert.ok(
        compressed <= 45_000,
        `${folder}/${file} gzips to ${compressed} bytes`,
      );
    }
  }
});

for (const folder of ["literallygoogle", "literallyapple"]) {
  test(`${folder}: failed thumbnails preserve the result and avoid retrying the same URL`, async () => {
    const source = await readFile(path.join(themesDir, folder, "scripts/search.js"), "utf8");
    const start = source.indexOf("function handleMediaAssetError(event) {");
    const end = source.indexOf('document.addEventListener("error", handleMediaAssetError, true);', start);
    class Element {}
    class Image extends Element {}
    const card = { hidden: false }, messages = [];
    const wrap = Object.assign(new Element(), {
      classList: { add() {} }, querySelector: () => messages[0], appendChild: value => messages.push(value),
    });
    let requests = 0, sourceUrl = "/api/proxy/image?original";
    const img = Object.assign(new Image(), {
      dataset: { fallback: sourceUrl }, classList: { contains: name => name === "image-thumb" },
      closest: selector => selector === ".image-card" ? card : wrap, getAttribute: () => sourceUrl,
    });
    Object.defineProperty(img, "src", { get: () => sourceUrl, set: value => { sourceUrl = value; requests++; } });
    const context = vm.createContext({ HTMLElement: Element, HTMLImageElement: Image, document: { createElement: () => ({}) }, getLgTranslation: () => "Thumbnail unavailable", getLaTranslation: () => "Thumbnail unavailable" });
    new vm.Script(source.slice(start, end)).runInContext(context);
    context.handleMediaAssetError({ target: img }); context.handleMediaAssetError({ target: img });
    assert.equal(card.hidden, false); assert.equal(requests, 0);
    assert.equal(messages.length, 1); assert.equal(messages[0].textContent, "Thumbnail unavailable");
    img.dataset.fallback = "/api/proxy/image?different-thumbnail";
    context.handleMediaAssetError({ target: img });
    assert.equal(requests, 1); assert.equal(sourceUrl, img.dataset.fallback);
  });

  test(`${folder}: preview reuses a loaded thumbnail without changing the original source`, async () => {
    const source = await readFile(path.join(themesDir, folder, "scripts/search.js"), "utf8");
    const start = source.indexOf("    function fitPreviewImage(panel) {");
    const end = source.indexOf("    function syncMeta(panel) {", start);
    assert.ok(start > 0 && end > start);
    const style = () => ({ removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } });
    const classes = new Set(), attrs = new Map();
    const img = { src: "https://images.example/original.jpg", complete: false, naturalWidth: 0, naturalHeight: 0, style: style(), getAttribute: () => img.src };
    let thumb = { src: "/api/proxy/image?thumbnail", currentSrc: "https://search.example/api/proxy/image?thumbnail", complete: true, naturalWidth: 200, naturalHeight: 100 };
    const wrap = { style: style(), clientWidth: 400, closest: () => ({ clientWidth: 400 }), classList: { add: key => classes.add(key), remove: key => classes.delete(key) }, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) };
    const panel = { querySelector: selector => selector === "#media-preview-img" ? img : wrap };
    const context = vm.createContext({ window: { innerHeight: 900 }, document: { querySelector: () => thumb } });
    new vm.Script(source.slice(start, end)).runInContext(context);
    context.fitPreviewImage(panel);
    assert.equal(classes.has("lg-preview-pending"), true);
    assert.equal(attrs.get("aria-busy"), "true");
    assert.equal(wrap.style.minHeight, "200px");
    assert.ok(wrap.style.backgroundImage.includes(thumb.currentSrc));
    assert.equal(img.src, "https://images.example/original.jpg");

    // Switching to an unchecked thumbnail must not retain the preceding photo.
    thumb = { complete: false }; context.fitPreviewImage(panel);
    assert.equal(classes.has("lg-preview-pending"), false);
    assert.equal(wrap.style.backgroundImage, undefined);

    thumb = { src: "/api/proxy/image?next", complete: true, naturalWidth: 100, naturalHeight: 200 };
    context.fitPreviewImage(panel);
    assert.equal(classes.has("lg-preview-pending"), true);
    img.complete = true; img.naturalWidth = 1600; img.naturalHeight = 800;
    context.fitPreviewImage(panel);
    assert.equal(classes.has("lg-preview-pending"), false);
    assert.equal(attrs.has("aria-busy"), false);
    assert.equal(wrap.style.backgroundImage, undefined); assert.equal(wrap.style.minHeight, undefined);
    assert.equal(img.style.width, "400px"); assert.equal(img.style.height, "200px");

    img.complete = false; context.fitPreviewImage(panel);
    img.style.display = "none"; context.fitPreviewImage(panel);
    assert.equal(classes.has("lg-preview-pending"), false, "a failed original/fallback must not leave a stale pending photo");
  });
}
