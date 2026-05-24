let template = "";
let externalFetch = (...args) => fetch(...args);
let cache = null;

const PLUGIN_NAME = "Reddit";
const PLUGIN_DESCRIPTION =
  "Shows a relevant Reddit post and top comments for Reddit-focused searches.";
const REDDIT_USER_AGENT =
  "degoog-toolkit-reddit-slot/1.0 (server-side search slot)";
const SEARCH_LIMIT = 12;
const COMMENT_FETCH_LIMIT = 18;
const CACHE_TTL_MS = 5 * 60 * 1000;

const settingsState = {
  showMode: "always",
  maxComments: 2,
  filterNsfw: true,
  minScore: 1,
  restrictSubreddit: "",
};

const SHOW_MODES = new Set([
  "always",
  "reddit-only",
  "keyword-or-results",
  "results",
]);
const COMMAND_PREFIX_RX = /^!reddit\b\s*/i;
const NON_REDDIT_QUERY_RX =
  /\b(weather|forecast|погода|метео|temperature|humidity|wind|rain|snow)\b/i;
const REDDIT_INTENT_RX =
  /\b(?:reddit|subreddit|redd\.it|reddit\.com)\b|(?:^|[\s/(])r\/[A-Za-z0-9_]{2,21}\b|site:(?:www\.)?(?:old\.|new\.)?reddit\.com\b/i;
const REDDIT_URL_RX =
  /(?:https?:\/\/)?(?:(?:www|old|new)\.)?reddit\.com\/[^\s<>"')]+|(?:https?:\/\/)?redd\.it\/[A-Za-z0-9_]+/gi;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "best",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "reddit",
  "should",
  "site",
  "subreddit",
  "the",
  "this",
  "to",
  "vs",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export const slot = {
  id: "reddit-slot",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "at-a-glance", "knowledge-panel"],
  waitForResults: true,

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["always", "reddit-only", "keyword-or-results", "results"],
      default: "always",
      description:
        "always: show on most searches like the example plugin. reddit-only: only queries that mention Reddit. results: only when search results include Reddit URLs.",
    },
    {
      key: "maxComments",
      label: "Number of comments",
      type: "select",
      options: ["0", "1", "2", "3"],
      default: "2",
      description: "How many top comments to show.",
    },
    {
      key: "filterNsfw",
      label: "Hide 18+ posts",
      type: "toggle",
      default: true,
      description: "Skip posts marked as NSFW.",
    },
    {
      key: "minScore",
      label: "Minimum post score",
      type: "select",
      options: ["0", "1", "10", "100", "500"],
      default: "1",
      description: "Only show posts at or above this score.",
    },
    {
      key: "restrictSubreddit",
      label: "Search only in subreddit",
      type: "text",
      placeholder: "selfhosted",
      description: "Optional subreddit name. Do not include r/.",
    },
  ],

  init(ctx) {
    template = ctx?.template || "";
    if (typeof ctx?.fetch === "function") {
      externalFetch = (...args) => ctx.fetch(...args);
    }
    if (typeof ctx?.createCache === "function") {
      cache = ctx.createCache(CACHE_TTL_MS);
    }
  },

  configure(settings) {
    configureSettings(settings);
  },

  trigger(query) {
    const q = normalizeSpace(query);
    if (q.length < 3 || q.length > 240) return false;
    if (/^!\S+/.test(q) && !COMMAND_PREFIX_RX.test(q)) return false;
    if (COMMAND_PREFIX_RX.test(q) || hasRedditIntent(q)) return true;
    if (NON_REDDIT_QUERY_RX.test(q)) return false;
    return settingsState.showMode !== "reddit-only";
  },

  async execute(query, context) {
    return executeReddit(query, context, false);
  },
};

export const command = {
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  trigger: "reddit",
  isClientExposed: false,

  init(ctx) {
    slot.init(ctx);
  },

  async execute(args, context) {
    return executeReddit(args, context, true);
  },
};

export const slotPlugin = slot;
export default slot;

