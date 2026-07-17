(function () {
  "use strict";

  let activeAudio = null;
  let activeButton = null;

  function closestElement(target, selector) {
    const element = target?.closest ? target : target?.parentElement;
    return element?.closest ? element.closest(selector) : null;
  }

  function resetAudioButton() {
    if (!activeButton) return;
    activeButton.classList.remove("dslot-audio-playing");
    activeButton.setAttribute("aria-pressed", "false");
    activeButton = null;
  }

  function handleAudioClick(event) {
    const button = closestElement(event.target, ".dslot-audio[data-dslot-audio]");
    if (!button) return;

    event.preventDefault();

    const source = button.dataset.dslotAudio;
    if (!source) return;

    if (activeAudio && activeButton === button) {
      activeAudio.pause();
      activeAudio = null;
      resetAudioButton();
      return;
    }

    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
      resetAudioButton();
    }

    const audio = new Audio(source);
    activeAudio = audio;
    activeButton = button;
    button.classList.add("dslot-audio-playing");
    button.setAttribute("aria-pressed", "true");

    const reset = () => {
      if (activeAudio === audio) activeAudio = null;
      resetAudioButton();
    };

    audio.addEventListener("ended", reset, { once: true });
    audio.addEventListener("error", reset, { once: true });
    audio.play().catch(reset);
  }

  function handleLookupClick(event) {
    const button = closestElement(
      event.target,
      ".dslot-tag-button[data-dslot-lookup]",
    );
    if (!button) return;

    event.preventDefault();

    const word = button.dataset.dslotLookup;
    if (!word) return;
    navigateToSearch(`define ${word}`);
  }

  function navigateToSearch(query) {
    const input =
      document.getElementById("results-search-input") ||
      document.getElementById("search-input");

    if (input) {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const form = input.closest("form");
      if (form) {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event("submit", { cancelable: true }));
        }
        return;
      }

      const button = document.getElementById("results-search-btn");
      if (button) {
        button.click();
        return;
      }
    }

    const url = new URL(window.location.href);
    url.searchParams.set("q", query);
    window.location.href = url.toString();
  }

  function showMoreModal(kind, word, termsJson) {
    let terms = [];
    try {
      terms = JSON.parse(termsJson);
    } catch {
      return;
    }

    const existing = document.querySelector(".dslot-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "dslot-modal-overlay";

    const root = document.querySelector("[data-dslot-root]");
    const tSynonyms = root ? root.getAttribute("data-t-synonyms") : "Synonyms";
    const tAntonyms = root ? root.getAttribute("data-t-antonyms") : "Antonyms";
    const tFor = root ? root.getAttribute("data-t-for") : "for";
    const tClose = root ? root.getAttribute("data-t-close") : "Close";

    const title = kind === "antonym" ? tAntonyms : tSynonyms;

    const tagsHtml = terms.map(term => {
      const termWord = String(term?.word || "");
      const lookupWord = termWord.trim().toLowerCase().replace(/[^a-z0-9'-]/g, "");

      const ratingHtml = term.rating && term.rating !== 0
        ? `<span class="dslot-rating" title="Power Thesaurus rating">${escapeHtml(term.rating)}</span>`
        : "";

      const partsHtml = term.partsOfSpeech && term.partsOfSpeech.length
        ? `<span class="dslot-term-meta">${term.partsOfSpeech.map(escapeHtml).join(", ")}</span>`
        : "";

      const tagsListHtml = term.tags && term.tags.length
        ? `<span class="dslot-term-tags">${term.tags.slice(0, 3).map(tag => `<span>#${escapeHtml(tag)}</span>`).join("")}</span>`
        : "";

      const wordControl = lookupWord
        ? `<button class="dslot-term-word dslot-tag-button" type="button" data-dslot-lookup="${escapeAttr(lookupWord)}" aria-label="Look up ${escapeAttr(kind)} ${escapeAttr(termWord)}">${escapeHtml(termWord)}</button>`
        : `<span class="dslot-term-word">${escapeHtml(termWord)}</span>`;

      return `<span class="dslot-term">
        <span class="dslot-term-main">${wordControl}${ratingHtml}</span>
        ${partsHtml || tagsListHtml ? `<span class="dslot-term-detail">${partsHtml}${tagsListHtml}</span>` : ""}
      </span>`;
    }).join("");

    overlay.innerHTML = `
      <div class="dslot-modal-container" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)} ${escapeAttr(tFor)} ${escapeAttr(word)}">
        <div class="dslot-modal-header">
          <div class="dslot-modal-title">${escapeHtml(title)} ${escapeHtml(tFor)} <span class="dslot-modal-word">${escapeHtml(word)}</span></div>
          <button class="dslot-modal-close" type="button" aria-label="${escapeAttr(tClose)}">&times;</button>
        </div>
        <div class="dslot-modal-body">
          <div class="dslot-tags-flex">
            ${tagsHtml}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector(".dslot-modal-close");
    const previousFocus = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", escHandler);
      overlay.classList.add("dslot-modal-closing");
      overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 300);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const escHandler = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
    closeBtn.focus();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function handleMoreClick(event) {
    const button = closestElement(event.target, ".dslot-more[data-dslot-more-terms]");
    if (!button) return;

    event.preventDefault();

    const kind = button.dataset.dslotMoreKind || "synonym";
    const termsJson = button.dataset.dslotMoreTerms;
    const card = closestElement(button, "[data-dslot-word]");
    const word = card ? card.dataset.dslotWord : "";

    showMoreModal(kind, word, termsJson);
  }

  document.addEventListener("click", function (event) {
    handleAudioClick(event);
    handleLookupClick(event);
    handleMoreClick(event);
  });
})();
