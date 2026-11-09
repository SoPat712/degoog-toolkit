// Solitaire's card runtime (card.js, ~32 KB) loads only once a Solitaire card is
// on the page, so searches without one skip it. Cards can arrive after results
// stream in, so the page is watched until the first one shows up.
(function () {
  var CARD = "[data-sol-widget]";
  var attempts = 0;
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType === 1 && (node.matches(CARD) || node.querySelector(CARD))) {
          load();
          return;
        }
      }
    }
  });

  function watch() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function load() {
    observer.disconnect();
    // Browsers cache a failed module fetch per URL, so a retry varies it.
    var url = attempts ? "./card.js?retry=" + attempts : "./card.js";
    attempts += 1;
    import(url).catch(function (error) {
      console.warn("[solitaire] card script failed to load", error);
      watch(); // try again when the next card is added
    });
  }

  if (document.querySelector(CARD)) load();
  else watch();
})();