async function executeReddit(query, context, forceIntent) {
  if (context?.tab && context.tab !== "all") return { html: "" };

  const rawQuery = normalizeSpace(query);
  if (!rawQuery) return { html: "" };

  try {
    const queryHasIntent =
      Boolean(forceIntent) ||
      COMMAND_PREFIX_RX.test(rawQuery) ||
      hasRedditIntent(rawQuery);
    const resultHints = getRedditResultHints(context?.results);
    if (!shouldExecuteForMode(queryHasIntent, resultHints)) {
      return { html: "" };
    }

    const parsed = parseQuery(rawQuery, resultHints, queryHasIntent);
    const directPost = parsed.postHint
      ? await fetchPostFromHint(parsed.postHint, context)
      : null;

    let post = directPost?.post || null;
    let comments = directPost?.comments || [];

    if (!post && parsed.searchQuery) {
      const posts = await searchRedditPosts(
        parsed.searchQuery,
        parsed.subreddit,
        context,
      );
      post = pickBestPost(posts, parsed.searchQuery, resultHints);
    }

    if (!post || !isAllowedPost(post)) return { html: "" };

    if (settingsState.maxComments > 0 && comments.length === 0) {
      comments = await fetchTopComments(post, context);
    }

    const html = renderRedditCard(post, comments);
    return html ? { title: "", html } : { html: "" };
  } catch {
    return { html: "" };
  }
}

function configureSettings(settings) {
  let requestedMode = String(settings?.showMode || "").trim();
  if (requestedMode === "keyword") {
    requestedMode = "always";
  }
  settingsState.showMode = SHOW_MODES.has(requestedMode)
    ? requestedMode
    : "always";

  const comments = Number.parseInt(settings?.maxComments ?? "2", 10);
  settingsState.maxComments = Number.isFinite(comments)
    ? Math.max(0, Math.min(3, comments))
    : 2;

  settingsState.filterNsfw =
    settings?.filterNsfw !== false && settings?.filterNsfw !== "false";

  const minScore = Number.parseInt(settings?.minScore ?? "1", 10);
  settingsState.minScore = Number.isFinite(minScore)
    ? Math.max(0, minScore)
    : 1;

  settingsState.restrictSubreddit = normalizeSubreddit(
    settings?.restrictSubreddit || "",
  );
}

function shouldExecuteForMode(queryHasIntent, resultHints) {
  if (settingsState.showMode === "always") return true;
  if (settingsState.showMode === "reddit-only") return queryHasIntent;
  if (settingsState.showMode === "results") return resultHints.length > 0;
  return queryHasIntent || resultHints.length > 0;
}

function parseQuery(rawQuery, resultHints, queryHasIntent) {
  const queryPostHint = extractRedditUrls(rawQuery)
    .map(parseRedditUrl)
    .find((hint) => hint?.postId);
  const postHint = queryPostHint || resultHints.find((hint) => hint.postId);
  const explicitSubreddit = extractSubreddit(rawQuery);
  const resultSubreddit = queryHasIntent
    ? ""
    : resultHints.find((hint) => hint.subreddit)?.subreddit || "";
  const subreddit =
    settingsState.restrictSubreddit ||
    explicitSubreddit ||
    resultSubreddit;

  return {
    postHint,
    subreddit,
    searchQuery: buildSearchQuery(rawQuery),
  };
}

async function searchRedditPosts(searchQuery, subreddit, context) {
  if (!searchQuery || searchQuery.length < 2) return [];

  const params = new URLSearchParams({
    q: searchQuery,
    sort: "relevance",
    t: "all",
    limit: String(SEARCH_LIMIT),
    type: "link",
    raw_json: "1",
  });
  let url = `https://www.reddit.com/search.json?${params.toString()}`;
  if (subreddit) {
    params.set("restrict_sr", "1");
    url = `https://www.reddit.com/r/${encodeURIComponent(
      subreddit,
    )}/search.json?${params.toString()}`;
  }

  const data = await fetchJson(url, context);
  const children = data?.data?.children;
  if (!Array.isArray(children)) return [];
  return children
    .filter((child) => child?.kind === "t3")
    .map((child) => normalizePost(child.data))
    .filter(Boolean)
    .filter(isAllowedPost);
}

