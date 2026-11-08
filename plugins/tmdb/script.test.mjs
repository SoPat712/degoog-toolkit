import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./card.js", import.meta.url), "utf8");
const BOOT = "  initSeasonRails(document);";
assert.ok(source.includes(BOOT), "card.js boot sequence moved; update this test");

// Runs card.js against a stub DOM and exposes the helpers under test.
function loadClient({ lang = "", fetch = async () => Response.json({}) } = {}) {
  const document = {
    documentElement: { lang },
    body: {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    __PLUGIN_ID__: "test-tmdb",
    document,
    fetch,
    console,
    URLSearchParams,
    Response,
    MutationObserver: class {
      observe() {}
    },
    ResizeObserver: class {
      observe() {}
    },
  });
  context.window = context;
  vm.runInContext(
    source.replace(
      BOOT,
      "  globalThis.__tmdbClient = { loadSeasonEpisodes, resetRestoredState, formatMediumDateFromIso };\n" + BOOT,
    ),
    context,
  );
  return context.__tmdbClient;
}

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const episodesPane = () => ({ dataset: {}, innerHTML: "" });

test("a slow earlier season never renders over the season clicked last", async () => {
  for (const firstToArrive of ["1", "3"]) {
    const pending = {};
    const client = loadClient({
      fetch: (url) => {
        const season = new URL(url, "https://degoog.test").searchParams.get("season");
        pending[season] = deferred();
        return pending[season].promise;
      },
    });
    const pane = episodesPane();
    const facts = [];
    const factsEl = {
      setAttribute: (_name, value) => facts.push(value),
      set innerHTML(_value) {},
    };

    const season1 = client.loadSeasonEpisodes(pane, "42", "1", factsEl);
    const season3 = client.loadSeasonEpisodes(pane, "42", "3", factsEl);
    const respond = (season) =>
      pending[season].resolve(
        Response.json({ html: `<p>Season ${season}</p>`, seasonFacts: { dateRange: `S${season}` } }),
      );
    const secondToArrive = firstToArrive === "1" ? "3" : "1";
    respond(firstToArrive);
    await (firstToArrive === "1" ? season1 : season3);
    respond(secondToArrive);
    await Promise.all([season1, season3]);

    assert.equal(pane.innerHTML, "<p>Season 3</p>", `season ${firstToArrive} answered first`);
    assert.equal(pane.dataset.tmdbSeasonActive, "3");
    assert.ok(!facts.includes("S1"), "stale season facts are not applied");

    // The stale response is still cached for a later click.
    await client.loadSeasonEpisodes(pane, "42", "1", factsEl);
    assert.equal(pane.innerHTML, "<p>Season 1</p>");
  }
});

test("Back clears init flags so restored season rails and cast carousels rebind", () => {
  const client = loadClient();
  const element = (dataset) => ({ dataset: { ...dataset } });
  const rail = element({ tmdbSeasonRailInit: "1" });
  const cast = element({ tmdbCastInit: "1" });
  const pane = element({ tmdbSeasonRequested: "2", tmdbSeasonActive: "2" });
  const root = {
    querySelectorAll(selector) {
      if (selector.includes("[data-tmdb-season-rail-init]")) return [rail, cast];
      if (selector === "[data-tmdb-episodes]") return [pane];
      return [];
    },
  };

  client.resetRestoredState(root);

  assert.equal(rail.dataset.tmdbSeasonRailInit, undefined);
  assert.equal(cast.dataset.tmdbCastInit, undefined);
  assert.equal(pane.dataset.tmdbSeasonRequested, undefined);
});

test("provisional season dates follow the document language", () => {
  const options = { month: "short", day: "numeric", year: "numeric" };
  const date = new Date(2010, 6, 15);
  assert.equal(
    loadClient({ lang: "de-DE" }).formatMediumDateFromIso("2010-07-15"),
    date.toLocaleDateString("de-DE", options),
  );
  assert.equal(
    loadClient({ lang: "" }).formatMediumDateFromIso("2010-07-15"),
    date.toLocaleDateString(undefined, options),
  );
  assert.equal(
    loadClient({ lang: "not a locale!" }).formatMediumDateFromIso("2010-07-15"),
    date.toLocaleDateString(undefined, options),
  );
});
