import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const script = (await readFile(new URL("../plugins/sports-slot/script.js", import.meta.url), "utf8"))
  .replaceAll("__PLUGIN_ID__", JSON.stringify("cache-fixture"));
const panel = (id) => `<div class="sports-slot" data-sports-query="nba score" data-refresh-ms="10000" data-refresh-after-ms="2000" data-refreshable="true" data-sports-live="true" data-fixture-id="${id}"><button type="button" data-sports-refresh-trigger>Refresh</button></div>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  let requests = 0;
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("https://fixture.test/**", (route) => {
    if (new URL(route.request().url()).pathname === "/") return route.fulfill({ contentType: "text/html", body: panel("initial") });
    requests++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ html: panel("refreshed"), retryAfterMs: 2000 }) });
  });
  await page.goto("https://fixture.test/");
  await page.addScriptTag({ content: script });
  const remaining = () => page.locator(".sports-slot").evaluate((el) => Number(el.dataset.nextRefreshAt) - Date.now());
  assert.ok(await remaining() > 1000);
  assert.ok(await remaining() <= 2000);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.waitForSelector('[data-fixture-id="refreshed"]');
  assert.equal(requests, 1);
  assert.ok(await remaining() > 1000);
  assert.ok(await remaining() <= 2000);
  assert.deepEqual(errors, []);
  console.log("PASS: initial cached data and refreshed panels preserve the server's remaining cache lifetime instead of restarting a 10-second interval.");
} finally { await browser.close(); }