async function fetchPostFromHint(hint, context) {
  if (!hint?.postId) return null;
  const id = encodeURIComponent(hint.postId);
  const url = hint.subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(
        hint.subreddit,
      )}/comments/${id}.json?limit=${COMMENT_FETCH_LIMIT}&depth=1&sort=top&raw_json=1`
    : `https://www.reddit.com/comments/${id}.json?limit=${COMMENT_FETCH_LIMIT}&depth=1&sort=top&raw_json=1`;

  const data = await fetchJson(url, context);
  const postData = data?.[0]?.data?.children?.find(
    (child) => child?.kind === "t3",
  )?.data;
  const post = normalizePost(postData);
  if (!post || !isAllowedPost(post)) return null;
  return {
    post,
    comments: collectComments(data, settingsState.maxComments),
  };
}

async function fetchTopComments(post, context) {
  if (!post?.id || settingsState.maxComments <= 0) return [];

  const url = `https://www.reddit.com/r/${encodeURIComponent(
    post.subredditPlain,
  )}/comments/${encodeURIComponent(
    post.id,
  )}.json?limit=${COMMENT_FETCH_LIMIT}&depth=1&sort=top&raw_json=1`;

  const data = await fetchJson(url, context);
  return collectComments(data, settingsState.maxComments);
}

async function fetchJson(url, context) {
  const cached = cache?.get?.(url);
  if (cached !== undefined) return cached;

  const doFetch =
    typeof context?.fetch === "function"
      ? (...args) => context.fetch(...args)
      : externalFetch;
  const response = await doFetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": REDDIT_USER_AGENT,
    },
  });

  if (!response?.ok) return null;
  const data = await response.json();
  cache?.set?.(url, data, CACHE_TTL_MS);
  return data;
}

function pickBestPost(posts, searchQuery, resultHints) {
  if (!posts.length) return null;

  const terms = extractTerms(searchQuery);
  const hintedIds = new Set(resultHints.map((hint) => hint.postId).filter(Boolean));
  const hintedSubs = new Set(
    resultHints.map((hint) => hint.subreddit).filter(Boolean),
  );

  return posts
    .map((post, index) => ({
      post,
      score: scorePost(post, terms, hintedIds, hintedSubs) - index * 0.05,
    }))
    .sort((a, b) => b.score - a.score)[0]?.post;
}

function scorePost(post, terms, hintedIds, hintedSubs) {
  const title = post.title.toLowerCase();
  const body = post.selftext.toLowerCase();
  const subreddit = post.subredditPlain.toLowerCase();
  const combined = `${title} ${body} ${subreddit}`;
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 4;
    else if (combined.includes(term)) score += 1.5;
    if (subreddit.includes(term)) score += 1;
  }

  if (hintedIds.has(post.id)) score += 8;
  if (hintedSubs.has(post.subredditPlain.toLowerCase())) score += 1.5;
  if (post.stickied) score -= 2;
  score += Math.log10(Math.max(1, post.score) + 1) * 0.55;
  score += Math.log10(Math.max(1, post.commentCount) + 1) * 0.85;
  return score;
}

function normalizePost(data) {
  if (!data || typeof data !== "object") return null;

  const subredditPlain = normalizeSubreddit(data.subreddit || "");
  const permalink = data.permalink
    ? `https://www.reddit.com${data.permalink}`
    : "";

  return {
    id: String(data.id || ""),
    title: cleanText(data.title || ""),
    selftext: cleanText(data.selftext || ""),
    subreddit: data.subreddit_name_prefixed || (subredditPlain ? `r/${subredditPlain}` : ""),
    subredditPlain,
    url: safeRedditPermalink(permalink),
    score: toNumber(data.score),
    commentCount: toNumber(data.num_comments),
    createdUtc: toNumber(data.created_utc),
    over18: data.over_18 === true,
    stickied: data.stickied === true,
    removedByCategory: Boolean(data.removed_by_category),
  };
}

function isAllowedPost(post) {
  if (!post?.id || !post.title || !post.url) return false;
  if (post.removedByCategory) return false;
  if (/^\[(?:deleted|removed)\]$/i.test(post.title)) return false;
  if (settingsState.filterNsfw && post.over18) return false;
  return post.score >= settingsState.minScore;
}

