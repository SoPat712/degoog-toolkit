// ── TMDB slot: client-side in-slot navigation + image modal ─────────────────
// Clicking a cast card with data-tmdb-nav="person" swaps the slot contents
// for a person panel fetched from /api/plugin/tmdb/person?id=...
// A back button is injected at the top to return to the previous panel.
// History is stored per-.tmdb-result instance on the element itself.
//
// Image modal: clicking an image with [data-tmdb-modal-src] opens a
// full-screen modal. Close with X button, Esc key, or clicking the backdrop.

(function () {
  "use strict";

  const STACK_PROP = "__tmdbNavStack";
  const LOADING_CLASS = "tmdb-loading";

  // ── Image Modal ───────────────────────────────────────────────────────────────
  let modalOverlay = null;
  let modalImg = null;

  function createModal() {
    if (modalOverlay) return;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "tmdb-modal-overlay";
    modalOverlay.setAttribute("role", "dialog");
    modalOverlay.setAttribute("aria-modal", "true");
    modalOverlay.setAttribute("aria-label", "Image preview");

    const closeBtn = document.createElement("button");
    closeBtn.className = "tmdb-modal-close";
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Close image");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeModal);

    modalImg = document.createElement("img");
    modalImg.className = "tmdb-modal-img";
    modalImg.alt = "";

    modalOverlay.appendChild(closeBtn);
    modalOverlay.appendChild(modalImg);
    document.documentElement.appendChild(modalOverlay);

    // Close when clicking on backdrop (but not the image)
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }

  function openModal(src) {
    if (!src) return;
    createModal();

    // Use original/higher res version if available
    // The src might already be "original" or we can try to upgrade it
    let highResSrc = src;
    // If it's a TMDB image URL with a size like /w342/ or /w185/, upgrade to /original/
    if (src.includes("image.tmdb.org")) {
      highResSrc = src.replace(/\/w\d+\//, "/original/");
    }

    modalImg.src = highResSrc;
    modalOverlay.classList.add("tmdb-modal--visible");
    document.body.style.overflow = "hidden";

    // Focus the close button for accessibility
    const closeBtn = modalOverlay.querySelector(".tmdb-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("tmdb-modal--visible");
    document.body.style.overflow = "";
    modalImg.src = "";
  }

  // Esc key handler
  document.addEventListener("keydown", function (e) {
    if (
      e.key === "Escape" &&
      modalOverlay &&
      modalOverlay.classList.contains("tmdb-modal--visible")
    ) {
      e.preventDefault();
      closeModal();
    }
  });

  // ── Navigation helpers ───────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function findRoot(el) {
    return el && el.closest ? el.closest(".tmdb-result") : null;
  }

  function currentLabel(root) {
    if (!root) return "";
    const panel = root.querySelector(":scope > .tmdb-panel, .tmdb-panel");
    if (panel && panel.dataset && panel.dataset.tmdbLabel) {
      return panel.dataset.tmdbLabel;
    }
    return "";
  }

  function getStack(root) {
    if (!root[STACK_PROP]) root[STACK_PROP] = [];
    return root[STACK_PROP];
  }

  function backButtonHtml(label) {
    const text = label ? `\u2190 ${esc(label)}` : "\u2190 Back";
    const aria = label ? `Back to ${esc(label)}` : "Back";
    return (
      `<button type="button" class="tmdb-back-btn" aria-label="${aria}" ` +
      `data-tmdb-back="1">${text}</button>`
    );
  }

  function renderStackedHtml(root, newInnerHtml) {
    const stack = getStack(root);
    if (stack.length === 0) {
      // No history — just the new content, no back button.
      root.innerHTML = newInnerHtml;
      return;
    }
    const prevLabel = stack[stack.length - 1].label || "";
    root.innerHTML = backButtonHtml(prevLabel) + newInnerHtml;
  }

  async function navigate(root, type, id, fallbackName) {
    if (!root || !type || !id) return;

    // Capture current state for the back stack.
    const label = currentLabel(root) || "";
    const html = root.innerHTML;
    const stack = getStack(root);
    stack.push({ html, label });

    root.classList.add(LOADING_CLASS);
    root.setAttribute("aria-busy", "true");

    try {
      const url =
        `/api/plugin/tmdb/${encodeURIComponent(type)}` +
        `?id=${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`TMDB nav fetch failed: ${res.status}`);
      }
      const data = await res.json();
      if (!data || typeof data.html !== "string" || !data.html) {
        throw new Error("TMDB nav response missing html");
      }
      renderStackedHtml(root, data.html);
      initSeasonRails(root);
      initTvRailHeightSync(root);
      // Scroll the slot into view so the user sees the new panel.
      try {
        root.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_e) {
        // Older browsers: ignore.
      }
    } catch (err) {
      // Roll back the stack push since the navigation failed.
      stack.pop();
      if (window && window.console) {
        console.warn("[tmdb] navigation failed:", err, {
          type,
          id,
          fallbackName,
        });
      }
    } finally {
      root.classList.remove(LOADING_CLASS);
      root.removeAttribute("aria-busy");
    }
  }

  function goBack(root) {
    if (!root) return;
    const stack = getStack(root);
    const prev = stack.pop();
    if (!prev) return;
    root.innerHTML = prev.html;
    initSeasonRails(root);
    initTvRailHeightSync(root);
    try {
      root.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_e) {
      // ignore
    }
  }

  // ── TV layout: cap the episodes rail to the main column height (side-by-side) ─
  function teardownTvRailSync(body) {
    const sync = body && body.__tmdbTvRailSync;
    if (sync) {
      try {
        sync.roMain.disconnect();
      } catch (_e) {
        /* ignore */
      }
      if (sync.roContainer) {
        try {
          sync.roContainer.disconnect();
        } catch (_e) {
          /* ignore */
        }
      }
      if (sync.roBand) {
        try {
          sync.roBand.disconnect();
        } catch (_e) {
          /* ignore */
        }
      }
      delete body.__tmdbTvRailSync;
    }
    if (body && body.querySelector) {
      const railEl = body.querySelector(".tmdb-tv-rail");
      if (railEl && railEl.style) {
        railEl.style.removeProperty("height");
        railEl.style.removeProperty("max-height");
        railEl.style.removeProperty("min-height");
        railEl.style.removeProperty("overflow");
      }
    }
    if (body && body.style) {
      body.style.removeProperty("--tmdb-tv-main-height");
    }
  }

  /** Hero column height only (cast sits below the band in wide layouts). */
  function measureTvMainRailHeight(main) {
    if (!main || !main.getBoundingClientRect) return 0;
    return Math.ceil(main.getBoundingClientRect().height);
  }

  function setupTvRailSync(body) {
    if (!body || !body.querySelector) return;
    const band = body.querySelector(".tmdb-tv-band");
    const main = body.querySelector(".tmdb-tv-main");
    const rail = body.querySelector(".tmdb-tv-rail");
    if (!main || !rail) return;

    teardownTvRailSync(body);

    const rowHost = band || body;
    const container = body.closest(".tmdb-result") || null;
    let raf = 0;
    function apply() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!body.isConnected || !rail.isConnected) return;
        const dir = window.getComputedStyle(rowHost).flexDirection;
        if (dir !== "row") {
          body.style.removeProperty("--tmdb-tv-main-height");
          rail.style.removeProperty("height");
          rail.style.removeProperty("max-height");
          rail.style.removeProperty("min-height");
          rail.style.removeProperty("overflow");
          return;
        }
        const h = measureTvMainRailHeight(main);
        if (h < 1) return;
        body.style.setProperty("--tmdb-tv-main-height", h + "px");
        /* Flex items use min-height:auto by default; episode content can force the rail
           taller than `height` unless min-height is explicitly 0. Inline beats themes. */
        rail.style.setProperty("height", h + "px");
        rail.style.setProperty("max-height", h + "px");
        rail.style.setProperty("min-height", "0");
        rail.style.setProperty("overflow", "hidden");
      });
    }

    const roMain = new ResizeObserver(apply);
    const roBand = band ? new ResizeObserver(apply) : null;
    const roContainer = container
      ? new ResizeObserver(apply)
      : null;
    roMain.observe(main);
    if (roBand && band) roBand.observe(band);
    if (roContainer && container) roContainer.observe(container);
    body.__tmdbTvRailSync = { roMain, roContainer, roBand, apply };
    apply();
  }

  function initTvRailHeightSync(scope) {
    const root =
      scope && scope.querySelectorAll ? scope : document;
    const bodies = new Set();
    if (
      root.nodeType === 1 &&
      root.matches &&
      root.matches(".tmdb-tv-body")
    ) {
      bodies.add(root);
    }
    root.querySelectorAll(".tmdb-tv-body").forEach((b) => bodies.add(b));
    bodies.forEach(setupTvRailSync);
  }

  // ── Horizontal strips (cast cards, season tabs): scroll step + nav enabled state
  function horizontalStripScrollStep(scrollEl, itemSelector) {
    let step = Math.max(220, Math.floor(scrollEl.clientWidth * 0.88));
    const item = scrollEl.querySelector(itemSelector);
    if (item && typeof item.getBoundingClientRect === "function") {
      const w = item.getBoundingClientRect().width;
      if (w > 0) {
        step = Math.ceil(w * 1.35 + 14);
      }
    }
    return Math.max(1, Math.round(step * 1.5));
  }

  function updateHorizontalScrollNav(scrollEl, prevBtn, nextBtn) {
    if (!scrollEl || !prevBtn || !nextBtn) return;
    const max = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (max <= 2) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    const left = scrollEl.scrollLeft;
    prevBtn.disabled = left <= 2;
    nextBtn.disabled = left >= max - 2;
  }

  function initCastCarousel(carousel) {
    if (!carousel || carousel.dataset.tmdbCastInit === "1") return;
    const scrollEl = carousel.querySelector(".tmdb-cast-scroll");
    const prevBtn = carousel.querySelector('[data-tmdb-cast-nav="prev"]');
    const nextBtn = carousel.querySelector('[data-tmdb-cast-nav="next"]');
    if (!scrollEl || !prevBtn || !nextBtn) return;
    carousel.dataset.tmdbCastInit = "1";

    const refresh = function () {
      updateHorizontalScrollNav(scrollEl, prevBtn, nextBtn);
    };

    scrollEl.addEventListener("scroll", refresh, { passive: true });
    const ro = new ResizeObserver(refresh);
    ro.observe(scrollEl);
    ro.observe(carousel);
    refresh();
  }

  function initCastCarousels(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll(".tmdb-cast-carousel").forEach(initCastCarousel);
  }

  function formatMediumDateFromIso(iso) {
    if (!iso || typeof iso !== "string") return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return "";
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function seasonFactsLineFromObject(facts) {
    if (!facts || typeof facts !== "object") return "";
    const ep =
      facts.episodeCount > 0
        ? `${facts.episodeCount} episode${facts.episodeCount !== 1 ? "s" : ""}`
        : "";
    const rt =
      typeof facts.runtimeTotal === "string" ? facts.runtimeTotal.trim() : "";
    const dr =
      typeof facts.dateRange === "string" ? facts.dateRange.trim() : "";
    return [ep, rt, dr].filter(Boolean).join(" \u00B7 ");
  }

  function applySeasonFacts(factsEl, facts) {
    if (!factsEl) return;
    const line = seasonFactsLineFromObject(facts);
    factsEl.textContent = line || "\u2014";
  }

  function provisionalSeasonFactsFromTab(btn) {
    const epRaw = btn.getAttribute("data-tmdb-season-episode-count") || "0";
    const episodeCount = parseInt(epRaw, 10);
    const safeEp = Number.isNaN(episodeCount) ? 0 : episodeCount;
    const air = btn.getAttribute("data-tmdb-season-air-date") || "";
    const dateRange = formatMediumDateFromIso(air);
    return {
      episodeCount: safeEp,
      dateRange,
      runtimeTotal: "",
    };
  }

  // ── TV seasons rail: horizontal tabs + lazy-loaded episodes ─────────────────
  async function loadSeasonEpisodes(episodesEl, tvId, seasonNumber, factsEl) {
    if (!episodesEl || !tvId || seasonNumber == null || seasonNumber === "") return;
    if (!episodesEl.__tmdbSeasonCache) episodesEl.__tmdbSeasonCache = {};
    const cache = episodesEl.__tmdbSeasonCache;
    const key = String(seasonNumber);

    if (cache[key]) {
      const entry = cache[key];
      const html = typeof entry === "string" ? entry : entry.html;
      episodesEl.innerHTML = html;
      episodesEl.dataset.tmdbSeasonActive = key;
      if (
        factsEl &&
        entry &&
        typeof entry === "object" &&
        entry.seasonFacts != null
      ) {
        applySeasonFacts(factsEl, entry.seasonFacts);
      }
      return;
    }
    if (episodesEl.dataset.tmdbLoading === "1") return;

    episodesEl.dataset.tmdbLoading = "1";
    episodesEl.innerHTML =
      '<div class="tmdb-episodes-loading">Loading episodes\u2026</div>';

    try {
      const url =
        `/api/plugin/tmdb/season` +
        `?tv=${encodeURIComponent(tvId)}` +
        `&season=${encodeURIComponent(seasonNumber)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`season fetch failed: ${res.status}`);
      const data = await res.json();
      if (!data || typeof data.html !== "string") {
        throw new Error("season response missing html");
      }
      const payload = {
        html: data.html,
        seasonFacts:
          data.seasonFacts && typeof data.seasonFacts === "object"
            ? data.seasonFacts
            : null,
      };
      cache[key] = payload;
      episodesEl.innerHTML = data.html;
      episodesEl.dataset.tmdbSeasonActive = key;
      if (factsEl && payload.seasonFacts) {
        applySeasonFacts(factsEl, payload.seasonFacts);
      }
    } catch (err) {
      episodesEl.innerHTML =
        '<div class="tmdb-episodes-error">' +
        "Couldn\u2019t load episodes. Try again later." +
        "</div>";
      if (window && window.console) {
        console.warn("[tmdb] season fetch failed:", err);
      }
    } finally {
      episodesEl.dataset.tmdbLoading = "";
    }
  }

  function updateSeasonButtons(rail, activeBtn) {
    rail.querySelectorAll("[data-tmdb-season-tab]").forEach((btn) => {
      const isActive = btn === activeBtn;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  async function activateSeasonTab(rail, btn) {
    if (!rail || !btn) return;
    const tvId = btn.getAttribute("data-tmdb-season-tv") || rail.getAttribute("data-tmdb-season-tv");
    const seasonNumber = btn.getAttribute("data-tmdb-season-number");
    const episodesEl = rail.querySelector("[data-tmdb-episodes]");
    const overviewEl = rail.querySelector("[data-tmdb-season-overview]");
    const factsEl = rail.querySelector("[data-tmdb-season-facts]");
    if (!tvId || !seasonNumber || !episodesEl) return;

    updateSeasonButtons(rail, btn);

    if (factsEl) {
      applySeasonFacts(factsEl, provisionalSeasonFactsFromTab(btn));
    }

    if (overviewEl) {
      const encoded = btn.getAttribute("data-tmdb-season-overview-uri") || "";
      let overviewText = "";
      try {
        overviewText = encoded ? decodeURIComponent(encoded) : "";
      } catch (_e) {
        overviewText = "";
      }
      overviewText = overviewText.replace(/\s+/g, " ").trim();
      overviewEl.textContent = overviewText;
      overviewEl.classList.toggle("tmdb-season-overview--empty", !overviewText);
    }

    await loadSeasonEpisodes(episodesEl, tvId, seasonNumber, factsEl);
  }

  function initSeasonRail(rail) {
    if (!rail || rail.dataset.tmdbSeasonRailInit === "1") return;
    rail.dataset.tmdbSeasonRailInit = "1";

    const carousel = rail.querySelector(".tmdb-seasons-carousel");
    const scrollEl = rail.querySelector(".tmdb-seasons-scroll");
    const leftBtn = rail.querySelector('[data-tmdb-season-scroll="left"]');
    const rightBtn = rail.querySelector('[data-tmdb-season-scroll="right"]');
    const tabs = Array.from(rail.querySelectorAll("[data-tmdb-season-tab]"));
    if (!scrollEl || !leftBtn || !rightBtn || tabs.length === 0) return;

    const refresh = function () {
      updateHorizontalScrollNav(scrollEl, leftBtn, rightBtn);
    };

    scrollEl.addEventListener("scroll", refresh, { passive: true });
    const ro = new ResizeObserver(refresh);
    ro.observe(scrollEl);
    if (carousel) ro.observe(carousel);
    refresh();

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => activateSeasonTab(rail, btn));
    });

    const initiallyActive =
      rail.querySelector("[data-tmdb-season-tab].is-active") || tabs[0];
    activateSeasonTab(rail, initiallyActive);
  }

  function initSeasonRails(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    root
      .querySelectorAll("[data-tmdb-seasons-rail]")
      .forEach((rail) => initSeasonRail(rail));
  }

  const seasonRailObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes || m.addedNodes.length === 0) continue;
      m.addedNodes.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches("[data-tmdb-seasons-rail]")) {
          initSeasonRail(node);
          initTvRailHeightSync(node);
          return;
        }
        if (node.matches && node.matches(".tmdb-cast-carousel")) {
          initCastCarousel(node);
          return;
        }
        if (node.querySelectorAll) {
          initSeasonRails(node);
          initTvRailHeightSync(node);
          initCastCarousels(node);
        }
      });
    }
  });

  // Click delegation: works for cast cards, back button, image modal, and any
  // future element with [data-tmdb-nav="..."] + [data-tmdb-id="..."].
  document.addEventListener(
    "click",
    function (e) {
      const target = e.target;
      if (!target || !target.closest) return;

      // Image modal trigger
      const imgEl = target.closest("[data-tmdb-modal-src]");
      if (imgEl) {
        const src = imgEl.getAttribute("data-tmdb-modal-src");
        if (src) {
          e.preventDefault();
          e.stopPropagation();
          openModal(src);
          return;
        }
      }

      // Cast carousel arrows (above cards; must run before [data-tmdb-nav])
      const castNavBtn = target.closest("[data-tmdb-cast-nav]");
      if (castNavBtn) {
        const carousel = castNavBtn.closest(".tmdb-cast-carousel");
        const scrollEl = carousel?.querySelector(".tmdb-cast-scroll");
        if (carousel && scrollEl && !castNavBtn.disabled) {
          e.preventDefault();
          e.stopPropagation();
          const dir = castNavBtn.getAttribute("data-tmdb-cast-nav");
          const step = horizontalStripScrollStep(scrollEl, ".tmdb-cast-card");
          scrollEl.scrollBy({
            left: dir === "prev" ? -step : step,
            behavior: "smooth",
          });
          return;
        }
      }

      const seasonNavBtn = target.closest("[data-tmdb-season-scroll]");
      if (seasonNavBtn) {
        const carousel = seasonNavBtn.closest(".tmdb-seasons-carousel");
        const scrollEl = carousel?.querySelector(".tmdb-seasons-scroll");
        if (carousel && scrollEl && !seasonNavBtn.disabled) {
          e.preventDefault();
          e.stopPropagation();
          const dir = seasonNavBtn.getAttribute("data-tmdb-season-scroll");
          const step = horizontalStripScrollStep(scrollEl, ".tmdb-season-tab");
          const delta = dir === "left" ? -step : step;
          scrollEl.scrollBy({ left: delta, behavior: "smooth" });
          return;
        }
      }

      const epOverviewBtn = target.closest("[data-tmdb-episode-overview-toggle]");
      if (epOverviewBtn) {
        const block = epOverviewBtn.closest("[data-tmdb-overview-block]");
        if (block) {
          e.preventDefault();
          e.stopPropagation();
          const expanded = block.classList.toggle("is-expanded");
          const trunc = block.querySelector(".tmdb-episode-overview-trunc");
          const full = block.querySelector(".tmdb-episode-overview-full");
          if (trunc && full) {
            trunc.toggleAttribute("hidden", expanded);
            full.toggleAttribute("hidden", !expanded);
          }
          epOverviewBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
          epOverviewBtn.textContent = expanded ? "Show less" : "Show more";
        }
        return;
      }

      // Back button
      const back = target.closest("[data-tmdb-back]");
      if (back) {
        const root = findRoot(back);
        if (!root) return;
        e.preventDefault();
        e.stopPropagation();
        goBack(root);
        return;
      }

      // Navigation trigger (cast card, etc.)
      const navEl = target.closest("[data-tmdb-nav]");
      if (!navEl) return;

      // If the click happened on an internal anchor inside the nav card
      // (e.g. an external TMDB link we add later), let the anchor handle it.
      const anchor = target.closest("a");
      if (anchor && navEl.contains(anchor) && anchor !== navEl) return;

      const type = navEl.getAttribute("data-tmdb-nav");
      const id = navEl.getAttribute("data-tmdb-id");
      const name = navEl.getAttribute("data-tmdb-name") || "";
      if (!type || !id) return;

      const root = findRoot(navEl);
      if (!root) return;

      e.preventDefault();
      e.stopPropagation();
      navigate(root, type, id, name);
    },
    false,
  );

  // Keyboard accessibility: Enter/Space on a focused nav element activates it.
  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      const target = e.target;
      if (!target || !target.matches) return;

      if (target.matches("[data-tmdb-back]")) {
        e.preventDefault();
        const root = findRoot(target);
        if (root) goBack(root);
        return;
      }

      // Image modal trigger via keyboard
      if (target.matches("[data-tmdb-modal-src]")) {
        e.preventDefault();
        const src = target.getAttribute("data-tmdb-modal-src");
        if (src) openModal(src);
        return;
      }

      if (target.matches("[data-tmdb-nav]")) {
        e.preventDefault();
        const type = target.getAttribute("data-tmdb-nav");
        const id = target.getAttribute("data-tmdb-id");
        const name = target.getAttribute("data-tmdb-name") || "";
        const root = findRoot(target);
        if (root && type && id) navigate(root, type, id, name);
      }
    },
    false,
  );

  initSeasonRails(document);
  initTvRailHeightSync(document);
  initCastCarousels(document);
  seasonRailObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
