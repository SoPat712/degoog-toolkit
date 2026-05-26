(function () {
  function init() {
    document.querySelectorAll("[data-color-translator-card]").forEach(initCard);
  }

  function initCard(card) {
    if (card.__colorTranslatorInitialized) return;
    card.__colorTranslatorInitialized = true;

    const copyButtons = card.querySelectorAll(".clrtr-copy-btn");
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const textToCopy = btn.getAttribute("data-copy");
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy).then(() => {
          btn.classList.add("copied");
          setTimeout(() => {
            btn.classList.remove("copied");
          }, 1500);
        }).catch((err) => {
          console.error("Failed to copy text: ", err);
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  const observer = new MutationObserver(init);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
