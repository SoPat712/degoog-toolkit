let template = "";
let maxComments = 2;
let filterNsfw = true;
let minScore = 1;
let restrictSubreddit = "";
let showMode = "keyword"; // "always" | "keyword" | "top10"
let pluginFetch = (...args) => fetch(...args);


const TriggerGuard = {
  // Checks if a query looks like physical unit conversion (e.g. "5m to km")
  isUnitConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const UNIT_CONV_RE = /^-?[\d][\d\s.,]*\s*\S.*?\b(?:to|into)\s+[a-z0-9°µ]{1,8}\s*$/i;
      return UNIT_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query looks like currency conversion (e.g. "100 usd to eur")
  isCurrencyConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const CURRENCY_CONV_RE = /^-?[\d][\d\s.,]*\s*[a-z]{3}\s+\b(?:to|into|in|=)\s+[a-z]{3}\s*$/i;
      return CURRENCY_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query is language translation
  isTranslation(q, lower) {
    return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) ||
           /how (do|would|can) you say\b/i.test(q);
  },

  // Checks if a query is a general non-financial tips article/advice (e.g. "gardening tips")
  isTipAdvice(q) {
    return /\b(tips?\s+(?:to|on\s+how|on|for|about|with|and|from|in)|(?:gardening|coding|interview|study|writing|clean|life|health|safety|cooking|travel|career|business)\s+tips?)\b/i.test(q);
  },

  // Checks if a query is a dice roll (e.g. "roll a 20 sided die", "d20")
  isDiceRoll(q) {
    return (
      /roll\s+(?:a\s+)?(?:die|dice)\b/i.test(q) ||
      /\bdice\s+roll\b/i.test(q) ||
      /\bdie\s+roll\b/i.test(q) ||
      /roll\s+d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q) ||
      /\b(d6|d20|d8|d10|d12|d100)\b/i.test(q) ||
      /\b\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q)
    );
  },

  // Checks if a query specifically targets a 20-sided die
  isD20Dice(q) {
    return /\bd20\b/i.test(q) || /\b20\s*-?\s*sided\b/i.test(q);
  },

  // Checks if a query is a utility tool (calculator, weather, timer, stocks, etc.)
  isUtility(q) {
    return /\b(weather|forecast|погода|метео|temperature|humidity|wind|rain|snow|translate|translation|convert|currency|calculator|calculate|math|stopwatch|timer|countdown|coinflip|coin-flip|yesno|yes-no|tip|tips|gratuity|gratuities|stocks?)\b/i.test(q);
  }
};

