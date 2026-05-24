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

  document.addEventListener("click", function (event) {
    handleAudioClick(event);
    handleLookupClick(event);
  });
})();
