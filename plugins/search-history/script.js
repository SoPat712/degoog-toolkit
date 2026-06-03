const HISTORY_API = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}`;
const HISTORY_LIST_URL = `${HISTORY_API}/list?limit=10`;

/** Last list from `/list`; replayed synchronously when the bar goes empty to avoid an AC→history flash. */
let _historyListCache = null;

const CLOCK_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' aria-hidden='true'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>";
const TRASH_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' aria-hidden='true'><path d='M3 6h18v2l-2 14H5L3 8V6z'/><path d='M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2'/><path d='M10 11v6'/><path d='M14 11v6'/></svg>";

const escapeHtml = (str) => {
  if (str == null) return "";
  const s = String(str);
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
};

const escapeAttr = (str) =>
  escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function renderHistoryDropdown(entries, input, dropdown) {
  if (!dropdown || !input) return;
  dropdown.innerHTML = entries
    .map(
      (item) =>
        `<div class="ac-item ac-item--history" data-entry="${escapeAttr(item.entry)}" data-id="${escapeAttr(String(item.id))}" role="button" tabindex="0">
          <span class="ac-item-icon ac-item-icon--clock" aria-hidden="true">${CLOCK_ICON}</span>
          <span class="ac-item-text">${escapeHtml(item.entry)}</span>
          <button type="button" class="ac-item-delete" data-id="${escapeAttr(String(item.id))}" aria-label="Delete">${TRASH_ICON}</button>
        </div>`,
    )
    .join("");
  dropdown.style.display = entries.length ? "block" : "none";
  if (dropdown.parentElement) {
    if (entries.length) {
      dropdown.parentElement.classList.add("ac-open");
    } else {
      dropdown.parentElement.classList.remove("ac-open");
    }
  }

  dropdown.querySelectorAll(".ac-item--history").forEach((el) => {
    const textEl = el.querySelector(".ac-item-text");
    const deleteBtn = el.querySelector(".ac-item-delete");
    const entry = el.dataset.entry;
    const id = el.dataset.id;

    if (textEl) {
      textEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = entry;
        dropdown.style.display = "none";
        if (dropdown.parentElement) {
          dropdown.parentElement.classList.remove("ac-open");
        }
        const form = input.closest("form");
        if (form) {
          form.requestSubmit
            ? form.requestSubmit()
            : form.dispatchEvent(new Event("submit", { cancelable: true }));
          return;
        }
        const resultsBtn = document.getElementById("results-search-btn");
        if (resultsBtn) resultsBtn.click();
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetch(`${HISTORY_API}/delete?id=${encodeURIComponent(id)}`, {
          method: "GET",
        })
          .then(() => fetch(HISTORY_LIST_URL))
          .then((r) => r.json())
          .then((list) => {
            const arr = Array.isArray(list) ? list : [];
            _historyListCache = arr;
            renderHistoryDropdown(arr, input, dropdown);
          })
          .catch(() => {});
      });
    }
  });
}

function fetchAndShowHistory(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  fetch(HISTORY_LIST_URL)
    .then((r) => r.json())
    .then((list) => {
      const arr = Array.isArray(list) ? list : [];
      _historyListCache = arr;
      if (input.value.trim() === "") {
        renderHistoryDropdown(arr, input, dropdown);
      }
    })
    .catch(() => {});
}

/** Instant paint while waiting on network (and before core clears the AC pane). */
function paintCachedHistoryIfAny(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  if (_historyListCache && _historyListCache.length > 0) {
    renderHistoryDropdown(_historyListCache, input, dropdown);
  }
}

function prefetchHistoryList() {
  fetch(HISTORY_LIST_URL)
    .then((r) => r.json())
    .then((list) => {
      _historyListCache = Array.isArray(list) ? list : [];
    })
    .catch(() => {});
}

function appendHistory(entry) {
  const q = (entry || "").trim();
  if (!q) return;
  if (q === "!history" || q.startsWith("!history ")) return;
  const payload = JSON.stringify({ entry: q });

  // Prefer sendBeacon: survives the pagehide/navigation that follows
  // form submits and button clicks on search (full-page navigations
  // via navigateToSearch or form GET submit would otherwise abort a
  // plain fetch before the POST is sent).
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], {
        type: "application/json;charset=UTF-8",
      });
      if (navigator.sendBeacon(`${HISTORY_API}/append`, blob)) return;
    } catch {}
  }

  // Fallback: keepalive fetch so the request isn't aborted on unload.
  try {
    fetch(`${HISTORY_API}/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function getHistoryInput(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.id === "search-input" || target.id === "results-search-input") {
    return target;
  }
  return null;
}

