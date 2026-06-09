import assert from "node:assert/strict";
import test from "node:test";

import { slot } from "./index.js";

await slot.init({
  template:
    '<div class="rslot"><a href="{{post_url}}">{{post_title}}</a><span>{{post_subreddit}}</span>{{comment_cards}}</div>',
});

test("triggers on explicit reddit keyword queries", () => {
  slot.configure({ showMode: "keyword" });
  assert.equal(slot.trigger("reddit mark hamill"), true);
  assert.equal(slot.trigger("best laptops"), false);
});

test("shows a blocked card when Reddit returns 403", async () => {
  slot.configure({ showMode: "keyword", maxComments: "2" });

  const output = await slot.execute("reddit mark hamill", {
    tab: "all",
    results: [],
    fetch: async () => new Response("", { status: 403 }),
  });

  assert.match(output.html, /rslot-error/);
  assert.match(output.html, />403</);
  assert.match(output.html, /Reddit blocked this request/);
  assert.match(output.html, /mark hamill/);
  assert.match(output.html, /reddit\.com\/search/);
  assert.doesNotMatch(output.html, /Search preview/);
});
