(function () {
  const CARD_SELECTOR = ".trc-card[data-trc-card]";
  const PLUGIN_API_BASE = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;

  function pluginApiUrl(path) {
    return `${PLUGIN_API_BASE}/${path}`;
  }

  function setStatus(card, status, message) {
    const statusEl = card.querySelector(".trc-status");
    if (!statusEl) return;
    statusEl.dataset.status = status || "available";
    statusEl.textContent = message || "";
  }

  function setLoading(card, loading) {
    card.dataset.trcLoading = loading ? "1" : "0";
    card
      .querySelectorAll(".trc-translate-button, .trc-provider-select, .trc-source-select, .trc-target-select")
      .forEach((control) => {
        control.disabled = Boolean(loading);
      });
  }

  function selected(select) {
    return select?.value || "";
  }

  function updateProviderOptions(card, providers, activeId) {
    const select = card.querySelector(".trc-provider-select");
    if (!select || !Array.isArray(providers)) return;

    providers.forEach((provider) => {
      const option = select.querySelector(`option[value="${cssEscape(provider.id)}"]`);
      if (!option) return;
      option.dataset.status = provider.status || "available";
      option.textContent = provider.name || provider.id;
    });

    if (activeId && select.querySelector(`option[value="${cssEscape(activeId)}"]`)) {
      select.value = activeId;
    }
  }

  async function translate(card, providerOverride) {
    const sourceInput = card.querySelector(".trc-source-input");
    const output = card.querySelector(".trc-output");
    const sourceSelect = card.querySelector(".trc-source-select");
    const targetSelect = card.querySelector(".trc-target-select");
    const providerSelect = card.querySelector(".trc-provider-select");
    const text = sourceInput?.value?.trim() || "";

    if (!text) {
      if (output) output.value = "";
      setStatus(card, "available", "");
      return;
    }

    setLoading(card, true);
    setStatus(card, "available", "Translating");

    try {
      const response = await fetch(pluginApiUrl("translate"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          source: selected(sourceSelect),
          target: selected(targetSelect),
          provider: providerOverride || selected(providerSelect),
        }),
      });
      const data = await response.json();
      updateProviderOptions(card, data.providers, data.provider?.id);

      if (!response.ok || !data.ok) {
        if (output) output.value = "";
        setStatus(card, "failed", data.error || "Translation unavailable");
        return;
      }

      if (output) output.value = data.translatedText || "";
      card.dataset.detectedSource = data.detectedSource || "";
      setStatus(
        card,
        data.provider?.status || "success",
        data.provider?.name || "Translated",
      );
    } catch (error) {
      if (output) output.value = "";
      setStatus(card, "failed", "Translation unavailable");
    } finally {
      setLoading(card, false);
    }
  }

  function copyOutput(card, button) {
    const output = card.querySelector(".trc-output");
    const value = output?.value || "";
    if (!value || !navigator?.clipboard) return;

    navigator.clipboard.writeText(value).then(() => {
      button.dataset.copied = "1";
      const label = button.querySelector("span");
      const previous = label ? label.textContent : "";
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        button.dataset.copied = "0";
        if (label) label.textContent = previous || "Copy";
      }, 1400);
    });
  }

  function syncSwapState(card) {
    const sourceSelect = card.querySelector(".trc-source-select");
    const button = card.querySelector(".trc-swap-button");
    if (button) button.disabled = selected(sourceSelect) === "auto";
  }

  function swapLanguages(card) {
    const sourceSelect = card.querySelector(".trc-source-select");
    const targetSelect = card.querySelector(".trc-target-select");
    const sourceInput = card.querySelector(".trc-source-input");
    const output = card.querySelector(".trc-output");
    const source = selected(sourceSelect);
    const target = selected(targetSelect);

    if (!source || source === "auto" || !target) return;

    sourceSelect.value = target;
    targetSelect.value = source;

    const currentSource = sourceInput?.value || "";
    if (sourceInput && output) {
      sourceInput.value = output.value || currentSource;
      output.value = currentSource;
    }

    syncSwapState(card);
  }

  function initCard(card) {
    if (card.dataset.trcInit) return;
    card.dataset.trcInit = "1";

    const sourceInput = card.querySelector(".trc-source-input");
    const sourceSelect = card.querySelector(".trc-source-select");
    const targetSelect = card.querySelector(".trc-target-select");
    const providerSelect = card.querySelector(".trc-provider-select");
    const translateButton = card.querySelector(".trc-translate-button");
    const copyButton = card.querySelector(".trc-copy-button");
    const swapButton = card.querySelector(".trc-swap-button");

    translateButton?.addEventListener("click", () => translate(card));
    providerSelect?.addEventListener("change", () => translate(card, providerSelect.value));
    targetSelect?.addEventListener("change", () => translate(card));
    sourceSelect?.addEventListener("change", () => {
      syncSwapState(card);
      translate(card);
    });
    sourceInput?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        translate(card);
      }
    });
    copyButton?.addEventListener("click", () => copyOutput(card, copyButton));
    swapButton?.addEventListener("click", () => swapLanguages(card));

    syncSwapState(card);
  }

  function init() {
    document.querySelectorAll(CARD_SELECTOR).forEach(initCard);
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  const observer = new MutationObserver(init);
  observer.observe(document.body, { childList: true, subtree: true });
  init();
})();