function getDropdownForInput(input) {
  if (!input) return null;
  if (input.id === "search-input") {
    return document.getElementById("ac-dropdown-home");
  }
  if (input.id === "results-search-input") {
    return document.getElementById("ac-dropdown-results");
  }
  return null;
}

function submitHistoryInput(input, dropdown) {
  dropdown.style.display = "none";
  if (dropdown.parentElement) {
    dropdown.parentElement.classList.remove("ac-open");
  }
  const form = input.closest("form");
  if (form) {
    form.requestSubmit
      ? form.requestSubmit()
      : form.dispatchEvent(new Event("submit", { cancelable: true }));
    return;
  }
  const resultsBtn = document.getElementById("results-search-btn");
  if (resultsBtn) resultsBtn.click();
}

function useHighlightedHistory(input, dropdown, event) {
  if (!dropdown || dropdown.style.display === "none" || !dropdown.offsetParent) {
    return false;
  }
  // degoog highlights AC items with an inline background or a class; check
  // for the most common indicators that a history row is "active".
  const highlighted = dropdown.querySelector(
    ".ac-item--history.active, .ac-item--history.selected, .ac-item--history[aria-selected=\"true\"], .ac-item--history:hover"
  );
  if (!highlighted) return false;
  const entry = highlighted.dataset.entry;
  if (!entry) return false;
  event.preventDefault();
  event.stopPropagation();
  input.value = entry;
  submitHistoryInput(input, dropdown);
  return true;
}

let initialized = false;
let hasUserInteracted = false;

const SH_LANG_DICT = {
  en: {
    confirmClear: "Are you sure you want to clear your search history?"
  },
  es: {
    confirmClear: "¿Está seguro de que desea borrar su historial de búsqueda?"
  },
  fr: {
    confirmClear: "Êtes-vous sûr de vouloir effacer votre historique de recherche ?"
  }
};
function getShTranslation(key) {
  const lang = (document.documentElement.lang || navigator.language || "en").split("-")[0].toLowerCase();
  return SH_LANG_DICT[lang]?.[key] || SH_LANG_DICT["en"][key] || key;
}
function initSearchHistory() {
  if (initialized) return;
  initialized = true;

  document.addEventListener("mousedown", () => { hasUserInteracted = true; }, { passive: true });
  document.addEventListener("keydown", () => { hasUserInteracted = true; }, { passive: true });
  document.addEventListener("touchstart", () => { hasUserInteracted = true; }, { passive: true });

  document.addEventListener("focusin", (e) => {
    const input = getHistoryInput(e.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown) return;
    if (!hasUserInteracted) return;
    paintCachedHistoryIfAny(input, dropdown);
    fetchAndShowHistory(input, dropdown);
  });

  // When the field is cleared while focused (e.g. backspace), show history without blur/refocus.
  document.addEventListener("input", (e) => {
    const input = getHistoryInput(e.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown || input.value.trim() !== "") return;
    paintCachedHistoryIfAny(input, dropdown);
    fetchAndShowHistory(input, dropdown);
  });

  document.addEventListener(
    "submit",
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement) || target.id !== "search-form-home") return;
      const input = document.getElementById("search-input");
      if (input) appendHistory(input.value);
    },
    true,
  );

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement) || !target.closest("#results-search-btn")) return;
      const input = document.getElementById("results-search-input");
      if (input) appendHistory(input.value);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const input = getHistoryInput(e.target);
      const dropdown = getDropdownForInput(input);
      if (!input) return;
      if (useHighlightedHistory(input, dropdown, e)) return;
      if (input.id === "results-search-input") appendHistory(input.value);
    },
    true,
  );

  prefetchHistoryList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchHistory);
} else {
  initSearchHistory();
}
