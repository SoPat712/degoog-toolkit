// Top Stories carousel arrows. The cards are server-rendered and scroll on
// their own; this only shows the arrows while there is more to scroll, pages
// the track, and swaps broken thumbnails for the placeholder.
(function () {
  "use strict";

  const ROOT = ".tstories";
  const bound = new WeakSet();
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          for (const { target } of entries) {
            if (target.isConnected) sync(target.closest(ROOT));
            else resizeObserver.unobserve(target);
          }
        })
      : null;

  function isRtl(track) {
    return getComputedStyle(track).direction === "rtl";
  }

  function sync(root) {
    const track = root?.querySelector(".tstories__track");
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const position = Math.abs(track.scrollLeft);
    const prev = root.querySelector('[data-tstories-nav="prev"]');
    const next = root.querySelector('[data-tstories-nav="next"]');
    if (prev) prev.hidden = position <= 2;
    if (next) next.hidden = max - position <= 2;
  }

  // Pages by whole cards so the next card lines up with the start edge.
  function pageWidth(track) {
    const item = track.querySelector(".tstories__item");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const card = item ? item.getBoundingClientRect().width + gap : 0;
    if (card <= 0) return track.clientWidth * 0.8;
    return Math.max(card, Math.floor(track.clientWidth / card) * card);
  }

  function bind(root) {
    if (bound.has(root)) return;
    const track = root.querySelector(".tstories__track");
    if (!track) return;
    bound.add(root);
    let frame = 0;
    track.addEventListener(
      "scroll",
      () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          sync(root);
        });
      },
      { passive: true },
    );
    resizeObserver?.observe(track);
    sync(root);
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(ROOT)) bind(node);
    node.querySelectorAll(ROOT).forEach(bind);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-tstories-nav]");
    const root = button?.closest(ROOT);
    const track = root?.querySelector(".tstories__track");
    if (!track) return;
    event.preventDefault();
    const direction = button.dataset.tstoriesNav === "prev" ? -1 : 1;
    track.scrollBy({
      left: direction * (isRtl(track) ? -1 : 1) * pageWidth(track),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest(ROOT)) return;
      if (image.classList.contains("tstories__favicon")) {
        image.hidden = true;
        return;
      }
      // The source initial underneath shows through once the image is gone.
      if (image.closest(".tstories__thumb")) image.remove();
    },
    true,
  );

  scan(document.documentElement);
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
