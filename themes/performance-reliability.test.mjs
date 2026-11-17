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
    for (const file of ["style.css", "image-filters.css", path.join("scripts", "search.js"), path.join("scripts", "image-filters.js"), path.join("scripts", "result-about.js")]) {
      const bytes = await readFile(path.join(themesDir, folder, file));
      const compressed = gzipSync(bytes).length;
      assert.ok(
        compressed <= 50_000,
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
    const settled = [];
    const context = vm.createContext({ HTMLElement: Element, HTMLImageElement: Image, document: { createElement: () => ({}) }, getLgTranslation: () => "Thumbnail unavailable", getLaTranslation: () => "Thumbnail unavailable", settleImageThumbShape: value => settled.push(value) });
    new vm.Script(source.slice(start, end)).runInContext(context);
    context.handleMediaAssetError({ target: img }); context.handleMediaAssetError({ target: img });
    assert.equal(card.hidden, false); assert.equal(requests, 0);
    assert.equal(messages.length, 1); assert.equal(messages[0].textContent, "Thumbnail unavailable");
    assert.equal(settled[0], card, "a failed thumbnail settles its box like a loaded one");
    img.dataset.fallback = "/api/proxy/image?different-thumbnail";
    context.handleMediaAssetError({ target: img });
    assert.equal(requests, 1); assert.equal(sourceUrl, img.dataset.fallback);
  });

  test(`${folder}: thumbnails never resize while on screen`, async () => {
    const [source, css] = await Promise.all([
      readFile(path.join(themesDir, folder, "scripts/search.js"), "utf8"),
      readFile(path.join(themesDir, folder, "style.css"), "utf8"),
    ]);
    const start = source.indexOf("const pendingThumbShapes = new Set();");
    const end = source.indexOf("function markImageThumbLoaded(img) {", start);
    assert.ok(start > 0 && end > start);
    const frames = [];
    const card = (top, loaded = true) => {
      const classes = new Set(loaded ? ["loaded"] : []);
      const wrap = { classList: { contains: name => classes.has(name), add: name => classes.add(name) } };
      return { classes, isConnected: true, querySelector: () => wrap, getBoundingClientRect: () => ({ top }) };
    };
    const context = vm.createContext({ window: { innerHeight: 800 }, requestAnimationFrame: callback => frames.push(callback) });
    new vm.Script(source.slice(start, end)).runInContext(context);

    const onScreen = card(300), above = card(-2000), below = card(1200), edge = card(799), loading = card(1500, false);
    [onScreen, above, below, edge, loading].forEach(target => context.settleImageThumbShape(target));
    assert.equal(frames.length, 1, "every card loaded in one frame is measured together");
    assert.equal(below.classes.has("lg-thumb-natural"), false, "nothing changes before the frame");
    frames.shift()();
    assert.equal(below.classes.has("lg-thumb-natural"), true, "a card below the viewport takes the image shape");
    assert.equal(onScreen.classes.has("lg-thumb-natural"), false, "a card on screen keeps its reserved box");
    assert.equal(edge.classes.has("lg-thumb-natural"), false, "a card peeking in at the bottom keeps its box");
    assert.equal(above.classes.has("lg-thumb-natural"), false, "a card above the viewport keeps its box, so cards below it stay put");
    assert.equal(loading.classes.has("lg-thumb-natural"), false, "a thumbnail still loading keeps its box");
    context.settleImageThumbShape(below);
    assert.equal(frames.length, 0, "a settled card is not measured again");

    assert.match(css, /contain-intrinsic-block-size:\s*auto calc\(75cqi \+ var\(--lg-image-info-block/);
    assert.match(css, /#results-list \.image-column\s*\{[^}]*container-type:\s*inline-size/);
    assert.match(css, /#results-list \.image-thumb\s*\{[^}]*aspect-ratio:\s*4 \/ 3;[^}]*object-fit:\s*cover/);
    assert.match(css, /\.lg-thumb-natural \.image-thumb\s*\{[^}]*aspect-ratio:\s*auto/);
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
