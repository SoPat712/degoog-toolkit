(function () {
  "use strict";

  const youtubeIcon = '<svg class="music-service-icon music-service-icon-youtube" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-width="1.25"/><path fill="#fff" d="m10.2 8.7 5.1 3.3-5.1 3.3z"/></svg>';

  function addYouTubeMusic(card) {
    const links = card.querySelector(".music-links");
    if (!links || links.querySelector('a[href^="https://music.youtube.com/"]')) return;
    const spotify = links.querySelector('a[href^="https://open.spotify.com/search/"]');
    const term = spotify?.href.split("/search/")[1];
    if (!term) return;

    const link = document.createElement("a");
    link.className = "music-pill";
    link.href = `https://music.youtube.com/search?q=${term}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `${youtubeIcon}<span>YouTube Music</span>`;
    links.append(link);
  }

  // Matches PREVIEW_LINES in lyrics.mjs.
  const LYRICS_PREVIEW = 16;

  function setOpen(section, attribute, button, open) {
    section.toggleAttribute(attribute, open);
    if (!button) return;
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? button.dataset.less : button.dataset.more;
  }

  function showLyrics(section, lines) {
    const text = section.querySelector(".music-lyrics-text");
    if (!text) return;
    text.replaceChildren(...lines.map((line, index) => {
      const span = document.createElement("span");
      span.className = `${line ? "music-lyrics-line" : "music-lyrics-break"}${index >= LYRICS_PREVIEW ? " music-lyrics-extra" : ""}`;
      span.textContent = line;
      if (!line) span.setAttribute("aria-hidden", "true");
      return span;
    }));
    const button = section.querySelector("[data-music-lyrics-toggle]");
    if (button) button.hidden = lines.length <= LYRICS_PREVIEW;
    section.hidden = false;
  }

  // Song cards render first; their lyrics arrive from the plugin route.
  function loadLyrics(section) {
    if (section.dataset.musicLyricsState) return;
    section.dataset.musicLyricsState = "loading";
    fetch(section.dataset.musicLyricsSrc, { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        section.dataset.musicLyricsState = "done";
        const lines = Array.isArray(data?.lines) ? data.lines.map(String) : [];
        if (lines.length) showLyrics(section, lines);
      })
      .catch(() => {
        section.dataset.musicLyricsState = "done";
      });
  }

  // A cover that fails to load leaves the empty tile, never a broken image. A
  // card can arrive with a cover that already failed, so scans check too.
  const COVER = ".music-cover img, .music-song-cover img";

  function hideCover(image) {
    const cover = image.parentElement;
    if (!cover || image.hidden) return;
    image.hidden = true;
    if (cover.classList.contains("music-song-cover")) {
      cover.classList.add("music-song-cover-empty");
      cover.setAttribute("aria-hidden", "true");
      cover.append(Object.assign(document.createElement("span"), { textContent: "♪" }));
    } else {
      cover.classList.add("music-cover-empty");
    }
  }

  function scan(root) {
    root.querySelectorAll?.(COVER).forEach((image) => {
      if (image.complete && !image.naturalWidth) hideCover(image);
    });
    if (root.matches?.(".music-card")) addYouTubeMusic(root);
    root.querySelectorAll?.(".music-card").forEach(addYouTubeMusic);
    if (root.matches?.("[data-music-lyrics-src]")) loadLyrics(root);
    root.querySelectorAll?.("[data-music-lyrics-src]").forEach(loadLyrics);
  }

  // Lyrics and, on phones, the discography start short with a "Show more" pill.
  const TOGGLES = [
    ["[data-music-lyrics-toggle]", ".music-lyrics", "data-music-lyrics-open"],
    ["[data-music-releases-toggle]", ".music-release-list", "data-music-releases-open"],
  ];

  document.addEventListener("click", (event) => {
    for (const [buttonSelector, sectionSelector, attribute] of TOGGLES) {
      const button = event.target.closest?.(buttonSelector);
      const section = button?.closest(sectionSelector);
      if (section) setOpen(section, attribute, button, !section.hasAttribute(attribute));
    }
  });

  scan(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener(
    "error",
    (event) => {
      if (event.target?.matches?.(COVER)) hideCover(event.target);
    },
    true,
  );
})();
