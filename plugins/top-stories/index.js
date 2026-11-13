// Top Stories: Google's "Top stories" block for newsworthy searches. The slot
// only decides cheaply whether a query may want headlines and renders a hidden
// placeholder; card.js fills it from the instance's own news engines through
// same-origin /api/search once the web results are on screen, so the block
// never holds back results.

let template = '<section class="tstories" data-slot-bare data-tstories-query="{{QUERY}}" hidden></section>';
let searchTypes = null;
let typesCache = { at: 0, types: null };
const settings = { freshHours: 48, triggerMode: "auto" };

const FRESH_HOURS = ["12", "24", "48", "72"];
const TYPES_TTL_MS = 60_000;

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
// Questions still look for news; card.js holds them to a stricter test.
const QUESTION_LEAD_RX =
  /^(?:how|what|whats|what's|why|when|where|which|who|whom|whose|is|are|was|were|can|could|should|would|will|do|does|did)\b/i;
const TOOL_LEAD_RX = /^(?:define|translate|convert|calculate)\b/i;
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
// or { query, explicit, question } where explicit news wording bypasses the
// share check and a question has to show that its own news is fresh.
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
  if (explicit) return { query: text, explicit: true, question: false };
  if (mode === "explicit") return null;
  if (TOOL_LEAD_RX.test(text) || OFF_TOPIC_RX.test(text)) return null;
  return { query: text, explicit: false, question: QUESTION_LEAD_RX.test(text) };
}

// Installed search types, so the block never asks a news tab with no engines.
async function installedTypes() {
  if (!searchTypes) return null;
  if (typesCache.types && Date.now() - typesCache.at < TYPES_TTL_MS) return typesCache.types;
  try {
    const types = await searchTypes();
    typesCache = { at: Date.now(), types: Array.isArray(types) ? types : null };
  } catch {
    typesCache = { at: Date.now(), types: null };
  }
  return typesCache.types;
}

// The hidden placeholder card.js fills. Function replacements keep "$&" and
// similar sequences in a query literal.
export function renderPlaceholder(parsed, locale = "") {
  const values = {
    QUERY: escapeHtml(parsed.query),
    HOURS: String(settings.freshHours),
    EXPLICIT: parsed.explicit ? "1" : "0",
    QUESTION: parsed.question ? "1" : "0",
    LOCALE: escapeHtml(String(locale || "").slice(0, 35)),
    NEWS_HREF: escapeHtml(`search?${new URLSearchParams({ q: parsed.query, type: "news" })}`),
  };
  return template.replace(/\{\{(QUERY|HOURS|EXPLICIT|QUESTION|LOCALE|NEWS_HREF)\}\}/g, (_, key) => values[key]);
}

export const slot = {
  id: "top-stories",
  name: "Top Stories",
  description: "Shows Google-style top stories from your news engines for newsworthy searches.",
  position: "above-results",
  slotPositions: ["above-results", "full-width-above-results", "below-results"],
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
        "Stories older than this are ignored. Top stories appear only when at least three stories are this fresh.",
    },
    {
      key: "triggerMode",
      label: "When to look for stories",
      type: "select",
      options: ["auto", "explicit"],
      optionLabels: ["Newsworthy searches", "Only searches that mention news"],
      default: "auto",
      description:
        "The first option runs short topic searches on your news engines and shows stories only when most results are fresh. The second option looks only when a search mentions news (for example news, headlines, breaking or latest).",
    },
  ],

  configure(values = {}) {
    const hours = String(values.freshHours ?? "48");
    settings.freshHours = FRESH_HOURS.includes(hours) ? Number(hours) : 48;
    settings.triggerMode = values.triggerMode === "explicit" ? "explicit" : "auto";
  },

  init(ctx) {
    if (ctx?.template) template = ctx.template;
    searchTypes = typeof ctx?.searchTypes === "function" ? () => ctx.searchTypes() : null;
    typesCache = { at: 0, types: null };
  },

  trigger(query) {
    return Boolean(parseNewsQuery(query));
  },

  async execute(query, context = {}) {
    try {
      const parsed = parseNewsQuery(query);
      if (!parsed) return { html: "" };
      const installed = await installedTypes();
      if (installed && !installed.includes("news")) return { html: "" };
      return { title: "", html: renderPlaceholder(parsed, context.locale) };
    } catch {
      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;
