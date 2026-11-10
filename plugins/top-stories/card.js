// Top Stories runtime. The slot renders a hidden placeholder; this fills it
// from the instance's own news engines through same-origin /api/search once
// the web results are on screen, or removes it when the news is not fresh.
// Thumbnails and favicons come back as core's signed /api/proxy URLs, so the
// browser never contacts a news site directly.
(function () {
  "use strict";

  const ROOT = ".tstories";
  const READY_EVENT = "degoog-results-ready";
  // Start anyway if core never announces results (they may have rendered
  // before this script loaded).
  const SETTLE_FALLBACK_MS = 1500;
  const FETCH_TIMEOUT_MS = 12_000;
  const CACHE_LIMIT = 12;
  const MIN_STORIES = 3;
  const MAX_LIST = 3;
  // The news search must be mostly fresh at the top unless the query asked
  // for news: evergreen topics ("python") always have a few fresh articles.
  const MIN_FRESH_SHARE = 0.5;
  const SHARE_SAMPLE = 20;
  const THIN_RESULTS = 6;
  const DAY_MS = 86_400_000;
  const FUTURE_SKEW_MS = 10 * 60_000;
  const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "its", "of", "on", "or", "over", "says", "the", "to", "was",
    "were", "will", "with",
  ]);
  const DATE_ONLY_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

  // ── Story selection: pure functions, tested in node ───────────────────────

  function safeLink(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  // Core keeps publish dates as "YYYY-MM-DD". Noon UTC is the day's midpoint;
  // a story dated today never counts as being from the future.
  function publishedTime(value, now) {
    const text = String(value || "").trim();
    const day = text.match(DATE_ONLY_RX);
    if (day) {
      const noon = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
      return Number.isFinite(noon) && noon - now < DAY_MS ? Math.min(noon, now) : 0;
    }
    const time = Date.parse(text);
    return Number.isFinite(time) && time <= now + FUTURE_SKEW_MS ? Math.min(time, now) : 0;
  }

  const isFresh = (story, now, windowMs) => story.published > 0 && now - story.published <= windowMs;

  function freshShare(stories, now, windowMs) {
    const ranked = stories.slice(0, SHARE_SAMPLE);
    if (!ranked.length) return 0;
    return ranked.filter((story) => isFresh(story, now, windowMs)).length / ranked.length;
  }

  const headlineWord = (word) => word.toLowerCase().replace(/['’]s$/, "").replace(/s$/, "");

  // A lone search word is either a name ("NASA", "Ukraine") or an everyday
  // word ("coffee"). Both have fresh news, but only names stay capitalized
  // mid-sentence. Title Case headlines capitalize everything, so only
  // sentence-case headlines count.
  function looksLikeName(word, stories) {
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
        ?.filter((word) => word.length > 1 && !STOPWORDS.has(word)) || [],
    );
  }

  function similarTitles(a, b) {
    const left = titleTokens(a);
    const right = titleTokens(b);
    if (!left.size || !right.size) return false;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared += 1;
    // A syndicated rewrite often adds words, so containment also counts.
    return shared / (left.size + right.size - shared) >= 0.6 ||
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

  // Results list both the engines that found a story and, from news engines,
  // its publisher. Engine labels ("Brave", "SearXNG:brave.news",
  // "RSS News · NYT") are skipped; the address names the rest.
  function publisherName(result, engines, href) {
    const isEngine = (name) =>
      engines.some((engine) =>
        name === engine || name.startsWith(`${engine} ·`) || name.startsWith(`${engine.split(" ")[0]}:`));
    const names = Array.isArray(result.sources) ? result.sources : [result.source];
    for (const value of names) {
      const name = typeof value === "string" ? value.trim() : "";
      if (name && name.length <= 60 && !isEngine(name)) return name;
    }
    return hostname(href);
  }

  // Headlines often end with the publisher ("… - The New York Times",
  // "… | Fortune"). Google drops that tail, so it goes when it names the
  // publisher or the site, including by initials ("NYT" for nytimes.com).
  function stripPublisher(title, source, href) {
    const match = title.match(/^(.{12,}?)\s+[-–—|]\s+([^-–—|]{2,40})$/);
    if (!match || match[2].trim().split(/\s+/).length > 5) return title;
    const squash = (text) => String(text).toLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}]/gu, "");
    const tail = squash(match[2]);
    const initials = match[2].trim().split(/\s+/)
      .filter((word) => !/^(?:the|of|and)$/i.test(word))
      .map((word) => word[0])
      .join("")
      .toLowerCase();
    const labels = hostname(href).split(".").slice(0, -1).filter((label) => label.length > 2);
    const names = [squash(source), ...labels].filter((name) => name.length > 2);
    const named = names.some((name) =>
      tail.startsWith(name) || name.includes(tail) || (initials.length > 1 && name.startsWith(initials)));
    return named ? match[1].trim() : title;
  }

  // `proxied` keeps only same-origin signed proxy URLs; the page supplies it.
  function toStory(result, engines, proxied, now) {
    if (!result || typeof result !== "object") return null;
    const href = safeLink(result.url);
    const rawTitle = String(result.title || "").replace(/\s+/g, " ").trim();
    if (!href || !rawTitle) return null;
    const source = publisherName(result, engines, href);
    const thumb = proxied(result.thumbnail) || proxied(result.imageUrl);
    return {
      title: stripPublisher(rawTitle, source, href),
      url: href,
      source,
      published: publishedTime(result.publishedAt, now),
      dateOnly: DATE_ONLY_RX.test(String(result.publishedAt || "").trim()),
      // The featured story shows a large image; imageUrl is usually bigger.
      image: proxied(result.imageUrl) || thumb,
      thumb,
      favicon: proxied(result.favicon),
    };
  }

  // Applies the gates and picks a featured story plus a short list, or
  // returns null. Explicit news searches skip the share and name checks.
  function pickStories(results, { query, explicit, windowMs, engines = [], proxied, now }) {
    const ranked = (Array.isArray(results) ? results : [])
      .map((result) => toStory(result, engines, proxied, now))
      .filter(Boolean);
    if (!explicit) {
      const share = ranked.length >= THIN_RESULTS ? freshShare(ranked, now, windowMs) : 0;
      if (share < MIN_FRESH_SHARE) return null;
      const fresh = ranked.filter((story) => isFresh(story, now, windowMs));
      if (!query.includes(" ") && !looksLikeName(query, fresh)) return null;
    }
    const picked = [];
    const urls = new Set();
    for (const story of ranked) {
      if (picked.length >= MAX_LIST + 3) break;
      if (!isFresh(story, now, windowMs) || urls.has(urlKey(story.url))) continue;
      if (picked.some((kept) => similarTitles(kept.title, story.title))) continue;
      urls.add(urlKey(story.url));
      picked.push(story);
    }
    if (picked.length < MIN_STORIES) return null;
    return { ...splitLead(picked), pool: picked };
  }

  // Google's featured story always has a picture. With none to show, every
  // story goes in the list instead of a text-only lead beside it.
  function splitLead(pool) {
    const lead = pool.find((story) => story.image);
    if (!lead) return { lead: null, list: pool.slice(0, MAX_LIST + 1) };
    return { lead, list: pool.filter((story) => story !== lead).slice(0, MAX_LIST) };
  }

  function relativeTime(story, now, locale) {
    let value;
    let unit;
    if (story.dateOnly) {
      // Whole days, so "today" and "yesterday" rather than a made-up hour.
      value = Math.min(0, Math.floor(story.published / DAY_MS) - Math.floor(now / DAY_MS));
      unit = "day";
    } else {
      const minutes = Math.max(1, Math.floor((now - story.published) / 60_000));
      [value, unit] = minutes < 60 ? [-minutes, "minute"]
        : minutes < 1440 ? [-Math.floor(minutes / 60), "hour"]
          : [-Math.floor(minutes / 1440), "day"];
    }
    for (const tag of [locale, undefined]) {
      try {
        const text = new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(value, unit);
        return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1);
      } catch {
        // Invalid or unsupported locale tag; fall back to the browser's.
      }
    }
    return "";
  }

  const stories = {
    publishedTime, isFresh, freshShare, looksLikeName, similarTitles, publisherName, stripPublisher,
    pickStories, splitLead, relativeTime,
  };

  // ── Page ──────────────────────────────────────────────────────────────────

  const handled = new WeakSet();
  const shown = new WeakMap();
  const newsCache = new Map();
  let stylesheet = null;

  function basePath() {
    const value = window.__DEGOOG_BASE_URL__;
    return typeof value === "string" ? value.replace(/\/+$/, "") : "";
  }

  function authHeaders() {
    const auth = window.__DEGOOG_SEARCH_AUTH__;
    return auth && auth.n && auth.s ? { "x-search-nonce": auth.n, "x-search-sig": auth.s } : {};
  }

  // Signed same-origin proxy URLs only; core cannot proxy data: URIs.
  function proxied(url) {
    if (typeof url !== "string" || !url) return "";
    try {
      const parsed = new URL(url, location.href);
      const target = parsed.searchParams.get("url") || "";
      return parsed.origin === location.origin &&
        parsed.pathname.startsWith(`${basePath()}/api/proxy/`) &&
        !/^data:/i.test(target)
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  // The block's styles load with it, so they cost nothing on other pages.
  function loadStyles() {
    if (!stylesheet) {
      stylesheet = new Promise((resolve, reject) => {
        if (typeof __PLUGIN_ID__ !== "string") {
          reject(new Error("unknown plugin folder"));
          return;
        }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `${basePath()}/plugins/${encodeURIComponent(__PLUGIN_ID__)}/card.css`;
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => {
          link.remove();
          stylesheet = null;
          reject(new Error("styles failed to load"));
        }, { once: true });
        document.head.append(link);
      });
    }
    return stylesheet;
  }

  function resultsShown() {
    const list = document.getElementById("results-list");
    return !!list && list.children.length > 0 && !list.querySelector('[class*="skeleton"]');
  }

  function whenResultsShown() {
    return new Promise((resolve) => {
      if (resultsShown()) {
        resolve();
        return;
      }
      const finish = () => {
        window.removeEventListener(READY_EVENT, finish);
        clearTimeout(timer);
        resolve();
      };
      window.addEventListener(READY_EVENT, finish);
      const timer = setTimeout(finish, SETTLE_FALLBACK_MS);
    });
  }

  async function searchNews(query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${basePath()}/api/search`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({ query, type: "news" }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`news search returned ${response.status}`);
      const data = await response.json();
      return {
        results: Array.isArray(data?.results) ? data.results : [],
        engines: (Array.isArray(data?.engineTimings) ? data.engineTimings : [])
          .map((timing) => String(timing?.name || ""))
          .filter(Boolean),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // One news search per query for the page's lifetime. Core may re-render or
  // replace the placeholder at any time (it requests slots twice per search,
  // and the responses can arrive in either order); every copy reuses this
  // answer. Failures are not kept, so a later copy tries again.
  function loadNews(query) {
    const key = query.toLowerCase();
    let entry = newsCache.get(key);
    if (!entry) {
      entry = whenResultsShown().then(() => searchNews(query));
      entry.catch(() => {
        if (newsCache.get(key) === entry) newsCache.delete(key);
      });
      newsCache.set(key, entry);
      while (newsCache.size > CACHE_LIMIT) newsCache.delete(newsCache.keys().next().value);
    }
    return entry;
  }

  function element(tag, className, attributes = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  function text(tag, className, value) {
    const node = element(tag, className);
    node.textContent = value;
    return node;
  }

  function image(className, src) {
    const box = element("span", className);
    box.append(element("img", "", { src, alt: "", loading: "lazy", decoding: "async" }));
    return box;
  }

  function storyText(story, now, locale) {
    const source = element("span", "tstories__source");
    if (story.favicon) {
      source.append(element("img", "tstories__favicon", {
        src: story.favicon, alt: "", width: "16", height: "16", loading: "lazy", decoding: "async",
      }));
    }
    source.append(text("span", "tstories__publisher", story.source));
    const time = text("time", "tstories__time", relativeTime(story, now, locale));
    time.dateTime = new Date(story.published).toISOString().slice(0, story.dateOnly ? 10 : 24);
    return [source, text("span", "tstories__headline", story.title), time];
  }

  function link(className, story) {
    return element("a", className, { href: story.url, target: "_blank", rel: "noopener noreferrer" });
  }

  function render(root, picked, now) {
    shown.set(root, { pool: picked.pool, now });
    const locale = root.dataset.tstoriesLocale || undefined;
    const grid = root.querySelector(".tstories__grid");
    grid?.classList.toggle("tstories__grid--list", !picked.lead);

    const list = element("ul", "tstories__list", { role: "list" });
    for (const story of picked.list) {
      const item = element("li", "tstories__item");
      const anchor = link("tstories__story", story);
      const body = element("span", "tstories__text");
      body.append(...storyText(story, now, locale));
      anchor.append(body);
      if (story.thumb) anchor.append(image("tstories__thumb", story.thumb));
      item.append(anchor);
      list.append(item);
    }
    if (picked.lead) {
      const lead = link("tstories__lead", picked.lead);
      lead.append(image("tstories__thumb", picked.lead.image), ...storyText(picked.lead, now, locale));
      grid?.replaceChildren(lead, list);
    } else {
      grid?.replaceChildren(list);
    }
    root.dataset.tstoriesState = "ready";
    root.hidden = false;
  }

  // Removes the placeholder, and core's slot panel with it when nothing else
  // shares the panel, so no empty frame stays above the results.
  function remove(root) {
    const holder = root.parentElement;
    const panel = holder?.closest(".results-slot-panel, .results-slot-panel-full-width");
    if (panel && holder.children.length === 1) panel.remove();
    else root.remove();
  }

  async function hydrate(root) {
    if (handled.has(root)) return;
    const query = (root.dataset.tstoriesQuery || "").trim();
    if (!query) return;
    handled.add(root);
    // Off the page right now (core may be moving it): fill it from the cache
    // if it comes back.
    const detached = () => {
      if (root.isConnected) return false;
      handled.delete(root);
      return true;
    };
    try {
      const news = await loadNews(query);
      if (detached()) return;
      const hours = Number(root.dataset.tstoriesHours) || 48;
      const now = Date.now();
      const picked = pickStories(news.results, {
        query,
        explicit: root.dataset.tstoriesExplicit === "1",
        windowMs: hours * 3_600_000,
        engines: news.engines,
        proxied,
        now,
      });
      if (!picked) {
        remove(root);
        return;
      }
      await loadStyles();
      if (!detached()) render(root, picked, now);
    } catch {
      // A timed-out or failed search leaves nothing behind. It is not cached,
      // so a re-rendered placeholder searches again.
      if (!detached()) remove(root);
    }
  }

  function openNewsTab() {
    const tab = document.querySelector(
      '.results-tab[data-type="news"], .results-tab[data-type="tab:engine:news"]',
    );
    if (!tab) return false;
    tab.click();
    window.scrollTo({ top: 0 });
    return true;
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(ROOT)) void hydrate(node);
    node.querySelectorAll(ROOT).forEach((root) => void hydrate(root));
  }

  function boot() {
    document.addEventListener("click", (event) => {
      const more = event.target.closest?.("[data-tstories-more]");
      if (!more || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Switch tabs in place when the theme has a News tab; otherwise follow the link.
      if (openNewsTab()) event.preventDefault();
    });

    // A broken thumbnail leaves its story text-only and a broken favicon
    // hides. A broken featured picture hands the lead to the next pictured
    // story, so the lead never sits text-only beside the list.
    document.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        const root = target instanceof HTMLImageElement ? target.closest(ROOT) : null;
        if (!root) return;
        if (target.classList.contains("tstories__favicon")) {
          target.hidden = true;
          return;
        }
        const state = shown.get(root);
        const href = target.closest("a")?.getAttribute("href");
        const story = state?.pool.find((candidate) => candidate.url === href);
        if (story) Object.assign(story, { image: "", thumb: "" });
        if (story && target.closest(".tstories__lead")) {
          render(root, { ...splitLead(state.pool), pool: state.pool }, state.now);
        } else {
          target.closest(".tstories__thumb")?.remove();
        }
      },
      true,
    );

    scan(document.documentElement);
    new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach(scan);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  boot();
})();