function collectComments(data, limit) {
  if (limit <= 0) return [];
  const children = data?.[1]?.data?.children;
  if (!Array.isArray(children)) return [];

  return children
    .filter((child) => child?.kind === "t1")
    .map((child) => normalizeComment(child.data))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function normalizeComment(data) {
  if (!data || data.stickied) return null;
  const body = cleanText(data.body || "");
  if (!body || /^\[(?:deleted|removed)\]$/i.test(body)) return null;
  if (data.author === "AutoModerator") return null;

  const comment = {
    author: cleanUsername(data.author || "reddit"),
    body,
    score: toNumber(data.score),
    url: safeRedditUrl(
      data.permalink ? `https://www.reddit.com${data.permalink}` : "",
    ),
  };
  return comment.url ? comment : null;
}

function renderRedditCard(post, comments) {
  const commentsSection = renderComments(comments);
  const snippet = makePostSnippet(post);
  const htmlTemplate =
    template ||
    `<div class="rslot-wrap"><article class="rslot-card"><a class="rslot-post" href="{{post_url}}" target="_blank" rel="noopener noreferrer"><span class="rslot-title">{{post_title}}</span><span class="rslot-snippet">{{post_snippet}}</span></a>{{comments_section}}</article></div>`;

  return fillTemplate(htmlTemplate, {
    post_subreddit: esc(post.subreddit),
    post_age: esc(formatAge(post.createdUtc)),
    post_url: escAttr(post.url),
    post_title: esc(clamp(post.title, 150)),
    post_snippet: esc(snippet),
    post_score: esc(formatCount(post.score)),
    post_comments: esc(formatCount(post.commentCount)),
    comments_section: commentsSection,
  });
}

function renderComments(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return "";

  const cards = comments
    .map(
      (comment) => `<a class="rslot-comment" href="${escAttr(
        comment.url,
      )}" target="_blank" rel="noopener noreferrer">
        <span class="rslot-comment-meta">
          <span class="rslot-comment-author">u/${esc(comment.author)}</span>
          <span class="rslot-comment-score">${esc(formatCount(comment.score))} pts</span>
        </span>
        <p class="rslot-comment-body">${esc(clamp(comment.body, 240))}</p>
      </a>`,
    )
    .join("");

  return `<section class="rslot-comments" aria-label="Top Reddit comments">
    <div class="rslot-comments-title">Top comments</div>
    <div class="rslot-comment-list">${cards}</div>
  </section>`;
}

function makePostSnippet(post) {
  if (post.selftext && post.selftext.length > 20) {
    return clamp(post.selftext, 260);
  }
  return "";
}

function getRedditResultHints(results) {
  const hints = [];
  const seen = new Set();
  const visited = new WeakSet();

  function visit(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    for (const key of ["url", "link", "href", "sourceUrl"]) {
      if (typeof value[key] !== "string") continue;
      const hint = parseRedditUrl(value[key]);
      if (!hint) continue;
      const signature = `${hint.postId || ""}:${hint.subreddit || ""}:${hint.url}`;
      if (!seen.has(signature)) {
        seen.add(signature);
        hints.push(hint);
      }
    }

    for (const key of ["results", "items", "children"]) {
      if (value[key]) visit(value[key]);
    }
  }

  visit(results);
  return hints;
}

function parseRedditUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "redd.it") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id ? { url: normalized, postId: id.toLowerCase(), subreddit: "" } : null;
  }
  if (!host.endsWith("reddit.com")) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  let subreddit = "";
  let postId = "";
  const rIndex = parts.findIndex((part) => part.toLowerCase() === "r");
  if (rIndex >= 0 && parts[rIndex + 1]) {
    subreddit = normalizeSubreddit(parts[rIndex + 1]);
  }
  const commentsIndex = parts.findIndex(
    (part) => part.toLowerCase() === "comments",
  );
  if (commentsIndex >= 0 && parts[commentsIndex + 1]) {
    postId = parts[commentsIndex + 1].toLowerCase();
  }

  if (!subreddit && !postId) return null;
  return { url: normalized, postId, subreddit };
}

