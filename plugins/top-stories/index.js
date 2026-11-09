import {
  bingFeedUrl,
  fetchFeed,
  freshShare,
  googleFeedUrl,
  isFresh,
  looksLikeName,
  newsMarket,
  parseBingRss,
  parseGoogleRss,
  safeHttpUrl,
  selectStories,
} from "./feeds.mjs";

let template = '<section class="tstories">{{STORIES}}</section>';
let pluginFetch = (...args) => fetch(...args);
let feedCache = null;
let proxyImage = null;
let proxyFavicon = null;
const pending = new Map();
const settings = { freshHours: 48, triggerMode: "auto", googleFallback: true };

const FEED_TTL_MS = 5 * 60_000;
const FAILED_FEED_TTL_MS = 60_000;
const FEED_TIMEOUT_MS = 2_500;
// All feeds together stay well inside core's 10 s slot timeout, so a slow news
// source never holds the other above-results slots for long.
const TOTAL_BUDGET_MS = 4_000;
const MIN_FETCH_MS = 300;
const MIN_STORIES = 3;
const MAX_STORIES = 8;
// Bing sometimes answers with only a couple of items, too few to judge by.
const THIN_FEED = 6;
const MIN_FRESH_SHARE = 0.5;
const FRESH_HOURS = ["12", "24", "48", "72"];

const BANG_RX = /(?:^|\s)![^\s!]/;
const URLISH_RX =
  /:\/\/|^www\.|@|\b[\w-]+\.(?:ai|app|co|com|dev|edu|gov|info|io|me|net|org|tv|uk|xyz)\b/i;
