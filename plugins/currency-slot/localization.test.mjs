import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import slot from "./index.js";

test("currency server renders localized fiat names for all nine languages", async () => {
  slot.init({
    template: await readFile(new URL("./template.html", import.meta.url), "utf8"),
    fetch: async () => Response.json([{ quote: "EUR", rate: 0.9 }]),
  });
  for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "zh"]) {
    const { html } = await slot.execute("100 USD to EUR", { lang });
    assert.ok(html.includes(new Intl.DisplayNames([lang], { type: "currency" }).of("USD")), lang);
    assert.ok(html.includes(new Intl.DisplayNames([lang], { type: "currency" }).of("EUR")), lang);
  }
});
