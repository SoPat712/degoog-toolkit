import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { routes, slot } from "./index.js";

function yahooFetch(url) {
  const parsed = new URL(url);

  if (parsed.pathname.endsWith("/v1/finance/search")) {
    const query = parsed.searchParams.get("q") || "";
    const normalized = query.toLowerCase();
    const quotes = normalized === "alphabet"
      ? [{
          symbol: "GOOGL",
          quoteType: "EQUITY",
          shortname: "Alphabet Inc.",
          exchange: "NMS",
        }]
      : normalized === "acme robotics"
        ? [{
            symbol: "ACMEX.SW",
            quoteType: "ETF",
            shortname: "Unrelated Robotics Fund",
            exchange: "EBS",
          }]
        : [{
            symbol: query.toUpperCase(),
            quoteType: "EQUITY",
            shortname: `${query.toUpperCase()} Holdings`,
            exchange: "NMS",
          }];
    return Promise.resolve(
      Response.json({
        quotes,
      }),
    );
  }

  if (parsed.pathname.endsWith("/v7/finance/quote")) {
    const symbol = parsed.searchParams.get("symbols") || "AAPL";
    return Promise.resolve(
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol,
              quoteType: "EQUITY",
              shortName: symbol === "AAPL" ? "Apple Inc." : "Alphabet Inc.",
              regularMarketPrice: 200,
              regularMarketPreviousClose: 198,
            },
          ],
        },
      }),
    );
  }

  if (parsed.pathname.includes("/v8/finance/chart/")) {
    const symbol = decodeURIComponent(parsed.pathname.split("/").at(-1));
    return Promise.resolve(
      Response.json({
        chart: {
          result: [
            {
              meta: {
                symbol,
                instrumentType: "EQUITY",
                regularMarketPrice: 200,
                previousClose: 198,
                currency: "USD",
              },
              timestamp: [1, 2],
              indicators: {
                quote: [{ close: [198, 200] }],
              },
            },
          ],
        },
      }),
    );
  }

  throw new Error(`Unexpected URL: ${url}`);
}