export const slot = {
  id: "reddit-slot",
  name: "Reddit",
  description: "Shows the top Reddit post and top comments above search results",
  position: "above-results",
  isClientExposed: false,
  waitForResults: true,

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["always", "keyword", "top10"],
      default: "keyword",
      description: "Always: shows for every search. Keyword: only when query contains 'reddit'. Top10: only when a Reddit link is in the top 10 search results.",
    },
    {
      key: "maxComments",
      label: "Number of comments",
      type: "select",
      options: ["1", "2", "3", "4"],
      description: "How many top comments to show side by side.",
    },
    {
      key: "filterNsfw",
      label: "Hide 18+ posts",
      type: "toggle",
      description: "Skip posts marked as NSFW.",
    },
    {
      key: "minScore",
      label: "Minimum post score",
      type: "select",
      options: ["1", "10", "100", "500", "1000"],
      description: "Only show posts with at least this many upvotes.",
    },
    {
      key: "restrictSubreddit",
      label: "Search only in subreddit",
      type: "text",
      placeholder: "e.g. AskReddit  (leave empty for all of Reddit)",
      description: "If set, searches only within this subreddit.",
    },
  ],

  init(ctx) {
    template = ctx.template;
    if (typeof ctx?.fetch === "function") {
      pluginFetch = (...args) => ctx.fetch(...args);
    }
  },

  configure(settings) {
    showMode = ["always", "keyword", "top10"].includes(settings?.showMode)
      ? settings.showMode
      : "keyword";

    const n = parseInt(settings?.maxComments ?? "2", 10);
    maxComments = Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 2;

    filterNsfw = settings?.filterNsfw !== false && settings?.filterNsfw !== "false";

    const ms = parseInt(settings?.minScore ?? "1", 10);
    minScore = Number.isFinite(ms) ? ms : 1;

    restrictSubreddit = (settings?.restrictSubreddit ?? "").trim().replace(/^r\//, "");
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    // Don't trigger on utility/conversion/calculation queries
    if (TriggerGuard.isUtility(q)) {
      return false;
    }
    if (showMode === "keyword") {
      return /\breddit\b/i.test(q);
    }
    return true;
  },

  async execute(query, context) {
    try {
      if (showMode === "top10") {
        const results = context?.results;
        if (!Array.isArray(results)) return { html: "" };
        const topResults = results.slice(0, 10);
        const hasReddit = topResults.some(r => {
          const url = typeof r?.url === "string" ? r.url : "";
          return url.includes("reddit.com");
        });
        if (!hasReddit) return { html: "" };
      }

      // Strip "reddit" keyword from the actual search query
      const cleanQuery = query.replace(/\breddit\b/gi, "").trim();
      const searchQuery = cleanQuery.length > 1 ? cleanQuery : query.trim();
      const encoded = encodeURIComponent(searchQuery);

      let searchUrl;
      if (restrictSubreddit) {
        searchUrl = `https://www.reddit.com/r/${encodeURIComponent(restrictSubreddit)}/search.json?q=${encoded}&sort=relevance&limit=10&type=link&restrict_sr=1`;
      } else {
        searchUrl = `https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=10&type=link`;
      }

      const doFetch =
        typeof context?.fetch === "function"
          ? (...args) => context.fetch(...args)
          : pluginFetch;

      const searchRes = await doFetch(searchUrl, {
        headers: { "User-Agent": "degoog-reddit-slot/1.0" },
      });

      if (!searchRes.ok) return { html: "" };

      const searchData = await searchRes.json();
      const posts = searchData?.data?.children;
      if (!posts || posts.length === 0) return { html: "" };

      const filtered = posts.filter((p) => {
        if (filterNsfw && p.data.over_18) return false;
        if (p.data.score < minScore) return false;
        return true;
      });

      if (filtered.length === 0) return { html: "" };

      const stopWords = new Set([
        "a","an","the","is","are","was","were","be","been","being",
        "have","has","had","do","does","did","will","would","could",
        "should","may","might","shall","can","need","dare","ought",
        "what","how","why","when","where","who","which","that","this",
        "i","you","he","she","we","they","it","me","him","her","us",
        "them","my","your","his","its","our","their","and","or","but",
        "if","in","on","at","to","for","of","with","by","from","about",
        "per","day","daily","each","every","normal","much","many","some",
      ]);

      const queryWords = searchQuery
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));

      const scored = filtered.map((p) => {
        const title = p.data.title.toLowerCase();
        const selftext = (p.data.selftext || "").toLowerCase().slice(0, 300);
        const combined = title + " " + selftext;
        let score = 0;
        for (const word of queryWords) {
          if (combined.includes(word)) score += title.includes(word) ? 2 : 1;
        }
        score += Math.min(p.data.num_comments / 5000, 0.5);
        return { data: p.data, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const post = scored[0].data;

      const commentsUrl = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.json?limit=15&depth=1&sort=top`;
      const commentsRes = await doFetch(commentsUrl, {
        headers: { "User-Agent": "degoog-reddit-slot/1.0" },
      });

      let comments = [];
      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        const rawComments = commentsData?.[1]?.data?.children || [];
        comments = rawComments
          .filter(
            (c) =>
              c.kind === "t1" &&
              c.data.body &&
              c.data.body !== "[deleted]" &&
              c.data.body !== "[removed]" &&
              !c.data.stickied &&
              c.data.score > 0
          )
          .sort((a, b) => b.data.score - a.data.score)
          .slice(0, maxComments)
          .map((c) => ({
            author: c.data.author,
            body: c.data.body.length > 180 ? c.data.body.slice(0, 177) + "…" : c.data.body,
            score: c.data.score,
            url: `https://reddit.com${c.data.permalink}`,
          }));
      }

      const postTitle = post.title.length > 100 ? post.title.slice(0, 97) + "…" : post.title;
      const postUrl = `https://reddit.com${post.permalink}`;
      const subreddit = post.subreddit_name_prefixed;
      const postScore = post.score >= 1000 ? (post.score / 1000).toFixed(1) + "k" : post.score;
      const numComments = post.num_comments >= 1000 ? (post.num_comments / 1000).toFixed(1) + "k" : post.num_comments;

      const commentCards = comments.map((c) => {
        const scoreStr = c.score >= 1000 ? (c.score / 1000).toFixed(1) + "k" : c.score;
        return `
          <a class="rslot-comment" href="${c.url}" target="_blank" rel="noopener noreferrer">
            <div class="rslot-comment-header">
              <span class="rslot-comment-author">u/${escapeHtml(c.author)}</span>
              <span class="rslot-comment-score">▲ ${scoreStr}</span>
            </div>
            <p class="rslot-comment-body">${escapeHtml(c.body)}</p>
          </a>`;
      }).join("");

      // 1 or 2 → two columns max; 3 or 4 → two rows of two
      const gridCols = comments.length === 1 ? "1fr" : "1fr 1fr";

      const html = template
        .replace("{{subreddit}}", escapeHtml(subreddit))
        .replace("{{post_title}}", escapeHtml(postTitle))
        .replace("{{post_url}}", postUrl)
        .replace("{{post_score}}", postScore)
        .replace("{{post_comments}}", numComments)
        .replace("{{post_subreddit}}", escapeHtml(subreddit))
        .replace("{{comment_cards}}", commentCards)
        .replace("{{grid_cols}}", gridCols);

      return { html };
    } catch (err) {
      return { html: "" };
    }
  },
};

export default slot;

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
