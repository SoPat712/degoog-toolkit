(function () {
  const CARD_SELECTOR = ".trc-card[data-trc-card]";
  const PLUGIN_API_BASE = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;
  const AUTO_TRANSLATE_DELAY_MS = 450;
  const cardState = new WeakMap();

  const TRANSLATE_LANG_DICT = {
    en: {
      copied: "Copied!",
      copyTranslation: "Copy translation",
      translating: "Translating",
      translationUnavailable: "Translation unavailable",
      translated: "Translated",
      speechUnavailable: "Speech unavailable"
    }
  };

  function tc(key) {
    const attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    const el = document.querySelector(CARD_SELECTOR) || document.querySelector(".trc-card[data-trc-card]");
    return (el && el.getAttribute(attrName)) || TRANSLATE_LANG_DICT.en[key] || key;
  }

  function pluginApiUrl(path) {
    return `${PLUGIN_API_BASE}/${path}`;
  }

  function stateFor(card) {
    let state = cardState.get(card);
    if (!state) {
      state = { timer: 0, requestId: 0, controller: null, audio: null };
      cardState.set(card, state);
    }
    return state;
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
      .querySelectorAll(
        ".trc-provider-select, .trc-source-select, .trc-target-select",
      )
      .forEach((control) => {
        control.disabled = Boolean(loading);
      });
  }

  function setRomanization(card, selector, value) {
    const node = card.querySelector(selector);
    if (node) node.textContent = value || "";
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

  function scheduleTranslate(card, options) {
    const state = stateFor(card);
    const delay =
      typeof options?.delay === "number" ? options.delay : AUTO_TRANSLATE_DELAY_MS;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      translate(card, options?.providerOverride);
    }, delay);
  }

  async function translate(card, providerOverride) {
    const state = stateFor(card);
    const sourceInput = card.querySelector(".trc-source-input");
    const output = card.querySelector(".trc-output");
    const sourceSelect = card.querySelector(".trc-source-select");
    const targetSelect = card.querySelector(".trc-target-select");
    const providerSelect = card.querySelector(".trc-provider-select");
    const text = sourceInput?.value?.trim() || "";

    clearTimeout(state.timer);
    state.controller?.abort();
    state.controller = null;
    state.requestId += 1;
    const requestId = state.requestId;

    if (!text) {
      if (output) output.value = "";
      setRomanization(card, ".trc-source-romanization", "");
      setRomanization(card, ".trc-target-romanization", "");
      setStatus(card, "available", "");
      return;
    }

    state.controller = new AbortController();
    setLoading(card, true);
    setStatus(card, "available", tc("translating"));

    try {
      const response = await fetch(pluginApiUrl("translate"), {
        method: "POST",
        signal: state.controller.signal,
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
      if (state.requestId !== requestId) return;
      updateProviderOptions(card, data.providers, data.provider?.id);

      if (!response.ok || !data.ok) {
        if (output) output.value = "";
        setRomanization(card, ".trc-source-romanization", "");
        setRomanization(card, ".trc-target-romanization", "");
        setStatus(card, "failed", data.error || tc("translationUnavailable"));
        return;
      }

      if (output) output.value = data.translatedText || "";
      card.dataset.detectedSource = data.detectedSource || "";
      setRomanization(card, ".trc-source-romanization", data.sourceRomanization);
      setRomanization(card, ".trc-target-romanization", data.targetRomanization);
      setStatus(
        card,
        data.provider?.status || "success",
        data.provider?.name || tc("translated"),
      );
    } catch (error) {
      if (state.requestId !== requestId || error?.name === "AbortError") return;
      if (output) output.value = "";
      setStatus(card, "failed", tc("translationUnavailable"));
    } finally {
      if (state.requestId === requestId) {
        state.controller = null;
        setLoading(card, false);
      }
    }
  }

  function copyOutput(card, button) {
    const output = card.querySelector(".trc-output");
    const value = output?.value || "";
    if (!value || !navigator?.clipboard) return;

    navigator.clipboard.writeText(value).then(() => {
      button.dataset.copied = "1";
      const previousTitle = button.title;
      const previousAria = button.getAttribute("aria-label");
      button.title = tc("copied");
      button.setAttribute("aria-label", tc("copied"));
      const label = button.querySelector("span");
      const previous = label ? label.textContent : "";
      if (label) label.textContent = tc("copied");
      setTimeout(() => {
        button.dataset.copied = "0";
        button.title = previousTitle || tc("copyTranslation");
        button.setAttribute("aria-label", previousAria || tc("copyTranslation"));
        if (label) label.textContent = previous || "Copy";
      }, 1400);
    });
  }

  function speak(card, kind, button) {
    const state = stateFor(card);
    const sourceInput = card.querySelector(".trc-source-input");
    const output = card.querySelector(".trc-output");
    const sourceSelect = card.querySelector(".trc-source-select");
    const targetSelect = card.querySelector(".trc-target-select");
    const isSource = kind === "source";
    const text = (isSource ? sourceInput?.value : output?.value)?.trim() || "";
    const selectedLanguage = isSource
      ? selected(sourceSelect)
      : selected(targetSelect);
    const language =
      selectedLanguage === "auto"
        ? card.dataset.detectedSource || ""
        : selectedLanguage;

    if (!text || !language || language === "auto") return;

    if (state.audio) {
      state.audio.pause();
      state.audio = null;
    }

    const url = new URL(pluginApiUrl("tts"), window.location.origin);
    url.searchParams.set("lang", language);
    url.searchParams.set("text", text.slice(0, 300));

    const audio = new Audio(url.toString());
    state.audio = audio;
    button?.setAttribute("aria-pressed", "true");
    button?.classList.add("trc-audio-playing");
    audio.addEventListener("ended", () => {
      if (state.audio === audio) state.audio = null;
      button?.setAttribute("aria-pressed", "false");
      button?.classList.remove("trc-audio-playing");
    });
    audio.addEventListener("error", () => {
      if (state.audio === audio) state.audio = null;
      button?.setAttribute("aria-pressed", "false");
      button?.classList.remove("trc-audio-playing");
      setStatus(card, "failed", tc("speechUnavailable"));
    });
    audio.play().catch(() => {
      if (state.audio === audio) state.audio = null;
      button?.setAttribute("aria-pressed", "false");
      button?.classList.remove("trc-audio-playing");
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
    const copyButton = card.querySelector(".trc-copy-button");
    const swapButton = card.querySelector(".trc-swap-button");
    const audioButtons = card.querySelectorAll(".trc-audio-button");

    providerSelect?.addEventListener("change", () =>
      scheduleTranslate(card, {
        delay: 0,
        providerOverride: providerSelect.value,
      }),
    );
    targetSelect?.addEventListener("change", () =>
      scheduleTranslate(card, { delay: 0 }),
    );
    sourceSelect?.addEventListener("change", () => {
      syncSwapState(card);
      scheduleTranslate(card, { delay: 0 });
    });
    sourceInput?.addEventListener("input", () => scheduleTranslate(card));
    sourceInput?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        translate(card);
      }
    });
    copyButton?.addEventListener("click", () => copyOutput(card, copyButton));
    audioButtons.forEach((button) => {
      button.addEventListener("click", () =>
        speak(card, button.dataset.trcSpeak, button),
      );
    });
    swapButton?.addEventListener("click", () => {
      swapLanguages(card);
      scheduleTranslate(card, { delay: 0 });
    });

    syncSwapState(card);
    const hasSource = (sourceInput?.value || "").trim();
    const hasOutput = (card.querySelector(".trc-output")?.value || "").trim();
    if (hasSource && !hasOutput) {
      scheduleTranslate(card, { delay: 0 });
    }
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