const CODE_OR_MATH_RX = /[=<>{}[\]\\|^`~;]|\d\s*[-+*/×÷^%]\s*\d|#[0-9a-f]{3,8}\b/i;
const NUMBER_RX = /^[$€£¥]?\d[\d.,]*[$€£¥%]?$/;
const YEAR_RX = /^(?:19|20)\d\d$/;
// "usd to eur", "all to try": currency and unit pairs belong to converters.
const CODE_PAIR_RX = /^[a-z]{3} (?:to|in|into) [a-z]{3}$/i;
// Explicit news wording. These queries skip the fresh-share check.
const NEWS_INTENT_RX =
  /\b(?:news|headlines?|breaking|latest|live updates?|press releases?)\b|^(?:what happened (?:to|with|in|at)|who won)\b/i;
// The same intent in the toolkit's other UI languages (JS \b is ASCII-only).
const NEWS_WORDS = new Set([
  "nachrichten", "schlagzeilen", "noticias", "titulares", "actualités", "actualites",
  "notizie", "notícias", "новости", "новини", "新闻", "新聞",
]);
const QUESTION_LEAD_RX =
  /^(?:how|what|whats|what's|why|when|where|which|who|whom|whose|is|are|was|were|can|could|should|would|will|do|does|did|define|translate|convert|calculate)\b/i;
// Reference, shopping, tool and media intents (plus queries other toolkit
// cards own) rarely want headlines, and fresh articles about them are noise.
const OFF_TOPIC_RX = new RegExp(
  `\\b(?:${[
    "how to", "tutorials?", "recipes?", "lyrics", "chords", "definition", "meaning",
    "synonyms?", "antonyms?", "translation", "pronunciation", "examples?", "templates?",
    "pdf", "docs", "documentation", "wiki", "wikipedia", "reddit", "login", "log in",
    "sign in", "sign up", "signup", "download", "install", "apk", "near me", "open now",
    "hours", "menu", "coupons?", "promo codes?", "prices?", "cost", "cheap", "cheapest",
    "buy", "for sale", "deals?", "reviews?", "vs", "versus", "calculator", "converter",
    "weather", "forecast", "time in", "timezone", "maps?", "directions", "quotes?",
    "ideas", "tips", "memes?", "pictures?", "pics?", "photos?", "images?",
    "wallpapers?", "logos?", "drawings?", "diagrams?", "videos?", "trailers?",
    "youtube", "showtimes", "jobs?", "salary", "careers", "tickets?", "crossword",
    "wordle", "cheats", "manual", "specs", "size chart", "days until", "countdown",
    "timer", "stopwatch", "speed ?test", "coin flip", "flip a coin", "metronome",
    "periodic table", "play", "snake game", "tic tac toe", "minesweeper", "discography",
    "albums?", "songs?", "books?", "novels?", "isbn", "movies?", "films?", "split",
    "tip", "random", "dice", "coin toss", "elements?", "atomic", "scores?", "standings",
    "schedule", "fixtures", "stocks?$", "share price", "time", "clock", "temperature",
    "in english", "origin", "etymology", "pronounce", "questions", "algorithm",
    "probability", "generator", "recommend",
  ].join("|")})\\b`,
  "i",
);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Decides whether a query may look for headlines. Returns null to stay silent,
// or { query, explicit } where explicit news wording bypasses the share check.
export function parseNewsQuery(query, mode = settings.triggerMode) {
  const text = String(query || "").replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 100) return null;
  const words = text.split(" ");
  if (words.length > 8) return null;
  if (BANG_RX.test(text) || URLISH_RX.test(text) || CODE_OR_MATH_RX.test(text)) return null;
  if (!/\p{L}/u.test(text) || CODE_PAIR_RX.test(text)) return null;
  // Amounts and measurements ("120$ split 4", "5 km in miles") are tool
  // queries; a year ("2026 elections") is not.
  const numbers = words.filter((word) => NUMBER_RX.test(word) && !YEAR_RX.test(word));
  if (numbers.length >= 2 || (numbers.length && words[0] === numbers[0])) return null;

  const explicit = NEWS_INTENT_RX.test(text) ||
    words.some((word) => NEWS_WORDS.has(word.toLowerCase())) ||
    /新闻|新聞/.test(text);
  if (explicit) return { query: text, explicit: true };
  if (mode === "explicit") return null;
  if (QUESTION_LEAD_RX.test(text) || OFF_TOPIC_RX.test(text)) return null;
  return { query: text, explicit: false };
}

function createCache(ctx) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache("ext:top-stories:feeds", FEED_TTL_MS);
  }
  return typeof ctx?.createCache === "function" ? ctx.createCache(FEED_TTL_MS) : null;
}

// feed: "bing" (relevance-ranked), "bing-fresh" (date-filtered) or "google".
async function loadFeed(feed, query, market, fetcher, { timeoutMs, freshHours }) {
  const key = `${feed}${feed === "bing-fresh" ? freshHours : ""}|${market.bing}|${query.toLowerCase()}`;
  const cached = feedCache ? await feedCache.get(key) : null;
  if (Array.isArray(cached)) return cached;
  if (pending.has(key)) return pending.get(key);

  const request = (async () => {
    try {
      const url = feed === "google"
        ? googleFeedUrl(query, market)
        : bingFeedUrl(query, market, feed === "bing-fresh" ? freshHours : 0);
      const xml = await fetchFeed(url, fetcher, timeoutMs);
      const stories = feed === "google" ? parseGoogleRss(xml) : parseBingRss(xml);
      if (feedCache) await feedCache.set(key, stories, FEED_TTL_MS);
      return stories;
    } catch {
      if (feedCache) await feedCache.set(key, [], FAILED_FEED_TTL_MS);
      return [];
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request;
}

// Applies the gates: at least MIN_STORIES fresh stories and, unless the query
// asked for news, a mostly fresh relevance-ranked feed. Bing decides alone when
// it clearly passes. Otherwise Google gives a second opinion: Bing's ranking
// sometimes buries fresh coverage ("openai"), and its feed is sometimes thin.
// A single word must also read as a name in the headlines, because everyday
// words ("coffee", "temporary") always have fresh news too.
export async function findStories(parsed, { fetcher, locale, now = Date.now() }) {
  const market = newsMarket(locale);
  const windowMs = settings.freshHours * 3_600_000;
  const started = Date.now();
  const load = async (feed) => {
    const timeoutMs = Math.min(FEED_TIMEOUT_MS, TOTAL_BUDGET_MS - (Date.now() - started));
    if (timeoutMs < MIN_FETCH_MS) return [];
    return loadFeed(feed, parsed.query, market, fetcher, {
      timeoutMs,
      freshHours: settings.freshHours,
    });
  };
  const select = (...feeds) => selectStories(feeds, { now, windowMs, max: MAX_STORIES });

  const bing = await load("bing");
  let google = null;
  if (!parsed.explicit) {
    let share = bing.length >= THIN_FEED ? freshShare(bing, now, windowMs) : 0;
    if (share < MIN_FRESH_SHARE && settings.googleFallback) {
      google = await load("google");
      share = Math.max(share, freshShare(google, now, windowMs));
    }
    if (share < MIN_FRESH_SHARE) return [];
  }

  // Bing's relevance feed is often thin even for busy topics. Its
  // date-filtered feed fills the row with fresh stories that, unlike Google's,
  // have thumbnails; Google stories go last.
  const singleWord = !parsed.explicit && !parsed.query.includes(" ");
  const fresh = singleWord || select(bing).length < MAX_STORIES ? await load("bing-fresh") : [];
  if (singleWord) {
    const recent = [bing, fresh, google || []].flat().filter((story) => isFresh(story, now, windowMs));
    if (!looksLikeName(parsed.query, recent)) return [];
  }
  if (!google && settings.googleFallback && select(bing, fresh).length < MIN_STORIES) {
    google = await load("google");
  }
  const stories = select(bing, fresh, google || []);
  return stories.length >= MIN_STORIES ? stories : [];
}

function relativeTime(published, now, locale) {
  const seconds = Math.max(0, Math.floor((now - published) / 1000));
  const [value, unit] = seconds < 3_600
    ? [Math.max(1, Math.floor(seconds / 60)), "minute"]
    : seconds < 86_400
      ? [Math.floor(seconds / 3_600), "hour"]
      : [Math.floor(seconds / 86_400), "day"];
  for (const tag of [locale, "en"]) {
    try {
      return new Intl.RelativeTimeFormat(tag || "en", { numeric: "always" }).format(-value, unit);
    } catch {
      // Invalid or unsupported locale tag; fall through to English.
    }
  }
  return "";
}

function signed(signer, url) {
  if (!signer || !url) return "";
  try {
    const value = signer(url);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function renderStory(story, { signImage, signFavicon, now, locale }) {
  const href = safeHttpUrl(story.url);
  if (!href) return "";
  const source = story.source || new URL(href).hostname.replace(/^www\./, "");
  const image = signed(signImage, story.image);
  const favicon = signed(signFavicon, story.sourceUrl || href);
  // The source initial is the placeholder for stories without a thumbnail,
  // and shows through if a thumbnail fails to load.
  const initial = `<span class="tstories__initial" aria-hidden="true">${escapeHtml(Array.from(source)[0]?.toUpperCase() || "")}</span>`;
  const thumb = `<span class="tstories__thumb">${initial}${
    image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : ""
  }</span>`;
  const icon = favicon
    ? `<img class="tstories__favicon" src="${escapeHtml(favicon)}" alt="" width="16" height="16" loading="lazy" decoding="async">`
    : "";
  return `<li class="tstories__item">
      <a class="tstories__card" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        ${thumb}
        <span class="tstories__body">
          <span class="tstories__source">${icon}<span class="tstories__source-name">${escapeHtml(source)}</span></span>
          <span class="tstories__headline">${escapeHtml(story.title)}</span>
          <time class="tstories__time" datetime="${new Date(story.published).toISOString()}">${escapeHtml(relativeTime(story.published, now, locale))}</time>
        </span>
      </a>
    </li>`;
}

export function renderStories(stories, context = {}, now = Date.now()) {
  const options = {
    signImage: typeof context.signProxyUrl === "function" ? context.signProxyUrl : proxyImage,
    signFavicon: typeof context.signFaviconUrl === "function" ? context.signFaviconUrl : proxyFavicon,
    now,
    locale: context.locale,
  };
  const items = stories.map((story) => renderStory(story, options)).filter(Boolean);
  return items.length >= MIN_STORIES ? template.replace("{{STORIES}}", items.join("")) : "";
}

export const slot = {
  id: "top-stories",
  name: "Top Stories",
  description: "Shows a carousel of fresh headlines for newsworthy searches.",
  position: "above-results",
  slotPositions: ["above-results", "below-results"],
  isClientExposed: false,
  settingsSchema: [
    {
      key: "freshHours",
      label: "Freshness window",
      type: "select",
      options: FRESH_HOURS,
      optionLabels: FRESH_HOURS.map((hours) => `${hours} hours`),
      default: "48",
      description:
        "Stories older than this are ignored. The carousel appears only when at least three stories are this fresh.",
    },
    {
      key: "triggerMode",
      label: "When to look for stories",
      type: "select",
      options: ["auto", "explicit"],
      optionLabels: ["Newsworthy searches", "Only searches that mention news"],
      default: "auto",
      description:
        "The first option sends short topic searches to Bing News and shows stories only when most of its results are fresh. The second option looks only when a search mentions news (for example news, headlines, breaking or latest).",
    },
    {
      key: "googleFallback",
      label: "Google News fallback",
      type: "toggle",
      default: "true",
      description:
        "Ask Google News when Bing returns too few stories. Google News stories have no thumbnails, and their links open through news.google.com.",
    },
  ],

  configure(values = {}) {
    const hours = String(values.freshHours ?? "48");
    settings.freshHours = FRESH_HOURS.includes(hours) ? Number(hours) : 48;
    settings.triggerMode = values.triggerMode === "explicit" ? "explicit" : "auto";
    settings.googleFallback = values.googleFallback !== false && values.googleFallback !== "false";
  },

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    if (typeof ctx?.fetch === "function") pluginFetch = (...args) => ctx.fetch(...args);
    feedCache = createCache(ctx);
    if (typeof ctx?.signProxyUrl === "function") proxyImage = (url) => ctx.signProxyUrl(url);
    if (typeof ctx?.signFaviconUrl === "function") proxyFavicon = (url) => ctx.signFaviconUrl(url);
  },

  trigger(query) {
    return Boolean(parseNewsQuery(query));
  },

  async execute(query, context = {}) {
    const parsed = parseNewsQuery(query);
    if (!parsed) return { html: "" };
    try {
      if (!feedCache) feedCache = createCache(context);
      const fetcher = typeof context.fetch === "function"
        ? (...args) => context.fetch(...args)
        : pluginFetch;
      const now = Date.now();
      const stories = await findStories(parsed, { fetcher, locale: context.locale, now });
      return { title: "", html: stories.length ? renderStories(stories, context, now) : "" };
    } catch {
      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
