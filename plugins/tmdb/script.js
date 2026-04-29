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
    try {
      root.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_e) {
      // ignore
    }
  }

  // ── Season accordion: lazy-load episodes when opened ────────────────────────
  // The season accordion body contains an empty [data-tmdb-episodes] slot
  // that gets filled the first time the user opens the accordion. We listen
  // for the native <details> "toggle" event in the capture phase because
  // "toggle" does not bubble.

  async function loadSeasonEpisodes(detailsEl) {
    const body = detailsEl.querySelector("[data-tmdb-episodes]");
    if (!body) return;
    if (body.dataset.tmdbLoaded === "1") return;
    if (body.dataset.tmdbLoading === "1") return;

    const tvId = detailsEl.getAttribute("data-tmdb-season-tv");
    const seasonNumber = detailsEl.getAttribute("data-tmdb-season-number");
    if (!tvId || seasonNumber == null || seasonNumber === "") return;

    body.dataset.tmdbLoading = "1";
    body.innerHTML =
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
      body.innerHTML = data.html;
      body.dataset.tmdbLoaded = "1";
    } catch (err) {
      body.innerHTML =
        '<div class="tmdb-episodes-error">' +
        "Couldn\u2019t load episodes. Try again later." +
        "</div>";
      if (window && window.console) {
        console.warn("[tmdb] season fetch failed:", err);
      }
    } finally {
      body.dataset.tmdbLoading = "";
    }
  }

  document.addEventListener(
    "toggle",
    function (e) {
      const el = e.target;
      if (!el || !el.matches) return;
      if (!el.matches(".tmdb-season-accordion")) return;
      if (!el.open) return;
      loadSeasonEpisodes(el);
    },
    true, // capture phase — "toggle" does not bubble
  );

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
})();
