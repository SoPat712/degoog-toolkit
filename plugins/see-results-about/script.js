// A Wikimedia thumbnail that fails to load becomes the chip's letter tile,
// never a broken image. Image errors do not bubble, so this listens in the
// capture phase. Chips can render, and their images fail, before this module
// runs, so the page and every added row are checked too.
(function () {
  "use strict";

  var THUMB = ".sra-card img.sra-thumb";

  function toTile(image) {
    var name = image.closest(".sra-chip")?.querySelector(".sra-name")?.textContent || "";
    var tile = document.createElement("span");
    tile.className = "sra-thumb sra-thumb--empty";
    tile.setAttribute("aria-hidden", "true");
    tile.textContent = Array.from(name.trim())[0] || "";
    image.replaceWith(tile);
  }

  function scan(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    var images = node.matches(THUMB) ? [node] : node.querySelectorAll(THUMB);
    images.forEach(function (image) {
      if (image.complete && !image.naturalWidth) toTile(image);
    });
  }

  document.addEventListener(
    "error",
    function (event) {
      if (event.target?.matches?.(THUMB)) toTile(event.target);
    },
    true,
  );

  scan(document.documentElement);
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(scan);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
