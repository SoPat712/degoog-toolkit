const STORAGE_KEY = "search_history";
const CONFIG_STORAGE_KEY = "search_history_max_entries";
const DEFAULT_MAX_ENTRIES = 1000;
const HISTORY_CONFIG_URL = `/api/plugin/${encodeURIComponent(__PLUGIN_ID__)}/config`;
const HISTORY_DROPDOWN_LIMIT = 10;
const HISTORY_PAGE_SIZE = 20;

let _maxEntries = DEFAULT_MAX_ENTRIES;
let _historyListCache = null;
let initialized = false;
let searchBarEngaged = false;

const CLOCK_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' aria-hidden='true'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>";
const TRASH_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' aria-hidden='true'><path d='M3 6h18v2l-2 14H5L3 8V6z'/><path d='M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2'/><path d='M10 11v6'/><path d='M14 11v6'/></svg>";

const escapeHtml = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const escapeAttr = escapeHtml;

function clampMaxEntries(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ENTRIES;
  return Math.min(100000, parsed);
}

function setMaxEntries(value) {
  _maxEntries = clampMaxEntries(value);
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, String(_maxEntries));
  } catch {}
  trimHistoryToMax();
}

function loadStoredMaxEntries() {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      _maxEntries = clampMaxEntries(stored);
    }
  } catch {}
}

function fetchConfiguredMaxEntries() {
  fetch(HISTORY_CONFIG_URL)
    .then((response) => {
      if (!response.ok) throw new Error("History config request failed");
      return response.json();
    })
    .then((payload) => {
      setMaxEntries(payload?.maxEntries);
      syncVisibleHistoryUi();
    })
    .catch(() => {});
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("search-history: localStorage not writable", error);
  }
}

function trimHistoryToMax() {
  const history = loadHistory();
  if (history.length <= _maxEntries) return;
  saveHistory(history.slice(-_maxEntries));
  refreshHistoryCache();
}

function refreshHistoryCache() {
  _historyListCache = listEntries(HISTORY_DROPDOWN_LIMIT);
}

function appendHistoryEntry(entry) {
  const q = String(entry || "").trim();
  if (!q) return;
  const normalizedQuery = q.toLowerCase();
  if (
    normalizedQuery === "!history" ||
    normalizedQuery.startsWith("!history ")
  ) {
    return;
  }

  const history = loadHistory();
  const existingIdx = history.findIndex(
    (item) => String(item.entry || "").toLowerCase() === normalizedQuery,
  );
  const timestamp = new Date().toISOString();

  if (existingIdx >= 0) {
    const existing = history[existingIdx];
    history.splice(existingIdx, 1);
    history.push({ id: existing.id, entry: existing.entry, timestamp });
  } else {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    history.push({ id, entry: q, timestamp });
  }

  while (history.length > _maxEntries) {
    history.shift();
  }

  saveHistory(history);
  refreshHistoryCache();
}

function deleteHistoryEntry(id) {
  const history = loadHistory();
  const idx = history.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return false;
  history.splice(idx, 1);
  saveHistory(history);
  refreshHistoryCache();
  return true;
}

