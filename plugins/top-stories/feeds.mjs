// News feed fetching, parsing and story selection for Top Stories.
// Bing News RSS is the primary source because it carries thumbnails; Google
// News RSS fills thin Bing feeds (it has no images, and its links go through
// news.google.com).

const USER_AGENT =
  "degoog-toolkit/1.0 (https://github.com/SoPat712/degoog-toolkit)";
const BING_ORIGIN = "https://www.bing.com";
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 270;
// Clock skew allowance for feeds that stamp stories slightly in the future.
const FUTURE_SKEW_MS = 10 * 60_000;
const DUPLICATE_SIMILARITY = 0.6;
const TITLE_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "of", "on", "or", "over", "says", "the", "to", "was",
  "were", "will", "with",
]);
// Bing News markets for a bare language tag ("de" rather than "de-DE").
const DEFAULT_REGIONS = {
  de: "de", en: "us", es: "es", fr: "fr", it: "it", ja: "jp", ko: "kr",
  nl: "nl", pl: "pl", pt: "br", ru: "ru", sv: "se", tr: "tr", uk: "ua", zh: "cn",
};

const NAMED_ENTITIES = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
};

export function decodeEntities(value) {
  return String(value ?? "").replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity) => {
      if (entity[0] === "#") {
        const code = entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function tagText(block, name) {
  const match = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
  );
  if (!match) return "";
  const raw = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(raw).replace(/\s+/g, " ").trim();
}

function tagAttribute(block, name, attribute) {
  const open = block.match(new RegExp(`<${name}\\s[^>]*>`, "i"))?.[0] || "";
  const value = open.match(new RegExp(`\\s${attribute}\\s*=\\s*"([^"]*)"`, "i"));
  return value ? decodeEntities(value[1]).trim() : "";
}

function rssItems(xml) {
  return String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function publishedAt(item) {
  const time = Date.parse(tagText(item, "pubDate"));
  return Number.isFinite(time) ? time : 0;
}

// Bing wraps most links in an apiclick.aspx redirect; the article is in `url`.
export function bingArticleUrl(link) {
  try {
    const url = new URL(link);
    if (/(^|\.)bing\.com$/i.test(url.hostname) && /apiclick/i.test(url.pathname)) {
      return safeHttpUrl(url.searchParams.get("url"));
    }
  } catch {
    return "";
  }
  return safeHttpUrl(link);
}

// <News:Image> may be absolute or a bare "/th?id=…" path. <News:ImageSize> is a
// query template ("w={0}&h={1}&c=14") that asks Bing for a cropped thumbnail.
export function bingImageUrl(raw, sizeTemplate = "") {
  if (!raw) return "";
  try {
    const url = new URL(raw, BING_ORIGIN);
    if (/(^|\.)bing\.com$/i.test(url.hostname)) url.protocol = "https:";
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const sizing = /\{0\}/.test(sizeTemplate) && /\{1\}/.test(sizeTemplate)
      ? sizeTemplate.replace("{0}", THUMB_WIDTH).replace("{1}", THUMB_HEIGHT)
      : `w=${THUMB_WIDTH}&h=${THUMB_HEIGHT}&c=14`;
    for (const [key, value] of new URLSearchParams(sizing)) {
      url.searchParams.set(key, value);
    }
    return url.href;
  } catch {
    return "";
  }
}

export function parseBingRss(xml) {
  return rssItems(xml)
    .map((item) => ({
      title: tagText(item, "title"),
      url: bingArticleUrl(tagText(item, "link")),
      source: tagText(item, "News:Source"),
      sourceUrl: "",
      image: bingImageUrl(tagText(item, "News:Image"), tagText(item, "News:ImageSize")),
      published: publishedAt(item),
      provider: "bing",
    }))
    .filter((story) => story.title && story.url);
}

export function parseGoogleRss(xml) {
  return rssItems(xml)
    .map((item) => {
      const source = tagText(item, "source");
      let title = tagText(item, "title");
      // Google appends " - Publisher" to every headline.
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -(source.length + 3)).trim();
      }
      return {
        title,
        url: safeHttpUrl(tagText(item, "link")),
        source,
        sourceUrl: safeHttpUrl(tagAttribute(item, "source", "url")),
        image: "",
        published: publishedAt(item),
        provider: "google",
      };
    })
    .filter((story) => story.title && story.url);
}