function extractRedditUrls(text) {
  return [...String(text || "").matchAll(REDDIT_URL_RX)].map((match) =>
    normalizeUrl(match[0]),
  );
}

function extractSubreddit(text) {
  const value = String(text || "");
  for (const url of extractRedditUrls(value)) {
    const hint = parseRedditUrl(url);
    if (hint?.subreddit) return hint.subreddit;
  }

  const subredditMatch =
    value.match(/\bsubreddit[:=]\s*([A-Za-z0-9_]{2,21})\b/i) ||
    value.match(/(?:^|[\s/(])r\/([A-Za-z0-9_]{2,21})(?=$|[\s/),.?:;])/i) ||
    value.match(/site:(?:www\.)?(?:old\.|new\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,21})\b/i);
  return normalizeSubreddit(subredditMatch?.[1] || "");
}

function buildSearchQuery(rawQuery) {
  return normalizeSpace(
    String(rawQuery || "")
      .replace(COMMAND_PREFIX_RX, " ")
      .replace(REDDIT_URL_RX, " ")
      .replace(/site:(?:www\.)?(?:old\.|new\.)?reddit\.com(?:\/r\/[A-Za-z0-9_]+)?\b/gi, " ")
      .replace(/site:redd\.it\b/gi, " ")
      .replace(/\b(?:on|from|in)\s+reddit\b/gi, " ")
      .replace(/\bsubreddit[:=]\s*[A-Za-z0-9_]{2,21}\b/gi, " ")
      .replace(/(?:^|[\s/(])r\/[A-Za-z0-9_]{2,21}(?=$|[\s/),.?:;])/gi, " ")
      .replace(/\b(?:reddit\.com|redd\.it|reddit|subreddit)\b/gi, " "),
  );
}

function hasRedditIntent(query) {
  return REDDIT_INTENT_RX.test(String(query || ""));
}

function extractTerms(query) {
  return normalizeSpace(query)
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function cleanText(value) {
  return decodeBasicEntities(String(value || ""))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUsername(value) {
  return (
    String(value || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 32) || "reddit"
  );
}

function decodeBasicEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'");
}

function fillTemplate(html, values) {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.split(`{{${key}}}`).join(String(value)),
    html,
  );
}

function normalizeUrl(value) {
  const trimmed = String(value || "")
    .trim()
    .replace(/[),.;]+$/g, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function safeRedditUrl(value) {
  const normalized = normalizeUrl(value);
  if (!parseRedditUrl(normalized)) return "";
  return normalized.replace(/^http:\/\//i, "https://");
}

function safeRedditPermalink(value) {
  const hint = parseRedditUrl(value);
  if (!hint) return "";
  if (hint.postId && hint.subreddit) {
    return `https://www.reddit.com/r/${encodeURIComponent(
      hint.subreddit,
    )}/comments/${encodeURIComponent(hint.postId)}/`;
  }
  if (hint.postId) {
    return `https://www.reddit.com/comments/${encodeURIComponent(hint.postId)}/`;
  }
  if (hint.subreddit) {
    return `https://www.reddit.com/r/${encodeURIComponent(hint.subreddit)}/`;
  }
  return "";
}

function normalizeSubreddit(value) {
  return String(value || "")
    .trim()
    .replace(/^\/?r\//i, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 21)
    .toLowerCase();
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatCount(value) {
  const number = Math.max(0, Math.round(toNumber(value)));
  if (number >= 1_000_000) return `${trimFixed(number / 1_000_000)}m`;
  if (number >= 1_000) return `${trimFixed(number / 1_000)}k`;
  return String(number);
}

function trimFixed(value) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}

function formatAge(createdUtc) {
  if (!createdUtc) return "";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - createdUtc));
  const units = [
    ["y", 365 * 24 * 60 * 60],
    ["mo", 30 * 24 * 60 * 60],
    ["d", 24 * 60 * 60],
    ["h", 60 * 60],
    ["m", 60],
  ];
  for (const [label, size] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  }
  return "just now";
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#096;");
}