test("uses matching Yahoo quote results as general instrument evidence", async () => {
  await slot.init({
    template: await readFile(new URL("./template.html", import.meta.url), "utf8"),
  });
  const cases = [
    [
      "aapl stock",
      "AAPL",
      [{
        url: "https://finance.yahoo.com/quote/AAPL/",
        title: "Apple Inc. (AAPL) Stock Price, News, Quote & History",
        snippet: "Find the latest Apple Inc. stock quote and company information.",
      }],
    ],
    [
      "alphabet stock",
      "GOOG",
      [{
        url: "https://finance.yahoo.com/quote/GOOG/",
        title: "Alphabet Inc. (GOOG) Stock Price, News, Quote & History",
        snippet: "Find the latest Alphabet Inc. stock quote and company information.",
      }],
    ],
    [
      "acme robotics stock",
      "ACME",
      [
        {
          url: "https://finance.yahoo.com/quote/ACME/",
          title: "Acme Robotics Inc. (ACME) Stock Price, News, Quote & History",
          snippet: "Find the latest Acme Robotics stock quote and company information.",
        },
        {
          url: "https://finance.yahoo.com/quote/ACMEX.SW/",
          title: "Acme Robotics Fund (ACMEX.SW)",
        },
      ],
    ],
    [
      "goog",
      "GOOG",
      [{
        url: "https://finance.yahoo.com/quote/GOOG/",
        title: "Alphabet Inc. (GOOG) Stock Price, News, Quote & History",
      }],
    ],
  ];

  for (const [query, expectedSymbol, results] of cases) {
    assert.equal(slot.trigger(query), true);
    const output = await slot.execute(query, {
      tab: "all",
      results,
      fetch: yahooFetch,
    });
    assert.match(output.html, /stocks-card/);
    assert.match(output.html, new RegExp(`>${expectedSymbol}<`));
    assert.match(output.html, /data-initial-chart="[^\"]*&quot;points&quot;/);
  }
});

test("starts the initial chart request while the quote snapshot is pending", async () => {
  let releaseSnapshot;
  let markChartStarted;
  const chartStarted = new Promise((resolve) => {
    markChartStarted = resolve;
  });

  const pending = slot.execute("ZZZX stock", {
    tab: "all",
    results: [],
    fetch: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/v1/finance/search")) {
        return Response.json({
          quotes: [{
            symbol: "ZZZX",
            quoteType: "EQUITY",
            shortname: "Example Holdings",
            exchange: "NMS",
          }],
        });
      }
      if (parsed.pathname.endsWith("/v7/finance/quote")) {
        return new Promise((resolve) => {
          releaseSnapshot = () => resolve(Response.json({
            quoteResponse: {
              result: [{
                symbol: "ZZZX",
                quoteType: "EQUITY",
                shortName: "Example Holdings",
                regularMarketPrice: 101,
                regularMarketPreviousClose: 100,
              }],
            },
          }));
        });
      }
      if (parsed.pathname.includes("/v8/finance/chart/")) {
        markChartStarted();
        return Response.json({
          chart: {
            result: [{
              meta: {
                symbol: "ZZZX",
                instrumentType: "EQUITY",
                regularMarketPrice: 101,
                previousClose: 100,
                currency: "USD",
              },
              timestamp: [1, 2],
              indicators: { quote: [{ close: [100, 101] }] },
            }],
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  await Promise.race([
    chartStarted,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("chart request remained serialized")), 500),
    ),
  ]);
  assert.equal(typeof releaseSnapshot, "function");
  releaseSnapshot();

  const output = await pending;
  assert.match(output.html, /stocks-card/);
});

test("does not let an unrelated Yahoo result override an explicit ticker", async () => {
  const output = await slot.execute("MSFT stock", {
    tab: "all",
    results: [{
      url: "https://finance.yahoo.com/quote/AAPL/",
      title: "Apple Inc. (AAPL) Stock Price, News, Quote & History",
    }],
    fetch: yahooFetch,
  });

  assert.match(output.html, />MSFT</);
  assert.doesNotMatch(output.html, />AAPL</);
});

test("does not treat a partial company-name match as stock evidence", async () => {
  const output = await slot.execute("app", {
    tab: "all",
    results: [{
      url: "https://finance.yahoo.com/quote/AAPL/",
      title: "Apple Inc. (AAPL) Stock Price, News, Quote & History",
    }],
    fetch: yahooFetch,
  });

  assert.deepEqual(output, { html: "" });
});

test("quote route returns a live quote payload", async () => {
  slot.configure({ liveUpdates: true, liveUpdateIntervalSeconds: "10" });
  await slot.init({ fetch: yahooFetch });
  const quoteRoute = routes.find((route) => route.path === "quote");
  assert.ok(quoteRoute);

  const response = await quoteRoute.handler(
    new Request("http://localhost/quote?symbol=AAPL&live=1"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.symbol, "AAPL");
  assert.equal(body.price, 200);
  assert.equal(body.trend, "up");
  assert.ok(body.chartPoint);
});

test("ordinary words left after cleanup do not become tickers", async () => {
  await slot.init({
    template: await readFile(new URL("./template.html", import.meta.url), "utf8"),
  });
  const noFetch = (url) => {
    throw new Error(`Unexpected fetch for an ordinary query: ${url}`);
  };

  for (const query of [
    "quote of the day",
    "Quote of the Day",
    "out of stock",
    "top stocks",
    "top 10 stocks",
    "share link",
    "stock up",
    "car stock",
    "best stocks",
    "love quote",
    "beef stock",
    "home equity",
    "tech stocks",
    "market shares",
    "bitcoin price",
    "hello world",
    "gold",
    "Fe",
  ]) {
    assert.equal(slot.trigger(query), false, query);
    assert.deepEqual(
      await slot.execute(query, { tab: "all", results: [], fetch: noFetch }),
      { html: "" },
      query,
    );
  }

  for (const query of [
    "msft stock",
    "aapl stock",
    "nvda shares",
    "apple stock",
    "ford stock",
    "home depot stock",
    "DAY stock",
    "$day",
    "!stock day",
  ]) {
    assert.equal(slot.trigger(query), true, query);
  }
});

test("renders the card without a change figure when there is no previous close", async () => {
  await slot.init({
    template: await readFile(new URL("./template.html", import.meta.url), "utf8"),
  });
  const output = await slot.execute("$NEWCO", {
    tab: "all",
    results: [],
    fetch: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/v1/finance/search")) {
        return Response.json({
          quotes: [{
            symbol: "NEWCO",
            quoteType: "EQUITY",
            shortname: "NewCo Inc",
            exchange: "NMS",
          }],
        });
      }
      if (parsed.pathname.endsWith("/v7/finance/quote")) {
        return new Response("{}", { status: 401 });
      }
      if (parsed.pathname.includes("/v8/finance/chart/")) {
        return Response.json({
          chart: {
            result: [{
              meta: {
                symbol: "NEWCO",
                instrumentType: "EQUITY",
                regularMarketPrice: 12,
                currency: "USD",
              },
              timestamp: [1, 2, 3],
              indicators: { quote: [{ close: [10, 11, 12] }] },
            }],
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  assert.match(output.html, /stocks-card/);
  assert.match(output.html, />NEWCO</);
  assert.match(output.html, /<div class="stocks-change"><\/div>/);
  assert.equal(output.html.match(/class="stocks-chart-stat"/g)?.length, 3);
  assert.doesNotMatch(output.html, /NaN|null%|undefined/);
});

test("chart layout follows its panel and stays readable on narrow cards", async () => {
  const [template, css, script] = await Promise.all(
    ["template.html", "style.css", "card.js"].map((file) =>
      readFile(new URL(`./${file}`, import.meta.url), "utf8"),
    ),
  );

  assert.ok(
    template.indexOf('class="stocks-header-row"') <
      template.indexOf('class="stocks-chart stocks-chart-{{trend}}"') &&
      template.indexOf('class="stocks-chart stocks-chart-{{trend}}"') <
        template.indexOf('class="stocks-details"'),
    "narrow cards show the chart before the detail tiles",
  );
  const wide = css.slice(css.indexOf("@container (min-width: 760px)"));
  assert.match(wide, /grid-template-areas:\s*"header chart"\s*"details chart"/);
  assert.match(wide, /\.stocks-chart-body \{[^}]*flex: 1 1 auto/);
  assert.match(css, /\.stocks-chart-periods \{[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/s);
  assert.match(css, /\.stocks-sparkline \{[^}]*position: absolute/s);
  assert.match(script, /new ResizeObserver\(/);
  assert.match(script, /_stocksResizeObserver\?\.disconnect\(\)/);
  assert.doesNotMatch(script, /addEventListener\("resize"/);
});
