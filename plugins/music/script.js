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

  function scan(root) {
    if (root.matches?.(".music-card")) addYouTubeMusic(root);
    root.querySelectorAll?.(".music-card").forEach(addYouTubeMusic);
  }

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
      const image = event.target?.closest?.(".music-cover img");
      if (image) image.hidden = true;
    },
    true,
  );
})();
