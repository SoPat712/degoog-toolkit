// Image & Video Strips runtime. Styles the hidden slot placeholder, fills it
// from the instance's own image and video engines through same-origin
// /api/search once the web results are on screen, and drives the carousel
// arrows. Thumbnails come back as core's signed /api/proxy URLs, so the
// browser never contacts an image host directly.
(function () {
  "use strict";

  const ROOT = ".mstrips";
  const STRIP = ".mstrips__strip[data-mstrips-kind]";
  const READY_EVENT = "degoog-results-ready";
  // Start anyway if core never announces results (they may have rendered
  // before this script loaded).
  const SETTLE_FALLBACK_MS = 1500;
  const FETCH_TIMEOUT_MS = 12_000;
  const CACHE_LIMIT = 12;
  const LIMITS = { images: 12, videos: 4 };
  const MINIMUM = { images: 4, videos: 2 };
  const SITE_NAMES = {
    "dailymotion.com": "Dailymotion",
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "rumble.com": "Rumble",
    "tiktok.com": "TikTok",
    "twitch.tv": "Twitch",
    "vimeo.com": "Vimeo",
    "youtu.be": "YouTube",
    "youtube.com": "YouTube",
  };

  // ── Result picking: pure functions, tested in node ────────────────────────

  function safeLink(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function siteName(url) {
    try {
      const host = new URL(url).hostname.replace(/^(?:www|m)\./, "");
      return SITE_NAMES[host] || host;
    } catch {
      return "";
    }
  }

  // Every usable result in rank order, links de-duplicated. Images need a
  // thumbnail; videos need a title. `proxied` keeps only same-origin signed
  // proxy URLs. The strip shows the first few and keeps the rest as spares.
  function pickMedia(kind, results, proxied) {
    const picked = [];
    const seen = new Set();
    for (const result of Array.isArray(results) ? results : []) {
      if (!result || typeof result !== "object") continue;
      const href = safeLink(result.url);
      const title = String(result.title || "").replace(/\s+/g, " ").trim();
      if (!href || seen.has(href)) continue;
      if (kind === "videos") {
        if (!title) continue;
        const duration = String(result.duration || "").trim();
        picked.push({
          href,
          title,
          thumb: proxied(result.thumbnail),
          duration: /^\d{1,2}(?::[0-5]\d){1,2}$/.test(duration) ? duration : "",
          favicon: proxied(result.favicon),
          site: siteName(href),
        });
      } else {
        const thumb = proxied(result.thumbnail) || proxied(result.imageUrl);
        if (!thumb) continue;
        picked.push({ href, title, thumb });
      }
      seen.add(href);
    }
    return picked;
  }

  const media = { pickMedia, siteName };

  // ── Page ──────────────────────────────────────────────────────────────────

  const handled = new WeakSet();
  const spares = new WeakMap();
  const bound = new WeakSet();
  const mediaCache = new Map();
  let stylesheet = null;
  let resizeObserver = null;

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
      return parsed.origin === location.origin &&
        parsed.pathname.startsWith(`${basePath()}/api/proxy/`) &&
        !/^data:/i.test(parsed.searchParams.get("url") || "")
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  // The strips' styles load with them, so they cost nothing on other pages.
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

  async function search(query, kind) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${basePath()}/api/search`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({ query, type: kind }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`search returned ${response.status}`);
      const data = await response.json();
      return pickMedia(kind, data?.results, proxied);
    } finally {
      clearTimeout(timer);
    }
  }

  // One search per query and kind for the page's lifetime. Core may re-render
  // or replace the placeholder at any time (it requests slots twice per
  // search, and on a fast repeat search the answers arrive in either order);
  // every copy reuses this answer, and none of them cancels it. Failures are
  // not kept, so a later copy tries again.
  function loadMedia(query, kind) {
    const key = `${kind}|${query.toLowerCase()}`;
    let entry = mediaCache.get(key);
    if (!entry) {
      entry = whenResultsShown().then(() => search(query, kind));
      entry.catch(() => {
        if (mediaCache.get(key) === entry) mediaCache.delete(key);
      });
      mediaCache.set(key, entry);
      while (mediaCache.size > CACHE_LIMIT) mediaCache.delete(mediaCache.keys().next().value);
    }
    return entry;
  }

  function element(tag, className, attributes = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  function externalLink(className, href) {
    return element("a", className, { href, target: "_blank", rel: "noopener noreferrer" });
  }

  function imageItem(item) {
    const node = element("li", "mstrips__item mstrips__item--image");
    const link = externalLink("mstrips__tile", item.href);
    if (item.title) link.title = item.title;
    link.append(element("img", "", { src: item.thumb, alt: item.title, loading: "lazy", decoding: "async" }));
    node.append(link);
    return node;
  }

  function videoItem(item) {
    const node = element("li", "mstrips__item mstrips__item--video");
    const link = externalLink("mstrips__card", item.href);
    const thumb = element("span", "mstrips__thumb");
    if (item.thumb) thumb.append(element("img", "", { src: item.thumb, alt: "", loading: "lazy", decoding: "async" }));
    if (item.duration) {
      const badge = element("span", "mstrips__duration");
      badge.textContent = item.duration;
      thumb.append(badge);
    }
    const headline = element("span", "mstrips__headline");
    headline.textContent = item.title;
    const source = element("span", "mstrips__source");
    if (item.favicon) {
      source.append(element("img", "mstrips__favicon", {
        src: item.favicon, alt: "", width: "16", height: "16", loading: "lazy", decoding: "async",
      }));
    }
    const name = element("span", "mstrips__source-name");
    name.textContent = item.site;
    source.append(name);
    link.append(thumb, headline, source);
    node.append(link);
    return node;
  }

  function fill(strip, kind, items) {
    const track = strip.querySelector(".mstrips__track");
    if (!track || items.length < MINIMUM[kind]) return false;
    const make = kind === "videos" ? videoItem : imageItem;
    track.replaceChildren(...items.slice(0, LIMITS[kind]).map(make));
    track.removeAttribute("aria-busy");
    // Broken image tiles are swapped for these.
    spares.set(strip, kind === "images" ? items.slice(LIMITS[kind]) : []);
    strip.classList.add("is-ready");
    bindCarousel(strip);
    return true;
  }

  // Removes a placeholder, and core's slot panel with it when nothing else
  // shares the panel, so an empty frame never stays above the results.
  function removeRoot(root) {
    const holder = root.parentElement;
    const panel = holder?.closest(".results-slot-panel, .results-slot-panel-full-width");
    if (panel && holder.children.length === 1) panel.remove();
    else root.remove();
  }

  function dropStrip(root, strip) {
    strip.remove();
    if (!root.querySelector(".mstrips__strip")) removeRoot(root);
  }

  async function hydrateStrip(root, strip, query) {
    if (handled.has(strip)) return;
    handled.add(strip);
    const kind = strip.dataset.mstripsKind;
    try {
      const items = await loadMedia(query, kind);
      // Off the page right now (core may be moving it): fill it from the
      // cache if it comes back.
      if (!strip.isConnected) handled.delete(strip);
      else if (!fill(strip, kind, items)) dropStrip(root, strip);
    } catch {
      // A timed-out or failed search drops this copy of the strip. It is not
      // cached, so a re-rendered placeholder searches again.
      if (!strip.isConnected) handled.delete(strip);
      else dropStrip(root, strip);
    }
  }

  function hydrate(root) {
    const query = (root.dataset.mstripsQuery || "").trim();
    if (!query) return;
    if (!handled.has(root)) {
      handled.add(root);
      // Unhidden even while off the page, so a copy core puts back shows.
      loadStyles().then(
        () => {
          root.hidden = false;
        },
        () => {
          if (root.isConnected) removeRoot(root);
        },
      );
    }
    for (const strip of root.querySelectorAll(STRIP)) void hydrateStrip(root, strip, query);
  }

  // ── Carousel arrows (shown only while there is more to scroll) ────────────

  function sync(strip) {
    const track = strip?.querySelector(".mstrips__track");
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const position = Math.abs(track.scrollLeft);
    const prev = strip.querySelector('[data-mstrips-nav="prev"]');
    const next = strip.querySelector('[data-mstrips-nav="next"]');
    if (prev) prev.hidden = position <= 2;
    if (next) next.hidden = max - position <= 2;
  }

  // Pages by whole items so the next one lines up with the start edge.
  function pageWidth(track) {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    let width = 0;
    for (const item of track.querySelectorAll(".mstrips__item")) {
      const next = width + item.getBoundingClientRect().width + gap;
      if (next > track.clientWidth && width > 0) break;
      width = next;
    }
    return width > 0 ? width : track.clientWidth * 0.8;
  }

  function bindCarousel(strip) {
    const track = strip.querySelector(".mstrips__track");
    if (!track) return;
    if (!bound.has(track)) {
      bound.add(track);
      let frame = 0;
      track.addEventListener(
        "scroll",
        () => {
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            sync(strip);
          });
        },
        { passive: true },
      );
      // Image tiles only know their width once loaded.
      track.addEventListener("load", () => sync(strip), true);
      resizeObserver?.observe(track);
    }
    sync(strip);
  }

  function openTab(kind) {
    const tab = document.querySelector(
      `.results-tab[data-type="${kind}"], .results-tab[data-type="tab:engine:${kind}"]`,
    );
    if (!tab) return false;
    tab.click();
    window.scrollTo({ top: 0 });
    return true;
  }

  // A broken tile gives way to a spare; with none left and too few tiles the
  // strip goes. A video keeps its card on the plain thumbnail background.
  function onImageError(image) {
    if (image.classList.contains("mstrips__favicon")) {
      image.hidden = true;
      return;
    }
    const strip = image.closest(".mstrips__strip");
    const tile = image.closest(".mstrips__item--image");
    if (!tile) {
      image.remove();
      return;
    }
    const spare = spares.get(strip)?.shift();
    if (spare) {
      tile.replaceWith(imageItem(spare));
    } else {
      tile.remove();
      const root = strip?.closest(ROOT);
      if (root && strip.querySelectorAll(".mstrips__item--image").length < MINIMUM.images) {
        dropStrip(root, strip);
        return;
      }
    }
    sync(strip);
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(ROOT)) hydrate(node);
    else if (node.matches(STRIP)) {
      const root = node.closest(ROOT);
      if (root) hydrate(root);
    }
    node.querySelectorAll(ROOT).forEach(hydrate);
  }

  function boot() {
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver((entries) => {
        for (const { target } of entries) {
          if (target.isConnected) sync(target.closest(".mstrips__strip"));
          else resizeObserver.unobserve(target);
        }
      });
    }

    document.addEventListener("click", (event) => {
      const viewAll = event.target.closest?.("[data-mstrips-all]");
      if (viewAll) {
        const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        // Switch tabs in place when the theme has the tab; otherwise follow the link.
        if (plain && openTab(viewAll.dataset.mstripsAll)) event.preventDefault();
        return;
      }
      const button = event.target.closest?.("[data-mstrips-nav]");
      const strip = button?.closest(".mstrips__strip");
      const track = strip?.querySelector(".mstrips__track");
      if (!track) return;
      event.preventDefault();
      const rtl = getComputedStyle(track).direction === "rtl";
      const direction = button.dataset.mstripsNav === "prev" ? -1 : 1;
      track.scrollBy({
        left: direction * (rtl ? -1 : 1) * pageWidth(track),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });

    document.addEventListener(
      "error",
      (event) => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.closest(ROOT)) onImageError(image);
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
