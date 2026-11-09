import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mediaIntent, renderStrips, slot, wantedStrips } from "./index.js";

const template = await readFile(new URL("./template.html", import.meta.url), "utf8");
const card = await readFile(new URL("./card.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./card.css", import.meta.url), "utf8");

// card.js keeps result picking as pure functions ahead of its DOM boot;
// swapping the boot call for a hook runs them without a page.
const marker = "\n  boot();\n";
assert.ok(card.includes(marker), "card.js boots through a single boot() call");
const sandbox = vm.createContext({ URL });
vm.runInContext(card.replace(marker, "\n  globalThis.__media = media;\n"), sandbox);
const media = sandbox.__media;
const plain = (value) => JSON.parse(JSON.stringify(value));
const proxied = (url) => (typeof url === "string" && url.startsWith("/api/proxy/") && !/url=data%3A/i.test(url) ? url : "");

function reset(settings = {}, searchTypes = async () => ["web", "images", "videos"]) {
  slot.configure(settings);
  slot.init({ template, searchTypes });
}

test.beforeEach(() => reset());

test("image intent needs words that ask to see something", () => {
  for (const query of [
    "cat pictures", "mountain wallpaper", "eiffel tower photos", "nasa logo", "plant cell diagram",
    "what does a capybara look like", "doge meme", "pikachu drawing", "sunset images",
  ]) {
    assert.deepEqual(mediaIntent(query), { images: true, videos: false }, query);
  }
  for (const query of [
    "photos", "photo editor", "docker image", "png to jpg", "image recognition python",
    "how to change profile picture", "picture in picture mode", "passport photo requirements",
    "best photo printer", "logo maker", "tattoo removal", "tattoo shops near me", "image resolution",
  ]) {
    assert.equal(mediaIntent(query).images, false, query);
  }
});

test("video intent covers tutorials, previews and watch searches", () => {
  for (const query of [
    "how to tie a tie", "dune trailer", "python tutorial", "iphone 17 review",
    "bohemian rhapsody music video", "super bowl highlights", "funny cat videos", "elden ring walkthrough",
  ]) {
    assert.deepEqual(mediaIntent(query), { images: false, videos: true }, query);
  }
  for (const query of [
    "videos", "reviews", "video card", "video editor free", "mp4 to mp3", "code review checklist",
    "peer review", "how to spell necessary", "video games 2026", "google reviews", "review questions",
  ]) {
    assert.equal(mediaIntent(query).videos, false, query);
  }
});

test("per-strip modes override intent but never bangs or URLs", () => {
  assert.deepEqual(wantedStrips("pizza", { images: "always", videos: "auto" }), { images: true, videos: false });
  assert.deepEqual(wantedStrips("cat pictures", { images: "never", videos: "always" }), { images: false, videos: true });
  assert.deepEqual(wantedStrips("!yt cat videos", { images: "always", videos: "always" }), { images: false, videos: false });
  assert.deepEqual(wantedStrips("example.com", { images: "always", videos: "always" }), { images: false, videos: false });
  assert.deepEqual(wantedStrips("2 + 2", { images: "always", videos: "always" }), { images: false, videos: false });

  reset({ imagesMode: "never", videosMode: "bogus" });
  assert.equal(slot.trigger("cat pictures"), false);
  assert.equal(slot.trigger("how to tie a tie"), true);
});

test("placeholders escape the query and link View all to the matching tab", () => {
  const html = renderStrips(`cats "and" <dogs> $& pictures`, ["images", "videos"]);
  assert.match(html, /^<div class="mstrips" data-mstrips-query="cats &quot;and&quot; &lt;dogs&gt; \$&amp; pictures" hidden>/);
  assert.doesNotMatch(html, /<dogs>/);
  assert.match(html, /href="search\?q=cats\+%22and%22\+%3Cdogs%3E\+%24%26\+pictures&amp;type=images"/);
  // Heading over a divider, then the row, then "View all" in the footer.
  assert.match(html, /mstrips__title[\s\S]*mstrips__carousel[\s\S]*mstrips__foot[\s\S]*data-mstrips-all="images"/);
  assert.match(html, /data-mstrips-kind="images"[\s\S]*data-mstrips-kind="videos"/);
  assert.equal(html.match(/mstrips__item--skeleton/g)?.length, 11);
  assert.match(html, /\{\{ t:plugin-media-strips\.viewAllImages \}\}/);
  for (const button of html.match(/<button\b[^>]*>/g)) assert.match(button, /type="button"/);
  assert.equal(renderStrips("", ["images"]), "");
  assert.equal(renderStrips("cat pictures", []), "");
});

test("execute renders only strips whose search type is installed", async () => {
  const both = await slot.execute("cat pictures and videos");
  assert.equal(both.title, "");
  assert.match(both.html, /data-mstrips-kind="images"/);
  assert.match(both.html, /data-mstrips-kind="videos"/);

  reset({}, async () => ["web", "images"]);
  const imagesOnly = await slot.execute("cat pictures and videos");
  assert.match(imagesOnly.html, /data-mstrips-kind="images"/);
  assert.doesNotMatch(imagesOnly.html, /data-mstrips-kind="videos"/);

  reset({}, async () => ["web"]);
  assert.equal((await slot.execute("cat pictures")).html, "");

  reset({}, async () => { throw new Error("catalog unavailable"); });
  assert.match((await slot.execute("cat pictures")).html, /data-mstrips-kind="images"/);

  assert.equal((await slot.execute("weather in rome")).html, "");
});