function listEntries(limit) {
  const entries = loadHistory();
  const newestFirst = [...entries].reverse();
  return limit ? newestFirst.slice(0, limit) : newestFirst;
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function syncHistoryResultRail(root) {
  if (!(root instanceof HTMLElement)) return;

  const searchInput = document.querySelector(
    "#results-search-input, #search-input",
  );
  if (!(searchInput instanceof HTMLElement)) return;

  const rootRect = root.getBoundingClientRect();
  const searchRect = searchInput.getBoundingClientRect();
  if (rootRect.width <= 0 || searchRect.width <= 0) return;

  const inlineStart = Math.max(0, searchRect.left - rootRect.left);
  root.style.setProperty(
    "--search-history-content-inline-start",
    `${inlineStart}px`,
  );
}

function renderHistoryPage(root, requestedPage = 1) {
  if (!(root instanceof HTMLElement)) return;

  const entries = listEntries();
  const totalPages = Math.max(1, Math.ceil(entries.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(1, Number.parseInt(requestedPage, 10) || 1),
    totalPages,
  );
  root.dataset.page = String(currentPage);

  if (!entries.length) {
    root.innerHTML = `<div class="search-history-result__shell"><h2 class="search-history-result__heading">Search history</h2><div class="no-results">No history yet.</div></div>`;
    syncHistoryResultRail(root);
    return;
  }

  const startIndex = (currentPage - 1) * HISTORY_PAGE_SIZE;
  const pageEntries = entries.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  const endIndex = Math.min(startIndex + pageEntries.length, entries.length);

  const items = pageEntries
    .map((item) => {
      const entry = String(item.entry ?? "");
      const searchUrl = `/search?q=${encodeURIComponent(entry)}`;
      return `<article class="search-history-result__item"><div class="search-history-result__meta"><span class="search-history-result__clock">${CLOCK_ICON}</span><time class="search-history-result__timestamp">${escapeHtml(formatTimestamp(item.timestamp))}</time><button type="button" class="history-delete-btn" data-id="${escapeAttr(String(item.id))}" aria-label="Delete history entry">${TRASH_ICON}</button></div><a class="search-history-result__title" href="${escapeAttr(searchUrl)}">${escapeHtml(entry)}</a></article>`;
    })
    .join("");

  const pagerMarkup =
    totalPages > 1
      ? `<nav class="search-history-result__pager" aria-label="Search history pages">
          <button type="button" class="search-history-result__pager-btn" data-history-page-action="previous" aria-label="Previous history page" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
          <span class="search-history-result__pager-status" aria-live="polite">Page ${currentPage} of ${totalPages}</span>
          <button type="button" class="search-history-result__pager-btn" data-history-page-action="next" aria-label="Next history page" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
        </nav>`
      : "";

  root.innerHTML = `<div class="search-history-result__shell"><h2 class="search-history-result__heading">Search history</h2><div class="search-history-result__list">${items}</div>${pagerMarkup}</div><div class="search-history-result__pager-info" hidden>Showing ${startIndex + 1} to ${endIndex} of ${entries.length}</div>`;
  syncHistoryResultRail(root);

  const statusLabel = root.querySelector(".search-history-result__pager-status");
  if (statusLabel) {
    statusLabel.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${entries.length} • Page ${currentPage} of ${totalPages}`;
  }

  root.querySelectorAll(".history-delete-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      deleteHistoryEntry(button.dataset.id);
      renderHistoryPage(root, parseInt(root.dataset.page || "1", 10));
    });
  });

  root.querySelectorAll("[data-history-page-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const action = event.currentTarget?.dataset?.historyPageAction;
      if (action === "previous") {
        renderHistoryPage(root, currentPage - 1);
      } else if (action === "next") {
        renderHistoryPage(root, currentPage + 1);
      }
    });
  });
}

function initHistoryPage() {
  const renderIfPresent = () => {
    const root = document.getElementById("history-plugin-root");
    if (!(root instanceof HTMLElement)) return false;
    if (root.dataset.maxEntries) {
      setMaxEntries(root.dataset.maxEntries);
    }
    renderHistoryPage(root);
    return true;
  };

  if (renderIfPresent()) return;

  const observer = new MutationObserver(() => {
    if (!renderIfPresent()) return;
    observer.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function getSearchBarForInput(input) {
  if (!input) return null;
  return input.closest(".search-bar, .results-search-bar");
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

function isHistoryDropdownOpen(dropdown) {
  return (
    dropdown instanceof HTMLElement &&
    dropdown.style.display !== "none" &&
    dropdown.querySelector(".ac-item--history") !== null
  );
}

function shouldShowHistory(input) {
  if (!input) return false;
  const dropdown = getDropdownForInput(input);
  if (isHistoryDropdownOpen(dropdown)) return true;
  if (input.value.trim() !== "") return false;
  if (document.activeElement === input) return true;
  const bar = getSearchBarForInput(input);
  return (
    bar instanceof HTMLElement &&
    document.activeElement instanceof Node &&
    bar.contains(document.activeElement)
  );
}

function hideHistoryDropdown(dropdown) {
  if (!dropdown) return;
  dropdown.style.display = "none";
  dropdown.parentElement?.classList.remove("ac-open");
}

function submitHistoryInput(input, dropdown) {
  hideHistoryDropdown(dropdown);
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

function renderHistoryDropdown(entries, input, dropdown) {
  if (!dropdown || !input) return;
  if (!shouldShowHistory(input)) {
    hideHistoryDropdown(dropdown);
    return;
  }

  dropdown.innerHTML = entries
    .map(
      (item) =>
        `<div class="ac-item ac-item--history" data-entry="${escapeAttr(item.entry)}" data-text="${escapeAttr(item.entry)}" data-id="${escapeAttr(String(item.id))}" role="button" tabindex="0">
          <span class="ac-item-icon ac-item-icon--clock" aria-hidden="true">${CLOCK_ICON}</span>
          <span class="ac-item-text degoog-ac-text">${escapeHtml(item.entry)}</span>
          <button type="button" class="ac-item-delete" data-id="${escapeAttr(String(item.id))}" aria-label="Delete">${TRASH_ICON}</button>
        </div>`,
    )
    .join("");

  if (!entries.length) {
    hideHistoryDropdown(dropdown);
    return;
  }

  dropdown.style.display = "block";
  dropdown.parentElement?.classList.add("ac-open");

  dropdown.querySelectorAll(".ac-item--history").forEach((item) => {
    const textEl = item.querySelector(".ac-item-text");
    const deleteBtn = item.querySelector(".ac-item-delete");
    const entry = item.dataset.entry;
    const id = item.dataset.id;

    if (textEl) {
      textEl.addEventListener("mousedown", (event) => {
        event.preventDefault();
        input.value = entry;
        submitHistoryInput(input, dropdown);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteHistoryEntry(id);
        renderHistoryDropdown(listEntries(HISTORY_DROPDOWN_LIMIT), input, dropdown);
      });
    }
  });
}

function fetchAndShowHistory(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  const entries = listEntries(HISTORY_DROPDOWN_LIMIT);
  _historyListCache = entries;
  if (shouldShowHistory(input)) {
    renderHistoryDropdown(entries, input, dropdown);
  }
}

/** Defer until after auto-bang clears its dropdown on the same input event. */
function scheduleHistoryDropdown(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  queueMicrotask(() => {
    if (input.value.trim() !== "") return;
    paintCachedHistoryIfAny(input, dropdown);
    fetchAndShowHistory(input, dropdown);
  });
}

function paintCachedHistoryIfAny(input, dropdown) {
  if (!input || !dropdown) return;
  if (input.value.trim() !== "") return;
  if (_historyListCache?.length) {
    renderHistoryDropdown(_historyListCache, input, dropdown);
  }
}

function getHighlightedHistoryItem(dropdown) {
  if (!isHistoryDropdownOpen(dropdown)) return null;
  return dropdown.querySelector(
    '.ac-item--history.active, .ac-item--history.ac-active, .ac-item--history.selected, .ac-item--history[aria-selected="true"]',
  );
}

function stopHistoryKeyEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleHistoryKeydown(event, input, dropdown) {
  const items = dropdown.querySelectorAll(".ac-item--history");
  if (!items.length) return false;

  if (event.key === "Escape") {
    stopHistoryKeyEvent(event);
    input.value = "";
    hideHistoryDropdown(dropdown);
    return true;
  }

  if (event.key === "Enter") {
    const highlighted = getHighlightedHistoryItem(dropdown);
    if (!highlighted?.dataset.entry) return false;
    stopHistoryKeyEvent(event);
    input.value = highlighted.dataset.entry;
    submitHistoryInput(input, dropdown);
    return true;
  }

  if (event.key === "Tab") {
    const highlighted = getHighlightedHistoryItem(dropdown);
    const entry = highlighted?.dataset.entry ?? items[0]?.dataset.entry;
    if (!entry) return false;
    stopHistoryKeyEvent(event);
    input.value = entry;
    submitHistoryInput(input, dropdown);
    return true;
  }

  return false;
}

function bindHistorySearchInput(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.historyKeyBound === "true") {
    return;
  }
  input.dataset.historyKeyBound = "true";

  input.addEventListener(
    "keydown",
    (event) => {
      const dropdown = getDropdownForInput(input);
      if (!isHistoryDropdownOpen(dropdown)) return;
      if (!["Enter", "Tab", "Escape"].includes(event.key)) return;
      handleHistoryKeydown(event, input, dropdown);
    },
    true,
  );
}

function markSearchBarEngagedFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  for (const id of ["search-input", "results-search-input"]) {
    const input = document.getElementById(id);
    const bar = getSearchBarForInput(input);
    if (bar instanceof HTMLElement && bar.contains(target)) {
      searchBarEngaged = true;
      return;
    }
  }
}

function syncVisibleHistoryUi() {
  refreshHistoryCache();

  const pageRoot = document.getElementById("history-plugin-root");
  if (pageRoot instanceof HTMLElement) {
    renderHistoryPage(pageRoot, parseInt(pageRoot.dataset.page || "1", 10));
  }

  for (const id of ["search-input", "results-search-input"]) {
    const input = document.getElementById(id);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown) continue;
    if (!isHistoryDropdownOpen(dropdown)) continue;
    renderHistoryDropdown(_historyListCache || [], input, dropdown);
  }
}

function initSearchHistory() {
  if (initialized) return;
  initialized = true;

  loadStoredMaxEntries();
  refreshHistoryCache();
  initHistoryPage();
  fetchConfiguredMaxEntries();

  for (const id of ["search-input", "results-search-input"]) {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) {
      bindHistorySearchInput(input);
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== CONFIG_STORAGE_KEY) return;
    if (event.key === CONFIG_STORAGE_KEY) {
      loadStoredMaxEntries();
      trimHistoryToMax();
    }
    syncVisibleHistoryUi();
  });

  document.addEventListener("mousedown", markSearchBarEngagedFromEvent, {
    passive: true,
  });
  document.addEventListener("touchstart", markSearchBarEngagedFromEvent, {
    passive: true,
  });

  document.addEventListener("focusin", (event) => {
    const input = getHistoryInput(event.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown) return;
    if (!searchBarEngaged) return;
    scheduleHistoryDropdown(input, dropdown);
  });

  document.addEventListener(
    "mousedown",
    (event) => {
      if (!(event.target instanceof Node)) return;
      for (const id of ["search-input", "results-search-input"]) {
        const input = document.getElementById(id);
        const dropdown = getDropdownForInput(input);
        const bar = getSearchBarForInput(input);
        if (!input || !dropdown || !bar) continue;
        if (dropdown.style.display === "none") continue;
        if (bar.contains(event.target)) continue;
        hideHistoryDropdown(dropdown);
      }
    },
    true,
  );

  document.addEventListener("focusout", (event) => {
    const bar =
      event.target instanceof Element
        ? event.target.closest(".search-bar, .results-search-bar")
        : null;
    if (!bar) return;
    requestAnimationFrame(() => {
      if (bar.contains(document.activeElement)) return;
      searchBarEngaged = false;
      const dropdown = bar.querySelector(".ac-dropdown");
      if (dropdown instanceof HTMLElement) hideHistoryDropdown(dropdown);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    searchBarEngaged = false;
    for (const id of ["search-input", "results-search-input"]) {
      const input = document.getElementById(id);
      hideHistoryDropdown(getDropdownForInput(input));
    }
  });

  document.addEventListener("input", (event) => {
    const input = getHistoryInput(event.target);
    const dropdown = getDropdownForInput(input);
    if (!input || !dropdown) return;
    if (input.value.trim() !== "") return;
    scheduleHistoryDropdown(input, dropdown);
  });

  document.addEventListener(
    "submit",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.id !== "search-form-home") return;
      const input = document.getElementById("search-input");
      if (input) appendHistoryEntry(input.value);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("#results-search-btn")) return;
      const input = document.getElementById("results-search-input");
      if (input) appendHistoryEntry(input.value);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") return;
      const input = getHistoryInput(event.target);
      if (!input) return;
      const dropdown = getDropdownForInput(input);
      if (isHistoryDropdownOpen(dropdown)) return;
      if (input.id === "results-search-input") appendHistoryEntry(input.value);
    },
    true,
  );

  window.addEventListener("resize", () => {
    const root = document.getElementById("history-plugin-root");
    if (!(root instanceof HTMLElement)) return;
    requestAnimationFrame(() => syncHistoryResultRail(root));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchHistory);
} else {
  initSearchHistory();
}