// Maps a browser locale to Bing and Google News market parameters.
export function newsMarket(locale) {
  const match = String(locale || "").match(/^([a-z]{2,3})(?:[-_]([a-z]{2}))?/i);
  const language = match ? match[1].toLowerCase() : "en";
  const region = (match?.[2] || DEFAULT_REGIONS[language] || "").toLowerCase();
  if (!region) return { bing: "en-us", language: "en", region: "US" };
  return { bing: `${language}-${region}`, language, region: region.toUpperCase() };
}

// `freshWithinHours` asks Bing for its date-filtered feed (past day or past
// week). That feed only holds recent stories, so it is useless for judging
// newsworthiness but good for filling the carousel.
export function bingFeedUrl(query, market, freshWithinHours = 0) {
  const params = new URLSearchParams({ q: query, format: "rss", mkt: market.bing });
  if (freshWithinHours > 0) {
    params.set("qft", `interval="${freshWithinHours <= 24 ? 7 : 8}"`);
  }
  return `${BING_ORIGIN}/news/search?${params}`;
}

export function googleFeedUrl(query, market) {
  const params = new URLSearchParams({
    q: query,
    hl: market.language === "en" ? `en-${market.region}` : market.language,
    gl: market.region,
    ceid: `${market.region}:${market.language}`,
  });
  return `https://news.google.com/rss/search?${params}`;
}

export async function fetchFeed(url, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.5",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`News feed returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export const isFresh = (story, now, windowMs) =>
  story.published > 0 &&
  story.published <= now + FUTURE_SKEW_MS &&
  now - story.published <= windowMs;

// Share of a relevance-ranked feed that is fresh. Evergreen topics ("python",
// "chocolate chip cookies") still have a few fresh articles, but the feed's top
// stays dominated by old ones; newsworthy topics are mostly fresh at the top.
export function freshShare(stories, now, windowMs, sample = 20) {
  const ranked = stories.slice(0, sample);
  if (!ranked.length) return 0;
  return ranked.filter((story) => isFresh(story, now, windowMs)).length / ranked.length;
}

const headlineWord = (word) => word.toLowerCase().replace(/['’]s$/, "").replace(/s$/, "");

// A lone search word is either a name ("NASA", "Ukraine", "iPhone") or an
// everyday word ("coffee", "temporary"). News search finds fresh headlines for
// both, but only names stay capitalized mid-sentence. Title Case headlines
// capitalize everything, so only sentence-case headlines count.
export function looksLikeName(word, stories) {
  const target = headlineWord(word);
  let named = 0;
  let plain = 0;
  for (const story of stories) {
    const words = String(story.title).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
    const long = words.filter((value) => value.length > 3);
    const capitals = long.filter((value) => /^\p{Lu}/u.test(value)).length;
    if (!long.length || capitals / long.length > 0.5) continue;
    words.forEach((value, index) => {
      if (index === 0 || headlineWord(value) !== target) return;
      if (/\p{Lu}/u.test(value)) named += 1;
      else plain += 1;
    });
  }
  return named >= 2 && named >= plain * 3;
}

function titleTokens(title) {
  return new Set(
    String(title)
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 1 && !TITLE_STOPWORDS.has(word)) || [],
  );
}

export function similarTitles(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  // A syndicated rewrite often adds words, so containment also counts.
  return shared / union >= DUPLICATE_SIMILARITY ||
    shared / Math.min(left.size, right.size) >= 0.85;
}

function urlKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

// Fresh stories in feed order, near-duplicate headlines removed. Earlier feeds
// win, so Bing stories (which have thumbnails) beat Google copies.
export function selectStories(feeds, { now, windowMs, max }) {
  const picked = [];
  const urls = new Set();
  for (const story of feeds.flat()) {
    if (picked.length >= max) break;
    if (!isFresh(story, now, windowMs)) continue;
    const key = urlKey(story.url);
    if (urls.has(key)) continue;
    if (picked.some((kept) => similarTitles(kept.title, story.title))) continue;
    urls.add(key);
    picked.push(story);
  }
  return picked;
}