test("the runtime only uses same-origin search and signed proxy thumbnails", () => {
  assert.match(card, /fetch\(`\$\{basePath\(\)\}\/api\/search`/);
  assert.match(card, /method: "POST"/);
  assert.match(card, /x-search-nonce/);
  assert.match(card, /pathname\.startsWith\(`\$\{basePath\(\)\}\/api\/proxy\/`\)/);
  assert.match(card, /degoog-results-ready/);
  assert.doesNotMatch(card, /https?:\/\/(?!github)/);
});

test("picking keeps signed thumbnails, skips data: URIs and de-duplicates links", () => {
  const signed = (name) => `/api/proxy/image?url=${encodeURIComponent(`https://img.example/${name}.jpg`)}&sig=x`;
  const dataUri = `/api/proxy/image?url=${encodeURIComponent("data:image/png;base64,AAAA")}&sig=x`;
  const images = plain(media.pickMedia("images", [
    { title: "A", url: "https://a.example/1", thumbnail: signed("a") },
    { title: "A again", url: "https://a.example/1", thumbnail: signed("a2") },
    { title: "Inline", url: "https://b.example/1", thumbnail: dataUri, imageUrl: signed("b-full") },
    { title: "Raw", url: "https://c.example/1", thumbnail: "https://img.example/raw.jpg" },
    { title: "Script", url: "javascript:alert(1)", thumbnail: signed("x") },
    null,
    "junk",
  ], proxied));
  assert.deepEqual(images.map((item) => [item.href, item.thumb]), [
    ["https://a.example/1", signed("a")],
    ["https://b.example/1", signed("b-full")],
  ]);
  assert.deepEqual(plain(media.pickMedia("images", undefined, proxied)), []);

  const [video, untitled] = plain(media.pickMedia("videos", [
    { title: "  How to   tie a tie ", url: "https://www.youtube.com/watch?v=1", thumbnail: signed("v"), duration: "3:05", favicon: "/api/proxy/favicon?domain=youtube.com&sig=x" },
    { title: "No thumbnail", url: "https://m.vimeo.com/2", duration: "live" },
    { title: "", url: "https://example.com/3" },
  ], proxied));
  assert.deepEqual(video, {
    href: "https://www.youtube.com/watch?v=1",
    title: "How to tie a tie",
    thumb: signed("v"),
    duration: "3:05",
    favicon: "/api/proxy/favicon?domain=youtube.com&sig=x",
    site: "YouTube",
  });
  assert.equal(untitled.site, "Vimeo");
  assert.equal(untitled.thumb, "");
  assert.equal(untitled.duration, "");
  assert.equal(media.siteName("https://news.example.org/x"), "news.example.org");
});

test("a re-rendered placeholder reuses the search and failures are retried", () => {
  // One search per query and kind, kept across placeholder copies.
  assert.match(card, /const key = `\$\{kind\}\|\$\{query\.toLowerCase\(\)\}`/);
  assert.match(card, /mediaCache\.delete\(key\)/);
  // Placeholders are tracked by element, never by a copied data attribute.
  assert.match(card, /const handled = new WeakSet\(\)/);
  assert.doesNotMatch(card, /dataset\.mstripsState/);
  // A strip that was off the page when its search finished fills on return.
  assert.match(card, /if \(!strip\.isConnected\) handled\.delete\(strip\)/);
  // Nothing aborts a search because a placeholder left the page.
  assert.doesNotMatch(card, /controller\.abort\(\);\s*active/);
  assert.match(card, /\/plugins\/\$\{encodeURIComponent\(__PLUGIN_ID__\)\}\/card\.css/);
  assert.match(card, /data-type="tab:engine:\$\{kind\}"/);
});

test("styles follow the shared card contract", () => {
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, "colors come from degoog variables");
  assert.doesNotMatch(styles, /font-family|text-transform/);
  assert.match(styles, /max-width: var\(--degoog-results-rail-inline-size, 652px\)/);
  for (const [, value] of styles.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.match(value, /^(?:var\(--theme-radius-(?:sm|md|pill), (?:8px|12px|999px)\)|50%)$/, value);
  }
  const rules = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  let checked = 0;
  for (const [, selectors] of rules.matchAll(/(?:^|[{}])\s*([^{}@;]+)\{/g)) {
    for (const selector of selectors.split(",").map((part) => part.trim()).filter(Boolean)) {
      if (/^(?:from|to|\d+%)$/.test(selector)) continue;
      assert.match(selector, /^(?::is\()?\.mstrips/, `scoped selector: ${selector}`);
      checked += 1;
    }
  }
  assert.ok(checked > 30, `checked ${checked} selectors`);
});

test("slot declares placement, network exposure and settings", () => {
  assert.equal(slot.isClientExposed, false);
  assert.equal(slot.position, "full-width-above-results");
  assert.deepEqual(slot.slotPositions, ["full-width-above-results", "above-results", "below-results"]);
  assert.deepEqual(slot.settingsSchema.map(({ key }) => key), ["imagesMode", "videosMode"]);
  assert.equal(slot.waitForResults, undefined);
});
